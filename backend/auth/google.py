import os
import json
import urllib.request
from urllib.error import URLError

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

def verify_google_credential(credential: str) -> dict:
    # Use urllib with a 5s timeout to bypass the Windows IPv6 requests hang that takes 2 minutes
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            payload = json.loads(response.read().decode())
    except URLError as e:
        raise ValueError(f"Failed to verify token: {e}")

    if payload.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Invalid issuer")
    if payload.get("aud") != GOOGLE_CLIENT_ID:
        raise ValueError("Invalid audience")
    if not payload.get("sub") or not payload.get("email"):
        raise ValueError("Incomplete Google identity")
        
    return {
        "google_sub": payload["sub"],
        "email": payload["email"],
        "name": payload.get("name"),
        "avatar_url": payload.get("picture"),
    }