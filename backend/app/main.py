import json
import shutil
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload
from urllib.parse import quote

from .auth_utils import (
    default_display_name,
    hash_password,
    issue_session_token,
    normalize_username,
    session_expiry,
    verify_password,
)
from .chunking import split_text_to_chunks
from .doc_parse import parse_path
from .database import Base, engine, get_db, migrate_sqlite_schema
from .project_identity import resolve_project_identity
from .framework_criteria import MAX_CRITERIA_CHARS, clip_criteria_text, extract_text_from_docx
from .models import (
    Attachment,
    AuthSession,
    DocumentChunk,
    DocumentFile,
    IssueEvidence,
    LlmAgent,
    ReviewFrameworkVersion,
    ReviewIssue,
    ReviewProject,
    ReviewRun,
    ProjectMemoryProfile,
    ReviewTask,
    User,
)
from .issue_report import build_issue_report_docx_bytes, build_issue_report_html
from .cross_project_memory import (
    project_overview_from_profile,
    build_profile_from_task,
    compare_tasks,
    ensure_task_memory_index,
    find_similar_tasks,
    list_ready_profiles,
    reindex_all_ready_tasks,
    resolve_task_project_key,
)
from .review_engine import run_issue_review_for_task
from .token_estimator import estimate_task_token_usage
from .schemas import (
    AnalysisStatusOut,
    AnalyzeRunBody,
    AuthOut,
    AttachmentOut,
    BootstrapStatusOut,
    DocumentChunkOut,
    DocumentFileOut,
    BootstrapAdminBody,
    DimensionTokenEstimateOut,
    LlmAgentCreate,
    LlmAgentOut,
    LlmAgentUpdate,
    PaginatedLlmAgentListOut,
    PaginatedTaskListOut,
    PaginatedUserListOut,
    ProfileUpdate,
    ReviewIssueListOut,
    ReviewIssueOut,
    ReviewIssueUpdate,
    ReviewRunBody,
    ReviewRunOut,
    ReviewSummaryOut,
    ParserCapabilityOut,
    TaskCostOverviewItemOut,
    CostCompareItemOut,
    MonthlyCostSummaryOut,
    MemoryProfileOut,
    MemoryLibraryOut,
    MemorySimilarListOut,
    MemorySimilarItemOut,
    MemoryCompareOut,
    MemoryCompareBody,
    MemoryChunkPairOut,
    MemoryReindexOut,
    FrameworkCriteriaPreviewOut,
    FrameworkCurrentResponse,
    FrameworkVersionOut,
    LoginBody,
    ProjectCreate,
    ProjectOut,
    ReviewTaskMetricsOut,
    TaskTokenEstimateOut,
    TaskCreate,
    TaskOut,
    TaskUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)

APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
DATA_DIR = ROOT_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
AVATAR_DIR = DATA_DIR / "avatars"
FRAMEWORK_CRITERIA_DIR = DATA_DIR / "framework_criteria"

FRAMEWORK_PATH = APP_DIR / "framework.json"
FRAMEWORK_PRE_PATH = APP_DIR / "framework_pre_review.json"
TEMPLATE_SCHEMA_PATH = APP_DIR / "template_schema.json"

_task_review_locks: dict[int, threading.Lock] = {}
_task_review_locks_guard = threading.Lock()


def _task_review_lock(task_id: int) -> threading.Lock:
    with _task_review_locks_guard:
        if task_id not in _task_review_locks:
            _task_review_locks[task_id] = threading.Lock()
        return _task_review_locks[task_id]


def _prepare_task_for_issue_review(db: Session, task: ReviewTask, *, force: bool) -> None:
    """防止重复点击导致并发审查；允许 failed 后重试。"""
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(minutes=35)
    stale_runs = (
        db.query(ReviewRun)
        .filter(
            ReviewRun.task_id == task.id,
            ReviewRun.status == "running",
            ReviewRun.started_at < stale_before,
        )
        .all()
    )
    for run in stale_runs:
        run.status = "failed"
        run.error_message = "审查超时，已自动终止"
        run.finished_at = now

    if task.analysis_status == "reviewing" and not force:
        active = (
            db.query(ReviewRun)
            .filter_by(task_id=task.id, status="running")
            .order_by(ReviewRun.id.desc())
            .first()
        )
        if active:
            raise HTTPException(
                409,
                "该任务正在问题审查中（通常需数分钟），请勿重复点击。"
                "若超过 35 分钟仍无结果，请刷新页面后再试。",
            )
        task.analysis_status = "indexed"

    allowed = {"indexed", "reviewed", "failed"}
    if task.analysis_status not in allowed and not force:
        raise HTTPException(400, "当前任务尚未完成材料解析，请先解析材料")

    for run in db.query(ReviewRun).filter_by(task_id=task.id, status="running").all():
        run.status = "failed"
        run.error_message = "已有新的审查请求，本条已取消"
        run.finished_at = now

    db.commit()
    db.refresh(task)


def _task_phase(task) -> str:
    ph = getattr(task, "phase", None) if task is not None else None
    if ph in ("pre_review", "implementation"):
        return ph
    return "implementation"


def load_framework(phase: str = "implementation") -> dict:
    """实施方案使用 framework.json；方案预审使用 framework_pre_review.json（维度与检索词不同）。"""
    if phase not in ("pre_review", "implementation"):
        phase = "implementation"
    path = FRAMEWORK_PRE_PATH if phase == "pre_review" else FRAMEWORK_PATH
    if phase == "pre_review" and not FRAMEWORK_PRE_PATH.exists():
        path = FRAMEWORK_PATH
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_template_schema() -> dict:
    if not TEMPLATE_SCHEMA_PATH.exists():
        return {}
    with open(TEMPLATE_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def parser_capabilities() -> ParserCapabilityOut:
    available = ["builtin"]
    optional: list[str] = []
    notes = ["默认使用内置解析器，分块过程完全在本地执行，不消耗大模型 token。"]
    try:
        import unstructured  # type: ignore  # noqa: F401

        available.append("unstructured")
        notes.append("已检测到 Unstructured，可用于 DOCX/文本类材料的结构化元素切分。")
    except Exception:
        optional.append("unstructured")
        notes.append("未安装 Unstructured；安装后会自动优先用于 DOCX/文本类结构化解析。")
    recommended = "unstructured" if "unstructured" in available else "builtin"
    return ParserCapabilityOut(
        preferred_engine=recommended,
        available_engines=available,
        optional_engines=optional,
        recommended_engine=recommended,
        notes=notes,
    )


def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    FRAMEWORK_CRITERIA_DIR.mkdir(parents=True, exist_ok=True)
    (FRAMEWORK_CRITERIA_DIR / "pre_review").mkdir(parents=True, exist_ok=True)
    (FRAMEWORK_CRITERIA_DIR / "implementation").mkdir(parents=True, exist_ok=True)


def _normalize_review_phase(phase: str) -> str:
    if phase not in ("pre_review", "implementation"):
        raise HTTPException(
            400,
            "无效阶段，仅支持 pre_review（方案预审）或 implementation（实施方案审核）",
        )
    return phase


def _latest_framework_version(
    db: Session, phase: str
) -> Optional[ReviewFrameworkVersion]:
    return (
        db.query(ReviewFrameworkVersion)
        .filter_by(phase=phase)
        .order_by(
            ReviewFrameworkVersion.version_seq.desc(),
            ReviewFrameworkVersion.id.desc(),
        )
        .first()
    )


def _next_framework_seq(db: Session, phase: str) -> int:
    row = (
        db.query(ReviewFrameworkVersion)
        .filter_by(phase=phase)
        .order_by(ReviewFrameworkVersion.version_seq.desc())
        .first()
    )
    return (row.version_seq + 1) if row else 1


def _owner_display_name(db: Session, user_id: Optional[int]) -> str:
    if user_id is None:
        return "—"
    u = db.get(User, user_id)
    if not u:
        return "—"
    return ((u.display_name or "").strip() or u.username)


def _updater_display_name(db: Session, user_id: Optional[int]) -> str:
    return _owner_display_name(db, user_id)


def _framework_version_to_out(db: Session, fv: ReviewFrameworkVersion) -> FrameworkVersionOut:
    return FrameworkVersionOut(
        id=fv.id,
        phase=fv.phase,
        version_seq=fv.version_seq,
        original_filename=fv.original_filename,
        created_at=fv.created_at,
        text_char_count=len(fv.extracted_text or ""),
        username=_owner_display_name(db, getattr(fv, "created_by_user_id", None)),
    )


def compute_review_status(db: Session, task_id: int) -> str:
    """新流程下，完成问题审查后视为已完成。"""
    task = db.query(ReviewTask).filter_by(id=task_id).first()
    if not task:
        return "in_progress"
    if getattr(task, "analysis_status", None) == "reviewed":
        return "completed"
    return "in_progress"


def _stamp_user_update(user: User, updater_id: int) -> None:
    user.updated_by_user_id = updater_id
    user.updated_at = datetime.now(timezone.utc)


def user_to_out(db: Session, user: User) -> UserOut:
    avatar_path = (getattr(user, "avatar_path", None) or "").strip()
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=getattr(user, "updated_at", None),
        avatar_url=f"/api/auth/me/avatar?v={Path(avatar_path).stat().st_mtime_ns}"
        if avatar_path and Path(avatar_path).is_file()
        else None,
        updated_by_name=_updater_display_name(db, getattr(user, "updated_by_user_id", None)),
    )


def _bootstrap_needed(db: Session) -> bool:
    return db.query(User).count() == 0


def task_to_out(db: Session, task: ReviewTask, username: str = "系统") -> TaskOut:
    st: str = compute_review_status(db, task.id)
    u = getattr(task, "user", None)
    if u is not None:
        owner_name = ((u.display_name or "").strip() or u.username)
    else:
        owner_name = username
    out = TaskOut.from_task(task, st, owner_name)
    out.updated_by_name = _updater_display_name(db, getattr(task, "updated_by_user_id", None))
    return out


def agent_to_out(db: Session, a: LlmAgent) -> LlmAgentOut:
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
        updated_at=getattr(a, "updated_at", None),
        username=_owner_display_name(db, a.user_id),
    )


def _get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "请先登录")
    token = authorization[7:].strip()
    session = db.query(AuthSession).filter_by(token=token).first()
    if not session:
        raise HTTPException(401, "登录态无效，请重新登录")
    now = datetime.now(timezone.utc)
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "登录已过期，请重新登录")
    user = session.user
    if not user or not user.is_active:
        raise HTTPException(403, "当前账号已被停用")
    return user


def _require_admin(user: User = Depends(_get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可执行该操作")
    return user


def _require_agent(db: Session, agent_id: int, user: User) -> LlmAgent:
    ag = db.query(LlmAgent).filter_by(id=agent_id, user_id=user.id).first()
    if not ag:
        raise HTTPException(400, "测评智能体不存在")
    return ag


def _get_task_or_404(db: Session, task_id: int, user: User) -> ReviewTask:
    t = db.query(ReviewTask).filter_by(id=task_id, user_id=user.id).first()
    if not t:
        raise HTTPException(404, "评审任务不存在")
    return t


def _get_task_any_or_404(db: Session, task_id: int) -> ReviewTask:
    t = db.get(ReviewTask, task_id)
    if not t:
        raise HTTPException(404, "评审任务不存在")
    return t


def _json_list_field(raw: Optional[str]) -> list:
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except Exception:
        return []


def _memory_profile_to_out(task: ReviewTask, profile: ProjectMemoryProfile) -> MemoryProfileOut:
    return MemoryProfileOut(
        task_id=task.id,
        task_name=task.name,
        project_key=profile.project_key,
        version=profile.version,
        phase=profile.phase or getattr(task, "phase", None),
        analysis_status=getattr(task, "analysis_status", None),
        index_status=profile.index_status,
        index_error=profile.index_error,
        summary_text=profile.summary_text,
        project_overview=project_overview_from_profile(profile),
        goals=_json_list_field(profile.goals_json),
        capabilities=_json_list_field(profile.capabilities_json),
        core_functions=_json_list_field(profile.core_functions_json),
        systems=_json_list_field(profile.systems_json),
        keywords=_json_list_field(profile.keywords_json),
        char_count=profile.char_count,
        chunk_count=profile.chunk_count,
        indexed_at=profile.indexed_at,
    )


def _get_review_run_or_404(db: Session, run_id: int, user: User) -> ReviewRun:
    run = (
        db.query(ReviewRun)
        .join(ReviewTask, ReviewRun.task_id == ReviewTask.id)
        .filter(ReviewRun.id == run_id, ReviewTask.user_id == user.id)
        .first()
    )
    if not run:
        raise HTTPException(404, "审查运行记录不存在")
    return run


def _get_issue_or_404(db: Session, issue_id: int, user: User) -> ReviewIssue:
    issue = (
        db.query(ReviewIssue)
        .join(ReviewTask, ReviewIssue.task_id == ReviewTask.id)
        .filter(ReviewIssue.id == issue_id, ReviewTask.user_id == user.id)
        .first()
    )
    if not issue:
        raise HTTPException(404, "问题不存在")
    return issue


def build_issue_summary(task: ReviewTask, issues: list[ReviewIssue]) -> ReviewSummaryOut:
    serious_count = sum(1 for x in issues if x.severity == "serious")
    major_count = sum(1 for x in issues if x.severity == "major")
    minor_count = sum(1 for x in issues if x.severity == "minor")
    manual_focus: list[str] = []
    for issue in issues:
        if issue.manual_review and issue.title not in manual_focus:
            manual_focus.append(issue.title)
    missing_materials: list[str] = []
    raw_missing = (getattr(task, "missing_materials", None) or "").strip()
    if raw_missing:
        missing_materials = [line.strip() for line in raw_missing.splitlines() if line.strip()]
    return ReviewSummaryOut(
        overall_assessment=getattr(task, "overall_assessment", None),
        serious_count=serious_count,
        major_count=major_count,
        minor_count=minor_count,
        missing_materials=missing_materials,
        manual_focus=manual_focus[:10],
    )


def _rebuild_task_documents(db: Session, task: ReviewTask) -> None:
    dimensions = load_framework(_task_phase(task)).get("dimensions") or []

    db.query(DocumentChunk).filter_by(task_id=task.id).delete()
    db.query(DocumentFile).filter_by(task_id=task.id).delete()
    db.flush()

    total_chars = 0
    total_chunks = 0

    proposal = (task.proposal_body or "").strip()
    if proposal:
        doc = DocumentFile(
            task_id=task.id,
            attachment_id=None,
            file_name="任务补充说明",
            file_type="text",
            parse_status="done",
            page_count=1,
            char_count=len(proposal),
            outline_json=None,
            parse_error=None,
        )
        db.add(doc)
        db.flush()
        proposal_chunks = split_text_to_chunks(
            proposal,
            section_hint="任务补充说明",
            dimensions=dimensions,
        )
        for idx, chunk in enumerate(proposal_chunks, start=1):
            db.add(
                DocumentChunk(
                    task_id=task.id,
                    document_file_id=doc.id,
                    chunk_index=idx,
                    section_title=chunk.section_title,
                    page_from=1,
                    page_to=1,
                    char_count=chunk.char_count,
                    token_estimate=chunk.token_estimate,
                    content=chunk.content,
                    summary=chunk.summary,
                    keywords_json=chunk.keywords_json,
                    dimension_hints_json=chunk.dimension_hints_json,
                )
            )
            total_chunks += 1
        total_chars += len(proposal)

    attachments = db.query(Attachment).filter_by(task_id=task.id).order_by(Attachment.id.asc()).all()
    for att in attachments:
        path = Path(att.stored_path)
        parsed = parse_path(path)
        parse_error = None
        if not parsed.text:
            parse_error = "当前版本未能抽取到可用文本"
            if parsed.outline_json:
                try:
                    parse_hint = json.loads(parsed.outline_json)
                except Exception:
                    parse_hint = {}
                if parse_hint.get("ocr_suggested"):
                    reason = parse_hint.get("reason")
                    if reason == "pdf_text_empty_maybe_scanned":
                        parse_error = "未提取到 PDF 文本，疑似扫描件；建议后续接入 OCR 后重试"
                    elif reason == "pdf_ocr_renderer_missing":
                        parse_error = "扫描版 PDF 需先渲染为图片后再 OCR，当前环境缺少 PDF 渲染依赖"
                    elif reason == "pdf_ocr_failed":
                        parse_error = "扫描版 PDF 已尝试 OCR，但当前仍未成功识别出可用文字"
                    elif reason == "image_ocr_unavailable_or_no_text":
                        parse_error = "图片材料暂未提取到文字，当前环境未启用 OCR 或图片本身无清晰文本"
                    elif reason == "ocr_python_deps_missing":
                        parse_error = "图片材料尚未启用 OCR 依赖，需补装 Pillow / pytesseract 后重试"
                    elif reason == "ocr_binary_missing_or_failed":
                        parse_error = "图片 OCR 运行失败，当前环境可能未安装 tesseract 可执行程序"
        doc = DocumentFile(
            task_id=task.id,
            attachment_id=att.id,
            file_name=att.original_name,
            file_type=path.suffix.lower().lstrip(".") or None,
            parse_status="done" if parsed.text else "failed",
            page_count=parsed.page_count,
            char_count=len(parsed.text) if parsed.text else None,
            outline_json=parsed.outline_json,
            parse_error=parse_error,
        )
        db.add(doc)
        db.flush()
        if not parsed.text:
            continue

        chunk_source = []
        if parsed.pages:
            for idx, page_text in enumerate(parsed.pages, start=1):
                if not (page_text or "").strip():
                    continue
                chunk_source.append((idx, idx, page_text))
        else:
            chunk_source.append((1, parsed.page_count or 1, parsed.text))

        next_chunk_index = 1
        for page_from, page_to, source_text in chunk_source:
            source_chunks = split_text_to_chunks(
                source_text,
                section_hint=att.original_name,
                dimensions=dimensions,
            )
            for chunk in source_chunks:
                db.add(
                    DocumentChunk(
                        task_id=task.id,
                        document_file_id=doc.id,
                        chunk_index=next_chunk_index,
                        section_title=chunk.section_title,
                        page_from=page_from,
                        page_to=page_to,
                        char_count=chunk.char_count,
                        token_estimate=chunk.token_estimate,
                        content=chunk.content,
                        summary=chunk.summary,
                        keywords_json=chunk.keywords_json,
                        dimension_hints_json=chunk.dimension_hints_json,
                    )
                )
                next_chunk_index += 1
                total_chunks += 1
        total_chars += len(parsed.text)

    task.doc_total_chars = total_chars or None
    task.doc_total_chunks = total_chunks or None


app = FastAPI(title="项目方案评审平台 API", version="0.2.0")
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


@app.get("/api/auth/bootstrap-status", response_model=BootstrapStatusOut)
def get_bootstrap_status(db: Session = Depends(get_db)):
    return BootstrapStatusOut(needs_bootstrap=_bootstrap_needed(db))


@app.post("/api/auth/bootstrap-admin", response_model=AuthOut)
def bootstrap_admin(body: BootstrapAdminBody, db: Session = Depends(get_db)):
    if not _bootstrap_needed(db):
        raise HTTPException(400, "系统已初始化管理员，请直接登录")
    username = normalize_username(body.username)
    if not username:
        raise HTTPException(400, "用户名不能为空")
    user = User(
        username=username,
        display_name=(body.display_name or default_display_name(username)).strip(),
        password_hash=hash_password(body.password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.query(ReviewTask).filter(ReviewTask.user_id.is_(None)).update({"user_id": user.id})
    db.query(LlmAgent).filter(LlmAgent.user_id.is_(None)).update({"user_id": user.id})

    session = AuthSession(
        user_id=user.id,
        token=issue_session_token(),
        expires_at=session_expiry(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return AuthOut(token=session.token, user=user_to_out(db, user))


@app.post("/api/auth/login", response_model=AuthOut)
def login(body: LoginBody, db: Session = Depends(get_db)):
    username = normalize_username(body.username)
    user = db.query(User).filter_by(username=username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "用户名或密码错误")
    if not user.is_active:
        raise HTTPException(403, "当前账号已被停用")
    session = AuthSession(
        user_id=user.id,
        token=issue_session_token(),
        expires_at=session_expiry(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return AuthOut(token=session.token, user=user_to_out(db, user))


@app.get("/api/auth/me", response_model=UserOut)
def auth_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    return user_to_out(db, current_user)


@app.patch("/api/auth/me", response_model=UserOut)
def update_my_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    if body.display_name is not None:
        dn = body.display_name.strip()
        current_user.display_name = dn if dn else default_display_name(current_user.username)
    _stamp_user_update(current_user, current_user.id)
    db.commit()
    db.refresh(current_user)
    return user_to_out(db, current_user)


@app.get("/api/auth/me/avatar")
def get_my_avatar(current_user: User = Depends(_get_current_user)):
    path = (getattr(current_user, "avatar_path", None) or "").strip()
    if not path or not Path(path).is_file():
        raise HTTPException(404, "尚未上传头像")
    return FileResponse(path)


@app.post("/api/auth/me/avatar", response_model=UserOut)
async def upload_my_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    raw_name = Path(file.filename or "avatar.png").name
    suffix = Path(raw_name).suffix.lower()
    allowed = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    if suffix not in allowed:
        raise HTTPException(400, "仅支持 JPG、PNG、GIF、WebP 格式头像")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "头像文件不能超过 2MB")
    dest = AVATAR_DIR / f"user_{current_user.id}{suffix}"
    dest.write_bytes(content)
    current_user.avatar_path = str(dest)
    _stamp_user_update(current_user, current_user.id)
    db.commit()
    db.refresh(current_user)
    return user_to_out(db, current_user)


@app.post("/api/auth/logout")
def logout(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    del current_user
    token = (authorization or "")[7:].strip()
    session = db.query(AuthSession).filter_by(token=token).first()
    if session:
        db.delete(session)
        db.commit()
    return {"ok": True}


@app.get("/api/users", response_model=PaginatedUserListOut)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    q: Optional[str] = Query(None, description="用户名或显示名模糊搜索"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(_require_admin),
):
    del admin_user
    base = db.query(User)
    term = (q or "").strip()
    if term:
        pat = f"%{term}%"
        base = base.filter(or_(User.username.ilike(pat), User.display_name.ilike(pat)))
    total = base.count()
    rows = (
        base.order_by(User.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedUserListOut(
        items=[user_to_out(db, x) for x in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.post("/api/users", response_model=UserOut)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(_require_admin),
):
    del admin_user
    username = normalize_username(body.username)
    if not username:
        raise HTTPException(400, "用户名不能为空")
    existing = db.query(User).filter_by(username=username).first()
    if existing:
        raise HTTPException(400, "用户名已存在")
    user = User(
        username=username,
        display_name=(body.display_name or default_display_name(username)).strip(),
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
        updated_by_user_id=admin_user.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_out(db, user)


def _active_admin_count(db: Session) -> int:
    return (
        db.query(User)
        .filter(User.role == "admin", User.is_active.is_(True))
        .count()
    )


@app.get("/api/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(_require_admin),
):
    del admin_user
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "用户不存在")
    return user_to_out(db, u)


@app.patch("/api/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(_require_admin),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "用户不存在")

    final_role = body.role if body.role is not None else target.role
    final_active = body.is_active if body.is_active is not None else target.is_active

    if admin_user.id == target.id and final_active is False:
        raise HTTPException(400, "不能停用自己的账号")

    was_admin_active = target.role == "admin" and target.is_active
    will_be_admin_active = final_role == "admin" and final_active
    if was_admin_active and not will_be_admin_active:
        if _active_admin_count(db) - 1 < 1:
            raise HTTPException(400, "不能移除或停用最后一个管理员")

    if body.display_name is not None:
        dn = body.display_name.strip()
        target.display_name = dn if dn else default_display_name(target.username)
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.password is not None:
        target.password_hash = hash_password(body.password)

    _stamp_user_update(target, admin_user.id)

    db.commit()
    db.refresh(target)
    return user_to_out(db, target)


@app.get("/api/framework")
def get_framework(
    phase: Optional[str] = Query(
        None,
        description="pre_review=方案预审维度；implementation=实施方案维度；缺省为 implementation",
    ),
):
    ph = phase if phase in ("pre_review", "implementation") else "implementation"
    return load_framework(ph)


@app.get("/api/template-schema")
def get_template_schema():
    return load_template_schema()


@app.get("/api/parser-capabilities", response_model=ParserCapabilityOut)
def get_parser_capabilities():
    return parser_capabilities()


@app.get("/api/llm-agents", response_model=PaginatedLlmAgentListOut)
def list_agents(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    q: Optional[str] = Query(None, description="名称或模型模糊搜索"),
    provider: Optional[str] = Query(
        None,
        description="deepseek|openai|custom，不传则不限定提供方",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    base = db.query(LlmAgent).filter(LlmAgent.user_id == current_user.id)
    if provider in ("deepseek", "openai", "custom"):
        base = base.filter(LlmAgent.provider == provider)
    term = (q or "").strip()
    if term:
        pat = f"%{term}%"
        base = base.filter(or_(LlmAgent.name.ilike(pat), LlmAgent.model.ilike(pat)))
    total = base.count()
    rows = (
        base.order_by(LlmAgent.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedLlmAgentListOut(
        items=[agent_to_out(db, a) for a in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.post("/api/llm-agents", response_model=LlmAgentOut)
def create_agent(
    body: LlmAgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    a = LlmAgent(
        user_id=current_user.id,
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
    return agent_to_out(db, a)


@app.get("/api/llm-agents/{agent_id}", response_model=LlmAgentOut)
def get_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    a = _require_agent(db, agent_id, current_user)
    return agent_to_out(db, a)


@app.patch("/api/llm-agents/{agent_id}", response_model=LlmAgentOut)
def update_agent(
    agent_id: int,
    body: LlmAgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    a = _require_agent(db, agent_id, current_user)
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
    return agent_to_out(db, a)


@app.delete("/api/llm-agents/{agent_id}")
def delete_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    a = _require_agent(db, agent_id, current_user)
    cnt = (
        db.query(ReviewTask)
        .filter(ReviewTask.llm_agent_id == agent_id, ReviewTask.user_id == current_user.id)
        .count()
    )
    if cnt:
        raise HTTPException(400, f"仍有 {cnt} 个任务绑定该智能体，请先解除绑定")
    db.delete(a)
    db.commit()
    return {"ok": True}


@app.get("/api/review-projects", response_model=list[ProjectOut])
def list_review_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    rows = (
        db.query(ReviewProject)
        .filter_by(user_id=current_user.id)
        .order_by(ReviewProject.id.desc())
        .all()
    )
    return [ProjectOut.model_validate(p) for p in rows]


@app.post("/api/review-projects", response_model=ProjectOut)
def create_review_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    p = ReviewProject(
        user_id=current_user.id,
        name=body.name.strip(),
        unit_name=body.unit_name.strip() if body.unit_name else None,
        external_code=body.external_code.strip() if body.external_code else None,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return ProjectOut.model_validate(p)


@app.get("/api/review-framework/{phase}/current", response_model=FrameworkCurrentResponse)
def get_framework_current(
    phase: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    ph = _normalize_review_phase(phase)
    fv = _latest_framework_version(db, ph)
    if not fv:
        return FrameworkCurrentResponse(phase=ph, current=None)
    return FrameworkCurrentResponse(phase=ph, current=_framework_version_to_out(db, fv))


@app.get(
    "/api/review-framework/{phase}/preview-text",
    response_model=FrameworkCriteriaPreviewOut,
)
def get_framework_criteria_preview(
    phase: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    """返回当前阶段最新上传要点的正文预览（过长时按与 LLM 注入相同的规则截断）。"""
    ph = _normalize_review_phase(phase)
    fv = _latest_framework_version(db, ph)
    if not fv:
        raise HTTPException(404, "该阶段尚未上传审核要点 Word")
    raw = (fv.extracted_text or "").strip()
    clipped = clip_criteria_text(raw)
    return FrameworkCriteriaPreviewOut(
        phase=ph,
        version_seq=fv.version_seq,
        original_filename=fv.original_filename or "",
        created_at=fv.created_at,
        username=_owner_display_name(db, getattr(fv, "created_by_user_id", None)),
        text=clipped,
        text_was_truncated=len(raw) > MAX_CRITERIA_CHARS,
    )


@app.post("/api/review-framework/{phase}/upload", response_model=FrameworkVersionOut)
async def upload_framework_docx(
    phase: str,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
    file: UploadFile = File(...),
):
    """上传新的审核要点 Word，覆盖磁盘上的 current 副本；新版本仅绑定此后新创建的任务。"""
    ph = _normalize_review_phase(phase)
    fn = (file.filename or "").strip()
    if not fn.lower().endswith(".docx"):
        raise HTTPException(400, "请上传 .docx 格式的审核要点")
    raw = await file.read()
    if len(raw) > 40 * 1024 * 1024:
        raise HTTPException(400, "文件过大（上限 40MB）")
    seq = _next_framework_seq(db, ph)
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in fn)[:160]
    dest_dir = FRAMEWORK_CRITERIA_DIR / ph
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"v{seq}_{safe}"
    dest.write_bytes(raw)
    try:
        extracted = extract_text_from_docx(dest)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(422, f"解析 Word 失败：{e!s}") from e
    rel = dest.relative_to(DATA_DIR).as_posix()
    fv = ReviewFrameworkVersion(
        phase=ph,
        version_seq=seq,
        original_filename=fn,
        stored_path=rel,
        extracted_text=extracted,
        created_by_user_id=admin.id,
    )
    db.add(fv)
    db.commit()
    db.refresh(fv)
    current_slot = dest_dir / "current.docx"
    try:
        shutil.copy2(dest, current_slot)
    except OSError:
        pass
    return _framework_version_to_out(db, fv)


@app.get("/api/review-tasks/metrics", response_model=ReviewTaskMetricsOut)
def review_task_metrics(
    phase: Optional[str] = Query(
        None,
        description="pre_review|implementation，不传则统计全部阶段",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    q = db.query(ReviewTask).filter(ReviewTask.user_id == current_user.id)
    if phase in ("pre_review", "implementation"):
        q = q.filter(ReviewTask.phase == phase)
    total = q.count()
    completed = q.filter(ReviewTask.analysis_status == "reviewed").count()
    return ReviewTaskMetricsOut(
        total=total,
        completed=completed,
        in_progress=max(0, total - completed),
    )


@app.get("/api/review-tasks", response_model=PaginatedTaskListOut)
def list_tasks(
    phase: Optional[str] = Query(
        None,
        description="pre_review=方案预审 implementation=实施方案审核，不传则不限定阶段",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    q: Optional[str] = Query(None, description="任务名称模糊搜索"),
    review_status: Optional[str] = Query(
        None,
        description="in_progress|completed，不传则不限定状态",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    base = (
        db.query(ReviewTask)
        .options(joinedload(ReviewTask.user))
        .filter(ReviewTask.user_id == current_user.id)
    )
    if phase in ("pre_review", "implementation"):
        base = base.filter(ReviewTask.phase == phase)
    if review_status == "completed":
        base = base.filter(ReviewTask.analysis_status == "reviewed")
    elif review_status == "in_progress":
        base = base.filter(ReviewTask.analysis_status != "reviewed")
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        base = base.filter(
            or_(
                ReviewTask.name.ilike(like),
                ReviewTask.project_key.ilike(like),
                ReviewTask.version.ilike(like),
            )
        )
    total = base.count()
    tasks = (
        base.order_by(ReviewTask.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedTaskListOut(
        items=[task_to_out(db, t, current_user.username) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.post("/api/review-tasks", response_model=TaskOut)
def create_task(
    body: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    ph = body.phase if body.phase in ("pre_review", "implementation") else "implementation"
    task_name = body.name.strip()
    pkey, pver = resolve_project_identity(task_name, body.project_key, body.version)
    t = ReviewTask(
        name=task_name,
        user_id=current_user.id,
        phase=ph,
        project_key=pkey,
        version=pver,
    )
    if body.llm_agent_id is not None:
        _require_agent(db, body.llm_agent_id, current_user)
        t.llm_agent_id = body.llm_agent_id
    if body.project_id is not None:
        pr = (
            db.query(ReviewProject)
            .filter_by(id=body.project_id, user_id=current_user.id)
            .first()
        )
        if not pr:
            raise HTTPException(400, "申报项目不存在或无权访问")
        t.project_id = pr.id
    fv = _latest_framework_version(db, ph)
    if fv:
        t.framework_version_id = fv.id
    db.add(t)
    db.commit()
    db.refresh(t)
    (UPLOAD_DIR / str(t.id)).mkdir(parents=True, exist_ok=True)
    db.refresh(t)
    return task_to_out(db, t, current_user.display_name)


@app.get("/api/review-tasks/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    t = _get_task_or_404(db, task_id, current_user)
    return task_to_out(db, t, current_user.display_name)


@app.patch("/api/review-tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    t = _get_task_or_404(db, task_id, current_user)
    data = body.model_dump(exclude_unset=True)
    if "llm_agent_id" in data and data["llm_agent_id"] is not None:
        _require_agent(db, data["llm_agent_id"], current_user)
    if {"name", "project_key", "version"} & data.keys():
        final_name = (data.get("name") if "name" in data else t.name) or ""
        final_name = final_name.strip()
        explicit_key = data["project_key"] if "project_key" in data else None
        explicit_ver = data["version"] if "version" in data else None
        if "name" in data and "project_key" not in data and "version" not in data:
            explicit_key = None
            explicit_ver = None
        pkey, pver = resolve_project_identity(final_name, explicit_key, explicit_ver)
        data["project_key"] = pkey
        data["version"] = pver
        if "name" in data:
            data["name"] = final_name
    for k, v in data.items():
        setattr(t, k, v)
    if "proposal_body" in data:
        has_materials = bool((t.proposal_body or "").strip()) or bool(
            db.query(Attachment).filter_by(task_id=t.id).first()
        )
        if has_materials:
            db.query(DocumentChunk).filter_by(task_id=t.id).delete()
            db.query(DocumentFile).filter_by(task_id=t.id).update({"parse_status": "pending"})
            t.analysis_status = "draft"
            t.doc_total_chars = None
            t.doc_total_chunks = None
        else:
            db.query(DocumentChunk).filter_by(task_id=t.id).delete()
            db.query(DocumentFile).filter_by(task_id=t.id).delete()
            t.analysis_status = "draft"
            t.doc_total_chars = None
            t.doc_total_chunks = None
    db.commit()
    db.refresh(t)
    return task_to_out(db, t, current_user.display_name)


@app.delete("/api/review-tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    t = _get_task_or_404(db, task_id, current_user)
    folder = UPLOAD_DIR / str(task_id)
    if folder.exists():
        shutil.rmtree(folder)
    db.delete(t)
    db.commit()
    return {"ok": True}


@app.get("/api/review-tasks/{task_id}/analysis-status", response_model=AnalysisStatusOut)
def get_analysis_status(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    files = (
        db.query(DocumentFile)
        .filter_by(task_id=task_id)
        .order_by(DocumentFile.id.asc())
        .all()
    )
    return AnalysisStatusOut(
        task_id=task.id,
        analysis_status=getattr(task, "analysis_status", "draft"),
        doc_total_chars=getattr(task, "doc_total_chars", None),
        doc_total_chunks=getattr(task, "doc_total_chunks", None),
        files=files,
    )


@app.get("/api/review-tasks/{task_id}/token-estimate", response_model=TaskTokenEstimateOut)
def get_task_token_estimate(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    agent = None
    if getattr(task, "llm_agent_id", None):
        agent = db.query(LlmAgent).filter_by(id=task.llm_agent_id).first()
    estimate = estimate_task_token_usage(db, task, load_framework(_task_phase(task)), agent)
    return TaskTokenEstimateOut(
        task_id=estimate.task_id,
        parser_engine=estimate.parser_engine,
        parser_mode=estimate.parser_mode,
        local_chunk_tokens=estimate.local_chunk_tokens,
        llm_chunking_tokens=estimate.llm_chunking_tokens,
        review_input_tokens=estimate.review_input_tokens,
        review_output_tokens=estimate.review_output_tokens,
        total_llm_tokens=estimate.total_llm_tokens,
        assumptions=estimate.assumptions,
        dimensions=[
            DimensionTokenEstimateOut(
                dimension_id=item.dimension_id,
                dimension_title=item.dimension_title,
                retrieved_chunks=item.retrieved_chunks,
                input_tokens=item.input_tokens,
                output_tokens=item.output_tokens,
            )
            for item in estimate.dimensions
        ],
        model_provider=estimate.model_provider,
        model_name=estimate.model_name,
        price_display_name=estimate.price_display_name,
        pricing_source_name=estimate.pricing_source_name,
        pricing_source_url=estimate.pricing_source_url,
        input_price_per_million_usd=estimate.input_price_per_million_usd,
        cached_input_price_per_million_usd=estimate.cached_input_price_per_million_usd,
        output_price_per_million_usd=estimate.output_price_per_million_usd,
        estimated_cost_low_usd=estimate.estimated_cost_low_usd,
        estimated_cost_high_usd=estimate.estimated_cost_high_usd,
        estimated_cost_low_cny=estimate.estimated_cost_low_cny,
        estimated_cost_high_cny=estimate.estimated_cost_high_cny,
        exchange_rate_usd_to_cny=estimate.exchange_rate_usd_to_cny,
    )


@app.get("/api/review-costs/task-overview", response_model=list[TaskCostOverviewItemOut])
def get_task_cost_overview(
    task_ids: Optional[str] = Query(
        None,
        description="逗号分隔的任务 id；不传则返回当前用户全部任务的估算（兼容旧客户端）",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    qry = db.query(ReviewTask).filter(ReviewTask.user_id == current_user.id)
    raw_ids = (task_ids or "").strip()
    if raw_ids:
        ids: list[int] = []
        for part in raw_ids.split(","):
            p = part.strip()
            if p.isdigit():
                ids.append(int(p))
        if not ids:
            return []
        qry = qry.filter(ReviewTask.id.in_(ids))
    tasks = qry.order_by(ReviewTask.id.desc()).all()
    items: list[TaskCostOverviewItemOut] = []
    for task in tasks:
        agent = None
        if getattr(task, "llm_agent_id", None):
            agent = db.query(LlmAgent).filter_by(id=task.llm_agent_id).first()
        estimate = estimate_task_token_usage(db, task, load_framework(_task_phase(task)), agent)
        items.append(
            TaskCostOverviewItemOut(
                task_id=task.id,
                total_llm_tokens=estimate.total_llm_tokens,
                estimated_cost_low_usd=estimate.estimated_cost_low_usd,
                estimated_cost_high_usd=estimate.estimated_cost_high_usd,
                estimated_cost_low_cny=estimate.estimated_cost_low_cny,
                estimated_cost_high_cny=estimate.estimated_cost_high_cny,
                price_display_name=estimate.price_display_name,
            )
        )
    return items


@app.get("/api/review-tasks/{task_id}/cost-compare", response_model=list[CostCompareItemOut])
def get_task_cost_compare(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    agents = db.query(LlmAgent).filter_by(user_id=current_user.id).order_by(LlmAgent.id.asc()).all()
    fw = load_framework(_task_phase(task))
    items: list[CostCompareItemOut] = []
    for agent in agents:
        estimate = estimate_task_token_usage(db, task, fw, agent)
        items.append(
            CostCompareItemOut(
                agent_id=agent.id,
                agent_name=agent.name,
                provider=agent.provider,
                model=agent.model,
                total_llm_tokens=estimate.total_llm_tokens,
                estimated_cost_low_usd=estimate.estimated_cost_low_usd,
                estimated_cost_high_usd=estimate.estimated_cost_high_usd,
                estimated_cost_low_cny=estimate.estimated_cost_low_cny,
                estimated_cost_high_cny=estimate.estimated_cost_high_cny,
                price_display_name=estimate.price_display_name,
                supported=estimate.estimated_cost_low_usd is not None,
            )
        )
    return items


@app.get("/api/review-costs/monthly-summary", response_model=MonthlyCostSummaryOut)
def get_monthly_cost_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    now = datetime.now(timezone.utc)
    month_prefix = now.astimezone().strftime("%Y-%m")
    tasks = db.query(ReviewTask).filter_by(user_id=current_user.id).all()
    task_count = 0
    total_llm_tokens = 0
    low_usd = 0.0
    high_usd = 0.0
    low_cny = 0.0
    high_cny = 0.0
    for task in tasks:
        created = getattr(task, "created_at", None)
        if not created:
            continue
        created_text = created.astimezone().strftime("%Y-%m") if getattr(created, "tzinfo", None) else str(created)[:7]
        if created_text != month_prefix:
            continue
        agent = None
        if getattr(task, "llm_agent_id", None):
            agent = db.query(LlmAgent).filter_by(id=task.llm_agent_id).first()
        estimate = estimate_task_token_usage(db, task, load_framework(_task_phase(task)), agent)
        task_count += 1
        total_llm_tokens += estimate.total_llm_tokens
        low_usd += estimate.estimated_cost_low_usd or 0
        high_usd += estimate.estimated_cost_high_usd or 0
        low_cny += estimate.estimated_cost_low_cny or 0
        high_cny += estimate.estimated_cost_high_cny or 0
    return MonthlyCostSummaryOut(
        month=month_prefix,
        task_count=task_count,
        total_llm_tokens=total_llm_tokens,
        estimated_cost_low_usd=low_usd,
        estimated_cost_high_usd=high_usd,
        estimated_cost_low_cny=low_cny,
        estimated_cost_high_cny=high_cny,
    )


@app.post("/api/review-tasks/{task_id}/analyze", response_model=AnalysisStatusOut)
def analyze_task_materials(
    task_id: int,
    body: AnalyzeRunBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    attachments = db.query(Attachment).filter_by(task_id=task_id).all()
    if not attachments and not (task.proposal_body or "").strip():
        raise HTTPException(400, "请先上传方案附件或填写方案说明")
    if getattr(task, "analysis_status", "draft") in {"parsing", "reviewing"} and not body.force:
        raise HTTPException(400, "当前任务正在处理中，如需重跑请传 force=true")

    task.analysis_status = "parsing"
    db.commit()
    db.refresh(task)

    _rebuild_task_documents(db, task)
    task.analysis_status = "indexed"
    db.commit()
    db.refresh(task)
    try:
        ensure_task_memory_index(db, task)
    except Exception:
        pass

    files = (
        db.query(DocumentFile)
        .filter_by(task_id=task_id)
        .order_by(DocumentFile.id.asc())
        .all()
    )
    return AnalysisStatusOut(
        task_id=task.id,
        analysis_status=task.analysis_status,
        doc_total_chars=task.doc_total_chars,
        doc_total_chunks=task.doc_total_chunks,
        files=files,
    )


@app.get("/api/review-tasks/{task_id}/document-files", response_model=list[DocumentFileOut])
def list_document_files(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    _get_task_or_404(db, task_id, current_user)
    return (
        db.query(DocumentFile)
        .filter_by(task_id=task_id)
        .order_by(DocumentFile.id.asc())
        .all()
    )


@app.get("/api/review-tasks/{task_id}/chunks", response_model=list[DocumentChunkOut])
def list_document_chunks(
    task_id: int,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    _get_task_or_404(db, task_id, current_user)
    return (
        db.query(DocumentChunk)
        .filter_by(task_id=task_id)
        .order_by(DocumentChunk.document_file_id.asc(), DocumentChunk.chunk_index.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@app.get("/api/document-chunks/{chunk_id}", response_model=DocumentChunkOut)
def get_document_chunk(
    chunk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    chunk = (
        db.query(DocumentChunk)
        .join(ReviewTask, DocumentChunk.task_id == ReviewTask.id)
        .filter(DocumentChunk.id == chunk_id, ReviewTask.user_id == current_user.id)
        .first()
    )
    if not chunk:
        raise HTTPException(404, "解析片段不存在")
    return chunk


@app.post("/api/review-tasks/{task_id}/review/run", response_model=ReviewRunOut)
def run_issue_review(
    task_id: int,
    body: ReviewRunBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    if body.agent_id is not None:
        _require_agent(db, body.agent_id, current_user)
    agent_id = body.agent_id if body.agent_id is not None else task.llm_agent_id
    if agent_id is None:
        raise HTTPException(400, "请先绑定默认智能体，或在请求中指定 agent_id")
    agent = _require_agent(db, agent_id, current_user)
    lock = _task_review_lock(task_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(
            409,
            "该任务正在问题审查中，请勿重复点击。完整审查通常需要数分钟。",
        )
    try:
        _prepare_task_for_issue_review(db, task, force=body.force)
        run = run_issue_review_for_task(
            db,
            task,
            load_framework(_task_phase(task)),
            agent,
            body.dimension_ids,
            load_template_schema(),
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except json.JSONDecodeError as e:
        raise HTTPException(
            422,
            "大模型返回的内容无法解析为 JSON，请重试问题审查；若仍失败，可换模型或缩短材料。",
        ) from e
    except httpx.HTTPStatusError as e:
        resp = e.response
        snippet = (resp.text[:500] if resp is not None else "") or str(e)
        raise HTTPException(502, f"大模型接口返回错误：{snippet}") from e
    except Exception as e:
        failed_run = ReviewRun(
            task_id=task.id,
            agent_id=agent_id,
            run_type="dimension" if body.dimension_ids else "full",
            status="failed",
            started_at=datetime.now(timezone.utc),
            finished_at=datetime.now(timezone.utc),
            error_message=str(e),
        )
        db.add(failed_run)
        task.analysis_status = "failed"
        db.commit()
        detail = str(e).strip()
        if detail in {"403 Forbidden", "403", "Forbidden"}:
            detail = (
                "大模型接口返回 403（拒绝访问），常见于连续重复点击或短时限流。"
                "请等待 30～60 秒后只点一次「问题审查」；并确认智能体为 deepseek-v4-flash 且 Key 已保存。"
            )
        elif "HTTP 403" not in detail and "403" in detail and len(detail) < 40:
            detail = (
                "大模型接口返回 403（拒绝访问），常见于连续重复点击或短时限流。"
                "请等待 30～60 秒后只点一次「问题审查」；并确认智能体为 deepseek-v4-flash 且 Key 已保存。"
            )
        raise HTTPException(502, f"问题审查失败：{detail}") from e
    finally:
        lock.release()
    return run


@app.get("/api/review-runs/{run_id}", response_model=ReviewRunOut)
def get_review_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    return _get_review_run_or_404(db, run_id, current_user)


@app.get("/api/review-tasks/{task_id}/review-runs", response_model=list[ReviewRunOut])
def list_review_runs(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    _get_task_or_404(db, task_id, current_user)
    return (
        db.query(ReviewRun)
        .filter_by(task_id=task_id)
        .order_by(ReviewRun.id.desc())
        .all()
    )


@app.get("/api/review-tasks/{task_id}/issues", response_model=ReviewIssueListOut)
def list_review_issues(
    task_id: int,
    severity: Optional[str] = Query(None),
    dimension_id: Optional[int] = Query(None),
    manual_review: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    q = db.query(ReviewIssue).filter_by(task_id=task_id)
    if severity:
        q = q.filter(ReviewIssue.severity == severity)
    if dimension_id is not None:
        q = q.filter(ReviewIssue.dimension_id == dimension_id)
    if manual_review is not None:
        q = q.filter(ReviewIssue.manual_review == manual_review)
    items = q.order_by(ReviewIssue.id.asc()).all()
    return ReviewIssueListOut(summary=build_issue_summary(task, items), items=items)


@app.get("/api/review-tasks/{task_id}/review-summary", response_model=ReviewSummaryOut)
def get_review_summary(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    issues = db.query(ReviewIssue).filter_by(task_id=task_id).all()
    return build_issue_summary(task, issues)


@app.get("/api/review-tasks/{task_id}/issues/report/download")
def download_issue_report(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    issues = db.query(ReviewIssue).filter_by(task_id=task_id).order_by(ReviewIssue.id.asc()).all()
    html_doc = build_issue_report_html(task, issues)
    fname = f"审查意见书-{task.name}.html"
    disp = "attachment; filename*=UTF-8''" + quote(fname)
    return Response(
        content=html_doc.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": disp},
    )


@app.get("/api/review-tasks/{task_id}/issues/report/word")
def download_issue_report_word(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    issues = db.query(ReviewIssue).filter_by(task_id=task_id).order_by(ReviewIssue.id.asc()).all()
    raw = build_issue_report_docx_bytes(task, issues)
    fname = f"审查意见书-{task.name}.docx"
    disp = "attachment; filename*=UTF-8''" + quote(fname)
    return Response(
        content=raw,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": disp},
    )


@app.get("/api/review-issues/{issue_id}", response_model=ReviewIssueOut)
def get_review_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    return _get_issue_or_404(db, issue_id, current_user)


@app.patch("/api/review-issues/{issue_id}", response_model=ReviewIssueOut)
def update_review_issue(
    issue_id: int,
    body: ReviewIssueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    issue = _get_issue_or_404(db, issue_id, current_user)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(issue, k, v)
    db.commit()
    db.refresh(issue)
    return issue


@app.post("/api/review-tasks/{task_id}/attachments", response_model=AttachmentOut)
async def upload_attachment(
    task_id: int,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    category: Optional[str] = Query(None),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    dest_dir = UPLOAD_DIR / str(task_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "upload").name
    if Path(safe_name).suffix.lower() != ".docx":
        raise HTTPException(400, "仅支持 .docx 文件")
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
    doc = DocumentFile(
        task_id=task_id,
        attachment_id=att.id,
        file_name=safe_name,
        file_type=dest.suffix.lower().lstrip(".") or None,
        parse_status="pending",
        char_count=len(content.decode("utf-8", errors="ignore").strip()) or None,
    )
    db.add(doc)
    db.commit()
    db.query(DocumentChunk).filter_by(task_id=task.id).delete()
    task.analysis_status = "draft"
    task.doc_total_chars = None
    task.doc_total_chunks = None
    db.commit()
    return att


@app.get("/api/review-tasks/{task_id}/attachments", response_model=list[AttachmentOut])
def list_attachments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    _get_task_or_404(db, task_id, current_user)
    return (
        db.query(Attachment)
        .filter_by(task_id=task_id)
        .order_by(Attachment.id)
        .all()
    )


@app.get("/api/review-tasks/{task_id}/attachments/{attachment_id}/download")
def download_attachment(
    task_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    _get_task_or_404(db, task_id, current_user)
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


@app.delete("/api/review-tasks/{task_id}/attachments/{attachment_id}")
def delete_attachment(
    task_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    task = _get_task_or_404(db, task_id, current_user)
    att = (
        db.query(Attachment)
        .filter_by(id=attachment_id, task_id=task_id)
        .first()
    )
    if not att:
        raise HTTPException(404, "附件不存在")
    path = Path(att.stored_path)
    if path.is_file():
        path.unlink()
    db.delete(att)
    db.commit()
    has_materials = bool((task.proposal_body or "").strip()) or bool(
        db.query(Attachment).filter_by(task_id=task_id).first()
    )
    if has_materials:
        db.query(DocumentChunk).filter_by(task_id=task.id).delete()
        db.query(DocumentFile).filter_by(task_id=task.id).update({"parse_status": "pending"})
        task.analysis_status = "draft"
        task.doc_total_chars = None
        task.doc_total_chunks = None
    else:
        db.query(DocumentChunk).filter_by(task_id=task.id).delete()
        db.query(DocumentFile).filter_by(task_id=task.id).delete()
        task.analysis_status = "draft"
        task.doc_total_chars = None
        task.doc_total_chunks = None
    db.commit()
    return {"ok": True}


# --- 方案记忆库 / 跨项目比对（全库，不按用户过滤） ---


@app.get("/api/memory/library", response_model=MemoryLibraryOut)
def memory_library(
    phase: Optional[str] = Query(None, description="pre_review | implementation"),
    q: Optional[str] = Query(None, description="任务名 / 项目标识 / 摘要 / 关键词"),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    del current_user
    rows = list_ready_profiles(db, phase=phase, q=q, limit=limit)
    items = [_memory_profile_to_out(task, profile) for task, profile in rows]
    return MemoryLibraryOut(items=items, total=len(items))


@app.get("/api/memory/tasks/{task_id}/profile", response_model=MemoryProfileOut)
def get_memory_profile(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    del current_user
    task = _get_task_any_or_404(db, task_id)
    profile = db.query(ProjectMemoryProfile).filter_by(task_id=task_id).first()
    if not profile:
        profile = build_profile_from_task(db, task)
    return _memory_profile_to_out(task, profile)


@app.post("/api/memory/tasks/{task_id}/index", response_model=MemoryProfileOut)
def index_memory_profile(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    del current_user
    task = _get_task_any_or_404(db, task_id)
    profile = build_profile_from_task(db, task)
    return _memory_profile_to_out(task, profile)


@app.get("/api/memory/tasks/{task_id}/similar", response_model=MemorySimilarListOut)
def memory_similar_tasks(
    task_id: int,
    limit: int = Query(10, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    del current_user
    task = _get_task_any_or_404(db, task_id)
    similar = find_similar_tasks(db, task, limit=limit)
    items = [
        MemorySimilarItemOut(
            task_id=item["task"].id,
            task_name=item["task"].name,
            project_key=item["profile"].project_key,
            version=item["profile"].version,
            phase=item["task"].phase,
            similarity_score=item["similarity_score"],
            overlap_keywords=item["overlap_keywords"],
            summary_text=(item["profile"].summary_text or "")[:800] or None,
        )
        for item in similar
    ]
    return MemorySimilarListOut(
        source_task_id=task.id,
        source_project_key=resolve_task_project_key(task),
        items=items,
    )


@app.post("/api/memory/compare", response_model=MemoryCompareOut)
def memory_compare_tasks(
    body: MemoryCompareBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    del current_user
    source = _get_task_any_or_404(db, body.source_task_id)
    target = _get_task_any_or_404(db, body.target_task_id)
    result = compare_tasks(db, source, target)
    sp: ProjectMemoryProfile = result["source_profile"]
    tp: ProjectMemoryProfile = result["target_profile"]
    return MemoryCompareOut(
        comparable=bool(result.get("comparable")),
        message=str(result.get("message") or ""),
        similarity_score=float(result.get("similarity_score") or 0),
        duplicate_risk=str(result.get("duplicate_risk") or "none"),
        overlap_keywords=list(result.get("overlap_keywords") or []),
        findings=list(result.get("findings") or []),
        source=_memory_profile_to_out(source, sp),
        target=_memory_profile_to_out(target, tp),
        chunk_pairs=[MemoryChunkPairOut(**pair) for pair in result.get("chunk_pairs") or []],
    )


@app.post("/api/memory/reindex", response_model=MemoryReindexOut)
def memory_reindex_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    del current_user
    count = reindex_all_ready_tasks(db)
    return MemoryReindexOut(indexed_count=count)
