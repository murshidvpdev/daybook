"""emi principal amount

Revision ID: 86d1f43c6a57
Revises: 15418442fa1c
Create Date: 2026-10-21 20:52:14.235105

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '86d1f43c6a57'
down_revision: str | Sequence[str] | None = '15418442fa1c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('emis', sa.Column('principal_amount', sa.Numeric(precision=12, scale=2), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('emis', 'principal_amount')
