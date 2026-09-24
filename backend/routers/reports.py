from fastapi import APIRouter, Depends, HTTPException
from backend.auth.session import get_current_user_id
from backend.db.queries import list_analyses_for_user, get_analysis_for_user, delete_analysis_for_user

router = APIRouter(prefix="/api/v1/reports")

@router.get("")
async def list_reports(user_id: str = Depends(get_current_user_id)):
    return await list_analyses_for_user(user_id)

@router.get("/{analysis_id}")
async def get_report(analysis_id: str, user_id: str = Depends(get_current_user_id)):
    row = await get_analysis_for_user(user_id, analysis_id)
    if not row: raise HTTPException(404, "Report not found")
    return row

@router.delete("/{analysis_id}")
async def delete_report(analysis_id: str, user_id: str = Depends(get_current_user_id)):
    ok = await delete_analysis_for_user(user_id, analysis_id)
    if not ok: raise HTTPException(404, "Report not found")
    return {"deleted": True}