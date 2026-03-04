"""add academic_title to work_experiences

Revision ID: d1e2f3a4b5c6
Revises: c3d4e5f6a7b8
Create Date: 2026-03-02
"""
from alembic import op

revision = 'd1e2f3a4b5c6'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE work_experiences ADD COLUMN academic_title VARCHAR(100)")


def downgrade():
    op.execute("ALTER TABLE work_experiences DROP COLUMN academic_title")
