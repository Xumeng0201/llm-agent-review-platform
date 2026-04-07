from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIR = _BACKEND_ROOT / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
SQLALCHEMY_DATABASE_URL = f"sqlite:///{(_DATA_DIR / 'app.db').resolve().as_posix()}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_sqlite_schema() -> None:
    """
    SQLite 轻量迁移：旧 attachments 列名、review_tasks 增加 llm_agent_id。
    """
    if engine.dialect.name != "sqlite":
        return
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    if "attachments" in tables:
        cols = {c["name"] for c in insp.get_columns("attachments")}
        if "project_id" in cols and "task_id" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE attachments RENAME COLUMN project_id TO task_id")
                )

    if "review_tasks" in tables:
        cols = {c["name"] for c in insp.get_columns("review_tasks")}
        if "llm_agent_id" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE review_tasks ADD COLUMN llm_agent_id INTEGER")
                )
        if "review_summary" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE review_tasks ADD COLUMN review_summary TEXT")
                )

    if "llm_agents" in tables:
        acols = {c["name"] for c in insp.get_columns("llm_agents")}
        if "system_prompt" not in acols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE llm_agents ADD COLUMN system_prompt TEXT"))
