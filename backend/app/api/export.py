from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.project import Project, ProjectSection
from app.api.projects import effective_section
from app.services.word_exporter import export_project_to_docx
import re
from urllib.parse import quote

router = APIRouter()


@router.get("/{project_id}/export")
def export_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sections_data = []
    for ps in sorted(project.sections, key=lambda s: s.template_section.order):
        ts = ps.template_section
        overrides = [o for o in project.rule_overrides if o.section_id == ps.id]
        eff = effective_section(ts, overrides)
        sections_data.append({
            "id": ps.id,
            "content": ps.content,
            "effective_section": eff,
        })

    # Add new sections from rule overrides (override_type=new_section)
    new_section_overrides = [
        o for o in project.rule_overrides if o.override_type == "new_section"
    ]
    for override in new_section_overrides:
        if override.new_value:
            sections_data.append({
                "id": None,
                "content": override.new_value.get("content", ""),
                "effective_section": {
                    "title": override.new_value.get("title", "新增章节"),
                    "level": override.new_value.get("level", 1),
                    "order": override.new_value.get("order", 9999),
                },
            })

    sections_data.sort(key=lambda s: s["effective_section"].get("order", 0))

    buf = export_project_to_docx(project, sections_data)
    date_str = datetime.now().strftime("%Y%m%d")
    safe_name = re.sub(r'[^\w\u4e00-\u9fff]', '_', project.name)
    filename = f"{safe_name}_草稿_{date_str}.docx"
    encoded_filename = quote(filename)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )
