"""add email drafts (autosave + scheduled send)

Revision ID: 005
Revises: 004
Create Date: 2026-07-09

"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_drafts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("thread_id", sa.Integer(), sa.ForeignKey("threads.id", ondelete="CASCADE"), nullable=True),
        sa.Column("to_person_id", sa.Integer(), sa.ForeignKey("people.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cc_person_ids", sa.Text(), server_default="[]"),
        sa.Column("subject", sa.String()),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("send_at", sa.DateTime(timezone=True)),
        sa.Column(
            "status",
            sa.Enum("draft", "scheduled", "sending", "failed", name="draftstatus"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("failure_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index(
        "ux_email_drafts_compose", "email_drafts", ["organization_id"],
        unique=True, postgresql_where=sa.text("thread_id IS NULL"),
    )
    op.create_index(
        "ux_email_drafts_reply", "email_drafts", ["thread_id"],
        unique=True, postgresql_where=sa.text("thread_id IS NOT NULL"),
    )

    op.create_table(
        "email_draft_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("draft_id", sa.Integer(), sa.ForeignKey("email_drafts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("email_draft_attachments")
    op.drop_index("ux_email_drafts_reply", table_name="email_drafts")
    op.drop_index("ux_email_drafts_compose", table_name="email_drafts")
    op.drop_table("email_drafts")
    op.execute("DROP TYPE IF EXISTS draftstatus")
