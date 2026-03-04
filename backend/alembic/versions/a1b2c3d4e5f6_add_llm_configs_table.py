"""add llm_configs table and remove projects.llm_config column

Revision ID: a1b2c3d4e5f6
Revises: bd728b6c2079
Create Date: 2026-02-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'bd728b6c2079'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'llm_configs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('provider', sa.String(100), nullable=False, server_default='openai'),
        sa.Column('model', sa.String(200), nullable=False, server_default='gpt-4o-mini'),
        sa.Column('api_key', sa.String(500), nullable=False, server_default=''),
        sa.Column('base_url', sa.String(500), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.drop_column('projects', 'llm_config')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('projects', sa.Column('llm_config', sa.JSON(), nullable=True))
    op.drop_table('llm_configs')
