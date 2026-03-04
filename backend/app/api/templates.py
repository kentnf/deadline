import os
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models.template import Template, TemplateSection
from app.services.template_parser import parse_template_with_llm
from app.services.llm_factory import LLMProviderFactory

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

SAMPLE_TEMPLATE_NAME = "示例模版：国自然面上项目"

SAMPLE_TEMPLATE = {
    "name": SAMPLE_TEMPLATE_NAME,
    "sections": [
        {
            "title": "项目摘要",
            "level": 1,
            "order": 0,
            "word_limit": 400,
            "writing_guide": "简明扼要地概括项目的科学问题、研究目标、主要研究内容、拟采用的研究方法和预期成果。要求语言精炼，突出创新点，让评审人快速了解本项目的核心价值。",
        },
        {
            "title": "立项依据与研究意义",
            "level": 1,
            "order": 1,
            "word_limit": 3000,
            "writing_guide": "阐述项目的科学背景与立项依据：（1）研究领域的现状与进展，指出关键科学问题；（2）国内外研究现状及存在的不足；（3）本项目拟解决的核心问题及其科学意义；（4）参考文献。",
        },
        {
            "title": "研究内容、研究目标及拟解决的关键科学问题",
            "level": 1,
            "order": 2,
            "word_limit": 2000,
            "writing_guide": "明确列出：（1）具体研究内容（分条列项）；（2）预期研究目标；（3）拟解决的 1-3 个关键科学问题（要聚焦，不宜过多）。",
        },
        {
            "title": "拟采取的研究方案及可行性分析",
            "level": 1,
            "order": 3,
            "word_limit": 3000,
            "writing_guide": "详细描述研究方案：（1）技术路线（可配图）；（2）各研究内容的具体实施方案；（3）可行性分析（包括前期工作基础、技术手段的成熟度）；（4）可能遇到的问题及解决预案。",
        },
        {
            "title": "研究基础与工作条件",
            "level": 1,
            "order": 4,
            "word_limit": 1500,
            "writing_guide": "说明：（1）前期已完成的相关工作（发表论文、已有数据、预实验结果）；（2）现有实验条件和仪器设备；（3）项目组成员的研究背景与分工；（4）已获得的相关资源或合作单位支持。",
        },
    ],
}


class SectionInput(BaseModel):
    title: str
    level: int = 1
    word_limit: Optional[int] = None
    writing_guide: Optional[str] = None
    order: int = 0
    parent_id: Optional[int] = None


class TemplateSaveRequest(BaseModel):
    name: str
    sections: list[SectionInput]


@router.post("/upload")
async def upload_template(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are accepted")
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.docx")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    return {"file_id": file_id, "filename": file.filename}


@router.post("/parse")
async def parse_template(
    file_id: str,
    db: Session = Depends(get_db),
):
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.docx")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        sections = await parse_template_with_llm(file_path, provider)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse failed: {str(e)}")

    return {"file_id": file_id, "sections": sections}


@router.post("/import-sample")
def import_sample_template(db: Session = Depends(get_db)):
    existing = db.query(Template).filter(Template.name == SAMPLE_TEMPLATE_NAME).first()
    if existing:
        return {"template_id": existing.id, "name": existing.name, "created": False}

    template = Template(name=SAMPLE_TEMPLATE_NAME)
    db.add(template)
    db.flush()

    for sec in SAMPLE_TEMPLATE["sections"]:
        ts = TemplateSection(
            template_id=template.id,
            title=sec["title"],
            level=sec["level"],
            word_limit=sec.get("word_limit"),
            writing_guide=sec.get("writing_guide"),
            order=sec["order"],
            parent_id=None,
        )
        db.add(ts)

    db.commit()
    db.refresh(template)
    return {"template_id": template.id, "name": template.name, "created": True}


@router.post("")
def save_template(request: TemplateSaveRequest, db: Session = Depends(get_db)):
    template = Template(name=request.name)
    db.add(template)
    db.flush()

    # Map order → db id for parent_id resolution
    order_to_id: dict[int, int] = {}
    sections_by_order = sorted(request.sections, key=lambda s: s.order)
    for sec in sections_by_order:
        parent_db_id = None
        if sec.parent_id is not None:
            parent_db_id = order_to_id.get(sec.parent_id)
        ts = TemplateSection(
            template_id=template.id,
            title=sec.title,
            level=sec.level,
            word_limit=sec.word_limit,
            writing_guide=sec.writing_guide,
            order=sec.order,
            parent_id=parent_db_id,
        )
        db.add(ts)
        db.flush()
        order_to_id[sec.order] = ts.id

    db.commit()
    db.refresh(template)
    return {"template_id": template.id, "name": template.name}


@router.get("")
def list_templates(db: Session = Depends(get_db)):
    templates = db.query(Template).all()
    result = []
    for t in templates:
        result.append({
            "id": t.id,
            "name": t.name,
            "section_count": len(t.sections),
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return result


@router.get("/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _serialize_template(t)


@router.delete("/{template_id}")
def delete_template(template_id: int, force: bool = Query(False), db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if t.projects and not force:
        raise HTTPException(
            status_code=409,
            detail=f"Template has {len(t.projects)} associated project(s). Use force=true to delete anyway."
        )
    db.delete(t)
    db.commit()
    return {"deleted": True}


def _serialize_template(t: Template) -> dict:
    root_sections = [s for s in t.sections if s.parent_id is None]
    root_sections.sort(key=lambda s: s.order)

    def serialize_section(sec: TemplateSection) -> dict:
        children = sorted(sec.children, key=lambda c: c.order)
        return {
            "id": sec.id,
            "title": sec.title,
            "level": sec.level,
            "word_limit": sec.word_limit,
            "writing_guide": sec.writing_guide,
            "order": sec.order,
            "parent_id": sec.parent_id,
            "children": [serialize_section(c) for c in children],
        }

    return {
        "id": t.id,
        "name": t.name,
        "source_file_path": t.source_file_path,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "sections": [serialize_section(s) for s in root_sections],
    }
