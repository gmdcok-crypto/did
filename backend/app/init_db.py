"""Create initial admin user and default device group. Run: python -m app.init_db"""
import asyncio
from sqlalchemy import select
from app.database import engine, AsyncSessionLocal, Base
from app.models import User, DeviceGroup
from app.auth import get_password_hash
from app.default_admin import DEFAULT_ADMIN_LOGIN, DEFAULT_ADMIN_PASSWORD


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.email == DEFAULT_ADMIN_LOGIN))
        if r.scalar_one_or_none() is None:
            u = User(
                email=DEFAULT_ADMIN_LOGIN,
                hashed_password=get_password_hash(DEFAULT_ADMIN_PASSWORD),
                role="admin",
            )
            db.add(u)
            await db.commit()
            print(f"Created admin user: {DEFAULT_ADMIN_LOGIN} / {DEFAULT_ADMIN_PASSWORD}")
        else:
            print("Admin user already exists")

        r = await db.execute(select(DeviceGroup).where(DeviceGroup.name == "기본"))
        if r.scalar_one_or_none() is None:
            g = DeviceGroup(name="기본", orientation="landscape")
            db.add(g)
            await db.commit()
            print("Created device group: 기본")
        else:
            print("Device group '기본' already exists")


if __name__ == "__main__":
    asyncio.run(main())
