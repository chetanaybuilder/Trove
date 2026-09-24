from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.auth.google import verify_google_credential
from backend.auth.session import issue_session_token
from backend.db.queries import upsert_user

router = APIRouter(prefix="/api/v1/auth")

class GoogleLoginRequest(BaseModel):
    credential: str

@router.post("/google")
async def google_login(body: GoogleLoginRequest):
    try:
        identity = verify_google_credential(body.credential)
        user = await upsert_user(**identity)
        return {"session_token": issue_session_token(str(user["id"])), "user": {**{k: (str(v) if k=="id" else v) for k,v in user.items()}}}
    except (ValueError, KeyError) as exc:
        print(f"Auth error: {type(exc)} - {exc}")
        raise HTTPException(401, "Invalid Google credential") from exc