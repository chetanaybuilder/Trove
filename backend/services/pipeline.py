import asyncio
import hashlib
import re
from typing import List
from backend.db.queries import (
    update_analysis_job, 
    get_message_hashes, 
    create_message_hashes
)
from backend.services.gemini_service import analyze_text, semantic_reduce_report
from backend.schemas.trove_report import TroveReportResponse

def normalize_text(text: str) -> List[str]:
    # Split text into chunks that are somewhat manageable
    # A simple approach: split by newlines, group into chunks of ~50 lines
    lines = text.split('\n')
    chunks = []
    current_chunk = []
    
    for line in lines:
        line = line.strip()
        if not line: continue
        current_chunk.append(line)
        if len(current_chunk) >= 500:
            chunks.append("\n".join(current_chunk))
            current_chunk = []
            
    if current_chunk:
        chunks.append("\n".join(current_chunk))
        
    return chunks

def hash_chunk(chunk: str) -> str:
    return hashlib.sha256(chunk.encode('utf-8')).hexdigest()

def merge_reports(reports: List[TroveReportResponse]) -> TroveReportResponse:
    merged = TroveReportResponse()
    
    for r in reports:
        merged.red_alerts.extend(r.red_alerts)
        
        # Merge executive briefs by joining them, keeping it somewhat concise
        if r.executive_brief:
            if merged.executive_brief:
                merged.executive_brief += " " + r.executive_brief
            else:
                merged.executive_brief = r.executive_brief
                
        merged.commitment_matrix.extend(r.commitment_matrix)
        merged.chronological_timeline.extend(r.chronological_timeline)
        merged.dependencies_and_blockers.extend(r.dependencies_and_blockers)
        merged.agreed_decisions.extend(r.agreed_decisions)
        merged.financial_terms.extend(r.financial_terms)
        merged.open_questions.extend(r.open_questions)
        merged.stakeholders.extend(r.stakeholders)
        
        if r.sentiment_audit:
            if merged.sentiment_audit:
                merged.sentiment_audit += " | " + r.sentiment_audit
            else:
                merged.sentiment_audit = r.sentiment_audit
                
        merged.next_agenda.extend(r.next_agenda)
        merged.verifiable_quotes.extend(r.verifiable_quotes)

    # Deduplicate simple lists
    merged.dependencies_and_blockers = list(set(merged.dependencies_and_blockers))
    merged.agreed_decisions = list(set(merged.agreed_decisions))
    merged.financial_terms = list(set(merged.financial_terms))
    merged.open_questions = list(set(merged.open_questions))
    merged.next_agenda = list(set(merged.next_agenda))
    
    # Deduplicate stakeholders by name
    seen_stakeholders = set()
    unique_stakeholders = []
    for s in merged.stakeholders:
        if s.name not in seen_stakeholders:
            seen_stakeholders.add(s.name)
            unique_stakeholders.append(s)
    merged.stakeholders = unique_stakeholders
    
    # Keep executive brief somewhat short
    if len(merged.executive_brief) > 2000:
        merged.executive_brief = merged.executive_brief[:1997] + "..."
        
    return merged

async def analyze_chunk_with_retry(chunk: str, max_retries=6) -> TroveReportResponse:
    for attempt in range(max_retries):
        try:
            return await analyze_text(chunk)
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                print(f"Rate limited. Waiting 60 seconds (Attempt {attempt+1}/{max_retries})...")
                await asyncio.sleep(60)
            else:
                await asyncio.sleep(2 ** attempt)

async def process_analysis_job(user_id: str, analysis_id: str, text: str):
    try:
        await update_analysis_job(analysis_id, status="processing")
        
        chunks = normalize_text(text)
        total_chunks = len(chunks)
        
        if total_chunks == 0:
            empty_report = TroveReportResponse()
            await update_analysis_job(analysis_id, status="completed", progress={"completed": 0, "total": 0}, structured_data=empty_report.model_dump())
            return

        await update_analysis_job(analysis_id, progress={"completed": 0, "total": total_chunks})
        
        # Deduplication Phase
        chunk_hashes = [hash_chunk(c) for c in chunks]
        cached_hashes = await get_message_hashes(user_id, set(chunk_hashes))
        
        semaphore = asyncio.Semaphore(5) # 5 concurrent requests to respect 15 RPM free tier
        completed_count = 0
        
        async def process_chunk(chunk, h):
            nonlocal completed_count
            if h in cached_hashes:
                try:
                    report = TroveReportResponse(**cached_hashes[h])
                    completed_count += 1
                    await update_analysis_job(analysis_id, progress={"completed": completed_count, "total": total_chunks})
                    return h, report, False
                except Exception:
                    pass
                    
            async with semaphore:
                report = await analyze_chunk_with_retry(chunk)
                
            completed_count += 1
            await update_analysis_job(analysis_id, progress={"completed": completed_count, "total": total_chunks})
            return h, report, True

        tasks = [process_chunk(chunk, h) for chunk, h in zip(chunks, chunk_hashes)]
        results = await asyncio.gather(*tasks)
        
        completed_reports = []
        new_hashes_to_save = {}
        
        for h, report, is_new in results:
            completed_reports.append(report)
            if is_new:
                new_hashes_to_save[h] = report.model_dump()
            
        # Save new intelligence to cache
        if new_hashes_to_save:
            await create_message_hashes(user_id, new_hashes_to_save)
            
        # Reduction Phase
        final_report = merge_reports(completed_reports)
        
        # Second-Pass Semantic Reduction
        if len(completed_reports) > 1:
            try:
                final_report = await semantic_reduce_report(final_report)
            except Exception as e:
                print(f"Semantic reduction failed: {e}")
        
        await update_analysis_job(
            analysis_id, 
            status="completed", 
            progress={"completed": total_chunks, "total": total_chunks},
            structured_data=final_report.model_dump()
        )
        
    except Exception as e:
        print(f"Job {analysis_id} failed: {e}")
        await update_analysis_job(analysis_id, status="failed", error_message=str(e))
