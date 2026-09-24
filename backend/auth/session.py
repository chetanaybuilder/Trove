import os, time, jwt
from fastapi import Header, HTTPException

SESSION_SECRET = os.environ["SESSION_SECRET"]
SESSION_TTL_SECONDS = 7 * 24 * 3600

def issue_session_token(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "exp": int(time.time()) + SESSION_TTL_SECONDS}, SESSION_SECRET, algorithm="HS256")

def verify_session_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except jwt.PyJWTError as exc:
        raise ValueError("Invalid or expired session") from exc

async def get_current_user_id(authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing session token")
    try:
        return verify_session_token(authorization.removeprefix("Bearer ").strip())
    except ValueError:
        raise HTTPException(401, "Invalid or expired session")