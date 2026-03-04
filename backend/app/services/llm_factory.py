from app.services.llm_provider import LLMProvider
from app.services.llm_openai import OpenAICompatibleProvider
from app.services.llm_anthropic import AnthropicProvider


class LLMProviderFactory:
    @staticmethod
    def from_config(llm_config: dict) -> LLMProvider:
        provider = llm_config.get("provider", "openai")
        api_key = llm_config.get("api_key", "")
        model = llm_config.get("model", "gpt-4o-mini")
        base_url = llm_config.get("base_url")

        if provider == "anthropic":
            return AnthropicProvider(api_key=api_key, model=model)
        else:
            return OpenAICompatibleProvider(api_key=api_key, model=model, base_url=base_url or None)

    @staticmethod
    def from_global_config(db) -> LLMProvider:
        from app.services.llm_config_service import GlobalLLMConfigService
        config = GlobalLLMConfigService.get_config(db)
        if config is None:
            raise ValueError("LLM 未配置，请前往设置页面配置")
        return LLMProviderFactory.from_config(config)
