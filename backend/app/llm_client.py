"""OpenAI 兼容 Chat Completions（DeepSeek / OpenAI / 自定义 Base）。"""

from __future__ import annotations

from typing import Any, List

import httpx

from .models import LlmAgent

DEFAULT_BASE = {
    "deepseek": "https://api.deepseek.com/v1",
    "openai": "https://api.openai.com/v1",
}


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
    headers = {
        "Authorization": f"Bearer {agent.api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": agent.model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    with httpx.Client(timeout=timeout) as client:
        r = client.post(url, json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"模型响应格式异常: {data!r}") from e
