"""account last checked on

Revision ID: c8d1e5f2a9b4
Revises: b2f4c9e1a7d3
Create Date: 2026-10-21 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c8d1e5f2a9b4'
down_revision: str | Sequence[str] | None = 'b2f4c9e1a7d3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('financial_accounts', sa.Column('last_checked_on', sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('financial_accounts', 'last_checked_on')
