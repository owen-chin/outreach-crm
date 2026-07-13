"""scope oauth_tokens and email_templates per-user

Revision ID: 006
Revises: 005
Create Date: 2026-07-12

Both tables were previously global (one Gmail token / one shared template list for
the whole app), which only worked because there was a single user. Adds user_id,
backfilling existing rows to the earliest-created user (the only user at the time
this migration was written) before making the column required.
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("oauth_tokens", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("email_templates", sa.Column("user_id", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE oauth_tokens
        SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
        WHERE user_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE email_templates
        SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
        WHERE user_id IS NULL
        """
    )
    # If no user exists yet, or a token/template somehow outlived its user, drop the
    # orphaned row rather than leaving user_id NULL under a NOT NULL constraint.
    op.execute("DELETE FROM oauth_tokens WHERE user_id IS NULL")
    op.execute("DELETE FROM email_templates WHERE user_id IS NULL")

    op.alter_column("oauth_tokens", "user_id", nullable=False)
    op.alter_column("email_templates", "user_id", nullable=False)

    op.create_foreign_key(
        "fk_oauth_tokens_user_id", "oauth_tokens", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_email_templates_user_id", "email_templates", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )

    op.drop_constraint("oauth_tokens_service_key", "oauth_tokens", type_="unique")
    op.create_unique_constraint(
        "ux_oauth_tokens_service_user", "oauth_tokens", ["service", "user_id"]
    )


def downgrade() -> None:
    op.drop_constraint("ux_oauth_tokens_service_user", "oauth_tokens", type_="unique")
    op.create_unique_constraint("oauth_tokens_service_key", "oauth_tokens", ["service"])

    op.drop_constraint("fk_email_templates_user_id", "email_templates", type_="foreignkey")
    op.drop_constraint("fk_oauth_tokens_user_id", "oauth_tokens", type_="foreignkey")

    op.drop_column("email_templates", "user_id")
    op.drop_column("oauth_tokens", "user_id")
