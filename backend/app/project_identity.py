"""从任务名称解析项目名称（project_key）与版本（version）。"""

from __future__ import annotations

import re

# 末尾 4 位数字作为版本：人才项目0511 → key=人才项目, version=0511
_TRAILING_4_DIGIT = re.compile(r"^(?P<key>.+?)(?P<ver>\d{4})$")

# 末尾 v2 / V2 / -v2
_TRAILING_V_NUM = re.compile(r"^(?P<key>.+?)[-_\s]?[vV](?P<ver>\d+)$")


def parse_project_identity(name: str) -> tuple[str | None, str | None]:
    text = (name or "").strip()
    if not text:
        return None, None
    m = _TRAILING_4_DIGIT.match(text)
    if m:
        key = (m.group("key") or "").strip()
        if key:
            return key, m.group("ver")
    m = _TRAILING_V_NUM.match(text)
    if m:
        key = (m.group("key") or "").strip()
        if key:
            return key, f"v{m.group('ver')}"
    return text, None


def resolve_project_identity(
    name: str,
    project_key: str | None = None,
    version: str | None = None,
) -> tuple[str | None, str | None]:
    """创建/更新时：显式传入的 project_key / version 优先，否则从 name 解析。"""
    key = (project_key or "").strip() or None
    ver = (version or "").strip() or None
    if key or ver:
        if not key:
            parsed_key, _ = parse_project_identity(name)
            key = parsed_key
        return key, ver
    return parse_project_identity(name)
