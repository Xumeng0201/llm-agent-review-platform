from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .framework_criteria import clip_criteria_text
from .llm_client import chat_completion
from .models import (
    DocumentChunk,
    DocumentFile,
    IssueEvidence,
    ReviewFrameworkVersion,
    ReviewIssue,
    ReviewRun,
    ReviewTask,
)


@dataclass
class RetrievedChunk:
    chunk_id: int
    file_name: str
    section_title: str | None
    page_from: int | None
    page_to: int | None
    content: str
    score: float
    summary: str | None = None
    keywords: list[str] = field(default_factory=list)
    dimension_hints: list[str] = field(default_factory=list)


@dataclass
class DraftIssue:
    dimension_id: int
    dimension_key: str
    dimension_title: str
    severity: str
    title: str
    description: str
    reason: str
    suggestion: str
    needs_supplement: bool
    manual_review: bool
    evidence_chunk_ids: list[int] = field(default_factory=list)


@dataclass
class ReviewSummary:
    overall_assessment: str
    missing_materials: list[str]
    manual_focus: list[str]


def _all_title_variants(node: dict[str, Any]) -> list[str]:
    values = [str(node.get("title") or "").strip()]
    values.extend(str(x).strip() for x in node.get("aliases", []) if str(x).strip())
    return [x for x in values if x]


def _normalize_heading(value: str) -> str:
    value = (value or "").strip()
    value = re.sub(r"^\s*第[一二三四五六七八九十0-9]+[章节部分篇]\s*", "", value)
    value = re.sub(r"^\s*[0-9一二三四五六七八九十]+(?:\.[0-9]+)*[、.\s]+", "", value)
    return re.sub(r"[\s，。,；：:、（）()《》“”\"'—\-]+", "", value.lower())


def _chunk_match_score(chunk: RetrievedChunk, variants: list[str]) -> float:
    title = _normalize_heading(chunk.section_title or "")
    summary = _normalize_heading(chunk.summary or "")
    keywords = [_normalize_heading(x) for x in chunk.keywords]
    content = _normalize_heading(chunk.content[:2200])
    best = 0.0
    for variant in variants:
        needle = _normalize_heading(variant)
        if not needle:
            continue
        if title and (needle in title or title in needle):
            best = max(best, 1.0)
        elif summary and needle in summary:
            best = max(best, 0.82)
        elif any(needle in kw or kw in needle for kw in keywords if kw):
            best = max(best, 0.72)
        elif content and needle in content:
            best = max(best, 0.68)
    return best


def _all_retrieved_chunks(db, task_id: int) -> list[RetrievedChunk]:
    rows = (
        db.query(DocumentChunk, DocumentFile)
        .join(DocumentFile, DocumentChunk.document_file_id == DocumentFile.id)
        .filter(DocumentChunk.task_id == task_id)
        .all()
    )
    chunks: list[RetrievedChunk] = []
    for chunk, doc in rows:
        chunks.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                file_name=doc.file_name,
                section_title=chunk.section_title,
                page_from=chunk.page_from,
                page_to=chunk.page_to,
                content=chunk.content,
                score=0.0,
                summary=chunk.summary or None,
                keywords=_parse_json_list(chunk.keywords_json),
                dimension_hints=_parse_json_list(chunk.dimension_hints_json),
            )
        )
    return chunks


def audit_template_compliance(
    db,
    task_id: int,
    template_schema: dict[str, Any] | None,
) -> list[DraftIssue]:
    if not template_schema:
        return []
    chapters = template_schema.get("chapters") or []
    if not chapters:
        return []

    dim = template_schema.get("dimension") or {}
    dimension_id = int(dim.get("id") or 9000)
    dimension_key = str(dim.get("key") or "template_compliance")
    dimension_title = str(dim.get("title") or "模板符合性")

    all_chunks = _all_retrieved_chunks(db, task_id)
    if not all_chunks:
        return []

    issues: list[DraftIssue] = []
    missing_parent_titles: set[str] = set()

    for chapter in chapters:
        chapter_variants = _all_title_variants(chapter)
        chapter_matches = [
            chunk for chunk in all_chunks if _chunk_match_score(chunk, chapter_variants) >= 0.68
        ]
        chapter_found = bool(chapter_matches)

        if chapter.get("required") and not chapter_found:
            missing_parent_titles.add(str(chapter.get("title") or ""))
            issues.append(
                DraftIssue(
                    dimension_id=dimension_id,
                    dimension_key=dimension_key,
                    dimension_title=dimension_title,
                    severity="serious",
                    title=f"缺少模板章节：{chapter.get('title')}",
                    description=(
                        f"未在当前方案中识别到模板要求的一级章节“{chapter.get('title')}”，"
                        "方案结构与编制模板存在明显偏差。"
                    ),
                    reason=(
                        "该章节属于模板中的必备模块，缺失后会影响审查人员对方案完整性、"
                        "论证链条和正式编制规范性的判断。"
                    ),
                    suggestion=(
                        f"建议按模板补充“{chapter.get('title')}”章节，并在章节下完整展开模板要求的小节内容。"
                    ),
                    needs_supplement=True,
                    manual_review=True,
                )
            )

        for child in chapter.get("children", []):
            child_title = str(child.get("title") or "").strip()
            if not child_title:
                continue
            if chapter.get("required") and not chapter_found:
                continue
            variants = _all_title_variants(child)
            pool = chapter_matches or all_chunks
            child_matches = [chunk for chunk in pool if _chunk_match_score(chunk, variants) >= 0.68]
            if child.get("required") and not child_matches:
                issues.append(
                    DraftIssue(
                        dimension_id=dimension_id,
                        dimension_key=dimension_key,
                        dimension_title=dimension_title,
                        severity="major",
                        title=f"缺少模板小节：{child_title}",
                        description=(
                            f"模板在“{chapter.get('title')}”下要求包含“{child_title}”，"
                            "但当前方案中未识别到对应的小节或等价内容。"
                        ),
                        reason=(
                            "该小节属于模板要求的关键编制项，缺失通常意味着方案在相应模块上的说明"
                            "不完整，后续正式评审容易被要求补充。"
                        ),
                        suggestion=(
                            f"建议在“{chapter.get('title')}”章节下补充“{child_title}”，"
                            "并按模板要求写明对应内容和支撑依据。"
                        ),
                        needs_supplement=True,
                        manual_review=True,
                        evidence_chunk_ids=[chunk.chunk_id for chunk in chapter_matches[:2]],
                    )
                )

    return issues


def _default_issue_review_preamble() -> str:
    return """你是一名政府和大型企事业单位项目方案审查专家，负责审查大模型、智能体类项目方案。

你的目标不是打分，而是输出“问题清单”。你必须严格围绕系统提供的审查维度工作，并遵守以下原则：
1. 只输出问题，不输出总分、分数、通过率，不自行生成评分结论。
2. 每条问题都必须有证据支撑；没有证据时只能写“未见材料说明”。
3. 问题要分为：严重问题、一般问题、轻微问题。
4. 严重问题用于标识可能影响立项、合规、安全、可实施性或验收的重大缺口。
5. 一般问题用于标识论证不足、机制不完整、材料不充分等重要问题。
6. 轻微问题用于标识表述、结构、细节完整性等可较快修正的问题。
7. 你的整改建议必须具体、克制、可执行，不能空泛。
8. 你的口径应当偏审慎，宁可提示“需补充材料”，也不要把缺失内容脑补完整。"""


def build_issue_review_system_prompt(
    agent,
    dimension: dict,
    criteria_supplement: str | None = None,
) -> str:
    custom = (getattr(agent, "system_prompt", None) or "").strip()
    preamble = custom or _default_issue_review_preamble()
    supplement_block = ""
    if criteria_supplement and criteria_supplement.strip():
        supplement_block = f"""

【本阶段已上传的审核要点全文（与下列维度规则一并遵守；若表述不完全一致，以更严格、更贴近政府数据项目审核实务的口径为准）】
{clip_criteria_text(criteria_supplement)}
"""
    hard_rules = f"""
{supplement_block}

【以下为当前运行的系统硬性要求，必须遵守】
当前审查维度：{dimension['title']}
审查目标：{dimension.get('goal', '')}

重点关注：
{chr(10).join('- ' + x for x in dimension.get('review_focus', []))}

严重问题判定参考：
{chr(10).join('- ' + x for x in dimension.get('serious_rules', []))}

一般问题判定参考：
{chr(10).join('- ' + x for x in dimension.get('major_rules', []))}

轻微问题判定参考：
{chr(10).join('- ' + x for x in dimension.get('minor_rules', []))}

输出要求：
1. 只能输出 JSON，不要使用 markdown 代码块，不要输出任何 JSON 以外的文字。
2. JSON 中必须使用英文双引号与英文逗号，禁止在字段之间使用中文逗号「，」。
3. 不能输出 score、评分、总分、通过/不通过判断。
4. 每条问题必须绑定 evidence_ids。
5. 如果证据不足，请在 description 或 reason 中明确写出“未见材料说明”。

JSON 结构：
{{
  "issues": [
    {{
      "severity": "serious|major|minor",
      "title": "问题标题",
      "description": "问题描述",
      "reason": "为什么这是问题",
      "suggestion": "整改建议",
      "needs_supplement": true,
      "manual_review": false,
      "evidence_ids": [1, 2]
    }}
  ]
}}"""
    return preamble + hard_rules


def _criteria_supplement_for_task(db, task: ReviewTask) -> str | None:
    fid = getattr(task, "framework_version_id", None)
    if not fid:
        return None
    fv = db.query(ReviewFrameworkVersion).filter_by(id=fid).first()
    if not fv or not (fv.extracted_text or "").strip():
        return None
    return fv.extracted_text


def normalize_dimensions(framework: dict) -> list[dict[str, Any]]:
    if framework.get("dimensions"):
        return framework["dimensions"]
    dimensions: list[dict[str, Any]] = []
    for indicator in framework.get("indicators", []):
        review_focus: list[str] = []
        query_terms: list[str] = []
        common_missing: list[str] = []
        for sec in indicator.get("secondaries", []):
            review_focus.extend(sec.get("audit_points", []))
            query_terms.append(sec.get("title", ""))
            query_terms.extend(sec.get("audit_points", []))
            common_missing.extend(sec.get("basis", []))
        dimensions.append(
            {
                "id": indicator["id"],
                "key": indicator.get("key") or f"dimension_{indicator['id']}",
                "title": indicator["title"],
                "goal": indicator.get("goal", ""),
                "review_focus": review_focus[:12],
                "query_terms": [x for x in query_terms if x][:20],
                "serious_rules": ["方案未充分体现关键内容，可能影响正式审查通过。"],
                "major_rules": ["关键论证不足或支撑材料不完整。"],
                "minor_rules": ["表述、结构或细节层面仍可优化。"],
                "required_evidence": common_missing[:8],
                "common_missing_items": common_missing[:8],
                "manual_review_triggers": [],
            }
        )
    return dimensions


def retrieve_chunks_for_dimension(db, task_id: int, dimension: dict, limit: int = 12) -> list[RetrievedChunk]:
    query_terms = _expand_terms(
        (dimension.get("query_terms") or [])
        + (dimension.get("required_evidence") or [])
        + (dimension.get("review_focus") or [])
        + [dimension.get("title") or ""]
    )
    rows = (
        db.query(DocumentChunk, DocumentFile)
        .join(DocumentFile, DocumentChunk.document_file_id == DocumentFile.id)
        .filter(DocumentChunk.task_id == task_id)
        .all()
    )
    scored: list[RetrievedChunk] = []
    for chunk, doc in rows:
        text = (chunk.content or "").lower()
        title = (chunk.section_title or "").lower()
        summary = chunk.summary or ""
        summary_lower = summary.lower()
        keywords = _parse_json_list(chunk.keywords_json)
        keyword_text = " ".join(keywords).lower()
        hint_keys = _parse_json_list(chunk.dimension_hints_json)
        score = 0.0
        for term in query_terms:
            if term in title:
                score += 4.0
            if term in summary_lower:
                score += 2.0
            if term in keyword_text:
                score += 2.2
            if term in text:
                score += 1.0
        if dimension.get("key") in hint_keys:
            score += 6.0
        if title and any(focus.lower() in title for focus in dimension.get("review_focus", []) if focus):
            score += 2.5
        if any(rule_term in summary_lower for rule_term in _expand_terms(dimension.get("serious_rules", []))[:8]):
            score += 1.5
        if score <= 0:
            continue
        scored.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                file_name=doc.file_name,
                section_title=chunk.section_title,
                page_from=chunk.page_from,
                page_to=chunk.page_to,
                content=chunk.content,
                score=score,
                summary=summary or None,
                keywords=keywords,
                dimension_hints=hint_keys,
            )
        )
    scored.sort(key=lambda x: (x.score, len(x.content)), reverse=True)
    return scored[:limit]


def _expand_terms(values: list[str]) -> list[str]:
    terms: list[str] = []
    for value in values:
        for token in re.split(r"[、，,。\s/（）()]+", value):
            token = token.strip().lower()
            if len(token) >= 2:
                terms.append(token)
    return list(dict.fromkeys(terms))


def _parse_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except Exception:
        return []
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _repair_json_text(text: str) -> str:
    """修复模型输出里常见的非标准 JSON（不改变字符串内部内容的尽力修复）。"""
    text = text.replace("\ufeff", "").replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    # 结构性中文逗号（引号/括号后的 ，）→ 英文逗号
    text = re.sub(r'([}\]"\d])\s*，\s*(?=["{\[])', r"\1,", text)
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return text


def _try_close_truncated_json(text: str) -> str:
    """输出被 max_tokens 截断时，尝试补全未闭合的引号与括号。"""
    stack: list[str] = []
    in_string = False
    escape = False
    for ch in text:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}]" and stack and stack[-1] == ch:
            stack.pop()
    suffix = '"' if in_string else ""
    suffix += "".join(reversed(stack))
    return text + suffix if suffix else text


def _json_candidates_from_llm_text(text: str) -> list[str]:
    text = (text or "").strip()
    out: list[str] = []
    seen: set[str] = set()

    def add(s: str) -> None:
        s = s.strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)

    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if m:
        add(m.group(1))
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        add(text[start : end + 1])
    if text.startswith("{"):
        add(text)
    return out


def _extract_json_object(text: str) -> dict[str, Any]:
    last_err: json.JSONDecodeError | None = None
    for raw in _json_candidates_from_llm_text(text):
        for variant in (raw, _repair_json_text(raw), _try_close_truncated_json(_repair_json_text(raw))):
            try:
                obj = json.loads(variant)
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError as e:
                last_err = e
    if last_err is not None:
        raise last_err
    raise json.JSONDecodeError("未找到 JSON 对象", text or "", 0)


def _parse_issue_discovery_response(
    content: str,
    *,
    agent,
    retry_messages: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    try:
        return _extract_json_object(content)
    except json.JSONDecodeError as first_err:
        if agent and retry_messages:
            try:
                repaired = chat_completion(
                    agent,
                    retry_messages
                    + [
                        {"role": "assistant", "content": content[:12000]},
                        {
                            "role": "user",
                            "content": (
                                "你上一条回复不是合法 JSON，无法被程序解析。"
                                "请仅重新输出完整 JSON，不要 markdown 代码块、不要任何解释文字。"
                                "结构与之前要求的 issues 数组完全一致。"
                            ),
                        },
                    ],
                    max_tokens=4096,
                    temperature=0.0,
                )
                return _extract_json_object(repaired)
            except (json.JSONDecodeError, Exception):
                pass
        raise ValueError(
            "大模型返回的内容无法解析为 JSON（可能含多余说明、逗号错误或输出被截断）。"
            "请重试「问题审查」；若仍失败，可换用更稳定的模型或缩短材料后重试。"
        ) from first_err


def build_issue_discovery_user_prompt(
    task_name: str,
    dimension: dict,
    retrieved_chunks: list[RetrievedChunk],
    memory_context: str | None = None,
) -> str:
    blocks: list[str] = []
    for idx, chunk in enumerate(retrieved_chunks, start=1):
        loc = [f"文件：{chunk.file_name}"]
        if chunk.page_from is not None:
            if chunk.page_to and chunk.page_to != chunk.page_from:
                loc.append(f"页码：{chunk.page_from}-{chunk.page_to}")
            else:
                loc.append(f"页码：{chunk.page_from}")
        if chunk.section_title:
            loc.append(f"章节：{chunk.section_title}")
        extra: list[str] = []
        if chunk.summary:
            extra.append(f"摘要：{chunk.summary[:160]}")
        if chunk.keywords:
            extra.append(f"关键词：{'、'.join(chunk.keywords[:8])}")
        blocks.append(f"[证据 {idx}] {' | '.join(loc)}\n" + "\n".join(extra + [chunk.content[:1800]]))
    memory_block = f"\n\n{memory_context}\n\n" if memory_context else ""
    return f"""任务名称：{task_name}
审查维度：{dimension['title']}
{memory_block}
以下是候选证据，请基于这些证据发现问题：

{chr(10).join(chr(10) + x for x in blocks)}"""


def discover_issues_for_dimension(
    agent,
    task_name: str,
    dimension: dict,
    retrieved_chunks: list[RetrievedChunk],
    criteria_supplement: str | None = None,
    memory_context: str | None = None,
) -> list[DraftIssue]:
    if not retrieved_chunks:
        return []
    messages = [
        {
            "role": "system",
            "content": build_issue_review_system_prompt(
                agent, dimension, criteria_supplement=criteria_supplement
            ),
        },
        {
            "role": "user",
            "content": build_issue_discovery_user_prompt(
                task_name, dimension, retrieved_chunks, memory_context=memory_context
            ),
        },
    ]
    content = chat_completion(
        agent,
        messages,
        max_tokens=4096,
        temperature=0.1,
    )
    obj = _parse_issue_discovery_response(content, agent=agent, retry_messages=messages)
    raw_items = obj.get("issues", [])
    issues: list[DraftIssue] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        evidence_ids = item.get("evidence_ids") or []
        issues.append(
            DraftIssue(
                dimension_id=dimension["id"],
                dimension_key=dimension["key"],
                dimension_title=dimension["title"],
                severity=str(item.get("severity") or "major"),
                title=str(item.get("title") or "").strip()[:255],
                description=str(item.get("description") or "").strip(),
                reason=str(item.get("reason") or "").strip(),
                suggestion=str(item.get("suggestion") or "").strip(),
                needs_supplement=bool(item.get("needs_supplement")),
                manual_review=bool(item.get("manual_review")),
                evidence_chunk_ids=[
                    retrieved_chunks[i - 1].chunk_id
                    for i in evidence_ids
                    if isinstance(i, int) and 1 <= i <= len(retrieved_chunks)
                ],
            )
        )
    return [x for x in issues if x.title and x.description]


def normalize_issue_title(title: str) -> str:
    return (
        title.strip()
        .replace("未明确", "")
        .replace("未说明", "")
        .replace("未体现", "")
        .replace("未提供", "")
        .replace("缺少", "")
        .replace("缺乏", "")
        .replace(" ", "")
    )


def _normalize_text(value: str) -> str:
    return re.sub(r"[\s，。,；：:、（）()《》“”\"'—\-]+", "", (value or "").strip().lower())


def _text_overlap_ratio(a: str, b: str) -> float:
    sa = set(re.findall(r"[\u4e00-\u9fffA-Za-z0-9]{2,12}", a))
    sb = set(re.findall(r"[\u4e00-\u9fffA-Za-z0-9]{2,12}", b))
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    return inter / max(1, min(len(sa), len(sb)))


def _issues_similar(a: DraftIssue, b: DraftIssue) -> bool:
    if normalize_issue_title(a.title) == normalize_issue_title(b.title):
        return True
    if a.dimension_key == b.dimension_key:
        title_overlap = _text_overlap_ratio(a.title, b.title)
        desc_overlap = _text_overlap_ratio(a.description, b.description)
        if title_overlap >= 0.6 and desc_overlap >= 0.35:
            return True
    if a.evidence_chunk_ids and b.evidence_chunk_ids:
        overlap = len(set(a.evidence_chunk_ids) & set(b.evidence_chunk_ids))
        if overlap >= 1 and _text_overlap_ratio(a.title + a.description, b.title + b.description) >= 0.45:
            return True
    return False


def severity_rank(severity: str) -> int:
    return {"minor": 1, "major": 2, "serious": 3}.get(severity, 0)


def merge_similar_issues(issues: list[DraftIssue]) -> list[DraftIssue]:
    merged: list[DraftIssue] = []
    for issue in issues:
        found = None
        for existing in merged:
            if _issues_similar(existing, issue):
                found = existing
                break
        if not found:
            merged.append(issue)
            continue
        if severity_rank(issue.severity) > severity_rank(found.severity):
            found.severity = issue.severity
        if len(_normalize_text(issue.description)) > len(_normalize_text(found.description)):
            found.description = issue.description
        if len(_normalize_text(issue.reason)) > len(_normalize_text(found.reason)):
            found.reason = issue.reason
        if len(_normalize_text(issue.suggestion)) > len(_normalize_text(found.suggestion)):
            found.suggestion = issue.suggestion
        found.needs_supplement = found.needs_supplement or issue.needs_supplement
        found.manual_review = found.manual_review or issue.manual_review
        for cid in issue.evidence_chunk_ids:
            if cid not in found.evidence_chunk_ids:
                found.evidence_chunk_ids.append(cid)
    return merged


def build_review_summary(task_name: str, issues: list[DraftIssue]) -> ReviewSummary:
    serious = [x for x in issues if x.severity == "serious"]
    major = [x for x in issues if x.severity == "major"]
    missing_materials: list[str] = []
    manual_focus: list[str] = []
    for issue in issues:
        if issue.needs_supplement and issue.title not in missing_materials:
            missing_materials.append(issue.title)
        if issue.manual_review and issue.title not in manual_focus:
            manual_focus.append(issue.title)
    if serious:
        overall = (
            f"《{task_name}》存在{len(serious)}项严重问题，建议补充整改后再进入正式审查。"
        )
    elif major:
        overall = (
            f"《{task_name}》整体框架基本完整，但存在{len(major)}项一般问题，建议补充完善关键论证和支撑材料。"
        )
    else:
        overall = (
            f"《{task_name}》未发现明显重大缺口，当前问题以轻微修改项为主，建议优化表达并补齐细节材料。"
        )
    return ReviewSummary(
        overall_assessment=overall,
        missing_materials=missing_materials[:10],
        manual_focus=manual_focus[:10],
    )


def persist_review_result(db, task: ReviewTask, run: ReviewRun, summary: ReviewSummary, issues: list[DraftIssue]) -> None:
    task.overall_assessment = summary.overall_assessment
    task.missing_materials = "\n".join(summary.missing_materials) if summary.missing_materials else None
    task.analysis_status = "reviewed"
    task.last_review_run_id = run.id

    db.query(ReviewIssue).filter(ReviewIssue.task_id == task.id).delete()
    db.flush()

    for issue in issues:
        row = ReviewIssue(
            task_id=task.id,
            review_run_id=run.id,
            dimension_id=issue.dimension_id,
            dimension_key=issue.dimension_key,
            dimension_title=issue.dimension_title,
            severity=issue.severity,
            title=issue.title,
            description=issue.description,
            reason=issue.reason,
            suggestion=issue.suggestion,
            needs_supplement=issue.needs_supplement,
            manual_review=issue.manual_review,
            status="open",
        )
        db.add(row)
        db.flush()
        if issue.evidence_chunk_ids:
            chunks = (
                db.query(DocumentChunk, DocumentFile)
                .join(DocumentFile, DocumentChunk.document_file_id == DocumentFile.id)
                .filter(DocumentChunk.id.in_(issue.evidence_chunk_ids))
                .all()
            )
            for chunk, doc in chunks:
                db.add(
                    IssueEvidence(
                        issue_id=row.id,
                        chunk_id=chunk.id,
                        file_name=doc.file_name,
                        page_from=chunk.page_from,
                        page_to=chunk.page_to,
                        section_title=chunk.section_title,
                        quote_text=chunk.content[:1000],
                        rank_score=int(chunk.token_estimate or 0),
                    )
                )

    run.status = "done"
    run.finished_at = datetime.now(timezone.utc)
    db.commit()


def run_issue_review_for_task(
    db,
    task: ReviewTask,
    framework: dict,
    agent,
    dimension_ids: list[int] | None = None,
    template_schema: dict[str, Any] | None = None,
) -> ReviewRun:
    run = ReviewRun(
        task_id=task.id,
        agent_id=agent.id,
        run_type="dimension" if dimension_ids else "full",
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    task.analysis_status = "reviewing"
    db.commit()
    db.refresh(run)

    dimensions = normalize_dimensions(framework)
    if dimension_ids:
        dimensions = [d for d in dimensions if d["id"] in set(dimension_ids)]

    criteria_supplement = _criteria_supplement_for_task(db, task)

    from .cross_project_memory import DUPLICATE_DIMENSION_KEY, format_similar_projects_for_review

    draft_issues: list[DraftIssue] = []
    for dim_index, dim in enumerate(dimensions):
        if dim_index > 0:
            # 维度间留足间隔，降低 DeepSeek 短时限流（403）概率
            time.sleep(2.5)
        retrieved = retrieve_chunks_for_dimension(db, task.id, dim)
        if not retrieved:
            continue
        memory_ctx = None
        if dim.get("key") == DUPLICATE_DIMENSION_KEY:
            memory_ctx = format_similar_projects_for_review(db, task)
        draft_issues.extend(
            discover_issues_for_dimension(
                agent,
                task.name,
                dim,
                retrieved,
                criteria_supplement=criteria_supplement,
                memory_context=memory_ctx,
            )
        )

    if not dimension_ids or any(int(x) == int((template_schema or {}).get("dimension", {}).get("id", 9000)) for x in dimension_ids):
        draft_issues.extend(audit_template_compliance(db, task.id, template_schema))

    merged = merge_similar_issues(draft_issues)
    summary = build_review_summary(task.name, merged)
    persist_review_result(db, task, run, summary, merged)
    db.refresh(run)
    return run
