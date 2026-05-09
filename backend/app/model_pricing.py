from __future__ import annotations

from dataclasses import dataclass


USD_TO_CNY = 7.2


@dataclass(frozen=True)
class ModelPrice:
    provider: str
    model_match: tuple[str, ...]
    display_name: str
    input_per_million_usd: float
    output_per_million_usd: float
    cached_input_per_million_usd: float | None = None
    source_name: str = ""
    source_url: str = ""


PRICE_CATALOG: tuple[ModelPrice, ...] = (
    ModelPrice(
        provider="deepseek",
        model_match=("deepseek-chat",),
        display_name="DeepSeek Chat",
        input_per_million_usd=0.28,
        cached_input_per_million_usd=0.028,
        output_per_million_usd=0.42,
        source_name="DeepSeek API Pricing",
        source_url="https://api-docs.deepseek.com/quick_start/pricing/",
    ),
    ModelPrice(
        provider="deepseek",
        model_match=("deepseek-reasoner",),
        display_name="DeepSeek Reasoner",
        input_per_million_usd=0.28,
        cached_input_per_million_usd=0.028,
        output_per_million_usd=2.19,
        source_name="DeepSeek API Pricing",
        source_url="https://api-docs.deepseek.com/quick_start/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-5.4-mini", "gpt-5.4 mini", "gpt-5.4-mini"),
        display_name="GPT-5.4 mini",
        input_per_million_usd=0.75,
        cached_input_per_million_usd=0.075,
        output_per_million_usd=4.50,
        source_name="OpenAI API Pricing",
        source_url="https://openai.com/api/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-5.4-nano", "gpt-5.4 nano"),
        display_name="GPT-5.4 nano",
        input_per_million_usd=0.20,
        cached_input_per_million_usd=0.02,
        output_per_million_usd=1.25,
        source_name="OpenAI API Pricing",
        source_url="https://openai.com/api/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-5.4",),
        display_name="GPT-5.4",
        input_per_million_usd=2.50,
        cached_input_per_million_usd=0.25,
        output_per_million_usd=15.00,
        source_name="OpenAI API Pricing",
        source_url="https://openai.com/api/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-5-mini", "gpt-5 mini"),
        display_name="GPT-5 mini",
        input_per_million_usd=0.25,
        cached_input_per_million_usd=0.025,
        output_per_million_usd=2.00,
        source_name="OpenAI API Pricing",
        source_url="https://openai.com/api/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-5-nano", "gpt-5 nano"),
        display_name="GPT-5 nano",
        input_per_million_usd=0.05,
        cached_input_per_million_usd=0.005,
        output_per_million_usd=0.40,
        source_name="OpenAI API Pricing",
        source_url="https://openai.com/api/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-5",),
        display_name="GPT-5",
        input_per_million_usd=1.25,
        cached_input_per_million_usd=0.125,
        output_per_million_usd=10.00,
        source_name="OpenAI API Pricing",
        source_url="https://openai.com/api/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-4.1-mini", "gpt-4.1 mini"),
        display_name="GPT-4.1 mini",
        input_per_million_usd=0.40,
        cached_input_per_million_usd=0.10,
        output_per_million_usd=1.60,
        source_name="OpenAI API Pricing",
        source_url="https://platform.openai.com/docs/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-4.1-nano", "gpt-4.1 nano"),
        display_name="GPT-4.1 nano",
        input_per_million_usd=0.10,
        cached_input_per_million_usd=0.025,
        output_per_million_usd=0.40,
        source_name="OpenAI API Pricing",
        source_url="https://platform.openai.com/docs/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-4.1",),
        display_name="GPT-4.1",
        input_per_million_usd=2.00,
        cached_input_per_million_usd=0.50,
        output_per_million_usd=8.00,
        source_name="OpenAI API Pricing",
        source_url="https://platform.openai.com/docs/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-4o-mini", "gpt-4o mini"),
        display_name="GPT-4o mini",
        input_per_million_usd=0.15,
        cached_input_per_million_usd=0.075,
        output_per_million_usd=0.60,
        source_name="OpenAI API Pricing",
        source_url="https://platform.openai.com/docs/pricing/",
    ),
    ModelPrice(
        provider="openai",
        model_match=("gpt-4o",),
        display_name="GPT-4o",
        input_per_million_usd=2.50,
        cached_input_per_million_usd=1.25,
        output_per_million_usd=10.00,
        source_name="OpenAI API Pricing",
        source_url="https://platform.openai.com/docs/pricing/",
    ),
)


def lookup_model_price(provider: str | None, model: str | None) -> ModelPrice | None:
    provider_key = (provider or "").strip().lower()
    model_key = (model or "").strip().lower()
    if not provider_key or not model_key:
        return None
    for item in PRICE_CATALOG:
        if item.provider != provider_key:
            continue
        if any(pattern in model_key for pattern in item.model_match):
            return item
    return None
