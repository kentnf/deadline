from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models.profile import ApplicantProfile, WorkExperience, ProjectHistory

router = APIRouter()


def _get_or_create_profile(db: Session) -> ApplicantProfile:
    profile = db.query(ApplicantProfile).filter(ApplicantProfile.id == 1).first()
    if not profile:
        profile = ApplicantProfile(id=1)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _profile_to_dict(profile: ApplicantProfile) -> dict:
    return {
        "id": profile.id,
        "name": profile.name,
        "institution": profile.institution,
        "department": profile.department,
        "title": profile.title,
        "email": profile.email,
        "work_experiences": [_work_exp_to_dict(w) for w in profile.work_experiences],
        "project_histories": [_proj_hist_to_dict(h) for h in profile.project_histories],
    }


def _work_exp_to_dict(w: WorkExperience) -> dict:
    return {
        "id": w.id,
        "organization": w.organization,
        "position": w.position,
        "academic_title": w.academic_title,
        "start_date": w.start_date,
        "end_date": w.end_date,
        "is_current": w.is_current,
    }


def _proj_hist_to_dict(h: ProjectHistory) -> dict:
    return {
        "id": h.id,
        "project_title": h.project_title,
        "grant_number": h.grant_number,
        "grant_type": h.grant_type,
        "role": h.role,
        "status": h.status,
        "start_date": h.start_date,
        "end_date": h.end_date,
        "funding_amount": h.funding_amount,
        "abstract": h.abstract,
    }


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None


class WorkExperienceRequest(BaseModel):
    organization: Optional[str] = None
    position: Optional[str] = None
    academic_title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: Optional[bool] = False


class ProjectHistoryRequest(BaseModel):
    project_title: Optional[str] = None
    grant_number: Optional[str] = None
    grant_type: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    funding_amount: Optional[float] = None
    abstract: Optional[str] = None


@router.get("")
def get_profile(db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    return _profile_to_dict(profile)


@router.put("")
def update_profile(request: ProfileUpdateRequest, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(profile)


@router.post("/work-experiences")
def create_work_experience(request: WorkExperienceRequest, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    w = WorkExperience(profile_id=profile.id, **request.model_dump())
    db.add(w)
    db.commit()
    db.refresh(w)
    return _work_exp_to_dict(w)


@router.patch("/work-experiences/{exp_id}")
def update_work_experience(exp_id: int, request: WorkExperienceRequest, db: Session = Depends(get_db)):
    w = db.query(WorkExperience).filter(WorkExperience.id == exp_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Work experience not found")
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(w, field, value)
    db.commit()
    db.refresh(w)
    return _work_exp_to_dict(w)


@router.delete("/work-experiences/{exp_id}")
def delete_work_experience(exp_id: int, db: Session = Depends(get_db)):
    w = db.query(WorkExperience).filter(WorkExperience.id == exp_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Work experience not found")
    db.delete(w)
    db.commit()
    return {"deleted": True}


@router.post("/project-histories")
def create_project_history(request: ProjectHistoryRequest, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    h = ProjectHistory(profile_id=profile.id, **request.model_dump())
    db.add(h)
    db.commit()
    db.refresh(h)
    return _proj_hist_to_dict(h)


@router.patch("/project-histories/{hist_id}")
def update_project_history(hist_id: int, request: ProjectHistoryRequest, db: Session = Depends(get_db)):
    h = db.query(ProjectHistory).filter(ProjectHistory.id == hist_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Project history not found")
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(h, field, value)
    db.commit()
    db.refresh(h)
    return _proj_hist_to_dict(h)


@router.delete("/project-histories/{hist_id}")
def delete_project_history(hist_id: int, db: Session = Depends(get_db)):
    h = db.query(ProjectHistory).filter(ProjectHistory.id == hist_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Project history not found")
    db.delete(h)
    db.commit()
    return {"deleted": True}
