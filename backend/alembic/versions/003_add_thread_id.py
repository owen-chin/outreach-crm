"""add gmail_thread_id to contacts

Revision ID: 003
Revises: 002
Create Date: 2026-07-02

"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("gmail_thread_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("contacts", "gmail_thread_id")
