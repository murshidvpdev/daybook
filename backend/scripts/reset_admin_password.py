"""Reset an existing admin's password — the counterpart to create_admin.py,
which refuses to touch an admin that already exists. Also deliberately not an
API endpoint.

Run with: uv run python3 scripts/reset_admin_password.py
In production: docker exec -it daybook-api uv run python3 scripts/reset_admin_password.py
"""

import asyncio
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.admin import AdminUser


async def main() -> None:
    email = input("Admin email: ").strip().lower()
    if not email:
        print("Email is required.")
        return

    async with AsyncSessionLocal() as db:
        admin = await db.scalar(select(AdminUser).where(AdminUser.email == email))
        if admin is None:
            emails = (await db.scalars(select(AdminUser.email).order_by(AdminUser.email))).all()
            print(f"No admin with email {email}. Existing admins: {', '.join(emails) or 'none'}")
            return

        password = getpass.getpass("New password: ")
        if len(password) < 8:
            print("Password must be at least 8 characters.")
            return
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Passwords didn't match.")
            return

        admin.hashed_password = hash_password(password)
        await db.commit()
        print(f"Password reset for admin: {email}")


if __name__ == "__main__":
    asyncio.run(main())
