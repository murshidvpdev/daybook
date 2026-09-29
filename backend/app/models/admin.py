from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class AdminUser(Base, UUIDPKMixin, TimestampMixin):
    """Deliberately its own table, not a role flag on `User` — an admin session
    is authenticated and authorized entirely separately (own JWT secret, own
    login endpoint) so a compromised regular-user token can never grant admin
    access. Never created via any public API — see scripts/create_admin.py."""

    __tablename__ = "admin_users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
