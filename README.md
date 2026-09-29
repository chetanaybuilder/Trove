# Trove — Turn information into clarity

Large-document intelligence: chunk → per-chunk notes → hierarchical merge → validated structured report.
Stack: React/Tailwind (frontend, in progress) · Node/Express · Neon PostgreSQL · Google OAuth (in progress) · pluggable AI provider.

## Database setup (Neon PostgreSQL)
1. Create a Neon account and a project at https://console.neon.tech.
2. Create (or use) the default database.
3. Click **Connect** and copy the **pooled** connection string.
4. `cp .env.example .env` and paste it into `DATABASE_URL=`.

## AI setup (Groq)
1. Sign up at https://console.groq.com and generate an API key.
2. Paste the key into `AI_API_KEY=` in your `.env`.
3. Set your preferred model in `AI_MODEL=` (e.g. `llama-3.3-70b-versatile`).

## Run
1. `npm install && npm run db:migrate`
2. `npm run dev:server`

Migrating: plain SQL files in `migrations/`, applied in order and tracked in `schema_migrations`. Use a separate Neon branch for development and run the same command with the production `DATABASE_URL` to deploy schema changes.
If `DATABASE_URL` is missing, the app stops with a clear message. The URL is only read server-side.

## Security notes
All queries are parameterized and scoped by `user_id` (`server/db/repo.js`); raw document text is never stored, only metadata and the structured report.

## Tests
`npm run test:pipeline` runs a synthetic ~60k-line document through the pipeline with a mock AI (no key needed).

## Cost & load design
- **Token saver:** duplicate lines are removed, then only the most informative blocks (spread across the whole document, original order kept) are sent: ~40k tokens for Quick, ~250k for Deep, however large the input. A 60k-line file (~900k tokens) costs a small fraction of a full read. Trade-off: Quick is a selection, not an exhaustive read; raise `DEEP_BUDGET_TOKENS` for completeness. Identical re-analyses are served from the saved report at zero AI cost.
- **Load safety (per server process):** bounded job queue (`MAX_JOBS` running, `MAX_QUEUED` waiting; overflow gets a friendly 503), an in-flight upload memory cap, one active analysis per user, per-user and per-IP rate limits, a global cap on AI calls with retry/backoff, and 15 s SSE keep-alives. To serve very large audiences, run several instances behind a load balancer (the queue is in-memory, per instance) and set `TRUST_PROXY=1`; Neon's pooled connection string handles the connection fan-out.
- **Ask this document** answers from stored per-section notes (only the 6 most relevant are sent), not the raw text, which is never stored. Notes are saved at analysis time.
- Sharing: a report is private until you press Share; anyone with the link can read it until you stop sharing.
- After upgrading from 1.0, run `npm run db:migrate` to apply `002_features.sql`.
