"""add users table and user_id to projects

Revision ID: 002
Revises: 001
Create Date: 2026-07-02

"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("google_id", sa.String(), nullable=False, unique=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String()),
        sa.Column("picture", sa.String()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_google_id", "users", ["google_id"])
    op.add_column("projects", sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "user_id")
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_table("users")
