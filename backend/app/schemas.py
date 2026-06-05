from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

ReviewStatus = Literal["in_progress", "completed"]
AnalysisStatus = Literal["draft", "parsing", "indexed", "reviewing", "reviewed", "failed"]
ParseStatus = Literal["pending", "parsing", "done", "failed"]
IssueSeverity = Literal["serious", "major", "minor"]
IssueStatus = Literal["open", "accepted", "dismissed", "revised"]
RunStatus = Literal["pending", "running", "done", "failed"]
RunType = Literal["full", "dimension", "retry"]
UserRole = Literal["admin", "user"]
ReviewPhase = Literal["pre_review", "implementation"]


class LoginBody(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)


class BootstrapAdminBody(LoginBody):
    display_name: Optional[str] = Field(None, max_length=128)


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    display_name: Optional[str] = Field(None, max_length=128)
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole = "user"


class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=128)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: UserRole
    is_active: bool
    avatar_url: Optional[str] = None
    created_at: Optional[datetime]
    updated_at: Optional[datetime] = None
    updated_by_name: str = "—"

    class Config:
        from_attributes = True


class AuthOut(BaseModel):
    token: str
    user: UserOut


class BootstrapStatusOut(BaseModel):
    needs_bootstrap: bool


class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    project_key: Optional[str] = Field(None, max_length=128, description="项目名称，用于区分不同建设事项")
    version: Optional[str] = Field(None, max_length=64, description="版本号，同一 project_key 下多稿次")
    llm_agent_id: Optional[int] = None
    phase: ReviewPhase = "implementation"
    project_id: Optional[int] = None


class TaskUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    project_key: Optional[str] = Field(None, max_length=128)
    version: Optional[str] = Field(None, max_length=64)
    proposal_body: Optional[str] = None
    summary_highlights: Optional[str] = None
    summary_issues: Optional[str] = None
    review_summary: Optional[str] = None
    llm_agent_id: Optional[int] = None


class TaskOut(BaseModel):
    """列表与详情统一结构；review_status / username 由接口层填入。"""

    id: int
    name: str
    project_key: Optional[str] = None
    version: Optional[str] = None
    proposal_body: Optional[str]
    summary_highlights: Optional[str]
    summary_issues: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime] = None
    review_status: ReviewStatus = "in_progress"
    username: str = "系统"
    updated_by_name: str = "—"
    llm_agent_id: Optional[int] = None
    review_summary: Optional[str] = None
    analysis_status: AnalysisStatus = "draft"
    doc_total_chars: Optional[int] = None
    doc_total_chunks: Optional[int] = None
    overall_assessment: Optional[str] = None
    missing_materials: Optional[str] = None
    phase: ReviewPhase = "implementation"
    project_id: Optional[int] = None
    framework_version_id: Optional[int] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_task(cls, task, review_status: ReviewStatus, username: str = "系统"):
        ph = getattr(task, "phase", None) or "implementation"
        if ph not in ("pre_review", "implementation"):
            ph = "implementation"
        return cls(
            id=task.id,
            name=task.name,
            project_key=getattr(task, "project_key", None),
            version=getattr(task, "version", None),
            proposal_body=task.proposal_body,
            summary_highlights=task.summary_highlights,
            summary_issues=task.summary_issues,
            created_at=task.created_at,
            updated_at=getattr(task, "updated_at", None),
            review_status=review_status,
            username=username,
            updated_by_name=getattr(task, "updated_by_name", "—"),
            llm_agent_id=getattr(task, "llm_agent_id", None),
            review_summary=getattr(task, "review_summary", None),
            analysis_status=getattr(task, "analysis_status", "draft"),
            doc_total_chars=getattr(task, "doc_total_chars", None),
            doc_total_chunks=getattr(task, "doc_total_chunks", None),
            overall_assessment=getattr(task, "overall_assessment", None),
            missing_materials=getattr(task, "missing_materials", None),
            phase=ph,  # type: ignore[arg-type]
            project_id=getattr(task, "project_id", None),
            framework_version_id=getattr(task, "framework_version_id", None),
        )


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    unit_name: Optional[str] = Field(None, max_length=255)
    external_code: Optional[str] = Field(None, max_length=128)


class ProjectOut(BaseModel):
    id: int
    name: str
    unit_name: Optional[str]
    external_code: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class FrameworkVersionOut(BaseModel):
    id: int
    phase: str
    version_seq: int
    original_filename: str
    created_at: Optional[datetime]
    text_char_count: int
    # 上传人显示名或登录名；无记录时为 —
    username: str = "—"


class FrameworkCurrentResponse(BaseModel):
    phase: str
    current: Optional[FrameworkVersionOut] = None


class FrameworkCriteriaPreviewOut(BaseModel):
    """当前阶段最新要点版本的正文预览（与注入提示词的截断规则一致）。"""

    phase: str
    version_seq: int
    original_filename: str
    created_at: Optional[datetime] = None
    username: str = "—"
    text: str
    text_was_truncated: bool = False


class AttachmentOut(BaseModel):
    id: int
    task_id: int
    original_name: str
    category: Optional[str]

    class Config:
        from_attributes = True


class DocumentFileOut(BaseModel):
    id: int
    task_id: int
    attachment_id: Optional[int]
    file_name: str
    file_type: Optional[str]
    parse_status: ParseStatus
    page_count: Optional[int]
    char_count: Optional[int]
    outline_json: Optional[str]
    parse_error: Optional[str]

    class Config:
        from_attributes = True


class DocumentChunkOut(BaseModel):
    id: int
    task_id: int
    document_file_id: int
    chunk_index: int
    section_title: Optional[str]
    page_from: Optional[int]
    page_to: Optional[int]
    char_count: Optional[int]
    token_estimate: Optional[int]
    content: str
    summary: Optional[str]
    keywords_json: Optional[str]
    dimension_hints_json: Optional[str]

    class Config:
        from_attributes = True


class ReviewRunOut(BaseModel):
    id: int
    task_id: int
    agent_id: Optional[int]
    run_type: RunType
    status: RunStatus
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True


class IssueEvidenceOut(BaseModel):
    id: int
    issue_id: int
    chunk_id: Optional[int]
    file_name: str
    page_from: Optional[int]
    page_to: Optional[int]
    section_title: Optional[str]
    quote_text: str
    rank_score: Optional[int]

    class Config:
        from_attributes = True


class ReviewIssueOut(BaseModel):
    id: int
    task_id: int
    review_run_id: Optional[int]
    dimension_id: int
    dimension_key: Optional[str]
    dimension_title: str
    severity: IssueSeverity
    title: str
    description: str
    reason: Optional[str]
    suggestion: Optional[str]
    needs_supplement: bool
    manual_review: bool
    status: IssueStatus
    evidences: list[IssueEvidenceOut] = []

    class Config:
        from_attributes = True


class ReviewIssueUpdate(BaseModel):
    severity: Optional[IssueSeverity] = None
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    reason: Optional[str] = None
    suggestion: Optional[str] = None
    needs_supplement: Optional[bool] = None
    manual_review: Optional[bool] = None
    status: Optional[IssueStatus] = None


class ReviewSummaryOut(BaseModel):
    overall_assessment: Optional[str] = None
    serious_count: int = 0
    major_count: int = 0
    minor_count: int = 0
    missing_materials: list[str] = []
    manual_focus: list[str] = []


class ReviewIssueListOut(BaseModel):
    summary: ReviewSummaryOut
    items: list[ReviewIssueOut]


class AnalyzeRunBody(BaseModel):
    force: bool = False


class ReviewRunBody(BaseModel):
    agent_id: Optional[int] = None
    dimension_ids: Optional[list[int]] = None
    force: bool = False


class AnalysisStatusOut(BaseModel):
    task_id: int
    analysis_status: AnalysisStatus
    doc_total_chars: Optional[int] = None
    doc_total_chunks: Optional[int] = None
    files: list[DocumentFileOut] = []


class DimensionTokenEstimateOut(BaseModel):
    dimension_id: int
    dimension_title: str
    retrieved_chunks: int
    input_tokens: int
    output_tokens: int


class TaskTokenEstimateOut(BaseModel):
    task_id: int
    parser_engine: str
    parser_mode: Optional[str] = None
    local_chunk_tokens: int
    llm_chunking_tokens: int
    review_input_tokens: int
    review_output_tokens: int
    total_llm_tokens: int
    assumptions: list[str] = []
    dimensions: list[DimensionTokenEstimateOut] = []
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    price_display_name: Optional[str] = None
    pricing_source_name: Optional[str] = None
    pricing_source_url: Optional[str] = None
    input_price_per_million_usd: Optional[float] = None
    cached_input_price_per_million_usd: Optional[float] = None
    output_price_per_million_usd: Optional[float] = None
    estimated_cost_low_usd: Optional[float] = None
    estimated_cost_high_usd: Optional[float] = None
    estimated_cost_low_cny: Optional[float] = None
    estimated_cost_high_cny: Optional[float] = None
    exchange_rate_usd_to_cny: float = 7.2


class ParserCapabilityOut(BaseModel):
    preferred_engine: str
    available_engines: list[str]
    optional_engines: list[str] = []
    recommended_engine: str
    notes: list[str] = []


class TaskCostOverviewItemOut(BaseModel):
    task_id: int
    total_llm_tokens: int
    estimated_cost_low_usd: Optional[float] = None
    estimated_cost_high_usd: Optional[float] = None
    estimated_cost_low_cny: Optional[float] = None
    estimated_cost_high_cny: Optional[float] = None
    price_display_name: Optional[str] = None


class CostCompareItemOut(BaseModel):
    agent_id: int
    agent_name: str
    provider: str
    model: str
    total_llm_tokens: int
    estimated_cost_low_usd: Optional[float] = None
    estimated_cost_high_usd: Optional[float] = None
    estimated_cost_low_cny: Optional[float] = None
    estimated_cost_high_cny: Optional[float] = None
    price_display_name: Optional[str] = None
    supported: bool = False


class MonthlyCostSummaryOut(BaseModel):
    month: str
    task_count: int
    total_llm_tokens: int
    estimated_cost_low_usd: float = 0
    estimated_cost_high_usd: float = 0
    estimated_cost_low_cny: float = 0
    estimated_cost_high_cny: float = 0


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
    updated_at: Optional[datetime] = None
    # 归属用户显示名或登录名
    username: str = "—"

    class Config:
        from_attributes = True


class PaginatedTaskListOut(BaseModel):
    items: list[TaskOut]
    total: int
    page: int
    page_size: int


class PaginatedUserListOut(BaseModel):
    items: list[UserOut]
    total: int
    page: int
    page_size: int


class PaginatedLlmAgentListOut(BaseModel):
    items: list[LlmAgentOut]
    total: int
    page: int
    page_size: int


class ReviewTaskMetricsOut(BaseModel):
    """任务计数；completed 与 TaskOut.review_status 一致（analysis_status == reviewed）。"""

    total: int
    in_progress: int
    completed: int


class MemoryProfileOut(BaseModel):
    task_id: int
    task_name: str
    project_key: Optional[str] = None
    version: Optional[str] = None
    phase: Optional[str] = None
    analysis_status: Optional[str] = None
    index_status: str = "pending"
    index_error: Optional[str] = None
    summary_text: Optional[str] = None
    project_overview: Optional[str] = None
    goals: list[str] = []
    capabilities: list[str] = []
    core_functions: list[str] = []
    systems: list[str] = []
    keywords: list[str] = []
    char_count: Optional[int] = None
    chunk_count: Optional[int] = None
    indexed_at: Optional[datetime] = None


class MemoryLibraryOut(BaseModel):
    items: list[MemoryProfileOut]
    total: int


class MemorySimilarItemOut(BaseModel):
    task_id: int
    task_name: str
    project_key: Optional[str] = None
    version: Optional[str] = None
    phase: Optional[str] = None
    similarity_score: float
    overlap_keywords: list[str] = []
    summary_text: Optional[str] = None


class MemorySimilarListOut(BaseModel):
    source_task_id: int
    source_project_key: Optional[str] = None
    items: list[MemorySimilarItemOut]


class MemoryChunkPairOut(BaseModel):
    score: float
    source_chunk_id: int
    source_file_name: str
    source_section_title: Optional[str] = None
    source_excerpt: str
    target_chunk_id: int
    target_file_name: str
    target_section_title: Optional[str] = None
    target_excerpt: str


class MemoryCompareOut(BaseModel):
    comparable: bool
    message: str
    similarity_score: float = 0.0
    duplicate_risk: str = "none"
    overlap_keywords: list[str] = []
    findings: list[str] = []
    source: MemoryProfileOut
    target: MemoryProfileOut
    chunk_pairs: list[MemoryChunkPairOut] = []


class MemoryCompareBody(BaseModel):
    source_task_id: int
    target_task_id: int


class MemoryReindexOut(BaseModel):
    indexed_count: int
