import os
from sqlalchemy.orm import Session

from app.models.llm_config import LLMConfig


class GlobalLLMConfigService:
    @staticmethod
    def get_config(db: Session) -> dict | None:
        row = db.query(LLMConfig).filter(LLMConfig.id == 1).first()
        if row and row.api_key:
            return {
                "provider": row.provider,
                "model": row.model,
                "api_key": row.api_key,
                "base_url": row.base_url,
            }
        # Fallback to .env variables
        api_key = os.getenv("LLM_API_KEY", "")
        if api_key:
            return {
                "provider": os.getenv("LLM_PROVIDER", "openai"),
                "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
                "api_key": api_key,
                "base_url": os.getenv("LLM_BASE_URL", ""),
            }
        return None

    @staticmethod
    def save_config(db: Session, config: dict) -> None:
        row = db.query(LLMConfig).filter(LLMConfig.id == 1).first()
        if row:
            row.provider = config.get("provider", "openai")
            row.model = config.get("model", "gpt-4o-mini")
            row.api_key = config.get("api_key", "")
            row.base_url = config.get("base_url", "")
        else:
            row = LLMConfig(
                id=1,
                provider=config.get("provider", "openai"),
                model=config.get("model", "gpt-4o-mini"),
                api_key=config.get("api_key", ""),
                base_url=config.get("base_url", ""),
            )
            db.add(row)
        db.commit()

    @staticmethod
    def mask_api_key(api_key: str) -> str:
        if not api_key:
            return ""
        if len(api_key) <= 4:
            return "*" * len(api_key)
        return "*" * (len(api_key) - 4) + api_key[-4:]
