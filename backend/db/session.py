import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

engine = create_async_engine(os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./test.db"), pool_pre_ping=True, connect_args={"command_timeout": 60, "timeout": 60})
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session