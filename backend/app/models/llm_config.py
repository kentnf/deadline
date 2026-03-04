from datetime import datetime
from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LLMConfig(Base):
    __tablename__ = "llm_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(100), nullable=False, default="openai")
    model: Mapped[str] = mapped_column(String(200), nullable=False, default="gpt-4o-mini")
    api_key: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    base_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
