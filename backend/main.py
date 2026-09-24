import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.routers import auth, analyze, reports

required = ["GEMINI_API_KEY", "DATABASE_URL", "GOOGLE_CLIENT_ID", "SESSION_SECRET"]
missing = [x for x in required if not os.getenv(x)]
if missing:
    # Import-time validation catches broken production configuration before traffic arrives.
    raise RuntimeError("Missing environment variables: " + ", ".join(missing))

app = FastAPI(title="Trove V2")
app.include_router(auth.router)
app.include_router(analyze.router)
app.include_router(reports.router)

if os.path.isdir("out/_next"):
    app.mount("/_next", StaticFiles(directory="out/_next"), name="next-assets")

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if os.path.isfile("out/index.html"):
        return FileResponse("out/index.html")
    return {"message": "Frontend not built. Please run `next dev` or `npm run build`."}