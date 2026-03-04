import json
from typing import Optional, AsyncIterator
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models.project import Project, ProjectSection, Conversation, Message
from app.services.llm_factory import LLMProviderFactory
from app.services.dialogue_engine import (
    get_active_conversation,
    get_conversation_history,
    build_system_prompt,
    classify_intent,
    check_sufficiency,
    check_writing_sufficiency,
    generate_writing_standard,
    detect_rule_modification,
    save_message,
)
from app.services.generation_service import GenerationService

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    section_id: Optional[int] = None
    paragraph_ref: Optional[int] = None
    use_papers: bool = False
    use_profile: bool = False


class OverrideCreateRequest(BaseModel):
    section_id: Optional[int] = None
    override_type: str
    original_value: Optional[dict] = None
    new_value: Optional[dict] = None
    user_reason: Optional[str] = None


class ContentUpdateRequest(BaseModel):
    content: str


class WritingGuideUpdateRequest(BaseModel):
    writing_guide: str


@router.post("/{project_id}/chat")
async def chat(
    project_id: int,
    request: ChatRequest,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    project_section = None
    if request.section_id is not None:
        project_section = db.query(ProjectSection).filter(
            ProjectSection.id == request.section_id,
            ProjectSection.project_id == project_id,
        ).first()
        if not project_section:
            raise HTTPException(status_code=404, detail="Section not found")

    conv = get_active_conversation(db, project_id, request.section_id)

    # Auto-generate opening message on first interaction
    is_first_message = len(conv.messages) == 0 and request.section_id is None
    if is_first_message:
        system = build_system_prompt(project, None, use_papers=request.use_papers, use_profile=request.use_profile, db=db, project_id=project_id)
        opening_messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": request.message},
        ]
    else:
        history = get_conversation_history(conv)
        system = build_system_prompt(project, project_section, request.paragraph_ref, use_papers=request.use_papers, use_profile=request.use_profile, db=db, project_id=project_id)
        opening_messages = [{"role": "system", "content": system}] + history + [
            {"role": "user", "content": request.message}
        ]

    save_message(db, conv.id, "user", request.message)

    conv_id = conv.id
    async def generate():
        # Re-fetch ORM objects to avoid DetachedInstanceError.
        # db.commit() in save_message expires all session-tracked objects; accessing
        # lazy-loaded attributes on them after an async yield can raise DetachedInstanceError.
        project = db.query(Project).filter(Project.id == project_id).first()
        project_section = (
            db.query(ProjectSection).filter(
                ProjectSection.id == request.section_id,
                ProjectSection.project_id == project_id,
            ).first()
            if request.section_id is not None else None
        )
        conv = get_active_conversation(db, project_id, request.section_id)

        full_response = ""
        try:
            intent = await classify_intent(request.message, provider)
            gen_service = GenerationService(provider)
        except Exception as e:
            err_msg = f"意图识别失败：{e}，将直接进行对话。"
            yield f"data: {json.dumps({'token': err_msg})}\n\n"
            save_message(db, conv_id, "assistant", err_msg)
            yield "data: [DONE]\n\n"
            return

        try:
            # --- Priority 1: continue_generation with active cursor → generate next paragraph ---
            if intent == "continue_generation" and project_section is not None:
                if project_section.generation_cursor is not None:
                    cursor = project_section.generation_cursor
                    plan = project_section.generation_plan or []
                    total = len(plan)
                    async for token in gen_service.generate_paragraph(project_section, project, cursor, db):
                        yield f"data: {json.dumps({'token': token})}\n\n"
                    db.refresh(project_section)
                    completed = cursor + 1
                    prompt_msg = gen_service.build_continuation_prompt(completed, total)
                    yield f"data: {json.dumps({'prompt': prompt_msg})}\n\n"
                    save_message(db, conv_id, "assistant", prompt_msg)
                    yield "data: [DONE]\n\n"
                    return
                # No active cursor — fall through to normal handling

            # --- Priority 2: active cursor + non-continue → revision feedback for last paragraph ---
            if project_section is not None and project_section.generation_cursor is not None:
                cursor = project_section.generation_cursor
                plan = project_section.generation_plan or []
                total = len(plan)
                feedback_cursor = max(0, cursor - 1)
                async for token in gen_service.generate_paragraph(
                    project_section, project, feedback_cursor, db, feedback=request.message
                ):
                    yield f"data: {json.dumps({'token': token})}\n\n"
                db.refresh(project_section)
                prompt_msg = gen_service.build_continuation_prompt(cursor, total)
                yield f"data: {json.dumps({'prompt': prompt_msg})}\n\n"
                save_message(db, conv_id, "assistant", prompt_msg)
                yield "data: [DONE]\n\n"
                return

            # --- Priority 3: rule_modification ---
            if intent == "rule_modification":
                rule_info = await detect_rule_modification(request.message, provider)
                if rule_info.get("detected"):
                    desc = rule_info.get("description", "")
                    response_text = (
                        f"我理解你想要调整模版规则：{desc}\n\n"
                        "请确认：\n\n"
                        "**A.** 确认此修改\n"
                        "**B.** 取消修改\n"
                        "**C.** 修改描述有误，重新说明\n\n"
                        "规则变更将保存为项目级覆盖，不影响原模版。"
                    )
                    for char in response_text:
                        full_response += char
                        yield f"data: {json.dumps({'token': char})}\n\n"
                    save_message(db, conv_id, "assistant", full_response)
                    yield "data: [DONE]\n\n"
                    return

            # --- Default: normal streaming response ---
            async for token in provider.chat(opening_messages, stream=True):
                full_response += token
                yield f"data: {json.dumps({'token': token})}\n\n"

            save_message(db, conv_id, "assistant", full_response)

            # After section conversation: check writing sufficiency and emit hint
            if project_section is not None:
                try:
                    fresh_conv = get_active_conversation(db, project_id, request.section_id)
                    history_for_hint = get_conversation_history(fresh_conv)
                    ts = project_section.template_section
                    section_info = {
                        "title": ts.title,
                        "word_limit": ts.word_limit,
                        "writing_guide": ts.writing_guide,
                    }
                    hint_result = await check_writing_sufficiency(
                        history_for_hint, section_info, provider,
                        system_context=system if (request.use_papers or request.use_profile) else None,
                    )
                    yield f"data: {json.dumps({'hint': 'ready' if hint_result.get('ready') else 'not_ready', 'notes': hint_result.get('notes', [])})}\n\n"
                except Exception:
                    pass  # silently skip hint on error

            yield "data: [DONE]\n\n"

        except Exception as e:
            err_msg = f"生成失败：{str(e)}"
            yield f"data: {json.dumps({'token': err_msg})}\n\n"
            try:
                save_message(db, conv_id, "assistant", (full_response + "\n\n" + err_msg) if full_response else err_msg)
            except Exception:
                pass
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/{project_id}/conversations")
def list_conversations(project_id: int, section_id: Optional[str] = None, db: Session = Depends(get_db)):
    actual_section_id = None if section_id in (None, "null", "overview", "0") else int(section_id)
    convs = db.query(Conversation).filter(
        Conversation.project_id == project_id,
        Conversation.section_id == actual_section_id,
    ).order_by(Conversation.created_at).all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "is_active": c.is_active,
            "message_count": len(c.messages),
            "created_at": c.created_at.isoformat(),
        }
        for c in convs
    ]


class CreateConversationRequest(BaseModel):
    section_id: Optional[int] = None


@router.post("/{project_id}/conversations")
def create_conversation(project_id: int, request: CreateConversationRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Auto-name: "对话 N"
    count = db.query(Conversation).filter(
        Conversation.project_id == project_id,
        Conversation.section_id == request.section_id,
    ).count()
    title = f"对话 {count + 1}"
    # Deactivate all existing threads for this section
    db.query(Conversation).filter(
        Conversation.project_id == project_id,
        Conversation.section_id == request.section_id,
    ).update({"is_active": False})
    conv = Conversation(project_id=project_id, section_id=request.section_id, title=title, is_active=True)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {"id": conv.id, "title": conv.title, "is_active": conv.is_active, "created_at": conv.created_at.isoformat()}


@router.put("/{project_id}/conversations/{conv_id}/activate")
def activate_conversation(project_id: int, conv_id: int, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(
        Conversation.id == conv_id,
        Conversation.project_id == project_id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # Deactivate siblings
    db.query(Conversation).filter(
        Conversation.project_id == project_id,
        Conversation.section_id == conv.section_id,
        Conversation.id != conv_id,
    ).update({"is_active": False})
    conv.is_active = True
    db.commit()
    # Return updated thread list
    convs = db.query(Conversation).filter(
        Conversation.project_id == project_id,
        Conversation.section_id == conv.section_id,
    ).order_by(Conversation.created_at).all()
    return [
        {"id": c.id, "title": c.title, "is_active": c.is_active, "message_count": len(c.messages), "created_at": c.created_at.isoformat()}
        for c in convs
    ]


@router.get("/{project_id}/conversations/{section_id}")
def get_conversation(project_id: int, section_id: str, db: Session = Depends(get_db)):
    actual_section_id = None if section_id in ("null", "overview", "0") else int(section_id)
    conv = db.query(Conversation).filter(
        Conversation.project_id == project_id,
        Conversation.section_id == actual_section_id,
        Conversation.is_active == True,
    ).first()
    if not conv:
        return {"messages": [], "thread_count": 0}
    thread_count = db.query(Conversation).filter(
        Conversation.project_id == project_id,
        Conversation.section_id == actual_section_id,
    ).count()
    messages = sorted(conv.messages, key=lambda m: m.created_at)
    return {
        "conversation_id": conv.id,
        "thread_count": thread_count,
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
            for m in messages
        ]
    }


@router.post("/{project_id}/overrides")
def create_override(project_id: int, request: OverrideCreateRequest, db: Session = Depends(get_db)):
    from app.models.project import ProjectRuleOverride
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    override = ProjectRuleOverride(
        project_id=project_id,
        section_id=request.section_id,
        override_type=request.override_type,
        original_value=request.original_value,
        new_value=request.new_value,
        user_reason=request.user_reason,
    )
    db.add(override)
    db.commit()
    db.refresh(override)
    return {"override_id": override.id}


@router.get("/{project_id}/overrides")
def list_overrides(project_id: int, db: Session = Depends(get_db)):
    from app.models.project import ProjectRuleOverride
    overrides = db.query(ProjectRuleOverride).filter(
        ProjectRuleOverride.project_id == project_id
    ).all()
    by_section: dict = {}
    for o in overrides:
        key = str(o.section_id or "global")
        if key not in by_section:
            by_section[key] = []
        by_section[key].append({
            "id": o.id,
            "section_id": o.section_id,
            "override_type": o.override_type,
            "original_value": o.original_value,
            "new_value": o.new_value,
            "user_reason": o.user_reason,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        })
    return by_section


@router.delete("/{project_id}/overrides/{override_id}")
def delete_override(project_id: int, override_id: int, db: Session = Depends(get_db)):
    from app.models.project import ProjectRuleOverride
    override = db.query(ProjectRuleOverride).filter(
        ProjectRuleOverride.id == override_id,
        ProjectRuleOverride.project_id == project_id,
    ).first()
    if not override:
        raise HTTPException(status_code=404, detail="Override not found")
    db.delete(override)
    db.commit()
    return {"deleted": True}


@router.put("/{project_id}/sections/{section_id}/content")
def update_section_content(
    project_id: int, section_id: int, request: ContentUpdateRequest, db: Session = Depends(get_db)
):
    ps = db.query(ProjectSection).filter(
        ProjectSection.id == section_id,
        ProjectSection.project_id == project_id,
    ).first()
    if not ps:
        raise HTTPException(status_code=404, detail="Section not found")

    ps.content = request.content
    ps.word_count = _count_words(request.content)
    if ps.status == "empty":
        ps.status = "draft"
    db.commit()
    return {"updated": True, "word_count": ps.word_count}


@router.post("/{project_id}/sections/{section_id}/generate-skeleton")
async def generate_skeleton(project_id: int, section_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ps = db.query(ProjectSection).filter(
        ProjectSection.id == section_id,
        ProjectSection.project_id == project_id,
    ).first()
    if not ps:
        raise HTTPException(status_code=404, detail="Section not found")

    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    gen_service = GenerationService(provider)
    skeleton = await gen_service.generate_skeleton_summary(ps, project)

    ps.skeleton_text = skeleton
    if ps.status == "empty":
        ps.status = "skeleton"
    db.commit()
    return {"skeleton_text": skeleton}


@router.post("/{project_id}/sections/{section_id}/generate")
async def generate_section_content(project_id: int, section_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ps = db.query(ProjectSection).filter(
        ProjectSection.id == section_id,
        ProjectSection.project_id == project_id,
    ).first()
    if not ps:
        raise HTTPException(status_code=404, detail="Section not found")

    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    gen_service = GenerationService(provider)

    async def stream_gen():
        async for token in gen_service.generate_section_stream(ps, project, db):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_gen(), media_type="text/event-stream")


def _count_words(text: str) -> int:
    if not text:
        return 0
    import re
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
    english_words = len(re.findall(r'\b[a-zA-Z]+\b', text))
    return chinese_chars + english_words


@router.post("/{project_id}/sections/{section_id}/generate-and-check")
async def generate_and_check(project_id: int, section_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ps = db.query(ProjectSection).filter(
        ProjectSection.id == section_id,
        ProjectSection.project_id == project_id,
    ).first()
    if not ps:
        raise HTTPException(status_code=404, detail="Section not found")

    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    gen_service = GenerationService(provider)
    try:
        result = await gen_service.generate_and_check(section_id, project_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Persist quality check results to ProjectSection
    from datetime import datetime as _dt
    ps.quality_issues = result["quality_check"].get("requirements_missed", [])
    ps.quality_checked_at = _dt.utcnow()
    db.commit()

    return result


@router.post("/{project_id}/sections/{section_id}/quality-check")
async def run_quality_check(project_id: int, section_id: int, db: Session = Depends(get_db)):
    ps = db.query(ProjectSection).filter(
        ProjectSection.id == section_id,
        ProjectSection.project_id == project_id,
    ).first()
    if not ps:
        raise HTTPException(status_code=404, detail="Section not found")

    if not ps.content:
        raise HTTPException(status_code=400, detail="Section has no content to check")

    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    gen_service = GenerationService(provider)
    try:
        result = await gen_service.run_quality_check(section_id, project_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result


@router.put("/{project_id}/sections/{section_id}/writing-guide")
def update_writing_guide(
    project_id: int, section_id: int, request: WritingGuideUpdateRequest, db: Session = Depends(get_db)
):
    from app.models.project import ProjectRuleOverride
    ps = db.query(ProjectSection).filter(
        ProjectSection.id == section_id,
        ProjectSection.project_id == project_id,
    ).first()
    if not ps:
        raise HTTPException(status_code=404, detail="Section not found")

    # Upsert: delete all existing writing_guide overrides for this section, then create fresh
    db.query(ProjectRuleOverride).filter(
        ProjectRuleOverride.project_id == project_id,
        ProjectRuleOverride.section_id == section_id,
        ProjectRuleOverride.override_type == "writing_guide",
    ).delete()

    override = ProjectRuleOverride(
        project_id=project_id,
        section_id=section_id,
        override_type="writing_guide",
        new_value={"writing_guide": request.writing_guide},
    )
    db.add(override)
    db.commit()
    return {"writing_guide": request.writing_guide, "trigger_quality_check": bool(ps.content)}


@router.post("/{project_id}/sections/{section_id}/generate-standard")
async def generate_standard_endpoint(
    project_id: int, section_id: int, db: Session = Depends(get_db)
):
    from app.api.projects import effective_section
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ps = db.query(ProjectSection).filter(
        ProjectSection.id == section_id,
        ProjectSection.project_id == project_id,
    ).first()
    if not ps:
        raise HTTPException(status_code=404, detail="Section not found")

    try:
        provider = LLMProviderFactory.from_global_config(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    conv = get_active_conversation(db, project_id, section_id)
    history = get_conversation_history(conv)
    ts = ps.template_section
    overrides = [o for o in project.rule_overrides if o.section_id == ps.id]
    eff = effective_section(ts, overrides)
    section_info = {
        "title": eff["title"],
        "word_limit": eff.get("word_limit"),
        "writing_guide": eff.get("writing_guide"),
    }

    try:
        result = await generate_writing_standard(history, section_info, provider)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result
