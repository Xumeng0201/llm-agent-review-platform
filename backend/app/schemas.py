from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

ReviewStatus = Literal["in_progress", "completed"]


class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    llm_agent_id: Optional[int] = None


class TaskUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    proposal_body: Optional[str] = None
    summary_highlights: Optional[str] = None
    summary_issues: Optional[str] = None
    review_summary: Optional[str] = None
    llm_agent_id: Optional[int] = None


class TaskOut(BaseModel):
    """列表与详情统一结构；review_status / username 由接口层填入。"""

    id: int
    name: str
    proposal_body: Optional[str]
    summary_highlights: Optional[str]
    summary_issues: Optional[str]
    created_at: Optional[datetime]
    review_status: ReviewStatus = "in_progress"
    username: str = "系统"
    llm_agent_id: Optional[int] = None
    review_summary: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_task(cls, task, review_status: ReviewStatus, username: str = "系统"):
        return cls(
            id=task.id,
            name=task.name,
            proposal_body=task.proposal_body,
            summary_highlights=task.summary_highlights,
            summary_issues=task.summary_issues,
            created_at=task.created_at,
            review_status=review_status,
            username=username,
            llm_agent_id=getattr(task, "llm_agent_id", None),
            review_summary=getattr(task, "review_summary", None),
        )


class ScoreUpsert(BaseModel):
    indicator_id: int = Field(..., ge=1, le=10)
    score: int = Field(..., ge=0, le=10)
    notes: Optional[str] = None


class ScoreOut(BaseModel):
    id: int
    task_id: int
    indicator_id: int
    score: Optional[int]
    notes: Optional[str]

    class Config:
        from_attributes = True


class AttachmentOut(BaseModel):
    id: int
    task_id: int
    original_name: str
    category: Optional[str]

    class Config:
        from_attributes = True


class IndicatorReportRow(BaseModel):
    indicator_id: int
    title: str
    score: Optional[int]
    max_score: int = 10
    notes: Optional[str]


class OverallReport(BaseModel):
    task_id: int
    task_name: str
    total_score: int
    max_total: int = 100
    conclusion_code: Literal["pass", "rectify", "reject"]
    conclusion_label: str
    reasons: List[str]
    indicators: List[IndicatorReportRow]
    summary_highlights: Optional[str]
    summary_issues: Optional[str]
    review_summary: Optional[str] = None


class LlmAgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    provider: Literal["deepseek", "openai", "custom"] = "deepseek"
    api_base: Optional[str] = Field(None, max_length=512)
    api_key: str = Field(..., min_length=1, max_length=512)
    model: str = Field(..., min_length=1, max_length=128)
    system_prompt: Optional[str] = Field(None, max_length=32000)

    @model_validator(mode="after")
    def custom_needs_base(self):
        if self.provider == "custom" and not (self.api_base or "").strip():
            raise ValueError("自定义接入必须填写 api_base（OpenAI 兼容地址，含 /v1）")
        return self


class LlmAgentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    provider: Optional[Literal["deepseek", "openai", "custom"]] = None
    api_base: Optional[str] = Field(None, max_length=512)
    api_key: Optional[str] = Field(None, min_length=1, max_length=512)
    model: Optional[str] = Field(None, min_length=1, max_length=128)
    system_prompt: Optional[str] = Field(None, max_length=32000)


class LlmAgentOut(BaseModel):
    id: int
    name: str
    provider: str
    api_base: Optional[str]
    model: str
    key_hint: str
    system_prompt: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class AiSuggestBody(BaseModel):
    """若省略 agent_id，则使用任务上绑定的 llm_agent_id。"""

    agent_id: Optional[int] = None


class AiScoreItemOut(BaseModel):
    indicator_id: int
    score: int
    notes: str


class AiSuggestOut(BaseModel):
    items: List[AiScoreItemOut]
    raw_excerpt: str
    agent_id: int
    agent_name: str


class AiReportItemOut(BaseModel):
    indicator_id: int
    score: int
    notes: str
    opinion: str


class AiReportOut(BaseModel):
    items: List[AiReportItemOut]
    conclusion: str
    highlights: str
    issues: str
    raw_excerpt: str
    agent_id: int
    agent_name: str


class AiReportApplyItem(BaseModel):
    indicator_id: int = Field(..., ge=1, le=10)
    score: int = Field(..., ge=0, le=10)
    notes: str = ""
    opinion: str = ""


class AiReportApplyBody(BaseModel):
    items: List[AiReportApplyItem]
    conclusion: str = ""
    highlights: str = ""
    issues: str = ""
