from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


from app.db.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    template_id: Mapped[int] = mapped_column(Integer, ForeignKey("templates.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    template: Mapped["Template"] = relationship("Template", back_populates="projects")
    sections: Mapped[List["ProjectSection"]] = relationship(
        "ProjectSection", back_populates="project", cascade="all, delete-orphan"
    )
    conversations: Mapped[List["Conversation"]] = relationship(
        "Conversation", back_populates="project", cascade="all, delete-orphan"
    )
    rule_overrides: Mapped[List["ProjectRuleOverride"]] = relationship(
        "ProjectRuleOverride", back_populates="project", cascade="all, delete-orphan"
    )


class ProjectSection(Base):
    __tablename__ = "project_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False)
    template_section_id: Mapped[int] = mapped_column(Integer, ForeignKey("template_sections.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="empty")
    skeleton_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    generation_plan: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    generation_cursor: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    quality_issues: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    quality_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="sections")
    template_section: Mapped["TemplateSection"] = relationship(
        "TemplateSection", back_populates="project_sections"
    )
    conversations: Mapped[List["Conversation"]] = relationship(
        "Conversation", back_populates="section"
    )
    rule_overrides: Mapped[List["ProjectRuleOverride"]] = relationship(
        "ProjectRuleOverride", back_populates="section"
    )


class ProjectRuleOverride(Base):
    __tablename__ = "project_rule_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False)
    section_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("project_sections.id"), nullable=True)
    override_type: Mapped[str] = mapped_column(String(100), nullable=False)
    original_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    new_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    user_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="rule_overrides")
    section: Mapped[Optional["ProjectSection"]] = relationship(
        "ProjectSection", back_populates="rule_overrides"
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False)
    section_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("project_sections.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="对话 1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="conversations")
    section: Mapped[Optional["ProjectSection"]] = relationship(
        "ProjectSection", back_populates="conversations"
    )
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan",
        order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
