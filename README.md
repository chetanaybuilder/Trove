# Trove V2

A single-service conversation intelligence app: Next.js static export + FastAPI + Neon Postgres + Google Identity Services + Gemini.

## Requirements
- Node 20+
- Python 3.11+ for local backend development
- Neon Postgres
- Google Cloud OAuth Web Client ID
- Gemini API key

## Environment
Copy `.env.example` to `.env.local` for frontend development and export the four backend variables in your shell when running FastAPI. For the static client, expose the Google client ID as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` during the Next build.

## Install and run frontend
```bash
npm install
npm run dev
```

## Database
```bash
pip install -r requirements.txt
alembic -c backend/alembic.ini upgrade head
```

## Backend
```bash
uvicorn backend.main:app --reload --port 10000
```

For local development, the Next dev server and FastAPI run separately only as a development convenience. Production is intentionally one Docker service.

## Production
```bash
docker build -t trove-v2 .
docker run --env-file .env -p 10000:10000 trove-v2
```

Set these Render variables:
`GEMINI_API_KEY`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET`.

## Google GIS
Create a Google OAuth Web Application client and add the production origin to the authorized JavaScript origins. The browser receives Google's ID token; FastAPI verifies it and then creates the app's own seven-day session JWT.

## Architecture
The browser talks to one FastAPI origin. FastAPI serves the exported Next.js files and owns `/api/v1/*`. Neon is plain Postgres; application queries explicitly scope every analysis to the authenticated internal user ID.

## Security notes
- Google ID tokens are verified server-side.
- The Google `sub` claim is the stable account key.
- Session tokens are signed with an application-only secret.
- Analysis queries require matching `user_id`.
- Input is capped at 600,000 characters.
- Secrets are never intentionally placed in client code.
