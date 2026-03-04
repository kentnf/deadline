from typing import AsyncIterator
import anthropic
from app.services.llm_provider import LLMProvider


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.model = model
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def chat(self, messages: list[dict], stream: bool = True) -> AsyncIterator[str]:
        system_msgs = [m for m in messages if m["role"] == "system"]
        other_msgs = [m for m in messages if m["role"] != "system"]
        system = system_msgs[0]["content"] if system_msgs else ""

        if stream:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=4096,
                system=system,
                messages=other_msgs,
            ) as stream_ctx:
                async for text in stream_ctx.text_stream:
                    yield text
        else:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=system,
                messages=other_msgs,
            )
            yield response.content[0].text

    async def complete(self, messages: list[dict]) -> str:
        system_msgs = [m for m in messages if m["role"] == "system"]
        other_msgs = [m for m in messages if m["role"] != "system"]
        system = system_msgs[0]["content"] if system_msgs else ""

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system,
            messages=other_msgs,
        )
        return response.content[0].text
