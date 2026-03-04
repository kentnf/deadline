from typing import Optional
from sqlalchemy.orm import Session
from app.models.project import Project, ProjectSection, Conversation, Message, ProjectRuleOverride
from app.models.template import TemplateSection
from app.api.projects import effective_section

MAX_HISTORY_MESSAGES = 20

SELF_DESCRIBE = '\u300e\u81ea\u884c\u63cf\u8ff0\u300f'  # 『自行描述』


def get_active_conversation(
    db: Session, project_id: int, section_id: Optional[int]
) -> Conversation:
    conv = db.query(Conversation).filter(
        Conversation.project_id == project_id,
        Conversation.section_id == section_id,
        Conversation.is_active == True,
    ).first()
    if not conv:
        conv = Conversation(project_id=project_id, section_id=section_id, title="对话 1", is_active=True)
        db.add(conv)
        db.commit()
        db.refresh(conv)
    return conv


def get_conversation_history(conv: Conversation) -> list[dict]:
    messages = sorted(conv.messages, key=lambda m: m.created_at)
    recent = messages[-MAX_HISTORY_MESSAGES:]
    return [{"role": m.role, "content": m.content} for m in recent]


def build_system_prompt(
    project: Project,
    project_section: Optional[ProjectSection],
    paragraph_ref: Optional[int] = None,
    use_papers: bool = False,
    use_profile: bool = False,
    db=None,
    project_id: Optional[int] = None,
) -> str:
    template = project.template
    parts = []

    if project_section is None:
        # Global phase — direction brainstorm + context collection
        parts.append(
            "你是一位资深国家自然科学基金项目申请书写作专家，帮助科研工作者完成从想法到完整申请书的全流程。\n\n"
            "**你的工作分两个阶段：**\n\n"
            "**阶段一：确定研究方向（首次交流时）**\n"
            "- 根据用户描述的研究想法，提出 2-3 个具体可行的基金申请书方向\n"
            "- 每个方向用 **A/B/C** 标注，包含：核心科学问题、主要创新点、适合的基金类别\n"
            "- 最后一个选项总是" + SELF_DESCRIBE + "\n\n"
            "**阶段二：收集关键信息（方向确认后）**\n"
            "- 通过 3-5 轮简洁提问收集：研究背景与现状、核心科学问题、主要研究内容与方法、创新点与意义、预期成果\n"
            "- 每次只聚焦 1-2 个要点，用 **A/B/C** 选项帮助用户表述，最后一项总是" + SELF_DESCRIBE + "\n"
            "- 当你认为已收集到足够信息（通常 3-5 轮对话后），在当次回复**末尾**精确加上以下内容（不要修改格式）：\n"
            "  \n---\n✅ 信息已充分，您可以点击「生成全文草稿」按钮开始生成申请书各章节初稿。"
        )
        if template:
            sections_summary = []
            for ts in sorted(template.sections, key=lambda s: s.order):
                if ts.parent_id is None:
                    sections_summary.append(
                        "- " + ts.title + ("（" + str(ts.word_limit) + "字）" if ts.word_limit else "")
                    )
            if sections_summary:
                parts.append("\n\n本子模版章节结构：\n" + "\n".join(sections_summary))

        # Include skeleton summaries from all project sections
        skeletons = []
        for ps in project.sections:
            if ps.skeleton_text:
                skeletons.append("**" + ps.template_section.title + "**：" + ps.skeleton_text)
        if skeletons:
            parts.append("\n\n当前骨架摘要：\n" + "\n".join(skeletons))

    else:
        ts = project_section.template_section
        overrides = [o for o in project.rule_overrides if o.section_id == project_section.id]
        eff = effective_section(ts, overrides)

        parts.append(
            "你是一位基金本子写作助手，帮助科研工作者完善当前章节内容。"
            "请用简洁的中文对话，多使用**A/B/C/D**字母选项引导用户，"
            "每组选项最后一项总是" + SELF_DESCRIBE + "。"
        )

        section_info = ["\n\n当前章节：**" + eff["title"] + "**（第" + str(eff["level"]) + "级）"]
        if eff.get("word_limit"):
            section_info.append("字数限制：" + str(eff["word_limit"]) + "字")
        if eff.get("writing_guide"):
            section_info.append("写作要求：" + eff["writing_guide"])
        parts.append("\n".join(section_info))

        if project_section.content:
            if paragraph_ref is not None:
                paragraphs = project_section.content.split("\n\n")
                if 0 <= paragraph_ref < len(paragraphs):
                    parts.append("\n\n待修改段落（第" + str(paragraph_ref) + "段）：\n" + paragraphs[paragraph_ref])
            else:
                parts.append("\n\n该章节当前内容：\n" + project_section.content)

        # Global skeleton context
        skeletons = []
        for ps in project.sections:
            if ps.skeleton_text and ps.id != project_section.id:
                skeletons.append("- **" + ps.template_section.title + "**：" + ps.skeleton_text)
        if skeletons:
            parts.append("\n\n其他章节骨架摘要：\n" + "\n".join(skeletons))

    # Inject paper context if requested
    if use_papers and db is not None and project_id is not None:
        try:
            from app.models.paper import Paper, ProjectPaper
            pps = db.query(ProjectPaper).filter(ProjectPaper.project_id == project_id).all()
            paper_parts = []
            for pp in pps:
                paper = db.query(Paper).filter(Paper.id == pp.paper_id, Paper.status == "ready").first()
                if paper:
                    item = f"• {paper.title or '未知标题'}"
                    if paper.authors:
                        item += f"（{paper.authors}）"
                    if paper.abstract:
                        abstract = paper.abstract[:400] + ("…" if len(paper.abstract) > 400 else "")
                        item += f"\n  摘要：{abstract}"
                    if paper.keywords:
                        item += f"\n  关键词：{paper.keywords}"
                    if paper.scientific_significance:
                        item += f"\n  科学意义：{paper.scientific_significance}"
                    paper_parts.append(item)
            if paper_parts:
                parts.append("\n\n---\n申请人相关文章（" + str(len(paper_parts)) + "篇，与本项目已关联）：\n" + "\n\n".join(paper_parts))
        except Exception:
            pass

    # Inject profile context if requested
    if use_profile and db is not None:
        try:
            from app.models.profile import ApplicantProfile, WorkExperience, ProjectHistory
            profile = db.query(ApplicantProfile).filter(ApplicantProfile.id == 1).first()
            if profile:
                profile_parts = []
                basic = []
                if profile.name:
                    basic.append(profile.name)
                if profile.institution:
                    basic.append(profile.institution)
                if profile.title:
                    basic.append(profile.title)
                if basic:
                    profile_parts.append("申请人：" + "，".join(basic))

                work_exps = db.query(WorkExperience).filter(WorkExperience.profile_id == 1).all()
                if work_exps:
                    we_lines = []
                    for w in work_exps:
                        end = "至今" if w.is_current else (w.end_date or "")
                        we_lines.append(f"• {w.start_date or ''}～{end}：{w.organization or ''}，{w.position or ''}")
                    profile_parts.append("工作经历：\n" + "\n".join(we_lines))

                proj_hists = db.query(ProjectHistory).filter(ProjectHistory.profile_id == 1).all()
                if proj_hists:
                    ph_lines = []
                    for h in proj_hists:
                        line = f"• {h.grant_type or ''}（{h.status or ''}，{h.start_date or ''}～{h.end_date or ''}，{h.role or ''}）"
                        if h.project_title:
                            line += f"\n  {h.project_title}"
                        if h.abstract:
                            ab = h.abstract[:300] + ("…" if len(h.abstract) > 300 else "")
                            line += f"\n  摘要：{ab}"
                        ph_lines.append(line)
                    profile_parts.append("项目经历：\n" + "\n".join(ph_lines))

                if profile_parts:
                    parts.append("\n\n---\n申请人档案信息：\n" + "\n\n".join(profile_parts))
        except Exception:
            pass

    return "".join(parts)


async def classify_intent(content: str, provider) -> str:
    prompt = (
        "Classify the following user message into ONE of these categories:\n"
        "- continue_generation: user wants to continue generating next paragraph (e.g., 继续, 下一段, 好的, 可以, ok, continue)\n"
        "- info_providing: user is sharing information or answering questions\n"
        "- rule_modification: user wants to change template rules (e.g., change word limit, section title)\n"
        "- feedback: user is giving feedback on generated content\n"
        "- revision_request: user wants to revise specific content\n"
        "- other: anything else\n\n"
        "Reply with ONLY the category name.\n\n"
        "Message: " + content
    )

    result = await provider.complete([{"role": "user", "content": prompt}])
    result = result.strip().lower()
    valid = {"continue_generation", "info_providing", "rule_modification", "feedback", "revision_request", "other"}
    return result if result in valid else "other"


async def check_sufficiency(conversation_history: list[dict], section_info: dict, provider, system_context: str = None) -> dict:
    history_text = "\n".join([m["role"] + ": " + m["content"] for m in conversation_history[-10:]])
    context_block = ""
    if system_context:
        # Truncate to avoid excessive prompt length; 1500 chars covers most paper/profile snippets
        snippet = system_context[:1500] + ("…" if len(system_context) > 1500 else "")
        context_block = f"Already injected system context (papers/profile are available to the model):\n{snippet}\n\n"
    prompt = (
        "Based on the conversation history, assess if there is enough information to generate the section "
        + repr(section_info.get("title", "")) + ".\n\n"
        "Requirements: " + str(section_info.get("writing_guide", "N/A")) + "\n"
        "Word limit: " + str(section_info.get("word_limit", "N/A")) + "\n\n"
        + context_block
        + "Conversation:\n" + history_text + "\n\n"
        'Reply with JSON: {"sufficient": true/false, "gaps": ["gap1", "gap2"]}. '
        'Do NOT list papers or profile as gaps if they appear in the system context above.'
    )

    result = await provider.complete([{"role": "user", "content": prompt}])
    import json
    import re
    m = re.search(r'\{[\s\S]*\}', result)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    return {"sufficient": True, "gaps": []}


async def check_writing_sufficiency(conversation_history: list[dict], section_info: dict, provider, system_context: str = None) -> dict:
    """Lightweight check: does the conversation content sufficiently cover the section writing requirements?
    Returns {ready: bool, notes: [str]}."""
    import json as _json
    import re as _re
    history_text = "\n".join([m["role"] + ": " + m["content"] for m in conversation_history[-12:]])
    writing_guide = section_info.get("writing_guide", "") or ""
    word_limit = section_info.get("word_limit", "")
    title = section_info.get("title", "")
    context_block = ""
    if system_context:
        snippet = system_context[:1500] + ("…" if len(system_context) > 1500 else "")
        context_block = f"Already injected system context (papers/profile are available to the model):\n{snippet}\n\n"
    prompt = (
        f"You are evaluating whether a conversation provides sufficient material to write a grant proposal section titled \"{title}\".\n\n"
        f"Section writing requirements:\n{writing_guide}\n"
        f"Target word count: {word_limit}\n\n"
        + context_block
        + f"Conversation so far:\n{history_text}\n\n"
        "Assess: does the conversation cover the main points required by the writing guide?\n"
        'Reply ONLY with JSON: {"ready": true/false, "notes": ["note1", "note2"]}\n'
        "Set ready=true if the key content points are covered (even if not perfectly). "
        "notes should be brief observations (1-3 items), in Chinese. "
        "Do NOT list papers or profile as gaps if they appear in the system context above."
    )
    try:
        result = await provider.complete([{"role": "user", "content": prompt}])
        m = _re.search(r'\{[\s\S]*\}', result)
        if m:
            return _json.loads(m.group())
    except Exception:
        pass
    return {"ready": False, "notes": []}


async def generate_writing_standard(conversation_history: list[dict], section_info: dict, provider) -> dict:
    """Generate an improved writing standard for a section based on conversation history.
    Returns {writing_guide: str}."""
    history_text = "\n".join([m["role"] + ": " + m["content"] for m in conversation_history[-12:]])
    existing_guide = section_info.get("writing_guide", "") or ""
    title = section_info.get("title", "")
    word_limit = section_info.get("word_limit", "")

    existing_part = f"\n\n当前写作标准：\n{existing_guide}" if existing_guide else ""
    word_limit_part = f"\n字数要求：{word_limit}" if word_limit else ""

    prompt = (
        f"根据以下对话内容，为基金申请书章节「{title}」生成一份写作标准（写作要求）。"
        f"{word_limit_part}{existing_part}\n\n"
        f"对话记录：\n{history_text}\n\n"
        "生成要求：\n"
        "- 用中文写作\n"
        "- 以短横线（-）开头的要点列表形式\n"
        "- 具体说明该章节需要包含哪些内容要点\n"
        "- 融入对话中体现的用户意图与偏好\n"
        "- 简洁明了，5-10条要点即可\n\n"
        "只输出写作标准文本（要点列表），不要添加前言或其他内容。"
    )

    try:
        result = await provider.complete([{"role": "user", "content": prompt}])
        return {"writing_guide": result.strip()}
    except Exception:
        return {"writing_guide": existing_guide}


async def detect_rule_modification(content: str, provider) -> dict:
    prompt = (
        "Detect if this message is requesting a rule change for a grant proposal template section.\n\n"
        "Message: " + content + "\n\n"
        "If it is a rule change request, reply with JSON:\n"
        '{"detected": true, "override_type": "word_limit|title|writing_guide|remove_limit", "description": "...", "proposed_value": {...}}\n\n'
        'If not, reply: {"detected": false}'
    )

    result = await provider.complete([{"role": "user", "content": prompt}])
    import json
    import re
    m = re.search(r'\{[\s\S]*\}', result)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    return {"detected": False}


def save_message(db: Session, conversation_id: int, role: str, content: str):
    msg = Message(conversation_id=conversation_id, role=role, content=content)
    db.add(msg)
    db.commit()
