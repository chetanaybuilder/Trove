import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import text
from backend.db.session import AsyncSessionLocal

async def get_latest():
    async with AsyncSessionLocal() as db:
        r = await db.execute(text("SELECT id, status, error_message, progress FROM analyses ORDER BY created_at DESC LIMIT 3"))
        rows = r.fetchall()
        for row in rows:
            print(dict(row._mapping))

asyncio.run(get_latest())
