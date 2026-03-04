import os
import re
import json
from typing import AsyncIterator, Optional
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectSection
from app.api.projects import effective_section
from app.services.dialogue_engine import get_conversation_history, get_active_conversation

GENERATION_THRESHOLD = int(os.getenv("GENERATION_THRESHOLD", "800"))


class GenerationService:
    def __init__(self, provider):
        self.provider = provider

    async def generate_section_stream(
        self, ps: ProjectSection, project: Project, db: Session
    ) -> AsyncIterator[str]:
        ts = ps.template_section
        overrides = [o for o in project.rule_overrides if o.section_id == ps.id]
        eff = effective_section(ts, overrides)
        word_limit = eff.get("word_limit") or 0

        conv = get_active_conversation(db, project.id, ps.id)
        history = get_conversation_history(conv)

        if word_limit < GENERATION_THRESHOLD:
            async for token in self._generate_simple(eff, history, project):
                yield token
        else:
            async for token in self._generate_structured(eff, history, project, ps):
                yield token

    async def _generate_simple(self, eff: dict, history: list[dict], project: Project) -> AsyncIterator[str]:
        system = self._build_generation_system(eff, project)
        messages = [{"role": "system", "content": system}] + history + [
            {"role": "user", "content": f"请根据上述对话信息，生成「{eff['title']}」章节的完整内容。"}
        ]
        async for token in self.provider.chat(messages, stream=True):
            yield token

    async def _generate_structured(
        self, eff: dict, history: list[dict], project: Project, ps: ProjectSection
    ) -> AsyncIterator[str]:
        system = self._build_generation_system(eff, project)
        plan_prompt = (
            f"请为「{eff['title']}」章节制定段落写作方案（约{eff.get('word_limit','未知')}字）。"
            "请提供2-3个不同的段落结构选项，以**A/B/C**字母标注，每个选项列出段落列表和各段主要内容。"
        )
        messages = [{"role": "system", "content": system}] + history + [
            {"role": "user", "content": plan_prompt}
        ]
        async for token in self.provider.chat(messages, stream=True):
            yield token

    async def generate_section_from_global_context(
        self,
        global_history: list[dict],
        ps_id: int,
        project_id: int,
        db: "Session",
    ) -> AsyncIterator[str]:
        """Generate a section using the global conversation as research context.
        Accepts IDs instead of ORM objects to avoid DetachedInstanceError."""
        from app.api.projects import effective_section as _effective_section
        from app.models.project import ProjectSection, Project, ProjectRuleOverride

        # Always re-fetch to avoid stale/expired objects
        ps = db.query(ProjectSection).filter(ProjectSection.id == ps_id).first()
        project = db.query(Project).filter(Project.id == project_id).first()
        if not ps or not project:
            return

        ts = ps.template_section
        overrides = db.query(ProjectRuleOverride).filter(
            ProjectRuleOverride.project_id == project_id,
            ProjectRuleOverride.section_id == ps_id,
        ).all()
        eff = _effective_section(ts, overrides)

        system_parts = [
            "你是一位专业的科研基金申请书写作专家。"
            "请根据以下研究背景对话，生成规范、专业的申请书章节内容。"
            "直接输出章节正文，不要包含章节标题，不要重复用户的原话。"
        ]
        if eff.get("writing_guide"):
            system_parts.append(f"\n\n本章节写作要求：{eff['writing_guide']}")
        if eff.get("word_limit"):
            system_parts.append(f"\n字数要求：约{eff['word_limit']}字")

        # Include already-generated sections for continuity (fresh query)
        other_sections = db.query(ProjectSection).filter(
            ProjectSection.project_id == project_id,
            ProjectSection.id != ps_id,
        ).all()
        generated_sections = []
        for other_ps in sorted(other_sections, key=lambda s: s.template_section.order):
            if other_ps.content:
                preview = other_ps.content[:400] + ("…" if len(other_ps.content) > 400 else "")
                generated_sections.append(f"### {other_ps.template_section.title}\n{preview}")
        if generated_sections:
            system_parts.append("\n\n已生成的其他章节（保持整体一致性）：\n" + "\n\n".join(generated_sections))

        system_parts.append(self._build_format_constraint(eff))
        system = "".join(system_parts)
        user_content = f"请根据以上研究方向对话，生成「{eff['title']}」章节的完整内容"
        if eff.get("word_limit"):
            user_content += f"，约{eff['word_limit']}字"
        user_content += "。"

        messages = [{"role": "system", "content": system}] + global_history + [
            {"role": "user", "content": user_content}
        ]

        paragraph_text = ""
        async for token in self.provider.chat(messages, stream=True):
            paragraph_text += token
            yield token

        # Re-fetch ps one more time before commit to ensure it's attached
        ps = db.query(ProjectSection).filter(ProjectSection.id == ps_id).first()
        if ps:
            cleaned = self.clean_generated_content(paragraph_text)
            ps.content = cleaned
            ps.word_count = self.count_words(cleaned).get("total", 0)
            if ps.status == "empty":
                ps.status = "draft"
            db.commit()

    async def generate_and_check(self, ps_id: int, project_id: int, db: Session) -> dict:
        """Generate section content from conversation history and run quality check.
        Non-streaming. Returns {content, quality_check}."""
        import json as _json
        import re as _re
        from app.api.projects import effective_section as _eff_sec
        from app.models.project import ProjectSection, Project, ProjectRuleOverride
        from app.services.dialogue_engine import get_active_conversation, get_conversation_history

        ps = db.query(ProjectSection).filter(ProjectSection.id == ps_id).first()
        project = db.query(Project).filter(Project.id == project_id).first()
        if not ps or not project:
            raise ValueError("Section or project not found")

        ts = ps.template_section
        overrides = db.query(ProjectRuleOverride).filter(
            ProjectRuleOverride.project_id == project_id,
            ProjectRuleOverride.section_id == ps_id,
        ).all()
        eff = _eff_sec(ts, overrides)
        writing_guide = eff.get("writing_guide", "") or ""
        word_limit = eff.get("word_limit") or 0

        conv = get_active_conversation(db, project_id, ps_id)
        history = get_conversation_history(conv)

        system = self._build_generation_system(eff, project)
        user_content = f"请根据以上对话，生成「{eff['title']}」章节的完整内容"
        if word_limit:
            user_content += f"，约{word_limit}字"
        user_content += "。直接输出章节正文，不要包含章节标题。"

        messages = [{"role": "system", "content": system}] + history + [
            {"role": "user", "content": user_content}
        ]
        content = await self.provider.complete(messages)
        content = self.clean_generated_content(content.strip())

        # Quality check
        actual_word_count = self.count_words(content).get("total", 0)
        check_prompt = (
            f"You are a quality reviewer for a grant proposal section titled \"{eff['title']}\".\n\n"
            f"Writing requirements:\n{writing_guide or '（未提供写作要求）'}\n"
            f"Word limit: {word_limit or '未指定'}\n\n"
            f"Generated content ({actual_word_count} words):\n{content}\n\n"
            "Review the content against the writing requirements. Reply ONLY with JSON:\n"
            '{"word_count": <int>, "word_limit": <int or null>, "within_limit": <bool>, '
            '"requirements_met": ["...", ...], "requirements_missed": ["...", ...], "overall": "..."}\n'
            "requirements_met/missed and overall should be in Chinese. Be concise."
        )
        quality_check: dict = {
            "word_count": actual_word_count,
            "word_limit": word_limit or None,
            "within_limit": (word_limit == 0 or actual_word_count <= word_limit * 1.2),
            "requirements_met": [],
            "requirements_missed": [],
            "overall": "质检结果获取失败",
        }
        try:
            check_result_raw = await self.provider.complete([{"role": "user", "content": check_prompt}])
            m = _re.search(r'\{[\s\S]*\}', check_result_raw)
            if m:
                parsed = _json.loads(m.group())
                quality_check.update(parsed)
                quality_check["word_count"] = actual_word_count  # always use actual count
        except Exception:
            pass

        return {"content": content, "quality_check": quality_check}

    async def run_quality_check(self, ps_id: int, project_id: int, db: Session) -> dict:
        """Run quality check against existing section content. Persists results and returns
        {issues, overall, checked_at}."""
        import json as _json
        import re as _re
        from datetime import datetime as _dt
        from app.api.projects import effective_section as _eff_sec
        from app.models.project import ProjectSection, Project, ProjectRuleOverride

        ps = db.query(ProjectSection).filter(ProjectSection.id == ps_id).first()
        project = db.query(Project).filter(Project.id == project_id).first()
        if not ps or not project:
            raise ValueError("Section or project not found")

        ts = ps.template_section
        overrides = db.query(ProjectRuleOverride).filter(
            ProjectRuleOverride.project_id == project_id,
            ProjectRuleOverride.section_id == ps_id,
        ).all()
        eff = _eff_sec(ts, overrides)
        writing_guide = eff.get("writing_guide", "") or ""
        word_limit = eff.get("word_limit") or 0

        content = ps.content or ""
        actual_word_count = self.count_words(content).get("total", 0)
        check_prompt = (
            f"You are a quality reviewer for a grant proposal section titled \"{eff['title']}\".\n\n"
            f"Writing requirements:\n{writing_guide or '（未提供写作要求）'}\n"
            f"Word limit: {word_limit or '未指定'}\n\n"
            f"Section content ({actual_word_count} words):\n{content}\n\n"
            "Review the content against the writing requirements. Reply ONLY with JSON:\n"
            '{"word_count": <int>, "word_limit": <int or null>, "within_limit": <bool>, '
            '"requirements_met": ["...", ...], "requirements_missed": ["...", ...], "overall": "..."}\n'
            "requirements_met/missed and overall should be in Chinese. Be concise."
        )
        issues: list = []
        overall: str = "质检结果获取失败"
        try:
            check_result_raw = await self.provider.complete([{"role": "user", "content": check_prompt}])
            m = _re.search(r'\{[\s\S]*\}', check_result_raw)
            if m:
                parsed = _json.loads(m.group())
                issues = parsed.get("requirements_missed", [])
                overall = parsed.get("overall", overall)
        except Exception:
            pass

        checked_at = _dt.utcnow()
        ps.quality_issues = issues
        ps.quality_checked_at = checked_at
        db.commit()

        return {
            "issues": issues,
            "overall": overall,
            "checked_at": checked_at.isoformat() + "Z",
        }

    async def generate_skeleton_summary(self, ps: ProjectSection, project: Project) -> str:
        ts = ps.template_section
        overrides = [o for o in project.rule_overrides if o.section_id == ps.id]
        eff = effective_section(ts, overrides)

        guide = eff.get("writing_guide", "")
        word_limit = eff.get("word_limit", "未知")

        skeletons_context = []
        for other_ps in project.sections:
            if other_ps.skeleton_text and other_ps.id != ps.id:
                skeletons_context.append(
                    f"- **{other_ps.template_section.title}**：{other_ps.skeleton_text}"
                )

        prompt = (
            f"请为基金申请书的「{eff['title']}」章节生成一段2-3句话的骨架摘要，"
            f"概述该章节将要写什么内容。\n"
            f"该章节要求：{guide}\n"
            f"字数限制：{word_limit}字\n"
        )
        if skeletons_context:
            prompt += "\n其他章节骨架（保持整体一致性）：\n" + "\n".join(skeletons_context)

        result = await self.provider.complete([{"role": "user", "content": prompt}])
        return result.strip()

    def _build_format_constraint(self, eff: dict) -> str:
        """Return a uniform output format constraint block to append to any generation system prompt."""
        return (
            "\n\n【输出格式要求】"
            "\n- 根据本章节写作要求的复杂度判断结构：若写作要求涵盖多个独立子主题，"
            "使用「一、二、三、」格式的子标题划分各部分；"
            "若章节内容单一或预计字数较少（500字以内），直接输出连贯段落，无需子标题。"
            "\n- 禁止输出 --- 分隔符行。"
            "\n- 禁止输出 A./B./C. 选项列表行。"
            "\n- 禁止使用 ### 等 Markdown 标题格式。"
            "\n- 禁止以「以下是」「根据您的」「综上来看」「根据上述」「根据以上」等 AI 口吻句子开头。"
            "\n- 每段以实质性学术内容直接开头，符合基金申请书正文规范。"
        )

    @staticmethod
    def clean_generated_content(text: str) -> str:
        """Remove residual AI conversation artifacts from generated section content.
        Only conservative cleanup: separator lines, standalone option lines, and
        conversation-opener sentences at the very start. Never modifies paragraph body."""
        if not text:
            return text
        lines = text.splitlines()
        cleaned = []
        for line in lines:
            stripped = line.strip()
            # Remove pure --- separator lines
            if stripped == "---":
                continue
            # Remove standalone A./B./C. option list lines (short, line-start pattern)
            if re.match(r'^[A-Ca-c]\.\s+\S', stripped) and len(stripped) < 120:
                continue
            cleaned.append(line)
        result = "\n".join(cleaned)
        # Remove conversation opener at the very beginning of the text (no MULTILINE)
        for pattern in [
            r'^以下是[^\n]*\n*',
            r'^根据您的[^\n]*\n*',
            r'^综上来看[^\n]*\n*',
            r'^根据上述[^\n]*\n*',
            r'^根据以上[^\n]*\n*',
        ]:
            result = re.sub(pattern, '', result)
        return result.strip()

    def _build_generation_system(self, eff: dict, project: Project) -> str:
        parts = [
            "你是一位专业的科研基金申请书写作专家，帮助科研工作者撰写高质量的基金申请书内容。"
            "请用规范的学术语言，根据对话内容生成符合要求的章节内容。"
        ]
        if eff.get("writing_guide"):
            parts.append(f"\n章节写作要求：{eff['writing_guide']}")
        if eff.get("word_limit"):
            parts.append(f"\n字数要求：约{eff['word_limit']}字")

        skeletons = []
        for ps in project.sections:
            if ps.skeleton_text:
                skeletons.append(f"- **{ps.template_section.title}**：{ps.skeleton_text}")
        if skeletons:
            parts.append("\n\n项目骨架（其他章节方向）：\n" + "\n".join(skeletons))

        parts.append(self._build_format_constraint(eff))
        return "".join(parts)

    async def extract_generation_plan(
        self, conversation_history: list[dict], section_title: str
    ) -> list[dict] | None:
        history_text = "\n".join([m["role"] + ": " + m["content"] for m in conversation_history[-10:]])
        prompt = (
            "Based on the following conversation, extract the paragraph structure plan that the user has confirmed "
            "for section \"" + section_title + "\".\n\n"
            "Conversation:\n" + history_text + "\n\n"
            "Return a JSON array where each item has: index (0-based), title (string), word_count (integer).\n"
            "Example: [{\"index\": 0, \"title\": \"研究背景\", \"word_count\": 400}]\n"
            "Return ONLY the JSON array, no other text."
        )
        result = await self.provider.complete([{"role": "user", "content": prompt}])
        m = re.search(r'\[[\s\S]*\]', result)
        if m:
            try:
                plan = json.loads(m.group())
                if isinstance(plan, list) and len(plan) > 0:
                    return plan
            except Exception:
                pass
        return None

    async def generate_paragraph(
        self,
        ps: ProjectSection,
        project: Project,
        cursor: int,
        db: Session,
        feedback: Optional[str] = None,
    ) -> AsyncIterator[str]:
        ts = ps.template_section
        overrides = [o for o in project.rule_overrides if o.section_id == ps.id]
        eff = effective_section(ts, overrides)

        plan = ps.generation_plan or []
        if cursor >= len(plan):
            return

        current_paragraph = plan[cursor]
        system = self._build_generation_system(eff, project)

        conv = get_active_conversation(db, project.id, ps.id)
        history = get_conversation_history(conv)

        parts = [
            "正在生成第" + str(cursor + 1) + "段（共" + str(len(plan)) + "段）：「" + current_paragraph["title"] + "」",
            "约" + str(current_paragraph.get("word_count", "未知")) + "字。",
        ]
        if ps.content:
            parts.append("\n\n已生成内容（保持上下文连贯）：\n" + ps.content)
        if feedback:
            parts.append("\n\n修改意见：" + feedback)
        parts.append("\n\n请生成本段内容，不要包含段落标题。")

        user_content = "".join(parts)
        messages = [{"role": "system", "content": system}] + history + [
            {"role": "user", "content": user_content}
        ]

        paragraph_text = ""
        async for token in self.provider.chat(messages, stream=True):
            paragraph_text += token
            yield token

        # DB write after streaming completes
        paragraph_text = self.clean_generated_content(paragraph_text)
        if feedback:
            # Replace last paragraph in content
            paragraphs = (ps.content or "").split("\n\n")
            if paragraphs:
                paragraphs[-1] = paragraph_text
                ps.content = "\n\n".join(paragraphs)
            else:
                ps.content = paragraph_text
        else:
            if ps.content:
                ps.content = ps.content + "\n\n" + paragraph_text
            else:
                ps.content = paragraph_text

        if not feedback:
            ps.generation_cursor = cursor + 1
            if cursor + 1 >= len(plan):
                ps.generation_cursor = None
                ps.status = "draft"

        ps.word_count = self.count_words(ps.content).get("total", 0)
        db.commit()

    def build_continuation_prompt(self, cursor: int, total: int) -> str:
        if cursor < total:
            return (
                "第" + str(cursor) + "段已生成（共" + str(total) + "段）。"
                "回复『继续』生成下一段，或告诉我需要修改什么。"
            )
        else:
            return (
                "全部" + str(total) + "段已生成，章节初稿完成！"
                "请在左侧内容区查看并决定是否标记为『已审阅』。"
            )

    def count_words(self, text: str) -> dict:
        if not text:
            return {"total": 0, "chinese": 0, "english": 0}
        chinese = len(re.findall(r'[\u4e00-\u9fff]', text))
        english = len(re.findall(r'\b[a-zA-Z]+\b', text))
        return {"total": chinese + english, "chinese": chinese, "english": english}

    def validate_word_count(self, text: str, word_limit: int) -> dict:
        counts = self.count_words(text)
        total = counts["total"]
        deviation = total - word_limit
        deviation_pct = round(deviation / word_limit * 100) if word_limit else 0
        return {
            "word_count": total,
            "word_limit": word_limit,
            "deviation": deviation,
            "deviation_percentage": deviation_pct,
            "within_limit": deviation <= 0,
        }
