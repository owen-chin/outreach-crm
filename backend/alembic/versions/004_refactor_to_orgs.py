"""refactor contacts to organizations/people/threads

Revision ID: 004
Revises: 003
Create Date: 2026-07-04

"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Create organizations (references existing contactstatus enum via raw SQL)
    conn.execute(sa.text("""
        CREATE TABLE organizations (
            id SERIAL PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            name VARCHAR NOT NULL,
            website VARCHAR,
            ask_type VARCHAR,
            status contactstatus NOT NULL DEFAULT 'not_contacted',
            last_contacted_date TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            _contact_id INTEGER
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO organizations
            (category_id, name, ask_type, status, last_contacted_date, notes, created_at, updated_at, _contact_id)
        SELECT category_id, company_name, ask_type, status, last_contacted_date, notes, created_at, updated_at, id
        FROM contacts
    """))

    # 2. Create people
    conn.execute(sa.text("""
        CREATE TABLE people (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR,
            email VARCHAR,
            title VARCHAR,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO people (organization_id, name, email, created_at)
        SELECT o.id, c.contact_name, c.email, c.created_at
        FROM contacts c
        JOIN organizations o ON o._contact_id = c.id
        WHERE c.contact_name IS NOT NULL OR c.email IS NOT NULL
    """))

    # 3. Create threads
    conn.execute(sa.text("""
        CREATE TABLE threads (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            gmail_thread_id VARCHAR NOT NULL,
            subject VARCHAR,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO threads (organization_id, gmail_thread_id, created_at)
        SELECT o.id, c.gmail_thread_id, c.created_at
        FROM contacts c
        JOIN organizations o ON o._contact_id = c.id
        WHERE c.gmail_thread_id IS NOT NULL
    """))

    # 4. Update email_logs: add thread_id + supporting columns, migrate data
    op.add_column("email_logs", sa.Column("thread_id", sa.Integer(), nullable=True))
    op.add_column("email_logs", sa.Column("to_email", sa.String(), nullable=True))
    op.add_column("email_logs", sa.Column("cc_emails", sa.String(), nullable=True))

    conn.execute(sa.text("""
        UPDATE email_logs el
        SET thread_id = t.id
        FROM threads t
        JOIN organizations o ON t.organization_id = o.id
        WHERE o._contact_id = el.contact_id
    """))

    # Drop email_logs that couldn't be linked (contact had no gmail_thread_id)
    conn.execute(sa.text("DELETE FROM email_logs WHERE thread_id IS NULL"))

    op.alter_column("email_logs", "thread_id", nullable=False)
    op.create_foreign_key(
        "fk_email_logs_thread_id", "email_logs", "threads", ["thread_id"], ["id"], ondelete="CASCADE"
    )

    # CASCADE removes the FK constraint on contact_id automatically
    conn.execute(sa.text("ALTER TABLE email_logs DROP COLUMN contact_id CASCADE"))

    # 5. Remove temp migration column and drop old table
    op.drop_column("organizations", "_contact_id")
    op.drop_table("contacts")


def downgrade() -> None:
    raise NotImplementedError("Downgrade not supported for migration 004")
