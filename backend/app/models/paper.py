from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    paper_tags: Mapped[List["PaperTag"]] = relationship(
        "PaperTag", back_populates="tag", cascade="all, delete-orphan"
    )


class PaperTag(Base):
    __tablename__ = "paper_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), nullable=False)
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("tags.id"), nullable=False)

    paper: Mapped["Paper"] = relationship("Paper", back_populates="paper_tags")
    tag: Mapped["Tag"] = relationship("Tag", back_populates="paper_tags")


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    authors: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    abstract: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    keywords: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scientific_significance: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="processing")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project_papers: Mapped[List["ProjectPaper"]] = relationship(
        "ProjectPaper", back_populates="paper", cascade="all, delete-orphan"
    )
    paper_tags: Mapped[List["PaperTag"]] = relationship(
        "PaperTag", back_populates="paper", cascade="all, delete-orphan"
    )


class ProjectPaper(Base):
    __tablename__ = "project_papers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    paper: Mapped["Paper"] = relationship("Paper", back_populates="project_papers")
