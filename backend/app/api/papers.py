import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models.paper import Paper, ProjectPaper, PaperTag, Tag
from app.models.project import Project

router = APIRouter()

_data_dir = os.environ.get("DATA_DIR")
UPLOAD_DIR = os.path.join(_data_dir, "uploads") if _data_dir else "uploads/papers"


class PaperUpdateRequest(BaseModel):
    title: Optional[str] = None
    authors: Optional[str] = None
    abstract: Optional[str] = None
    keywords: Optional[str] = None
    scientific_significance: Optional[str] = None


async def _extract_with_llm(text: str, db: Session) -> dict:
    from app.services.llm_factory import LLMProviderFactory
    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError:
        return {}

    prompt = (
        "请从以下论文文本中提取结构化信息，返回 JSON 格式（只返回 JSON，不要其他文字）：\n\n"
        "{\n"
        '  "title": "论文标题",\n'
        '  "authors": "作者列表（逗号分隔）",\n'
        '  "abstract": "摘要（中文或英文原文）",\n'
        '  "keywords": "关键词（逗号分隔）"\n'
        "}\n\n"
        f"论文文本（前3000字）：\n{text[:3000]}"
    )
    import json as _json
    import re
    result = await provider.complete([{"role": "user", "content": prompt}])
    m = re.search(r'\{[\s\S]*\}', result)
    if m:
        try:
            return _json.loads(m.group())
        except Exception:
            pass
    return {}


@router.post("/upload")
async def upload_paper(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="只支持 PDF 格式文件")

    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Extract text with pypdf
    raw_text = ""
    try:
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(content))
        for page in reader.pages:
            raw_text += (page.extract_text() or "") + "\n"
    except Exception:
        pass

    # Create initial record
    paper = Paper(
        file_path=file_path,
        file_name=file.filename,
        status="processing",
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)

    # Extract structured info with LLM
    if raw_text.strip():
        extracted = await _extract_with_llm(raw_text, db)
        paper.title = extracted.get("title") or file.filename
        paper.authors = extracted.get("authors")
        paper.abstract = extracted.get("abstract")
        paper.keywords = extracted.get("keywords")
        paper.status = "ready"
    else:
        paper.title = file.filename
        paper.status = "failed"

    db.commit()
    db.refresh(paper)

    return {
        "id": paper.id,
        "title": paper.title,
        "authors": paper.authors,
        "abstract": paper.abstract,
        "keywords": paper.keywords,
        "file_name": paper.file_name,
        "status": paper.status,
        "created_at": paper.created_at.isoformat() if paper.created_at else None,
    }


@router.get("")
def list_papers(db: Session = Depends(get_db)):
    papers = db.query(Paper).order_by(Paper.created_at.desc()).all()
    return [
        {
            "id": p.id,
            "title": p.title,
            "authors": p.authors,
            "status": p.status,
            "file_name": p.file_name,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "tags": [{"id": pt.tag.id, "name": pt.tag.name} for pt in p.paper_tags],
        }
        for p in papers
    ]


@router.get("/{paper_id}")
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    project_ids = [pp.project_id for pp in paper.project_papers]

    return {
        "id": paper.id,
        "title": paper.title,
        "authors": paper.authors,
        "abstract": paper.abstract,
        "keywords": paper.keywords,
        "scientific_significance": paper.scientific_significance,
        "file_name": paper.file_name,
        "file_path": paper.file_path,
        "status": paper.status,
        "created_at": paper.created_at.isoformat() if paper.created_at else None,
        "project_ids": project_ids,
        "tags": [{"id": pt.tag.id, "name": pt.tag.name} for pt in paper.paper_tags],
    }


@router.patch("/{paper_id}")
def update_paper(paper_id: int, request: PaperUpdateRequest, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(paper, field, value)

    db.commit()
    db.refresh(paper)
    return {"updated": True}


@router.delete("/{paper_id}")
def delete_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Delete file from disk
    if paper.file_path and os.path.exists(paper.file_path):
        os.remove(paper.file_path)

    db.delete(paper)
    db.commit()
    return {"deleted": True}


@router.post("/{paper_id}/projects/{project_id}")
def associate_paper_project(paper_id: int, project_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    existing = db.query(ProjectPaper).filter(
        ProjectPaper.paper_id == paper_id,
        ProjectPaper.project_id == project_id,
    ).first()
    if not existing:
        pp = ProjectPaper(paper_id=paper_id, project_id=project_id)
        db.add(pp)
        db.commit()
    return {"associated": True}


@router.delete("/{paper_id}/projects/{project_id}")
def disassociate_paper_project(paper_id: int, project_id: int, db: Session = Depends(get_db)):
    pp = db.query(ProjectPaper).filter(
        ProjectPaper.paper_id == paper_id,
        ProjectPaper.project_id == project_id,
    ).first()
    if pp:
        db.delete(pp)
        db.commit()
    return {"disassociated": True}


@router.post("/{paper_id}/tags/{tag_id}")
def add_tag_to_paper(paper_id: int, tag_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    existing = db.query(PaperTag).filter(
        PaperTag.paper_id == paper_id,
        PaperTag.tag_id == tag_id,
    ).first()
    if not existing:
        pt = PaperTag(paper_id=paper_id, tag_id=tag_id)
        db.add(pt)
        db.commit()
    return {"associated": True}


@router.delete("/{paper_id}/tags/{tag_id}")
def remove_tag_from_paper(paper_id: int, tag_id: int, db: Session = Depends(get_db)):
    pt = db.query(PaperTag).filter(
        PaperTag.paper_id == paper_id,
        PaperTag.tag_id == tag_id,
    ).first()
    if pt:
        db.delete(pt)
        db.commit()
    return {"disassociated": True}
