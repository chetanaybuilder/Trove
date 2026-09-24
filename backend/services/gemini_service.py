import os
from google import genai
from google.genai import types
import re
from backend.schemas.trove_report import TroveReportResponse

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

SYSTEM = """You are Trove, a conversation-intelligence analyst. Analyze the supplied conversation.
Extract only evidence-supported information. Do not invent facts. Produce a structured report with:
red alerts, executive brief, commitments, timeline, dependencies/blockers, decisions, financial terms,
open questions, stakeholders, sentiment audit, next agenda and short verifiable quotes."""

def compress_text(text: str) -> str:
    # Remove bracketed timestamps like [12:30 PM] or [2023-10-01]
    text = re.sub(r'\[\d{1,4}[-/:]\d{1,2}[^\]]{1,15}\]\s*', '', text)
    # Shorten names like "John Doe:" to "JD:"
    text = re.sub(r'(?m)^([A-Z])[a-z]+ ([A-Z])[a-z]+:', r'\1\2:', text)
    # Collapse multiple newlines and spaces
    text = re.sub(r'\n{2,}', '\n', text)
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()

async def analyze_text(text: str) -> TroveReportResponse:
    compressed = compress_text(text)
    response = await client.aio.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=[SYSTEM, compressed],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=TroveReportResponse,
            temperature=0.2
        )
    )
    return TroveReportResponse.model_validate_json(response.text)

REDUCTION_SYSTEM = """You are Trove's semantic reduction engine.
You will receive a deterministically merged JSON report compiled from multiple conversation chunks.
Your task is to perform semantic deduplication:
1. Merge highly similar or redundant commitments (e.g., "Alex will fix it" vs "Alex is fixing the bug").
2. Merge timelines and sort them correctly.
3. Remove redundant open questions and dependencies.
4. Keep the executive brief concise and coherent.
Do not invent any new facts. Produce the final structured report in the exact same schema."""

async def semantic_reduce_report(report: TroveReportResponse) -> TroveReportResponse:
    response = await client.aio.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=[REDUCTION_SYSTEM, report.model_dump_json()],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=TroveReportResponse,
            temperature=0.1
        )
    )
    return TroveReportResponse.model_validate_json(response.text)