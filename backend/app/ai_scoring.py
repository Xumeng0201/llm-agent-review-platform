"""根据评测框架与方案文本，调用大模型生成打分建议或完整评审报告（JSON）。"""

from __future__ import annotations

import json
import re
from typing import Any, List

from pydantic import BaseModel, Field, field_validator

from .llm_client import chat_completion
from .models import LlmAgent


class AiScoreItem(BaseModel):
    indicator_id: int = Field(..., ge=1, le=10)
    score: int = Field(..., ge=0, le=10)
    notes: str = Field(default="", max_length=2000)

    @field_validator("notes", mode="before")
    @classmethod
    def notes_str(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v)[:2000]


class AiSuggestResult(BaseModel):
    items: List[AiScoreItem]
    raw_excerpt: str = ""


class AiReportLine(BaseModel):
    indicator_id: int = Field(..., ge=1, le=10)
    score: int = Field(..., ge=0, le=10)
    notes: str = Field(default="", max_length=2000)
    opinion: str = Field(default="", max_length=12000)

    @field_validator("notes", mode="before")
    @classmethod
    def clip_notes(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v)[:2000]

    @field_validator("opinion", mode="before")
    @classmethod
    def clip_opinion(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v)[:12000]


class AiReportResult(BaseModel):
    items: List[AiReportLine]
    conclusion: str = ""
    highlights: str = ""
    issues: str = ""
    raw_excerpt: str = ""


SUGGEST_FORMAT_RULES = """你必须只输出一个 JSON 对象（不要 Markdown 代码块外壳、不要其它说明文字），结构为：
{
  "items": [
    {"indicator_id": 1, "score": 0到10的整数, "notes": "该项打分简要依据"},
    ... 必须包含 indicator_id 从 1 到 10 共 10 条 ...
  ]
}
要求：score 为整数；指标 5（数据合规）、指标 7（安全）若方案明显缺失应压低分；信息不足时在 notes 中说明。"""

REPORT_FORMAT_RULES = """你必须只输出一个 JSON 对象（不要 Markdown 代码块外壳、不要其它说明文字），结构为：
{
  "items": [
    {
      "indicator_id": 1,
      "score": 0到10的整数,
      "notes": "该项打分简要依据",
      "opinion": "对该一级指标的详细评审意见，可分段、分要点，专业具体"
    },
    ... 必须包含 indicator_id 1～10 共 10 条 ...
  ],
  "conclusion": "综合评审结论文本：是否建议通过、主要风险与总体判断（多段文字）",
  "highlights": "项目亮点与优势",
  "issues": "存在问题、整改建议与需补充材料（多段文字）"
}
要求：opinion / conclusion / highlights / issues 均用中文书面语，条理清晰。"""


def _default_role_preamble() -> str:
    return (
        "你是一名资深的信息化建设与大模型、智能体项目方案评审专家，"
        "熟悉立项、技术、数据、安全、运维与成本等维度。"
    )


def build_system_for_suggest(agent: LlmAgent) -> str:
    custom = (agent.system_prompt or "").strip()
    if custom:
        return custom + "\n\n【以下为输出格式硬性要求，必须遵守】\n" + SUGGEST_FORMAT_RULES
    return _default_role_preamble() + "\n\n【以下为输出格式硬性要求，必须遵守】\n" + SUGGEST_FORMAT_RULES


def build_system_for_report(agent: LlmAgent) -> str:
    custom = (agent.system_prompt or "").strip()
    if custom:
        return custom + "\n\n【以下为输出格式硬性要求，必须遵守】\n" + REPORT_FORMAT_RULES
    return (
        _default_role_preamble()
        + "你需要输出完整评审报告所需的结构化结果（分项分数、分项意见、综合结论、亮点与整改建议）。\n\n"
        + "【以下为输出格式硬性要求，必须遵守】\n"
        + REPORT_FORMAT_RULES
    )


def _framework_prompt_block(fw: dict) -> str:
    lines: List[str] = []
    for ind in fw.get("indicators", []):
        lines.append(f"{ind['id']}. {ind['title']}\n   目标：{ind.get('goal', '')}")
    return "\n".join(lines)


def _extract_json_object(text: str) -> dict:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def build_user_task_message(
    fw: dict,
    task_name: str,
    proposal_text: str,
    attachment_names: List[str],
) -> str:
    framework_block = _framework_prompt_block(fw)
    att = "、".join(attachment_names) if attachment_names else "（无文件名列表，仅见正文）"
    return f"""请根据下列材料完成评审任务。

## 任务名称
{task_name}

## 已上传方案附件（文件名）
{att}

## 方案正文/摘要（可能不完整，请结合常识谨慎判断）
{proposal_text[:12000]}

## 评审框架（共 10 项一级指标，每项满分 10 分，总分 100）
{framework_block}
"""


def run_ai_suggest(
    agent: LlmAgent,
    fw: dict,
    task_name: str,
    proposal_text: str,
    attachment_names: List[str],
) -> AiSuggestResult:
    system = build_system_for_suggest(agent)
    user = build_user_task_message(fw, task_name, proposal_text, attachment_names)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    content = chat_completion(agent, messages)
    excerpt = content[:800] + ("…" if len(content) > 800 else "")
    try:
        obj = _extract_json_object(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"模型未返回可解析 JSON：{e}") from e
    raw_items = obj.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("JSON 中缺少 items 数组")
    items: List[AiScoreItem] = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        try:
            items.append(AiScoreItem.model_validate(it))
        except Exception:
            continue
    by_id = {x.indicator_id: x for x in items}
    ordered: List[AiScoreItem] = []
    for i in range(1, 11):
        if i in by_id:
            ordered.append(by_id[i])
        else:
            ordered.append(AiScoreItem(indicator_id=i, score=0, notes="模型未返回该项，请人工填写"))
    return AiSuggestResult(items=ordered, raw_excerpt=excerpt)


def run_ai_report(
    agent: LlmAgent,
    fw: dict,
    task_name: str,
    proposal_text: str,
    attachment_names: List[str],
) -> AiReportResult:
    system = build_system_for_report(agent)
    user = build_user_task_message(fw, task_name, proposal_text, attachment_names)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    content = chat_completion(agent, messages, max_tokens=8192)
    excerpt = content[:1200] + ("…" if len(content) > 1200 else "")
    try:
        obj = _extract_json_object(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"模型未返回可解析 JSON：{e}") from e
    raw_items = obj.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("JSON 中缺少 items 数组")
    items: List[AiReportLine] = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        try:
            items.append(AiReportLine.model_validate(it))
        except Exception:
            continue
    by_id = {x.indicator_id: x for x in items}
    ordered: List[AiReportLine] = []
    for i in range(1, 11):
        if i in by_id:
            ordered.append(by_id[i])
        else:
            ordered.append(
                AiReportLine(
                    indicator_id=i,
                    score=0,
                    notes="模型未返回该项",
                    opinion="请人工补写评审意见。",
                )
            )
    conclusion = str(obj.get("conclusion") or "")[:16000]
    highlights = str(obj.get("highlights") or "")[:16000]
    issues = str(obj.get("issues") or "")[:16000]
    return AiReportResult(
        items=ordered,
        conclusion=conclusion,
        highlights=highlights,
        issues=issues,
        raw_excerpt=excerpt,
    )
