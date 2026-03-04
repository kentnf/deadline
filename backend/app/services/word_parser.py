import os
from docx import Document


def extract_document_structure(file_path: str) -> list[dict]:
    doc = Document(file_path)
    result = []
    for para in doc.paragraphs:
        style_name = para.style.name if para.style else "Normal"
        text = para.text.strip()
        if not text:
            continue
        if style_name.startswith("Heading 1"):
            level = 1
        elif style_name.startswith("Heading 2"):
            level = 2
        elif style_name.startswith("Heading 3"):
            level = 3
        else:
            level = 0
        result.append({"level": level, "text": text, "style": style_name})
    return result


def build_text_for_llm(paragraphs: list[dict]) -> str:
    lines = []
    for p in paragraphs:
        if p["level"] == 1:
            lines.append(f"# {p['text']}")
        elif p["level"] == 2:
            lines.append(f"## {p['text']}")
        elif p["level"] == 3:
            lines.append(f"### {p['text']}")
        else:
            lines.append(p["text"])
    return "\n".join(lines)
