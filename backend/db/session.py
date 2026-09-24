import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

db_url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./test.db")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(db_url, pool_pre_ping=True, pool_timeout=120, connect_args={"command_timeout": 60, "timeout": 60})
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session