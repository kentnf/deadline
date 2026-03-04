from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[dict], stream: bool = True) -> AsyncIterator[str]:
        ...

    @abstractmethod
    async def complete(self, messages: list[dict]) -> str:
        ...
