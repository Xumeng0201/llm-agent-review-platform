"""OpenAI 兼容 Chat Completions（DeepSeek / OpenAI / 自定义 Base）。"""

from __future__ import annotations

import time
from typing import Any, List

import httpx

from .models import LlmAgent

DEFAULT_BASE = {
    # 官方文档 base_url 为 https://api.deepseek.com（/v1 路径通常也可用）
    "deepseek": "https://api.deepseek.com",
    "openai": "https://api.openai.com/v1",
}


def _normalize_chat_model(agent: LlmAgent) -> str:
    """DeepSeek 等对 model 名称大小写敏感；例如 deepseek-V4-flash 会被拒，需 deepseek-v4-flash。"""
    m = (agent.model or "").strip()
    if not m:
        return m
    if agent.provider == "deepseek" and m.lower().startswith("deepseek-"):
        return "deepseek-" + m[len("deepseek-") :].lower()
    return m


def resolve_api_base(agent: LlmAgent) -> str:
    b = (agent.api_base or "").strip().rstrip("/")
    if b:
        return b
    if agent.provider in DEFAULT_BASE:
        return DEFAULT_BASE[agent.provider]
    raise ValueError("自定义接入必须填写 API Base（如 https://api.example.com/v1）")


def chat_completion(
    agent: LlmAgent,
    messages: List[dict[str, str]],
    *,
    temperature: float = 0.2,
    max_tokens: int = 4096,
    timeout: float = 120.0,
) -> str:
    base = resolve_api_base(agent)
    url = f"{base}/chat/completions"
    api_key = (agent.api_key or "").strip()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": _normalize_chat_model(agent),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if not api_key:
        raise ValueError("智能体未配置 API Key，请在「测评方法」中填写后保存。")

    retry_statuses = {403, 429, 502, 503, 504}
    last_hint = ""
    with httpx.Client(timeout=timeout) as client:
        for attempt in range(4):
            r = client.post(url, json=body, headers=headers)
            if r.status_code < 400:
                data = r.json()
                break
            last_hint = (r.text or "").strip()[:800] or r.reason_phrase or "无响应正文"
            if r.status_code in retry_statuses and attempt < 3:
                # 403/429 时退避更久，避免连续重试仍触发限流
                wait = 3.0 * (2**attempt) if r.status_code in (403, 429) else 1.5 * (2**attempt)
                time.sleep(wait)
                continue
            if r.status_code == 401:
                raise ValueError(
                    f"大模型鉴权失败（HTTP 401）：{last_hint}。"
                    "请检查 API Key 是否完整、未过期，且与提供方一致。"
                )
            if r.status_code == 403:
                raise ValueError(
                    f"大模型拒绝访问（HTTP 403）：{last_hint}。"
                    "请勿连续重复点击「问题审查」；稍等 10～30 秒后重试。"
                    "并确认 Key 已开通 deepseek-v4-flash 且已在测评方法中保存。"
                )
            raise ValueError(f"大模型接口错误（HTTP {r.status_code}）：{last_hint}")
        else:
            raise ValueError(f"大模型接口错误：{last_hint}")
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"模型响应格式异常: {data!r}") from e
