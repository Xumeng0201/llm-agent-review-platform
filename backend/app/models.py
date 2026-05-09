from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), nullable=False, unique=True, index=True)
    display_name = Column(String(128), nullable=False)
    password_hash = Column(String(512), nullable=False)
    role = Column(String(32), nullable=False, default="user")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agents = relationship("LlmAgent", back_populates="user")
    tasks = relationship("ReviewTask", back_populates="user")
    review_projects = relationship("ReviewProject", back_populates="user")
    sessions = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="sessions")


class LlmAgent(Base):
    """测评智能体：对接 OpenAI 兼容 API（DeepSeek、OpenAI、自定义 Base）。"""

    __tablename__ = "llm_agents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(128), nullable=False)
    provider = Column(String(32), nullable=False)
    api_base = Column(String(512), nullable=True)
    api_key = Column(String(512), nullable=False)
    model = Column(String(128), nullable=False)
    system_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="agents")


class ReviewProject(Base):
    """申报项目：可挂多条阶段任务（如多轮实施方案）。"""

    __tablename__ = "review_projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    unit_name = Column(String(255), nullable=True)
    external_code = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="review_projects")
    tasks = relationship("ReviewTask", back_populates="project")


class ReviewFrameworkVersion(Base):
    """某阶段审核要点 Word 上传版本；新任务绑定创建时的版本，仅新任务随上传更新。"""

    __tablename__ = "review_framework_versions"

    id = Column(Integer, primary_key=True, index=True)
    phase = Column(String(32), nullable=False, index=True)
    version_seq = Column(Integer, nullable=False)
    original_filename = Column(String(512), nullable=False)
    stored_path = Column(String(1024), nullable=False)
    extracted_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)


class ReviewTask(Base):
    """评审任务：任务名称 + 方案材料 + 分项打分 + 报告"""

    __tablename__ = "review_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("review_projects.id"), nullable=True, index=True)
    phase = Column(String(32), nullable=False, default="implementation", index=True)
    framework_version_id = Column(
        Integer, ForeignKey("review_framework_versions.id"), nullable=True, index=True
    )
    name = Column(String(255), nullable=False)
    proposal_body = Column(Text, nullable=True)
    summary_highlights = Column(Text, nullable=True)
    summary_issues = Column(Text, nullable=True)
    review_summary = Column(Text, nullable=True)
    llm_agent_id = Column(Integer, ForeignKey("llm_agents.id"), nullable=True)
    analysis_status = Column(String(32), nullable=False, default="draft")
    doc_total_chars = Column(Integer, nullable=True)
    doc_total_chunks = Column(Integer, nullable=True)
    overall_assessment = Column(Text, nullable=True)
    missing_materials = Column(Text, nullable=True)
    last_review_run_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="tasks")
    project = relationship("ReviewProject", back_populates="tasks")
    framework_version = relationship("ReviewFrameworkVersion")
    llm_agent = relationship("LlmAgent")
    scores = relationship(
        "IndicatorScore", back_populates="task", cascade="all, delete-orphan"
    )
    attachments = relationship(
        "Attachment", back_populates="task", cascade="all, delete-orphan"
    )
    document_files = relationship(
        "DocumentFile", back_populates="task", cascade="all, delete-orphan"
    )
    review_runs = relationship(
        "ReviewRun", back_populates="task", cascade="all, delete-orphan"
    )
    review_issues = relationship(
        "ReviewIssue", back_populates="task", cascade="all, delete-orphan"
    )


class IndicatorScore(Base):
    """每项一级指标 0～10 分，十项合计 100 分。"""

    __tablename__ = "indicator_scores"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("review_tasks.id"), nullable=False)
    indicator_id = Column(Integer, nullable=False)
    score = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    task = relationship("ReviewTask", back_populates="scores")


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("review_tasks.id"), nullable=False)
    original_name = Column(String(512), nullable=False)
    stored_path = Column(String(1024), nullable=False)
    category = Column(String(128), nullable=True)

    task = relationship("ReviewTask", back_populates="attachments")


class DocumentFile(Base):
    __tablename__ = "document_files"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("review_tasks.id"), nullable=False)
    attachment_id = Column(Integer, ForeignKey("attachments.id"), nullable=True)
    file_name = Column(String(512), nullable=False)
    file_type = Column(String(64), nullable=True)
    parse_status = Column(String(32), nullable=False, default="pending")
    page_count = Column(Integer, nullable=True)
    char_count = Column(Integer, nullable=True)
    outline_json = Column(Text, nullable=True)
    parse_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("ReviewTask", back_populates="document_files")
    attachment = relationship("Attachment")
    chunks = relationship(
        "DocumentChunk", back_populates="document_file", cascade="all, delete-orphan"
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("review_tasks.id"), nullable=False)
    document_file_id = Column(Integer, ForeignKey("document_files.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    section_title = Column(String(512), nullable=True)
    page_from = Column(Integer, nullable=True)
    page_to = Column(Integer, nullable=True)
    char_count = Column(Integer, nullable=True)
    token_estimate = Column(Integer, nullable=True)
    content = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    keywords_json = Column(Text, nullable=True)
    dimension_hints_json = Column(Text, nullable=True)

    task = relationship("ReviewTask")
    document_file = relationship("DocumentFile", back_populates="chunks")


class ReviewRun(Base):
    __tablename__ = "review_runs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("review_tasks.id"), nullable=False)
    agent_id = Column(Integer, ForeignKey("llm_agents.id"), nullable=True)
    run_type = Column(String(32), nullable=False, default="full")
    status = Column(String(32), nullable=False, default="pending")
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)

    task = relationship("ReviewTask", back_populates="review_runs")
    agent = relationship("LlmAgent")
    issues = relationship("ReviewIssue", back_populates="review_run")


class ReviewIssue(Base):
    __tablename__ = "review_issues"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("review_tasks.id"), nullable=False)
    review_run_id = Column(Integer, ForeignKey("review_runs.id"), nullable=True)
    dimension_id = Column(Integer, nullable=False)
    dimension_key = Column(String(128), nullable=True)
    dimension_title = Column(String(255), nullable=False)
    severity = Column(String(16), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    reason = Column(Text, nullable=True)
    suggestion = Column(Text, nullable=True)
    needs_supplement = Column(Boolean, nullable=False, default=False)
    manual_review = Column(Boolean, nullable=False, default=False)
    status = Column(String(32), nullable=False, default="open")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    task = relationship("ReviewTask", back_populates="review_issues")
    review_run = relationship("ReviewRun", back_populates="issues")
    evidences = relationship(
        "IssueEvidence", back_populates="issue", cascade="all, delete-orphan"
    )


class IssueEvidence(Base):
    __tablename__ = "issue_evidences"

    id = Column(Integer, primary_key=True, index=True)
    issue_id = Column(Integer, ForeignKey("review_issues.id"), nullable=False)
    chunk_id = Column(Integer, ForeignKey("document_chunks.id"), nullable=True)
    file_name = Column(String(512), nullable=False)
    page_from = Column(Integer, nullable=True)
    page_to = Column(Integer, nullable=True)
    section_title = Column(String(512), nullable=True)
    quote_text = Column(Text, nullable=False)
    rank_score = Column(Integer, nullable=True)

    issue = relationship("ReviewIssue", back_populates="evidences")
    chunk = relationship("DocumentChunk")
