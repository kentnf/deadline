from typing import AsyncIterator
from openai import AsyncOpenAI
from app.services.llm_provider import LLMProvider


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, api_key: str, model: str, base_url: str | None = None):
        self.model = model
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def chat(self, messages: list[dict], stream: bool = True) -> AsyncIterator[str]:
        if stream:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
            )
            async for chunk in response:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        else:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=False,
            )
            yield response.choices[0].message.content or ""

    async def complete(self, messages: list[dict]) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            stream=False,
        )
        return response.choices[0].message.content or ""
