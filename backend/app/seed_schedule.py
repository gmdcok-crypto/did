"""기본 스케줄 시드: 기본 그룹에 빈 캠페인/스케줄만 생성 (재생할 이미지는 CMS에서 등록 후 선택).
실행: python -m app.seed_schedule
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import DeviceGroup, Campaign, Schedule


async def main():
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(DeviceGroup).where(DeviceGroup.name == "기본"))
        group = r.scalar_one_or_none()
        if not group:
            print("Device group '기본' not found. Run python -m app.init_db first.")
            return

        r = await db.execute(select(Schedule).limit(1))
        if r.scalar_one_or_none() is not None:
            print("Schedule already exists. Skip seed.")
            return

        now = datetime.utcnow()
        start = now
        end = now + timedelta(days=365)

        campaign = Campaign(name="기본 캠페인", start_at=start, end_at=end, priority=0)
        db.add(campaign)
        await db.flush()

        schedule = Schedule(
            name="기본 스케줄",
            campaign_id=campaign.id,
            device_group_id=group.id,
            layout_id="full",
            layout_config={"content_ids": []},
            is_active=True,
        )
        db.add(schedule)
        await db.commit()
        print("Created seed: empty campaign + schedule for group '기본'. Add media in CMS and assign to this campaign/schedule.")


if __name__ == "__main__":
    asyncio.run(main())
