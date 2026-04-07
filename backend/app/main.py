import json
import shutil
from pathlib import Path
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from urllib.parse import quote

from .ai_scoring import run_ai_report, run_ai_suggest
from .database import Base, engine, get_db, migrate_sqlite_schema
from .models import Attachment, IndicatorScore, LlmAgent, ReviewTask
from .report_html import build_report_html
from .schemas import (
    AiReportApplyBody,
    AiReportItemOut,
    AiReportOut,
    AiScoreItemOut,
    AiSuggestBody,
    AiSuggestOut,
    AttachmentOut,
    IndicatorReportRow,
    LlmAgentCreate,
    LlmAgentOut,
    LlmAgentUpdate,
    OverallReport,
    ScoreOut,
    ScoreUpsert,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from .verdict import compute_from_scores

APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
DATA_DIR = ROOT_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"

FRAMEWORK_PATH = APP_DIR / "framework.json"


def load_framework() -> dict:
    with open(FRAMEWORK_PATH, encoding="utf-8") as f:
        return json.load(f)


def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def init_scores_for_task(db: Session, task_id: int):
    existing = {r.indicator_id for r in db.query(IndicatorScore).filter_by(task_id=task_id).all()}
    for i in range(1, 11):
        if i not in existing:
            db.add(
                IndicatorScore(
                    task_id=task_id,
                    indicator_id=i,
                    score=None,
                    notes=None,
                )
            )
    db.commit()


def compute_review_status(db: Session, task_id: int) -> str:
    """十项均已录入分数（0～10）视为已完成，与参考图「测评状态」一致。"""
    init_scores_for_task(db, task_id)
    rows = (
        db.query(IndicatorScore)
        .filter_by(task_id=task_id)
        .order_by(IndicatorScore.indicator_id)
        .all()
    )
    if len(rows) < 10:
        return "in_progress"
    if all(r.score is not None for r in rows):
        return "completed"
    return "in_progress"


def task_to_out(db: Session, task: ReviewTask, username: str = "系统") -> TaskOut:
    st: str = compute_review_status(db, task.id)
    return TaskOut.from_task(task, st, username)


def agent_to_out(a: LlmAgent) -> LlmAgentOut:
    k = a.api_key or ""
    hint = ("****" + k[-4:]) if len(k) > 4 else ("****" if k else "")
    return LlmAgentOut(
        id=a.id,
        name=a.name,
        provider=a.provider,
        api_base=a.api_base,
        model=a.model,
        key_hint=hint,
        system_prompt=getattr(a, "system_prompt", None),
        created_at=a.created_at,
    )


def _require_agent(db: Session, agent_id: int) -> LlmAgent:
    ag = db.query(LlmAgent).filter_by(id=agent_id).first()
    if not ag:
        raise HTTPException(400, "测评智能体不存在")
    return ag


def build_overall_report(db: Session, task: ReviewTask) -> OverallReport:
    init_scores_for_task(db, task.id)
    rows_db = (
        db.query(IndicatorScore)
        .filter_by(task_id=task.id)
        .order_by(IndicatorScore.indicator_id)
        .all()
    )
    fw = load_framework()
    id_to_title = {x["id"]: x["title"] for x in fw["indicators"]}
    scores_map: dict[int, Optional[int]] = {}
    indicators: list[IndicatorReportRow] = []
    for r in rows_db:
        scores_map[r.indicator_id] = r.score
        indicators.append(
            IndicatorReportRow(
                indicator_id=r.indicator_id,
                title=id_to_title.get(r.indicator_id, str(r.indicator_id)),
                score=r.score,
                max_score=10,
                notes=r.notes,
            )
        )
    code, label, reasons, total = compute_from_scores(scores_map)
    return OverallReport(
        task_id=task.id,
        task_name=task.name,
        total_score=total,
        max_total=100,
        conclusion_code=code,
        conclusion_label=label,
        reasons=reasons,
        indicators=indicators,
        summary_highlights=task.summary_highlights,
        summary_issues=task.summary_issues,
        review_summary=getattr(task, "review_summary", None),
    )


app = FastAPI(title="大模型/智能体方案评审 API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    ensure_dirs()
    Base.metadata.create_all(bind=engine)
    migrate_sqlite_schema()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/framework")
def get_framework():
    return load_framework()


@app.get("/api/llm-agents", response_model=list[LlmAgentOut])
def list_agents(db: Session = Depends(get_db)):
    rows = db.query(LlmAgent).order_by(LlmAgent.id.desc()).all()
    return [agent_to_out(a) for a in rows]


@app.post("/api/llm-agents", response_model=LlmAgentOut)
def create_agent(body: LlmAgentCreate, db: Session = Depends(get_db)):
    a = LlmAgent(
        name=body.name.strip(),
        provider=body.provider,
        api_base=body.api_base.strip() if body.api_base else None,
        api_key=body.api_key,
        model=body.model.strip(),
        system_prompt=body.system_prompt.strip() if body.system_prompt else None,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return agent_to_out(a)


@app.get("/api/llm-agents/{agent_id}", response_model=LlmAgentOut)
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    a = db.query(LlmAgent).filter_by(id=agent_id).first()
    if not a:
        raise HTTPException(404, "智能体不存在")
    return agent_to_out(a)


@app.patch("/api/llm-agents/{agent_id}", response_model=LlmAgentOut)
def update_agent(agent_id: int, body: LlmAgentUpdate, db: Session = Depends(get_db)):
    a = db.query(LlmAgent).filter_by(id=agent_id).first()
    if not a:
        raise HTTPException(404, "智能体不存在")
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        a.name = data["name"].strip()
    if "provider" in data and data["provider"] is not None:
        a.provider = data["provider"]
    if "api_base" in data:
        a.api_base = data["api_base"].strip() if data["api_base"] else None
    if "api_key" in data and data["api_key"] is not None:
        a.api_key = data["api_key"]
    if "model" in data and data["model"] is not None:
        a.model = data["model"].strip()
    if "system_prompt" in data:
        a.system_prompt = data["system_prompt"].strip() if data["system_prompt"] else None
    if a.provider == "custom" and not (a.api_base or "").strip():
        raise HTTPException(400, "自定义接入必须填写 API Base")
    db.commit()
    db.refresh(a)
    return agent_to_out(a)


@app.delete("/api/llm-agents/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    a = db.query(LlmAgent).filter_by(id=agent_id).first()
    if not a:
        raise HTTPException(404, "智能体不存在")
    cnt = db.query(ReviewTask).filter(ReviewTask.llm_agent_id == agent_id).count()
    if cnt:
        raise HTTPException(400, f"仍有 {cnt} 个任务绑定该智能体，请先解除绑定")
    db.delete(a)
    db.commit()
    return {"ok": True}


@app.get("/api/review-tasks", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_db)):
    tasks = db.query(ReviewTask).order_by(ReviewTask.id.desc()).all()
    return [task_to_out(db, t) for t in tasks]


@app.post("/api/review-tasks", response_model=TaskOut)
def create_task(body: TaskCreate, db: Session = Depends(get_db)):
    t = ReviewTask(name=body.name.strip())
    if body.llm_agent_id is not None:
        _require_agent(db, body.llm_agent_id)
        t.llm_agent_id = body.llm_agent_id
    db.add(t)
    db.commit()
    db.refresh(t)
    (UPLOAD_DIR / str(t.id)).mkdir(parents=True, exist_ok=True)
    init_scores_for_task(db, t.id)
    db.refresh(t)
    return task_to_out(db, t)


@app.get("/api/review-tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    return task_to_out(db, t)


@app.patch("/api/review-tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskUpdate, db: Session = Depends(get_db)):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    data = body.model_dump(exclude_unset=True)
    if "llm_agent_id" in data and data["llm_agent_id"] is not None:
        _require_agent(db, data["llm_agent_id"])
    for k, v in data.items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return task_to_out(db, t)


@app.delete("/api/review-tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    folder = UPLOAD_DIR / str(task_id)
    if folder.exists():
        shutil.rmtree(folder)
    db.delete(t)
    db.commit()
    return {"ok": True}


@app.get("/api/review-tasks/{task_id}/scores", response_model=list[ScoreOut])
def get_scores(task_id: int, db: Session = Depends(get_db)):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    init_scores_for_task(db, task_id)
    return (
        db.query(IndicatorScore)
        .filter_by(task_id=task_id)
        .order_by(IndicatorScore.indicator_id)
        .all()
    )


@app.put("/api/review-tasks/{task_id}/scores", response_model=ScoreOut)
def upsert_score(task_id: int, body: ScoreUpsert, db: Session = Depends(get_db)):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    r = (
        db.query(IndicatorScore)
        .filter_by(task_id=task_id, indicator_id=body.indicator_id)
        .first()
    )
    if not r:
        r = IndicatorScore(task_id=task_id, indicator_id=body.indicator_id)
        db.add(r)
    r.score = body.score
    r.notes = body.notes
    db.commit()
    db.refresh(r)
    return r


@app.post("/api/review-tasks/{task_id}/ai-suggest", response_model=AiSuggestOut)
def ai_suggest_scores(
    task_id: int, body: AiSuggestBody, db: Session = Depends(get_db)
):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    agent_id = body.agent_id if body.agent_id is not None else t.llm_agent_id
    if agent_id is None:
        raise HTTPException(
            400,
            "请指定智能体：在请求体中传 agent_id，或在任务上绑定默认智能体（编辑任务或新建时选择）。",
        )
    agent = db.query(LlmAgent).filter_by(id=agent_id).first()
    if not agent:
        raise HTTPException(400, "测评智能体不存在")
    proposal = (t.proposal_body or "").strip()
    atts = (
        db.query(Attachment)
        .filter_by(task_id=task_id)
        .order_by(Attachment.id)
        .all()
    )
    names = [x.original_name for x in atts]
    if not proposal and not names:
        raise HTTPException(
            400,
            "请先填写「方案说明」或上传方案附件，以便智能体评审。",
        )
    fw = load_framework()
    try:
        result = run_ai_suggest(agent, fw, t.name, proposal, names)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except httpx.HTTPStatusError as e:
        detail = e.response.text[:500] if e.response is not None else str(e)
        raise HTTPException(502, f"大模型接口返回错误：{detail}") from e
    except Exception as e:
        raise HTTPException(502, f"调用大模型失败：{e!s}") from e
    return AiSuggestOut(
        items=[AiScoreItemOut(**x.model_dump()) for x in result.items],
        raw_excerpt=result.raw_excerpt,
        agent_id=agent.id,
        agent_name=agent.name,
    )


@app.post("/api/review-tasks/{task_id}/ai-report", response_model=AiReportOut)
def ai_full_report(
    task_id: int, body: AiSuggestBody, db: Session = Depends(get_db)
):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    agent_id = body.agent_id if body.agent_id is not None else t.llm_agent_id
    if agent_id is None:
        raise HTTPException(
            400,
            "请指定智能体：在请求体中传 agent_id，或在任务上绑定默认智能体。",
        )
    agent = db.query(LlmAgent).filter_by(id=agent_id).first()
    if not agent:
        raise HTTPException(400, "测评智能体不存在")
    proposal = (t.proposal_body or "").strip()
    atts = (
        db.query(Attachment)
        .filter_by(task_id=task_id)
        .order_by(Attachment.id)
        .all()
    )
    names = [x.original_name for x in atts]
    if not proposal and not names:
        raise HTTPException(
            400,
            "请先填写「方案说明」或上传方案附件，以便智能体生成评审报告。",
        )
    fw = load_framework()
    try:
        result = run_ai_report(agent, fw, t.name, proposal, names)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except httpx.HTTPStatusError as e:
        detail = e.response.text[:500] if e.response is not None else str(e)
        raise HTTPException(502, f"大模型接口返回错误：{detail}") from e
    except Exception as e:
        raise HTTPException(502, f"调用大模型失败：{e!s}") from e
    return AiReportOut(
        items=[AiReportItemOut(**x.model_dump()) for x in result.items],
        conclusion=result.conclusion,
        highlights=result.highlights,
        issues=result.issues,
        raw_excerpt=result.raw_excerpt,
        agent_id=agent.id,
        agent_name=agent.name,
    )


@app.post("/api/review-tasks/{task_id}/ai-report/apply", response_model=TaskOut)
def apply_ai_report(
    task_id: int, body: AiReportApplyBody, db: Session = Depends(get_db)
):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    init_scores_for_task(db, task_id)
    t.review_summary = body.conclusion.strip() or None
    t.summary_highlights = body.highlights.strip() or None
    t.summary_issues = body.issues.strip() or None
    for it in body.items:
        parts: list[str] = []
        if (it.notes or "").strip():
            parts.append(it.notes.strip())
        if (it.opinion or "").strip():
            parts.append("【评审意见】" + it.opinion.strip())
        combined = "\n".join(parts) if parts else None
        r = (
            db.query(IndicatorScore)
            .filter_by(task_id=task_id, indicator_id=it.indicator_id)
            .first()
        )
        if not r:
            r = IndicatorScore(task_id=task_id, indicator_id=it.indicator_id)
            db.add(r)
        r.score = it.score
        r.notes = combined
    db.commit()
    db.refresh(t)
    return task_to_out(db, t)


@app.get("/api/review-tasks/{task_id}/report", response_model=OverallReport)
def get_report(task_id: int, db: Session = Depends(get_db)):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    return build_overall_report(db, t)


@app.get("/api/review-tasks/{task_id}/report/download")
def download_report(task_id: int, db: Session = Depends(get_db)):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    report = build_overall_report(db, t)
    html_doc = build_report_html(report)
    raw = html_doc.encode("utf-8")
    fname = f"评审报告-{t.name}.html"
    disp = "attachment; filename*=UTF-8''" + quote(fname)
    return Response(
        content=raw,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": disp},
    )


@app.post("/api/review-tasks/{task_id}/attachments", response_model=AttachmentOut)
async def upload_attachment(
    task_id: int,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    category: Optional[str] = Query(None),
):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    dest_dir = UPLOAD_DIR / str(task_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "upload").name
    dest = dest_dir / safe_name
    counter = 1
    while dest.exists():
        dest = dest_dir / f"{dest.stem}_{counter}{dest.suffix}"
        counter += 1
    content = await file.read()
    dest.write_bytes(content)
    att = Attachment(
        task_id=task_id,
        original_name=safe_name,
        stored_path=str(dest),
        category=category,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


@app.get("/api/review-tasks/{task_id}/attachments", response_model=list[AttachmentOut])
def list_attachments(task_id: int, db: Session = Depends(get_db)):
    t = db.query(ReviewTask).filter_by(id=task_id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    return (
        db.query(Attachment)
        .filter_by(task_id=task_id)
        .order_by(Attachment.id)
        .all()
    )


@app.get("/api/review-tasks/{task_id}/attachments/{attachment_id}/download")
def download_attachment(
    task_id: int, attachment_id: int, db: Session = Depends(get_db)
):
    att = (
        db.query(Attachment)
        .filter_by(id=attachment_id, task_id=task_id)
        .first()
    )
    if not att:
        raise HTTPException(404, "附件不存在")
    path = Path(att.stored_path)
    if not path.is_file():
        raise HTTPException(404, "文件已丢失")
    return FileResponse(path, filename=att.original_name)
