"""One-off admin account creation — deliberately not an API endpoint.

Run with: uv run python3 scripts/create_admin.py
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
    password = getpass.getpass("Admin password: ")
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        return
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords didn't match.")
        return

    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(AdminUser).where(AdminUser.email == email))
        if existing is not None:
            print(f"An admin with email {email} already exists.")
            return
        db.add(AdminUser(email=email, hashed_password=hash_password(password)))
        await db.commit()
        print(f"Admin account created: {email}")


if __name__ == "__main__":
    asyncio.run(main())
