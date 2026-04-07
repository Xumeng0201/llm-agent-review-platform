from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class LlmAgent(Base):
    """测评智能体：对接 OpenAI 兼容 API（DeepSeek、OpenAI、自定义 Base）。"""

    __tablename__ = "llm_agents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    provider = Column(String(32), nullable=False)
    api_base = Column(String(512), nullable=True)
    api_key = Column(String(512), nullable=False)
    model = Column(String(128), nullable=False)
    system_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ReviewTask(Base):
    """评审任务：任务名称 + 方案材料 + 分项打分 + 报告"""

    __tablename__ = "review_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    proposal_body = Column(Text, nullable=True)
    summary_highlights = Column(Text, nullable=True)
    summary_issues = Column(Text, nullable=True)
    review_summary = Column(Text, nullable=True)
    llm_agent_id = Column(Integer, ForeignKey("llm_agents.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    llm_agent = relationship("LlmAgent")
    scores = relationship(
        "IndicatorScore", back_populates="task", cascade="all, delete-orphan"
    )
    attachments = relationship(
        "Attachment", back_populates="task", cascade="all, delete-orphan"
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
