"""add tags tables

Revision ID: c3d4e5f6a7b8
Revises: 08fcf247e131
Create Date: 2026-03-02

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = '08fcf247e131'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL UNIQUE
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS paper_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
        )
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS paper_tags")
    op.execute("DROP TABLE IF EXISTS tags")
