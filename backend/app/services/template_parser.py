import json
import re
from app.services.word_parser import extract_document_structure, build_text_for_llm
from app.services.llm_provider import LLMProvider


PARSE_PROMPT = """You are a document analyzer. Given the text content of a grant proposal template, extract the section structure as JSON.

For each section, extract:
- title: section title text
- level: heading level (1, 2, or 3)
- word_limit: integer word/character limit if mentioned, null otherwise
- writing_guide: any writing instructions or requirements for this section as a string, null if none
- order: sequential order number starting from 1
- parent_id: null (will be set by the caller based on level)

Return ONLY valid JSON in this format:
{
  "sections": [
    {
      "title": "...",
      "level": 1,
      "word_limit": null,
      "writing_guide": "...",
      "order": 1
    }
  ]
}

Document content:
"""


async def parse_template_with_llm(file_path: str, provider: LLMProvider) -> list[dict]:
    paragraphs = extract_document_structure(file_path)
    text = build_text_for_llm(paragraphs)

    messages = [
        {"role": "user", "content": PARSE_PROMPT + text}
    ]
    response = await provider.complete(messages)

    # Extract JSON from response
    json_match = re.search(r'\{[\s\S]*\}', response)
    if not json_match:
        raise ValueError("LLM did not return valid JSON")

    data = json.loads(json_match.group())
    sections = data.get("sections", [])

    # Assign parent_id based on level nesting
    sections = _assign_parent_ids(sections)
    return sections


def _assign_parent_ids(sections: list[dict]) -> list[dict]:
    stack: list[tuple[int, int]] = []  # (level, index)
    for i, section in enumerate(sections):
        level = section.get("level", 1)
        # Pop stack until we find a parent
        while stack and stack[-1][0] >= level:
            stack.pop()
        if stack:
            section["parent_id"] = stack[-1][1]
        else:
            section["parent_id"] = None
        stack.append((level, i))
    return sections
