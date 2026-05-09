"""审核要点 Word：解析正文，供问题审查提示词注入。"""

from __future__ import annotations

from pathlib import Path

# 注入 LLM 时的上限，避免撑爆上下文
MAX_CRITERIA_CHARS = 28000


def extract_text_from_docx(path: Path) -> str:
    try:
        from docx import Document
    except ImportError as e:
        raise RuntimeError("未安装 python-docx，无法解析 Word") from e
    doc = Document(str(path))
    lines: list[str] = []
    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if t:
            lines.append(t)
    return "\n".join(lines)


def clip_criteria_text(text: str, limit: int = MAX_CRITERIA_CHARS) -> str:
    t = (text or "").strip()
    if len(t) <= limit:
        return t
    return t[: limit - 80] + "\n\n[审核要点正文过长，已截断；完整内容以系统归档版本为准。]"
