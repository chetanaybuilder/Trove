import os
from alembic import context
from sqlalchemy import create_engine

config = context.config
url = os.environ["DATABASE_URL"].replace("+asyncpg", "+psycopg").replace("ssl=require", "sslmode=require")
config.set_main_option("sqlalchemy.url", url)

def run_migrations_online():
    connectable = create_engine(config.get_main_option("sqlalchemy.url"))
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction(): context.run_migrations()

run_migrations_online()