from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .models import Attachment

TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".tsv",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".html",
    ".htm",
    ".log",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
}


def _read_text_file(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "gb18030", "gbk"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def _read_docx_file(path: Path) -> str:
    try:
        from docx import Document
    except ImportError:
        return ""
    doc = Document(str(path))
    lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(lines)


def extract_attachment_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in TEXT_EXTENSIONS:
        return _read_text_file(path)
    if suffix == ".docx":
        return _read_docx_file(path)
    return ""


def collect_attachment_evidence(
    attachments: Iterable[Attachment],
    max_chars_per_file: int = 6000,
    max_total_chars: int = 18000,
) -> str:
    """抽取附件正文，供智能体直接依据文件内容评审。"""
    remaining = max_total_chars
    blocks: list[str] = []
    for att in attachments:
        if remaining <= 0:
            break
        path = Path(att.stored_path)
        if not path.is_file():
            continue
        text = extract_attachment_text(path).strip()
        if not text:
            continue
        snippet = text[: min(max_chars_per_file, remaining)]
        blocks.append(f"### 附件：{att.original_name}\n{snippet}")
        remaining -= len(snippet)
    return "\n\n".join(blocks)
