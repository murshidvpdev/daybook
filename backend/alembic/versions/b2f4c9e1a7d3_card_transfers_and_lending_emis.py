"""card transfers and lending EMIs

Revision ID: b2f4c9e1a7d3
Revises: 7558766a1be0
Create Date: 2026-10-03 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b2f4c9e1a7d3'
down_revision: str | Sequence[str] | None = '7558766a1be0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'transactions', sa.Column('is_transfer', sa.Boolean(), server_default=sa.false(), nullable=False)
    )
    op.add_column('emis', sa.Column('lending_id', sa.Uuid(), nullable=True))
    op.add_column('emis', sa.Column('conversion_transaction_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_emis_lending_id'), 'emis', ['lending_id'], unique=False)
    op.create_foreign_key(
        op.f('emis_lending_id_fkey'), 'emis', 'lendings', ['lending_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        op.f('emis_conversion_transaction_id_fkey'),
        'emis',
        'transactions',
        ['conversion_transaction_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f('emis_conversion_transaction_id_fkey'), 'emis', type_='foreignkey')
    op.drop_constraint(op.f('emis_lending_id_fkey'), 'emis', type_='foreignkey')
    op.drop_index(op.f('ix_emis_lending_id'), table_name='emis')
    op.drop_column('emis', 'conversion_transaction_id')
    op.drop_column('emis', 'lending_id')
    op.drop_column('transactions', 'is_transfer')
