import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

_client: Optional[OpenAI] = None

if GROQ_API_KEY:
    _client = OpenAI(
        api_key=GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
    )

MODEL_NAME = "openai/gpt-oss-120b"

SYSTEM_INSTRUCTION = """You are the GeoMine AI Assistant, an AI system built for CMPDI/CIL subsidiaries to support geological, mining and production reporting for the Ministry of Coal and parliamentary inquiries.

Rules you must follow strictly:
1. Answer ONLY using the document context and structured data provided in the user message. Do not use outside knowledge about mining, coal, or any other topic.
2. If the provided context does not contain the answer, clearly say that the uploaded documents do not contain this information, and suggest the user upload a relevant document.
3. Always mention which document(s) your answer is based on when possible.
4. Be precise, professional, and concise — this is used for official reporting purposes.
5. If asked for numbers (production figures, overburden, etc.), quote them exactly as they appear in the source text or structured data, and note the source document.
6. Never invent figures, mine names, or dates that are not present in the provided context.
7. When asked to summarize, analyze, or compare, organize your answer clearly — use short paragraphs or bullet points, group by mine or document where relevant, and highlight totals, trends or notable figures found in the structured data.
8. If structured data (mine name, production, overburden) is provided but the raw text context is limited, you may still give a data-driven analysis using the structured data alone."""


DRAFT_SYSTEM_INSTRUCTION = """You are drafting an official written response on behalf of CMPDI/CIL to a parliamentary or high-level administrative inquiry regarding coal mining, geological, or production matters.

Write in formal, precise, professional English suitable for official government correspondence. Structure your response as follows:

1. A brief restatement of the inquiry for context.
2. A clearly organized response body using data drawn ONLY from the provided document context and structured data below — cite the source document name for each figure or claim you make.
3. A closing note stating that this response has been compiled from available digitized records by an AI-assisted system and should be reviewed and countersigned by the concerned officer before formal submission.

Rules:
- Never fabricate any figure, mine name, date, or fact not present in the provided context.
- If the available data is insufficient to fully answer the inquiry, state this explicitly and specify what additional documentation would be needed.
- Do not use casual language, emojis, or informal phrasing anywhere in the response."""


def is_configured() -> bool:
    return _client is not None


def generate_answer(
    question: str,
    context_snippets: List[dict],
    structured_summary: Optional[str] = None,
) -> str:
    if not _client:
        raise RuntimeError("Groq API key is not configured on the server.")

    if context_snippets:
        context_text = "\n\n".join(
            f"[Source: {snippet['document_name']}]\n{snippet['snippet']}"
            for snippet in context_snippets
        )
    else:
        context_text = "(No matching text content was found in the uploaded documents.)"

    structured_block = (
        f"=== STRUCTURED DATA (extracted figures across documents) ===\n{structured_summary}\n\n"
        if structured_summary
        else ""
    )

    user_message = (
        f"{structured_block}"
        f"=== DOCUMENT TEXT CONTEXT ===\n{context_text}\n\n"
        f"=== QUESTION ===\n{question}"
    )

    response = _client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": user_message},
        ],
    )

    if response.choices and response.choices[0].message.content:
        return response.choices[0].message.content.strip()

    return "I wasn't able to generate a response. Please try rephrasing your question."


def draft_formal_response(
    inquiry: str,
    context_snippets: List[dict],
    structured_summary: Optional[str] = None,
) -> str:
    if not _client:
        raise RuntimeError("Groq API key is not configured on the server.")

    if context_snippets:
        context_text = "\n\n".join(
            f"[Source: {snippet['document_name']}]\n{snippet['snippet']}"
            for snippet in context_snippets
        )
    else:
        context_text = "(No matching text content was found in the uploaded documents.)"

    structured_block = (
        f"=== STRUCTURED DATA (extracted figures across documents) ===\n{structured_summary}\n\n"
        if structured_summary
        else ""
    )

    user_message = (
        f"{structured_block}"
        f"=== DOCUMENT TEXT CONTEXT ===\n{context_text}\n\n"
        f"=== INQUIRY TO RESPOND TO ===\n{inquiry}"
    )

    response = _client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": DRAFT_SYSTEM_INSTRUCTION},
            {"role": "user", "content": user_message},
        ],
    )

    if response.choices and response.choices[0].message.content:
        return response.choices[0].message.content.strip()

    return "I wasn't able to draft a response. Please try rephrasing the inquiry."
INSIGHT_SYSTEM_INSTRUCTION = """You are a mining data analyst for CMPDI/CIL. You are given a block of structured, real data (numbers, mine names, years) about coal mining operations. Write a short, sharp analytical narrative — 3 to 6 sentences — that:

1. Highlights the most notable pattern, trend, or outlier in the data.
2. Uses only the exact figures given to you — never invent numbers, mine names, or years not present in the data.
3. Is written in a professional, analytical tone suitable for an internal briefing.
4. If the data is too sparse to draw a meaningful conclusion, say so plainly instead of making one up.

Do not use bullet points or headers — write flowing analytical prose only."""


def generate_insight(topic_label: str, data_summary: str) -> str:
    if not _client:
        raise RuntimeError("Groq API key is not configured on the server.")

    if not data_summary.strip():
        return "Not enough data has been processed yet to generate an insight here."

    user_message = f"Topic: {topic_label}\n\n=== DATA ===\n{data_summary}"

    response = _client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": INSIGHT_SYSTEM_INSTRUCTION},
            {"role": "user", "content": user_message},
        ],
    )

    if response.choices and response.choices[0].message.content:
        return response.choices[0].message.content.strip()

    return "I wasn't able to generate an insight right now."
import json as _json

RECORD_EXTRACTION_SYSTEM = """You are a precise data extraction engine for coal/mining documents. Given a passage of text, identify every distinct mine, colliery, project, or company-level coal mining record mentioned with at least one numeric figure (production or overburden). Do not invent mines, names, or numbers not present in the text.

Respond ONLY with a valid JSON array of objects, nothing else. Each object must have exactly these keys:
- "mine_name": string
- "reporting_year": string or null (e.g. "2023-24" or "2023")
- "production": number or null (in million tonnes)
- "overburden": number or null (in million cubic metres)

If the text does not describe any specific mine/company-level production or overburden figures, respond with an empty array: []"""

def extract_mining_records_from_text(text: str, max_chars: int = 8000) -> list:
    if not _client or not text or not text.strip():
        return []

    # Process the complete extracted document in chunks instead of
    # looking only at the first 8,000 characters.
    chunk_size = max_chars
    cleaned_text = text.strip()

    chunks = [
        cleaned_text[i:i + chunk_size]
        for i in range(0, len(cleaned_text), chunk_size)
    ]

    all_records = []

    for snippet in chunks:
        try:
            response = _client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": RECORD_EXTRACTION_SYSTEM
                    },
                    {
                        "role": "user",
                        "content": snippet
                    },
                ],
            )
        except Exception:
            continue

        if (
            not response.choices
            or not response.choices[0].message.content
        ):
            continue

        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.strip("`")

            if raw.lower().startswith("json"):
                raw = raw[4:]

            raw = raw.strip()

        try:
            data = _json.loads(raw)
        except Exception:
            continue

        if not isinstance(data, list):
            continue

        def _to_number(value):
            if value is None:
                return None

            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        for item in data:
            if not isinstance(item, dict):
                continue

            mine_name = item.get("mine_name")

            if not mine_name or not isinstance(mine_name, str):
                continue

            all_records.append(
                {
                    "mine_name": mine_name.strip()[:255],
                    "reporting_year": item.get("reporting_year") or None,
                    "production": _to_number(
                        item.get("production")
                    ),
                    "overburden": _to_number(
                        item.get("overburden")
                    ),
                }
            )
    # Remove duplicate records that can occur at chunk boundaries.
    unique_records = []
    seen = set()

    for record in all_records:
        key = (
            record["mine_name"],
            record["reporting_year"],
            record["production"],
            record["overburden"],
        )

        if key not in seen:
            seen.add(key)
            unique_records.append(record)

    return unique_records