from alembic import op
import sqlalchemy as sa

revision = "001_init"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.execute('create extension if not exists "pgcrypto"')
    op.create_table("users",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("google_sub", sa.Text(), nullable=False, unique=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("name", sa.Text()),
        sa.Column("avatar_url", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.create_index("users_google_sub_idx","users",["google_sub"])
    op.create_table("analyses",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.Text(), server_default="Untitled Analysis", nullable=False),
        sa.Column("raw_input_preview", sa.Text(), nullable=False),
        sa.Column("structured_data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.create_index("analyses_user_id_idx","analyses",["user_id"])
    op.create_index("analyses_created_at_idx","analyses",[sa.text("created_at DESC")])

def downgrade():
    op.drop_table("analyses")
    op.drop_table("users")