from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json as _json

from app.db.session import get_db
from app.models.template import Template, TemplateSection
from app.models.project import Project, ProjectSection, ProjectRuleOverride, Conversation, Message

router = APIRouter()


class ProjectCreateRequest(BaseModel):
    name: str
    template_id: int


def effective_section(template_section: TemplateSection, overrides: list[ProjectRuleOverride]) -> dict:
    result = {
        "id": template_section.id,
        "title": template_section.title,
        "level": template_section.level,
        "word_limit": template_section.word_limit,
        "writing_guide": template_section.writing_guide,
        "order": template_section.order,
        "parent_id": template_section.parent_id,
    }
    for override in overrides:
        if override.override_type == "word_limit":
            result["word_limit"] = override.new_value.get("word_limit") if override.new_value else None
        elif override.override_type == "title":
            result["title"] = override.new_value.get("title", result["title"]) if override.new_value else result["title"]
        elif override.override_type == "writing_guide":
            result["writing_guide"] = override.new_value.get("writing_guide") if override.new_value else None
        elif override.override_type == "remove_limit":
            result["word_limit"] = None
    return result


@router.post("")
def create_project(request: ProjectCreateRequest, db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.id == request.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    project = Project(name=request.name, template_id=request.template_id)
    db.add(project)
    db.flush()

    all_sections = db.query(TemplateSection).filter(
        TemplateSection.template_id == request.template_id
    ).all()
    for ts in all_sections:
        ps = ProjectSection(project_id=project.id, template_section_id=ts.id)
        db.add(ps)

    db.commit()
    db.refresh(project)
    return {"project_id": project.id, "name": project.name}


@router.get("")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).all()
    result = []
    for p in projects:
        total = len(p.sections)
        if total > 0:
            points = 0
            for s in p.sections:
                if s.skeleton_text is not None:
                    points += 1
                if s.content is not None:
                    points += 1
                if s.quality_checked_at is not None and (s.quality_issues is None or len(s.quality_issues) == 0):
                    points += 1
            completion = round(points / (total * 3) * 100)
        else:
            completion = 0
        result.append({
            "id": p.id,
            "name": p.name,
            "template_name": p.template.name if p.template else None,
            "status": p.status,
            "completion_percentage": completion,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return result


@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    sections_data = []
    for ps in sorted(p.sections, key=lambda s: s.template_section.order):
        ts = ps.template_section
        overrides = [o for o in p.rule_overrides if o.section_id == ps.id]
        eff = effective_section(ts, overrides)
        has_wg_override = any(o.override_type == "writing_guide" for o in overrides)
        sections_data.append({
            "id": ps.id,
            "template_section_id": ps.template_section_id,
            "status": ps.status,
            "skeleton_text": ps.skeleton_text,
            "content": ps.content,
            "word_count": ps.word_count,
            "generation_plan": ps.generation_plan,
            "generation_cursor": ps.generation_cursor,
            "effective_section": eff,
            "has_writing_guide_override": has_wg_override,
            "quality_issues": ps.quality_issues,
            "quality_checked_at": ps.quality_checked_at.isoformat() + "Z" if ps.quality_checked_at else None,
        })

    return {
        "id": p.id,
        "name": p.name,
        "template_id": p.template_id,
        "status": p.status,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "sections": sections_data,
    }


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(p)
    db.commit()
    return {"deleted": True}


@router.get("/{project_id}/status")
def get_project_status(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    sections = p.template.sections if p.template else []
    if not sections:
        return {"template_status": "incomplete", "reason": "No sections parsed"}

    sections_without_title = [s for s in sections if not s.title]
    if sections_without_title:
        return {"template_status": "incomplete", "reason": "Some sections are missing titles"}

    return {"template_status": "valid", "section_count": len(sections)}


@router.post("/{project_id}/generate-draft")
async def generate_draft(project_id: int, db: Session = Depends(get_db)):
    from app.services.llm_factory import LLMProviderFactory
    from app.services.generation_service import GenerationService
    from app.services.dialogue_engine import get_or_create_conversation, get_conversation_history
    from app.db.session import SessionLocal

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    global_conv = get_or_create_conversation(db, project_id, None)
    global_history = get_conversation_history(global_conv)

    section_ids = [
        ps.id for ps in sorted(project.sections, key=lambda s: s.template_section.order)
    ]
    total = len(section_ids)
    # Close the request-scoped session; each section will use its own session
    db.close()

    gen_service = GenerationService(provider)

    async def stream():
        import traceback
        for i, sid in enumerate(section_ids):
            # Each section gets a fresh session to avoid DetachedInstanceError
            section_db = SessionLocal()
            try:
                ps = section_db.query(ProjectSection).filter(ProjectSection.id == sid).first()
                if not ps:
                    section_db.close()
                    continue
                title = ps.template_section.title
                yield f"data: {_json.dumps({'event': 'section_start', 'section_id': sid, 'title': title, 'index': i + 1, 'total': total})}\n\n"
                try:
                    async for token in gen_service.generate_section_from_global_context(
                        global_history, sid, project_id, section_db
                    ):
                        yield f"data: {_json.dumps({'event': 'token', 'section_id': sid, 'token': token})}\n\n"
                    yield f"data: {_json.dumps({'event': 'section_done', 'section_id': sid, 'title': title, 'index': i + 1, 'total': total})}\n\n"
                except Exception as e:
                    tb = traceback.format_exc()
                    print(f"[generate-draft] ERROR on section '{title}': {e}\n{tb}", flush=True)
                    yield f"data: {_json.dumps({'event': 'section_error', 'section_id': sid, 'title': title, 'error': str(e)})}\n\n"
            finally:
                section_db.close()

        yield f"data: {_json.dumps({'event': 'complete', 'total': total})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/{project_id}/papers")
def list_project_papers(project_id: int, db: Session = Depends(get_db)):
    from app.models.paper import Paper, ProjectPaper
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    pps = db.query(ProjectPaper).filter(ProjectPaper.project_id == project_id).all()
    result = []
    for pp in pps:
        paper = db.query(Paper).filter(Paper.id == pp.paper_id).first()
        if paper:
            result.append({
                "id": paper.id,
                "title": paper.title,
                "authors": paper.authors,
                "status": paper.status,
                "file_name": paper.file_name,
            })
    return result


@router.post("/{project_id}/papers/{paper_id}")
def associate_project_paper(project_id: int, paper_id: int, db: Session = Depends(get_db)):
    from app.models.paper import Paper, ProjectPaper
    if not db.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(status_code=404, detail="Project not found")
    if not db.query(Paper).filter(Paper.id == paper_id).first():
        raise HTTPException(status_code=404, detail="Paper not found")
    existing = db.query(ProjectPaper).filter(
        ProjectPaper.project_id == project_id,
        ProjectPaper.paper_id == paper_id,
    ).first()
    if not existing:
        db.add(ProjectPaper(project_id=project_id, paper_id=paper_id))
        db.commit()
    return {"associated": True}


@router.delete("/{project_id}/papers/{paper_id}")
def disassociate_project_paper(project_id: int, paper_id: int, db: Session = Depends(get_db)):
    from app.models.paper import ProjectPaper
    pp = db.query(ProjectPaper).filter(
        ProjectPaper.project_id == project_id,
        ProjectPaper.paper_id == paper_id,
    ).first()
    if pp:
        db.delete(pp)
        db.commit()
    return {"disassociated": True}
