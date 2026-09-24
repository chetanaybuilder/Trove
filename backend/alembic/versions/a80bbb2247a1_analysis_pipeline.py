from alembic import op
import sqlalchemy as sa

revision = "a80bbb2247a1"
down_revision = "001_init"
branch_labels = None
depends_on = None

def upgrade():
    # Alter analyses table
    op.add_column("analyses", sa.Column("status", sa.Text(), server_default="pending", nullable=False))
    op.add_column("analyses", sa.Column("progress", sa.JSON(), nullable=True))
    op.add_column("analyses", sa.Column("error_message", sa.Text(), nullable=True))

    # Make structured_data nullable in analyses since it starts empty
    op.alter_column("analyses", "structured_data", existing_type=sa.JSON(), nullable=True)

    # Create analysis_chunks
    op.create_table("analysis_chunks",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("analysis_id", sa.UUID(), sa.ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("structured_data", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True)
    )
    op.create_index("analysis_chunks_analysis_id_idx", "analysis_chunks", ["analysis_id"])

    # Create message_hashes for deduplication
    op.create_table("message_hashes",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_hash", sa.Text(), nullable=False),
        sa.Column("cached_intelligence", sa.JSON(), nullable=True),
        sa.UniqueConstraint("user_id", "message_hash", name="uq_user_message_hash")
    )
    op.create_index("message_hashes_user_hash_idx", "message_hashes", ["user_id", "message_hash"])


def downgrade():
    op.drop_table("message_hashes")
    op.drop_table("analysis_chunks")
    op.alter_column("analyses", "structured_data", existing_type=sa.JSON(), nullable=False)
    op.drop_column("analyses", "error_message")
    op.drop_column("analyses", "progress")
    op.drop_column("analyses", "status")