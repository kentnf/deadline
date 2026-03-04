from typing import Optional, List
from sqlalchemy import String, Integer, Float, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ApplicantProfile(Base):
    __tablename__ = "applicant_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    institution: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    work_experiences: Mapped[List["WorkExperience"]] = relationship(
        "WorkExperience", back_populates="profile", cascade="all, delete-orphan",
        order_by="WorkExperience.id"
    )
    project_histories: Mapped[List["ProjectHistory"]] = relationship(
        "ProjectHistory", back_populates="profile", cascade="all, delete-orphan",
        order_by="ProjectHistory.id"
    )


class WorkExperience(Base):
    __tablename__ = "work_experiences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, ForeignKey("applicant_profile.id"), nullable=False)
    organization: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    position: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    academic_title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    start_date: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)   # "YYYY-MM"
    end_date: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)     # "YYYY-MM" or null
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    profile: Mapped["ApplicantProfile"] = relationship("ApplicantProfile", back_populates="work_experiences")


class ProjectHistory(Base):
    __tablename__ = "project_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, ForeignKey("applicant_profile.id"), nullable=False)
    project_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    grant_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    grant_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    start_date: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)   # "YYYY-MM"
    end_date: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)     # "YYYY-MM"
    funding_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    abstract: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    profile: Mapped["ApplicantProfile"] = relationship("ApplicantProfile", back_populates="project_histories")
