from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ChunkDraft:
    chunk_index: int
    section_title: str | None
    content: str
    char_count: int
    token_estimate: int
    summary: str
    keywords_json: str
    dimension_hints_json: str


HEADING_RE = re.compile(r"^\s*(第[一二三四五六七八九十0-9]+[章节部分篇]|[0-9一二三四五六七八九十]+[\.、])")


def _looks_like_heading(line: str) -> bool:
    text = line.strip()
    if not text:
        return False
    if HEADING_RE.match(text):
        return True
    if len(text) > 36:
        return False
    if re.search(r"[。；;！？!?：:，,（）()\[\]]", text):
        return False
    # 常见模板/方案标题行：短句、纯文字、无句末标点。
    return bool(re.fullmatch(r"[\u4e00-\u9fffA-Za-z0-9《》、·\-—\s]{2,36}", text))


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 2)


def _simple_keywords(text: str, limit: int = 8) -> list[str]:
    candidates = re.findall(r"[\u4e00-\u9fffA-Za-z]{2,12}", text)
    counts: dict[str, int] = {}
    for token in candidates:
        counts[token] = counts.get(token, 0) + 1
    ranked = sorted(counts.items(), key=lambda x: (-x[1], x[0]))
    return [word for word, _ in ranked[:limit]]


def _expand_terms(values: list[str]) -> list[str]:
    terms: list[str] = []
    for value in values:
        for token in re.split(r"[、，,。\s/（）()：:；;]+", value):
            token = token.strip().lower()
            if len(token) >= 2:
                terms.append(token)
    return list(dict.fromkeys(terms))


def _dimension_hints(text: str, title: str | None, dimensions: list[dict[str, Any]] | None) -> list[str]:
    if not dimensions:
        return []
    haystacks = [text.lower()]
    if title:
        haystacks.append(title.lower())
    hints: list[tuple[str, float]] = []
    for dim in dimensions:
        score = 0.0
        terms = _expand_terms(
            (dim.get("query_terms") or [])
            + (dim.get("required_evidence") or [])
            + (dim.get("review_focus") or [])
        )
        for term in terms:
            if any(term in h for h in haystacks[1:]):
                score += 2.0
            elif term in haystacks[0]:
                score += 0.8
        if score > 0:
            hints.append((str(dim.get("key") or ""), score))
    hints.sort(key=lambda x: x[1], reverse=True)
    return [key for key, _ in hints[:4] if key]


def split_text_to_chunks(
    text: str,
    *,
    target_chars: int = 1200,
    overlap_chars: int = 160,
    section_hint: str | None = None,
    dimensions: list[dict[str, Any]] | None = None,
) -> list[ChunkDraft]:
    clean = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not clean:
        return []

    lines = [line.strip() for line in clean.split("\n")]
    sections: list[tuple[str | None, list[str]]] = []
    current_title = section_hint
    current_lines: list[str] = []

    for line in lines:
        if not line:
            continue
        if _looks_like_heading(line) and current_lines:
            sections.append((current_title, current_lines))
            current_title = line[:120]
            current_lines = []
            continue
        current_lines.append(line)
    if current_lines:
        sections.append((current_title, current_lines))

    chunks: list[ChunkDraft] = []
    chunk_index = 1
    for title, section_lines in sections:
        section_text = "\n".join(section_lines).strip()
        if not section_text:
            continue
        start = 0
        while start < len(section_text):
            end = min(len(section_text), start + target_chars)
            piece = section_text[start:end].strip()
            if not piece:
                break
            keywords = _simple_keywords(piece)
            hint_keys = _dimension_hints(piece, title, dimensions)
            chunks.append(
                ChunkDraft(
                    chunk_index=chunk_index,
                    section_title=title,
                    content=piece,
                    char_count=len(piece),
                    token_estimate=_estimate_tokens(piece),
                    summary=((title + "：") if title else "") + piece[:180],
                    keywords_json=json.dumps(keywords, ensure_ascii=False),
                    dimension_hints_json=json.dumps(hint_keys, ensure_ascii=False),
                )
            )
            chunk_index += 1
            if end >= len(section_text):
                break
            start = max(end - overlap_chars, start + 1)
    return chunks
