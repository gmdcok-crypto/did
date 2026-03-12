"""Create initial admin user and default device group. Run: python -m app.init_db"""
import asyncio
from app.database import engine, AsyncSessionLocal, Base
from app.models import User, DeviceGroup
from app.auth import get_password_hash


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        r = await db.execute(select(User).where(User.email == "admin@example.com"))
        if r.scalar_one_or_none() is None:
            u = User(
                email="admin@example.com",
                hashed_password=get_password_hash("admin123"),
                role="admin",
            )
            db.add(u)
            await db.commit()
            print("Created admin user: admin@example.com / admin123")
        else:
            print("Admin user already exists")

        r = await db.execute(select(DeviceGroup).where(DeviceGroup.name == "기본"))
        if r.scalar_one_or_none() is None:
            g = DeviceGroup(name="기본")
            db.add(g)
            await db.commit()
            print("Created device group: 기본")
        else:
            print("Device group '기본' already exists")


if __name__ == "__main__":
    asyncio.run(main())
