from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .model_pricing import USD_TO_CNY, lookup_model_price
from .models import DocumentChunk, DocumentFile
from .review_engine import normalize_dimensions, retrieve_chunks_for_dimension


@dataclass
class DimensionTokenEstimate:
    dimension_id: int
    dimension_title: str
    retrieved_chunks: int
    input_tokens: int
    output_tokens: int


@dataclass
class TaskTokenEstimate:
    task_id: int
    parser_engine: str
    parser_mode: str | None
    local_chunk_tokens: int
    llm_chunking_tokens: int
    review_input_tokens: int
    review_output_tokens: int
    total_llm_tokens: int
    assumptions: list[str] = field(default_factory=list)
    dimensions: list[DimensionTokenEstimate] = field(default_factory=list)
    model_provider: str | None = None
    model_name: str | None = None
    price_display_name: str | None = None
    pricing_source_name: str | None = None
    pricing_source_url: str | None = None
    input_price_per_million_usd: float | None = None
    cached_input_price_per_million_usd: float | None = None
    output_price_per_million_usd: float | None = None
    estimated_cost_low_usd: float | None = None
    estimated_cost_high_usd: float | None = None
    estimated_cost_low_cny: float | None = None
    estimated_cost_high_cny: float | None = None
    exchange_rate_usd_to_cny: float = USD_TO_CNY


def _coalesce_parser_meta(outline_json: str | None) -> tuple[str, str | None]:
    if not outline_json:
        return "builtin", None
    try:
        import json

        payload = json.loads(outline_json)
        return str(payload.get("parser_engine") or "builtin"), payload.get("parser_mode")
    except Exception:
        return "builtin", None


def estimate_task_token_usage(db, task, framework: dict[str, Any], agent=None) -> TaskTokenEstimate:
    dimensions = normalize_dimensions(framework)
    chunks = (
        db.query(DocumentChunk)
        .filter_by(task_id=task.id)
        .order_by(DocumentChunk.id.asc())
        .all()
    )
    local_chunk_tokens = sum(int(chunk.token_estimate or 0) for chunk in chunks)

    parser_engine = "builtin"
    parser_mode: str | None = None
    files = (
        db.query(DocumentFile)
        .filter_by(task_id=task.id)
        .order_by(DocumentFile.attachment_id.is_(None).asc(), DocumentFile.id.asc())
        .all()
    )
    for file in files:
        engine, mode = _coalesce_parser_meta(file.outline_json)
        if engine != "builtin" or mode:
            parser_engine, parser_mode = engine, mode
            break

    per_dimension: list[DimensionTokenEstimate] = []
    review_input_tokens = 0
    review_output_tokens = 0
    base_prompt_tokens = 900
    per_chunk_overhead = 60

    for dimension in dimensions:
        retrieved = retrieve_chunks_for_dimension(db, task.id, dimension, limit=8)
        evidence_tokens = sum(
            min(max(len(chunk.content) // 2, 1), 1200) + per_chunk_overhead
            for chunk in retrieved
        )
        input_tokens = base_prompt_tokens + evidence_tokens
        output_tokens = 480 if retrieved else 180
        review_input_tokens += input_tokens
        review_output_tokens += output_tokens
        per_dimension.append(
            DimensionTokenEstimate(
                dimension_id=int(dimension.get("id") or 0),
                dimension_title=str(dimension.get("title") or f"维度 {dimension.get('id')}"),
                retrieved_chunks=len(retrieved),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        )

    assumptions = [
        "当前“长文本分解”使用本地规则切块，本身不消耗大模型 token。",
        "本估算只计算问题审查阶段的 LLM token，不含 OCR、文件解析等本地步骤。",
        "每个审查维度按最多 8 个高相关 chunk 估算，单块正文按约 1 汉字≈0.5~1 token 做保守折算。",
        "输出 token 按每个维度生成结构化问题清单估算，实际会随问题数量和智能体提示词波动。",
    ]

    model_provider = getattr(agent, "provider", None) if agent is not None else None
    model_name = getattr(agent, "model", None) if agent is not None else None
    price = lookup_model_price(model_provider, model_name)

    price_display_name = None
    pricing_source_name = None
    pricing_source_url = None
    input_price_per_million_usd = None
    cached_input_price_per_million_usd = None
    output_price_per_million_usd = None
    estimated_cost_low_usd = None
    estimated_cost_high_usd = None
    estimated_cost_low_cny = None
    estimated_cost_high_cny = None

    if price:
        price_display_name = price.display_name
        pricing_source_name = price.source_name
        pricing_source_url = price.source_url
        input_price_per_million_usd = price.input_per_million_usd
        cached_input_price_per_million_usd = price.cached_input_per_million_usd
        output_price_per_million_usd = price.output_per_million_usd
        low_input_price = price.cached_input_per_million_usd or price.input_per_million_usd
        high_input_price = price.input_per_million_usd
        estimated_cost_low_usd = (
            review_input_tokens * low_input_price + review_output_tokens * price.output_per_million_usd
        ) / 1_000_000
        estimated_cost_high_usd = (
            review_input_tokens * high_input_price + review_output_tokens * price.output_per_million_usd
        ) / 1_000_000
        estimated_cost_low_cny = estimated_cost_low_usd * USD_TO_CNY
        estimated_cost_high_cny = estimated_cost_high_usd * USD_TO_CNY
        assumptions.append("费用区间按“缓存命中输入价 ~ 标准输入价”估算；若供应商未区分缓存价，则区间上下限相同。")
        assumptions.append(f"人民币估算按 1 USD ≈ {USD_TO_CNY:.2f} CNY 粗略换算。")
    else:
        assumptions.append("当前绑定模型未匹配到内置官方价目表，暂未给出费用估算。")

    return TaskTokenEstimate(
        task_id=task.id,
        parser_engine=parser_engine,
        parser_mode=parser_mode,
        local_chunk_tokens=local_chunk_tokens,
        llm_chunking_tokens=0,
        review_input_tokens=review_input_tokens,
        review_output_tokens=review_output_tokens,
        total_llm_tokens=review_input_tokens + review_output_tokens,
        assumptions=assumptions,
        dimensions=per_dimension,
        model_provider=model_provider,
        model_name=model_name,
        price_display_name=price_display_name,
        pricing_source_name=pricing_source_name,
        pricing_source_url=pricing_source_url,
        input_price_per_million_usd=input_price_per_million_usd,
        cached_input_price_per_million_usd=cached_input_price_per_million_usd,
        output_price_per_million_usd=output_price_per_million_usd,
        estimated_cost_low_usd=estimated_cost_low_usd,
        estimated_cost_high_usd=estimated_cost_high_usd,
        estimated_cost_low_cny=estimated_cost_low_cny,
        estimated_cost_high_cny=estimated_cost_high_cny,
    )
