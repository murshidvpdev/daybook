"""emi debits from any account, lending links a transaction

Revision ID: 3a917ec19c40
Revises: 27186433c65c
Create Date: 2026-09-11 15:54:26.806569

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3a917ec19c40'
down_revision: str | Sequence[str] | None = '27186433c65c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable first, then backfill from the credit card any existing EMI pointed
    # at, then tighten to NOT NULL — safe even if this runs against a database
    # that already has EMI rows, not just an empty one.
    op.add_column('emis', sa.Column('account_id', sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE emis
        SET account_id = credit_cards.account_id
        FROM credit_cards
        WHERE credit_cards.id = emis.credit_card_id
        """
    )
    op.alter_column('emis', 'account_id', nullable=False)

    op.drop_index(op.f('ix_emis_credit_card_id'), table_name='emis')
    op.create_index(op.f('ix_emis_account_id'), 'emis', ['account_id'], unique=False)
    op.drop_constraint(op.f('emis_credit_card_id_fkey'), 'emis', type_='foreignkey')
    op.create_foreign_key(None, 'emis', 'financial_accounts', ['account_id'], ['id'], ondelete='CASCADE')
    op.drop_column('emis', 'credit_card_id')
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # Only reversible for EMIs that were actually on a credit card account — any
    # EMI debited straight from a bank account has no credit_card_id to go back to
    # and will fail the NOT NULL below; that's expected, not a bug in the migration.
    op.add_column('emis', sa.Column('credit_card_id', sa.UUID(), autoincrement=False, nullable=True))
    op.execute(
        """
        UPDATE emis
        SET credit_card_id = credit_cards.id
        FROM credit_cards
        WHERE credit_cards.account_id = emis.account_id
        """
    )
    op.alter_column('emis', 'credit_card_id', nullable=False)

    op.drop_constraint(None, 'emis', type_='foreignkey')
    op.create_foreign_key(op.f('emis_credit_card_id_fkey'), 'emis', 'credit_cards', ['credit_card_id'], ['id'], ondelete='CASCADE')
    op.drop_index(op.f('ix_emis_account_id'), table_name='emis')
    op.create_index(op.f('ix_emis_credit_card_id'), 'emis', ['credit_card_id'], unique=False)
    op.drop_column('emis', 'account_id')
    # ### end Alembic commands ###
