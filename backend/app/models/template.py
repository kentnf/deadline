from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    sections: Mapped[List["TemplateSection"]] = relationship(
        "TemplateSection", back_populates="template", cascade="all, delete-orphan"
    )
    projects: Mapped[List["Project"]] = relationship("Project", back_populates="template")


class TemplateSection(Base):
    __tablename__ = "template_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(Integer, ForeignKey("templates.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    word_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    writing_guide: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("template_sections.id"), nullable=True)

    template: Mapped["Template"] = relationship("Template", back_populates="sections")
    children: Mapped[List["TemplateSection"]] = relationship(
        "TemplateSection",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    parent: Mapped[Optional["TemplateSection"]] = relationship(
        "TemplateSection", back_populates="children", remote_side="TemplateSection.id"
    )
    project_sections: Mapped[List["ProjectSection"]] = relationship(
        "ProjectSection", back_populates="template_section"
    )
