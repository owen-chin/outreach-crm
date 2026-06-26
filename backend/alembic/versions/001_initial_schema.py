"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-06-26

"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("date", sa.Date()),
        sa.Column("description", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_name", sa.String(), nullable=False),
        sa.Column("contact_name", sa.String()),
        sa.Column("email", sa.String()),
        sa.Column("ask_type", sa.String()),
        sa.Column(
            "status",
            sa.Enum(
                "not_contacted", "contacted", "responded",
                "negotiating", "confirmed", "declined",
                name="contactstatus",
            ),
            nullable=False,
            server_default="not_contacted",
        ),
        sa.Column("last_contacted_date", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "email_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "email_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "oauth_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service", sa.String(), nullable=False, unique=True),
        sa.Column("token_data", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("oauth_tokens")
    op.drop_table("email_templates")
    op.drop_table("email_logs")
    op.drop_table("contacts")
    op.drop_table("categories")
    op.drop_table("projects")
    op.execute("DROP TYPE IF EXISTS contactstatus")
