"""Word 导出：北京时间文案 + 全文档默认字体（微软雅黑）。"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt

BEIJING_TZ = ZoneInfo("Asia/Shanghai")
DOC_BODY_FONT = "Microsoft YaHei"


def format_now_beijing(fmt: str = "%Y-%m-%d %H:%M") -> str:
    return datetime.now(BEIJING_TZ).strftime(fmt)


def _set_style_font_all_scripts(style, font_name: str, size_pt: float | None) -> None:
    style.font.name = font_name
    if size_pt is not None:
        style.font.size = Pt(size_pt)
    r_pr = style.element.get_or_add_rPr()
    r_fonts = r_pr.get_or_add_rFonts()
    r_fonts.set(qn("w:ascii"), font_name)
    r_fonts.set(qn("w:hAnsi"), font_name)
    r_fonts.set(qn("w:eastAsia"), font_name)


def apply_global_yahei_font(doc: Document, body_pt: float = 11, font_name: str = DOC_BODY_FONT) -> None:
    """正文、标题与常用列表样式统一为微软雅黑（ascii / hAnsi / eastAsia）。"""
    _set_style_font_all_scripts(doc.styles["Normal"], font_name, body_pt)
    for i in range(1, 10):
        try:
            _set_style_font_all_scripts(doc.styles[f"Heading {i}"], font_name, None)
        except KeyError:
            break
    for name in ("List Bullet", "List Number", "List Paragraph", "Title", "Subtitle"):
        try:
            _set_style_font_all_scripts(doc.styles[name], font_name, None)
        except KeyError:
            pass
