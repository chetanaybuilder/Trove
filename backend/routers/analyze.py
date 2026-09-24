import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from backend.auth.session import get_current_user_id
from backend.services.pipeline import process_analysis_job
from backend.db.queries import create_analysis_job, get_analysis_for_user

router = APIRouter(prefix="/api/v1")

class AnalyzeRequest(BaseModel):
    text: str

@router.post("/analyze")
async def analyze(body: AnalyzeRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user_id)):
    if not body.text.strip(): raise HTTPException(400, "Input is empty")
    
    # We create the job in the DB and get the ID
    job = await create_analysis_job(user_id, "Conversation analysis", body.text[:2000])
    
    # Spawn background task
    background_tasks.add_task(process_analysis_job, user_id, str(job["id"]), body.text)
    
    return {"job_id": str(job["id"]), "status": "pending"}

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, user_id: str = Depends(get_current_user_id)):
    job = await get_analysis_for_user(user_id, job_id)
    if not job: raise HTTPException(404, "Job not found")
    
    return {
        "id": str(job["id"]),
        "status": job["status"],
        "progress": job.get("progress"),
        "error_message": job.get("error_message"),
        "report": job.get("structured_data") if job["status"] == "completed" else None
    }