"""全库跨项目方案记忆：项目画像、相似检索与两两比对。

业务规则：
- 仅在不同 project_key 之间做重复建设比对；
- 同一 project_key 下不同 version（如人才0511 vs 0512）视为同一项目多稿，不参与互比。
"""

from __future__ import annotations

import json
import re
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from .llm_client import chat_completion
from .models import DocumentChunk, LlmAgent, ProjectMemoryProfile, ReviewTask
from .project_identity import parse_project_identity
from .review_engine import _all_retrieved_chunks, _expand_terms, _normalize_text, _text_overlap_ratio


DUPLICATE_DIMENSION_KEY = "duplicate_and_consolidation"
INDEXABLE_STATUSES = frozenset({"indexed", "reviewing", "reviewed", "failed"})

_KEYWORD_STOPWORDS = frozenset(
    {
        "基于",
        "通过",
        "实现",
        "建设",
        "项目",
        "系统",
        "平台",
        "应用",
        "服务",
        "管理",
        "发展",
        "工作",
        "要求",
        "提出",
        "完善",
        "依托",
        "解决",
        "问题",
        "例如",
        "主要",
        "包括",
        "以及",
        "进行",
        "开展",
        "推进",
        "加强",
        "提升",
        "本市",
        "全区",
        "部门",
        "单位",
        "方案",
        "内容",
        "目标",
        "任务",
        "人月",
        "软件开发费",
        "附件",
        "草本",
        "rpa",
        "bi",
        "ai",
        "ocr",
        "codewave",
    }
)

_SYSTEM_NOISE_PREFIXES = (
    "附件",
    "附表",
    "建设",
    "提出",
    "完善",
    "依托",
    "实现",
    "根据",
    "按照",
    "建设单位",
    "承担单位",
    "例如",
    "主要",
    "包括",
    "提出要",
    "深化",
)


def resolve_task_project_key(task: ReviewTask) -> str | None:
    key = (getattr(task, "project_key", None) or "").strip()
    if key:
        return key
    parsed_key, _ = parse_project_identity(task.name or "")
    return (parsed_key or "").strip() or None


def tasks_are_comparable(source: ReviewTask, target: ReviewTask) -> bool:
    """不同 project_key 才可比对；缺 project_key 时退化为按任务 id 区分。"""
    if source.id == target.id:
        return False
    sk = resolve_task_project_key(source)
    tk = resolve_task_project_key(target)
    if sk and tk:
        return sk != tk
    return source.id != target.id


def _parse_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except Exception:
        return []
    if not isinstance(value, list):
        return []
    return [str(x).strip() for x in value if str(x).strip()]


_PHRASE_LABEL_PREFIX = re.compile(
    r"^(建设目标|项目目标|业务目标|建设内容|主要功能|核心能力)[是为：:]\s*"
)
_FILE_EXT_RE = re.compile(r"\.(docx?|pdf|pptx?|xlsx?|wps)\b", re.IGNORECASE)
_OVERVIEW_SYSTEM_PROMPT = (
    "你是政务信息化项目方案编辑。你的任务是用自己的话写「项目概述」，"
    "概括项目要建设什么、解决什么问题、服务谁、达成什么目标。"
    "禁止复制粘贴材料原文、文件名、封面、单位名称或招标套话。"
)


def _strip_phrase_label(phrase: str) -> str:
    return _PHRASE_LABEL_PREFIX.sub("", (phrase or "").strip()).strip()


def _looks_like_raw_dump(text: str) -> bool:
    t = (text or "").strip()
    if len(t) < 8:
        return True
    if _FILE_EXT_RE.search(t):
        return True
    head = t.split("：", 1)[0][:120]
    if _FILE_EXT_RE.search(head):
        return True
    if re.search(r"(建设){2,}", t) or re.search(r"(项目){3,}", t):
        return True
    if len(t) > 200:
        return True
    if t.count("，") >= 8 and not re.search(r"[。；]", t[:120]):
        return True
    return False


def _is_valid_overview(text: str | None) -> bool:
    if not text:
        return False
    t = text.strip()
    if len(t) < 16 or len(t) > 220:
        return False
    if _looks_like_raw_dump(t):
        return False
    if not re.search(r"[\u4e00-\u9fff]", t):
        return False
    return True


def _normalize_overview_candidate(text: str) -> str | None:
    t = re.sub(r"\s+", " ", (text or "").strip())
    t = t.strip("\"'“”‘’「」")
    if not _is_valid_overview(t):
        return None
    if not t.endswith(("。", "；", ".", "！")):
        t += "。"
    return t[:220]


def _is_filename_like_title(title: str) -> bool:
    t = (title or "").strip()
    if not t:
        return True
    if _FILE_EXT_RE.search(t):
        return True
    if len(t) > 60 and ("方案" in t or "报告" in t) and ("《" in t or "(" in t or "（" in t):
        return True
    return False


def _curated_snippets_from_corpus(corpus: str, *, limit: int = 8) -> list[str]:
    """从正文中抽取适合写概述的句子，跳过封面/文件名噪声。"""
    snippets: list[str] = []
    patterns = [
        r"[^。\n]{6,80}(?:建设目标|项目目标|总体目标|业务目标)[^。\n]{4,140}[。；]",
        r"[^。\n]{6,80}(?:建设内容|建设方案|主要建设|总体建设)[^。\n]{4,160}[。；]",
        r"[^。\n]{10,200}(?:旨在|拟建设|本项目|通过建设)[^。\n]{4,120}[。；]",
    ]
    for pat in patterns:
        for m in re.finditer(pat, corpus[:60_000], re.IGNORECASE):
            s = re.sub(r"\s+", " ", (m.group(0) or "").strip())
            if len(s) < 20 or _looks_like_raw_dump(s):
                continue
            if s not in snippets:
                snippets.append(s[:220])
            if len(snippets) >= limit:
                return snippets
    for line in corpus[:40_000].split("\n"):
        line = line.strip()
        if len(line) < 24 or len(line) > 220:
            continue
        if _looks_like_raw_dump(line) or _is_filename_like_title(line):
            continue
        if re.search(r"(目标|建设|平台|系统|服务|管理)", line):
            snippets.append(line[:220])
        if len(snippets) >= limit:
            break
    return snippets


def build_project_overview(
    task: ReviewTask,
    goals: list[str],
    capabilities: list[str],
    chunks: list[Any],
    *,
    corpus: str = "",
) -> str | None:
    """启发式概述（仅作 LLM 失败时的回退，不使用 chunk 摘要）。"""
    for phrase in goals + capabilities:
        text = _strip_phrase_label(phrase)
        normalized = _normalize_overview_candidate(text)
        if normalized:
            return normalized
    for snippet in _curated_snippets_from_corpus(corpus):
        normalized = _normalize_overview_candidate(snippet)
        if normalized:
            return normalized
    body = (getattr(task, "proposal_body", None) or "").strip()
    if body and not _looks_like_raw_dump(body):
        first = re.search(r"[^。\n；;]{20,200}[。；]", body)
        if first:
            normalized = _normalize_overview_candidate(first.group(0))
            if normalized:
                return normalized
    key = resolve_task_project_key(task)
    if key:
        phase = "方案预审" if getattr(task, "phase", None) == "pre_review" else "实施方案"
        return f"围绕「{key}」开展{phase}相关数字化建设（概述待模型重新生成）。"
    return None


def project_overview_from_profile(profile: ProjectMemoryProfile) -> str | None:
    stored = (getattr(profile, "overview_text", None) or "").strip()
    if stored and _is_valid_overview(stored):
        return stored[:220]
    goals = _parse_json_list(profile.goals_json)
    caps = _parse_json_list(profile.capabilities_json)
    for phrase in goals + caps:
        normalized = _normalize_overview_candidate(_strip_phrase_label(phrase))
        if normalized:
            return normalized
    if profile.summary_text:
        for line in profile.summary_text.split("\n"):
            if line.startswith("建设目标摘要："):
                normalized = _normalize_overview_candidate(
                    line.replace("建设目标摘要：", "", 1).strip()
                )
                if normalized:
                    return normalized
    return None


def _is_meaningful_keyword(token: str) -> bool:
    k = (token or "").strip()
    if len(k) < 4 or len(k) > 14:
        return False
    low = k.lower()
    if low in _KEYWORD_STOPWORDS or k in _KEYWORD_STOPWORDS:
        return False
    if re.fullmatch(r"[\d,.]+", k):
        return False
    if re.fullmatch(r"[a-z]{1,4}", low):
        return False
    if not re.search(r"[\u4e00-\u9fff]{3,}", k):
        return False
    if k.startswith(("的", "在", "与", "及", "将", "把", "对", "为", "以", "从")):
        return False
    if re.search(r"(进行|实现|依托|处理|传递|核实|探索|开展|自动|配置|对接|基于)", k):
        return False
    if _looks_like_raw_dump(k):
        return False
    return True


def _build_profile_keywords(chunks: list[Any], corpus: str) -> list[str]:
    counter: Counter[str] = Counter()
    for ch in chunks:
        for kw in getattr(ch, "keywords", None) or []:
            if _is_meaningful_keyword(str(kw)):
                counter[str(kw).strip()] += 1
    for token in re.findall(r"[\u4e00-\u9fff]{4,10}", corpus[:25_000]):
        if _is_meaningful_keyword(token):
            counter[token] += 1
    return [w for w, c in counter.most_common(16) if c >= 2 and _is_meaningful_keyword(w)][:8]


def _is_meaningful_system(name: str) -> bool:
    s = (name or "").strip()
    if len(s) < 4 or len(s) > 18:
        return False
    if not re.fullmatch(r"[\u4e00-\u9fffA-Za-z0-9·]{2,16}(?:系统|平台)", s):
        return False
    if _looks_like_raw_dump(s) or _is_filename_like_title(s):
        return False
    if re.search(r"[：:（）()《》、,，；;]", s):
        return False
    if any(s.startswith(p) for p in _SYSTEM_NOISE_PREFIXES):
        return False
    if re.search(r"\d{3,}", s):
        return False
    if re.search(r"(形成|推动|无法|探索|对接|部署|传递|核实|管理|基金|事业|单位|中心|云)", s):
        return False
    return True


def _extract_system_names(
    corpus: str,
    chunks: list[Any],
    capabilities: list[str],
) -> list[str]:
    found: list[str] = []
    pat = re.compile(r"([\u4e00-\u9fffA-Za-z0-9·]{2,16}(?:系统|平台))")
    sources = list(capabilities)
    for ch in chunks:
        title = (getattr(ch, "section_title", None) or "").strip()
        if title and not _is_filename_like_title(title):
            sources.append(title)
    for text in sources:
        for m in pat.finditer(text or ""):
            name = (m.group(1) or "").strip()
            if _is_meaningful_system(name) and name not in found:
                found.append(name)
    for m in pat.finditer(corpus[:35_000]):
        name = (m.group(1) or "").strip()
        if _is_meaningful_system(name) and name not in found:
            found.append(name)
        if len(found) >= 8:
            break
    return found[:8]


def _extract_phrases(text: str, patterns: list[str], limit: int = 12) -> list[str]:
    found: list[str] = []
    for pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            phrase = (m.group(1) or "").strip()
            if len(phrase) >= 2 and phrase not in found:
                found.append(phrase[:200])
            if len(found) >= limit:
                return found
    return found


def _collect_corpus_text(db: Session, task_id: int, max_chars: int = 120_000) -> str:
    rows = (
        db.query(DocumentChunk.content, DocumentChunk.section_title)
        .filter(DocumentChunk.task_id == task_id)
        .order_by(DocumentChunk.id.asc())
        .all()
    )
    parts: list[str] = []
    total = 0
    for content, title in rows:
        block = f"{title or ''}\n{content or ''}"
        if total + len(block) > max_chars:
            break
        parts.append(block)
        total += len(block)
    return "\n".join(parts)


def _resolve_agent_for_memory(db: Session, task: ReviewTask) -> LlmAgent | None:
    agent_id = getattr(task, "llm_agent_id", None)
    if agent_id:
        agent = db.query(LlmAgent).filter_by(id=agent_id).first()
        if agent and (agent.api_key or "").strip():
            return agent
    return (
        db.query(LlmAgent)
        .filter(LlmAgent.api_key.isnot(None), LlmAgent.api_key != "")
        .order_by(LlmAgent.id.asc())
        .first()
    )


def _overview_source_excerpt(
    task: ReviewTask,
    corpus: str,
    chunks: list[Any],
    *,
    goals: list[str],
    capabilities: list[str],
) -> str:
    parts: list[str] = []
    body = (getattr(task, "proposal_body", None) or "").strip()
    if body and not _looks_like_raw_dump(body[:500]):
        parts.append(f"【项目背景】\n{body[:1800]}")
    if goals:
        parts.append("【建设目标摘录】\n" + "\n".join(_strip_phrase_label(g) for g in goals[:4]))
    if capabilities:
        parts.append("【建设内容摘录】\n" + "\n".join(_strip_phrase_label(c) for c in capabilities[:4]))
    titles = [
        (getattr(c, "section_title", None) or "").strip()
        for c in chunks
        if (getattr(c, "section_title", None) or "").strip()
    ]
    clean_titles = [t for t in dict.fromkeys(titles) if not _is_filename_like_title(t)][:10]
    if clean_titles:
        parts.append("【章节结构】" + "、".join(clean_titles))
    snippets = _curated_snippets_from_corpus(corpus)
    if snippets:
        parts.append("【正文要点】\n" + "\n".join(f"- {s}" for s in snippets))
    return "\n\n".join(parts)[:10_000]


def generate_project_overview_with_llm(
    db: Session,
    task: ReviewTask,
    agent: LlmAgent,
    *,
    corpus: str,
    chunks: list[Any],
    goals: list[str],
    capabilities: list[str],
) -> str | None:
    """调用大模型生成简明项目概述；失败或质量不合格时返回 None。"""
    excerpt = _overview_source_excerpt(
        task, corpus, chunks, goals=goals, capabilities=capabilities
    )
    if not excerpt.strip():
        return None

    user_prompt = (
        f"任务名称：{task.name}\n"
        f"项目标识：{resolve_task_project_key(task) or '—'}\n"
        f"版本：{(getattr(task, 'version', None) or '').strip() or '—'}\n\n"
        "请根据下列摘录，用你自己的话写一段项目概述（90～150 个汉字，单段）：\n"
        "1. 说明要建设什么系统/平台、解决什么问题、主要服务对象\n"
        "2. 禁止出现文件名（如 .docx）、禁止粘贴原文、禁止单位名堆砌、禁止关键词罗列\n"
        "3. 只输出概述正文，不要标题、序号、引号或「概述：」等前缀\n\n"
        f"{excerpt}"
    )

    messages = [
        {"role": "system", "content": _OVERVIEW_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    try:
        content = chat_completion(
            agent,
            messages,
            temperature=0.15,
            max_tokens=280,
            timeout=90.0,
        )
        text = (content or "").strip()
        text = re.sub(r"^(项目概述|概述)[：:]\s*", "", text)
        text = re.sub(r"^#+\s*", "", text)
        text = re.sub(r"^[\-*•\d.]+\s*", "", text)
        return _normalize_overview_candidate(text)
    except Exception:
        return None


def _is_valid_core_function(text: str) -> bool:
    t = (text or "").strip()
    if len(t) < 4 or len(t) > 24:
        return False
    if _looks_like_raw_dump(t):
        return False
    if t.startswith(("在", "以", "通过", "面向", "围绕", "基于")):
        return False
    if t.endswith(("方面", "领域", "工作", "建设", "系统", "平台")):
        return False
    if re.search(r"(附件|单位|有限公司|docx|提出|完善|依托|实现全流程)", t, re.I):
        return False
    if not re.search(r"[\u4e00-\u9fff]{3,}", t):
        return False
    return True


def _normalize_core_function_line(line: str) -> str | None:
    t = re.sub(r"^[\d\.、\)\-\*•]+\s*", "", (line or "").strip())
    t = re.sub(r"^(核心功能|主要功能|功能点)[：:]\s*", "", t)
    t = t.strip("\"'“”‘’「」")
    if _is_valid_core_function(t):
        return t[:28]
    return None


def build_core_functions_heuristic(capabilities: list[str], corpus: str) -> list[str]:
    found: list[str] = []
    for pat in [
        r"(?:核心功能|主要功能|功能模块)[是为：:]\s*([^。\n；;]{6,120})",
        r"(?:建设内容|业务能力)[是为：:]\s*([^。\n；;]{6,120})",
    ]:
        for m in re.finditer(pat, corpus[:50_000], re.IGNORECASE):
            block = (m.group(1) or "").strip()
            parts = re.split(r"[；;]\s*|\n+", block)
            for part in parts:
                part = re.sub(r"^\d+[\.、\)]\s*", "", part.strip())
                normalized = _normalize_core_function_line(part)
                if normalized and normalized not in found:
                    found.append(normalized)
                if len(found) >= 6:
                    return found
    for cap in capabilities:
        text = _strip_phrase_label(cap)
        for part in re.split(r"[；;]\s*|\n+", text):
            part = re.sub(r"^\d+[\.、\)]\s*", "", part.strip())[:80]
            normalized = _normalize_core_function_line(part)
            if normalized and normalized not in found:
                found.append(normalized)
            if len(found) >= 6:
                return found
    return found[:6]


def generate_core_functions_with_llm(
    agent: LlmAgent,
    task: ReviewTask,
    *,
    excerpt: str,
) -> list[str]:
    if not excerpt.strip():
        return []
    user_prompt = (
        f"任务名称：{task.name}\n"
        f"项目标识：{resolve_task_project_key(task) or '—'}\n\n"
        "请根据下列方案材料，提炼 4～6 项核心功能（可交付业务能力点）。\n"
        "每项 6～20 个汉字，如「政策智能匹配」「工单闭环处置」「经济数据监测预警」。\n"
        "禁止文件名、单位名、空泛表述（如「系统建设」「在某某方面」）。\n"
        '只输出 JSON：{"core_functions": ["功能1", "功能2", ...]}\n\n'
        f"{excerpt}"
    )
    messages = [
        {"role": "system", "content": _OVERVIEW_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    try:
        content = chat_completion(
            agent,
            messages,
            temperature=0.15,
            max_tokens=400,
            timeout=90.0,
        )
    except Exception:
        return []
    found: list[str] = []
    raw = (content or "").strip()
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            obj = json.loads(raw[start:end])
            items = obj.get("core_functions") if isinstance(obj, dict) else None
            if isinstance(items, list):
                for item in items:
                    normalized = _normalize_core_function_line(str(item))
                    if normalized and normalized not in found:
                        found.append(normalized)
                    if len(found) >= 6:
                        return found
    except Exception:
        pass
    for line in raw.split("\n"):
        normalized = _normalize_core_function_line(line)
        if normalized and normalized not in found:
            found.append(normalized)
        if len(found) >= 6:
            break
    return found


def build_profile_from_task(db: Session, task: ReviewTask) -> ProjectMemoryProfile:
    """从已解析材料生成/更新项目画像（概述优先 LLM，其余字段启发式）。"""
    profile = db.query(ProjectMemoryProfile).filter_by(task_id=task.id).first()
    if not profile:
        profile = ProjectMemoryProfile(task_id=task.id)
        db.add(profile)

    profile.project_key = resolve_task_project_key(task)
    profile.version = (getattr(task, "version", None) or "").strip() or None
    profile.phase = getattr(task, "phase", None) or "implementation"
    profile.index_status = "pending"
    db.flush()

    try:
        chunks = _all_retrieved_chunks(db, task.id)
        if not chunks and not (task.proposal_body or "").strip():
            profile.index_status = "failed"
            profile.index_error = "无解析材料，无法建立记忆索引"
            profile.indexed_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(profile)
            return profile

        corpus = _collect_corpus_text(db, task.id)
        if task.proposal_body:
            corpus = f"{task.proposal_body}\n{corpus}"

        goals = _extract_phrases(
            corpus,
            [
                r"(建设目标[是为：:]\s*[^。\n；;]{4,120})",
                r"(项目目标[是为：:]\s*[^。\n；;]{4,120})",
                r"(业务目标[是为：:]\s*[^。\n；;]{4,120})",
            ],
            limit=8,
        )
        capabilities = _extract_phrases(
            corpus,
            [
                r"(建设内容[是为：:]\s*[^。\n；;]{4,160})",
                r"(主要功能[是为：:]\s*[^。\n；;]{4,160})",
                r"(核心能力[是为：:]\s*[^。\n；;]{4,160})",
            ],
            limit=10,
        )
        systems = _extract_system_names(corpus, chunks, capabilities)
        top_keywords = _build_profile_keywords(chunks, corpus)

        section_titles = list(
            dict.fromkeys(
                [c.section_title.strip() for c in chunks if c.section_title and c.section_title.strip()]
            )
        )[:10]

        summary_parts = [
            f"任务：{task.name}",
            f"项目标识：{profile.project_key or '—'}",
            f"版本：{profile.version or '—'}",
        ]
        if goals:
            summary_parts.append(f"建设目标摘要：{goals[0][:200]}")
        if section_titles:
            summary_parts.append(f"主要章节：{'、'.join(section_titles[:6])}")
        if top_keywords:
            summary_parts.append(f"关键词：{'、'.join(top_keywords[:10])}")

        heuristic_overview = build_project_overview(
            task, goals, capabilities, chunks, corpus=corpus
        )
        agent = _resolve_agent_for_memory(db, task)
        llm_overview = (
            generate_project_overview_with_llm(
                db,
                task,
                agent,
                corpus=corpus,
                chunks=chunks,
                goals=goals,
                capabilities=capabilities,
            )
            if agent
            else None
        )
        if llm_overview and _is_valid_overview(llm_overview):
            profile.overview_text = llm_overview
        elif heuristic_overview and _is_valid_overview(heuristic_overview):
            profile.overview_text = heuristic_overview
        else:
            profile.overview_text = None

        overview_excerpt = _overview_source_excerpt(
            task, corpus, chunks, goals=goals, capabilities=capabilities
        )
        heuristic_core = build_core_functions_heuristic(capabilities, corpus)
        core_functions = heuristic_core
        if agent:
            llm_core = generate_core_functions_with_llm(
                agent, task, excerpt=overview_excerpt
            )
            if len(llm_core) >= 2:
                core_functions = llm_core
        profile.core_functions_json = json.dumps(core_functions, ensure_ascii=False)

        profile.summary_text = "\n".join(summary_parts)[:4000]
        profile.goals_json = json.dumps(goals, ensure_ascii=False)
        profile.capabilities_json = json.dumps(capabilities, ensure_ascii=False)
        profile.systems_json = json.dumps(systems, ensure_ascii=False)
        profile.keywords_json = json.dumps(top_keywords, ensure_ascii=False)
        profile.char_count = task.doc_total_chars
        profile.chunk_count = task.doc_total_chunks or len(chunks)
        profile.index_status = "ready"
        profile.index_error = None
        profile.indexed_at = datetime.now(timezone.utc)
    except Exception as e:
        profile.index_status = "failed"
        profile.index_error = str(e)[:500]
        profile.indexed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(profile)
    return profile


def ensure_task_memory_index(db: Session, task: ReviewTask) -> ProjectMemoryProfile | None:
    if getattr(task, "analysis_status", "draft") not in INDEXABLE_STATUSES:
        return None
    if not task.doc_total_chunks and not (task.proposal_body or "").strip():
        return None
    return build_profile_from_task(db, task)


def _profile_keyword_set(profile: ProjectMemoryProfile) -> set[str]:
    terms = set(_expand_terms(_parse_json_list(profile.keywords_json)))
    for field in (profile.goals_json, profile.capabilities_json, profile.systems_json):
        for item in _parse_json_list(field):
            terms.update(_expand_terms([item]))
    if profile.summary_text:
        terms.update(_expand_terms([profile.summary_text[:2000]]))
    if profile.project_key:
        terms.add(_normalize_text(profile.project_key))
    return {t for t in terms if len(t) >= 2}


def _similarity_score(
    source_task: ReviewTask,
    source_profile: ProjectMemoryProfile,
    target_task: ReviewTask,
    target_profile: ProjectMemoryProfile,
) -> float:
    if not tasks_are_comparable(source_task, target_task):
        return 0.0
    sa = _profile_keyword_set(source_profile)
    sb = _profile_keyword_set(target_profile)
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb)
    jaccard = inter / union if union else 0.0

    text_score = _text_overlap_ratio(
        source_profile.summary_text or "",
        target_profile.summary_text or "",
    )
    name_score = _text_overlap_ratio(source_task.name or "", target_task.name or "")
    return round(min(0.98, jaccard * 0.55 + text_score * 0.3 + name_score * 0.15), 4)


def list_ready_profiles(
    db: Session,
    *,
    exclude_task_id: int | None = None,
    exclude_project_key: str | None = None,
    phase: str | None = None,
    q: str | None = None,
    limit: int = 200,
) -> list[tuple[ReviewTask, ProjectMemoryProfile]]:
    query = (
        db.query(ReviewTask, ProjectMemoryProfile)
        .join(ProjectMemoryProfile, ProjectMemoryProfile.task_id == ReviewTask.id)
        .filter(ProjectMemoryProfile.index_status == "ready")
    )
    if phase in ("pre_review", "implementation"):
        query = query.filter(ReviewTask.phase == phase)
    if exclude_task_id is not None:
        query = query.filter(ReviewTask.id != exclude_task_id)
    if exclude_project_key:
        query = query.filter(
            (ProjectMemoryProfile.project_key.is_(None))
            | (ProjectMemoryProfile.project_key != exclude_project_key)
        )
    term = (q or "").strip().lower()
    if term:
        like = f"%{term}%"
        query = query.filter(
            (ReviewTask.name.ilike(like))
            | (ProjectMemoryProfile.project_key.ilike(like))
            | (ProjectMemoryProfile.summary_text.ilike(like))
            | (ProjectMemoryProfile.overview_text.ilike(like))
            | (ProjectMemoryProfile.keywords_json.ilike(like))
        )
    rows = query.order_by(ProjectMemoryProfile.indexed_at.desc(), ReviewTask.id.desc()).limit(limit).all()
    return list(rows)


def find_similar_tasks(
    db: Session,
    source_task: ReviewTask,
    *,
    limit: int = 10,
    min_score: float = 0.08,
) -> list[dict[str, Any]]:
    source_profile = db.query(ProjectMemoryProfile).filter_by(task_id=source_task.id, index_status="ready").first()
    if not source_profile:
        ensure_task_memory_index(db, source_task)
        source_profile = db.query(ProjectMemoryProfile).filter_by(task_id=source_task.id).first()
    if not source_profile or source_profile.index_status != "ready":
        return []

    src_key = resolve_task_project_key(source_task)
    candidates = list_ready_profiles(
        db,
        exclude_task_id=source_task.id,
        exclude_project_key=src_key,
        limit=300,
    )
    scored: list[dict[str, Any]] = []
    for target_task, target_profile in candidates:
        score = _similarity_score(source_task, source_profile, target_task, target_profile)
        if score < min_score:
            continue
        overlap = sorted(_profile_keyword_set(source_profile) & _profile_keyword_set(target_profile))[:12]
        scored.append(
            {
                "task": target_task,
                "profile": target_profile,
                "similarity_score": score,
                "overlap_keywords": overlap,
            }
        )
    scored.sort(key=lambda x: x["similarity_score"], reverse=True)
    return scored[:limit]


def _top_chunk_pairs(db: Session, source_task_id: int, target_task_id: int, limit: int = 5) -> list[dict[str, Any]]:
    source_chunks = _all_retrieved_chunks(db, source_task_id)[:40]
    target_chunks = _all_retrieved_chunks(db, target_task_id)[:40]
    pairs: list[dict[str, Any]] = []
    for sc in source_chunks:
        for tc in target_chunks:
            score = _text_overlap_ratio(sc.content[:2500], tc.content[:2500])
            if score < 0.12:
                continue
            pairs.append(
                {
                    "score": round(score, 4),
                    "source_chunk_id": sc.chunk_id,
                    "source_file_name": sc.file_name,
                    "source_section_title": sc.section_title,
                    "source_excerpt": (sc.content or "")[:480],
                    "target_chunk_id": tc.chunk_id,
                    "target_file_name": tc.file_name,
                    "target_section_title": tc.section_title,
                    "target_excerpt": (tc.content or "")[:480],
                }
            )
    pairs.sort(key=lambda x: x["score"], reverse=True)
    return pairs[:limit]


def compare_tasks(
    db: Session,
    source_task: ReviewTask,
    target_task: ReviewTask,
) -> dict[str, Any]:
    sp = db.query(ProjectMemoryProfile).filter_by(task_id=source_task.id).first()
    tp = db.query(ProjectMemoryProfile).filter_by(task_id=target_task.id).first()
    if not sp or sp.index_status != "ready":
        sp = build_profile_from_task(db, source_task)
    if not tp or tp.index_status != "ready":
        tp = build_profile_from_task(db, target_task)

    if not tasks_are_comparable(source_task, target_task):
        sk = resolve_task_project_key(source_task)
        tk = resolve_task_project_key(target_task)
        return {
            "comparable": False,
            "message": (
                f"项目标识相同（{sk or tk}），视为同一项目的不同版本，不做重复建设互比。"
                if sk and sk == tk
                else "无法比对同一任务。"
            ),
            "similarity_score": 0.0,
            "duplicate_risk": "none",
            "overlap_keywords": [],
            "findings": [],
            "source_profile": sp,
            "target_profile": tp,
            "chunk_pairs": [],
        }

    if not sp or sp.index_status != "ready":
        sp = build_profile_from_task(db, source_task)
    if not tp or tp.index_status != "ready":
        tp = build_profile_from_task(db, target_task)

    score = _similarity_score(source_task, sp, target_task, tp)
    overlap_kw = sorted(_profile_keyword_set(sp) & _profile_keyword_set(tp))[:20]

    if score >= 0.45:
        risk = "high"
        risk_label = "疑似重复建设风险较高"
    elif score >= 0.22:
        risk = "medium"
        risk_label = "存在一定功能或目标重叠，建议说明差异与统筹关系"
    else:
        risk = "low"
        risk_label = "相似度较低，暂未见明显重复建设迹象"

    findings: list[str] = []
    if overlap_kw:
        findings.append(f"关键词重叠：{'、'.join(overlap_kw[:8])}" + ("…" if len(overlap_kw) > 8 else ""))
    sg = _parse_json_list(sp.systems_json)
    tg = _parse_json_list(tp.systems_json)
    common_systems = [s for s in sg if any(_text_overlap_ratio(s, t) >= 0.5 for t in tg)]
    if common_systems:
        findings.append(f"系统/平台表述相近：{'、'.join(common_systems[:5])}")

    return {
        "comparable": True,
        "message": risk_label,
        "similarity_score": score,
        "duplicate_risk": risk,
        "overlap_keywords": overlap_kw,
        "source_profile": sp,
        "target_profile": tp,
        "chunk_pairs": _top_chunk_pairs(db, source_task.id, target_task.id),
        "findings": findings,
    }


def format_similar_projects_for_review(db: Session, task: ReviewTask, limit: int = 5) -> str | None:
    """供「重复建设与统筹集约」维度审查时注入提示词。"""
    similar = find_similar_tasks(db, task, limit=limit, min_score=0.1)
    if not similar:
        return None
    blocks: list[str] = []
    src_key = resolve_task_project_key(task) or "—"
    blocks.append(
        f"【全库记忆比对】当前任务项目标识为「{src_key}」。"
        "以下历史方案与当前项目标识不同，供重复建设排查参考（同项目不同版本已自动排除）："
    )
    for idx, item in enumerate(similar, start=1):
        t: ReviewTask = item["task"]
        p: ProjectMemoryProfile = item["profile"]
        blocks.append(
            f"\n[历史 {idx}] 任务：{t.name}（项目：{p.project_key or '—'}，版本：{p.version or '—'}，"
            f"相似度 {item['similarity_score']:.0%}）\n摘要：{(p.summary_text or '')[:600]}"
        )
        if item["overlap_keywords"]:
            blocks.append(f"重叠关键词：{'、'.join(item['overlap_keywords'][:8])}")
    blocks.append(
        "\n若发现与上述历史方案存在能力或目标重叠，请结合当前证据指出疑似重复建设，"
        "并说明与历史项目的差异或统筹复用建议；勿将同项目多版本材料误判为两个独立项目。"
    )
    return "\n".join(blocks)


def reindex_all_ready_tasks(db: Session, limit: int = 500) -> int:
    tasks = (
        db.query(ReviewTask)
        .filter(ReviewTask.analysis_status.in_(("indexed", "reviewed")))
        .order_by(ReviewTask.id.desc())
        .limit(limit)
        .all()
    )
    count = 0
    for index, task in enumerate(tasks):
        if task.doc_total_chunks or (task.proposal_body or "").strip():
            if index > 0:
                time.sleep(0.6)
            build_profile_from_task(db, task)
            count += 1
    return count
