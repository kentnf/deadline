from typing import AsyncIterator
from app.services.llm_provider import LLMProvider


async def stream_tokens(provider: LLMProvider, messages: list[dict]) -> AsyncIterator[str]:
    async for token in provider.chat(messages, stream=True):
        yield token


def sse_format(data: str) -> str:
    return f"data: {data}\n\n"
