from app.database import Base

from app.models.user import User  # noqa
from app.models.device import Device, DeviceGroup  # noqa
from app.models.campaign import Campaign, CampaignContent  # noqa
from app.models.content import Content  # noqa
from app.models.schedule import Schedule, ScheduleSlot  # noqa
from app.models.event import PlaybackEvent  # noqa
from app.models.app_setting import AppSetting  # noqa
from app.models.deployment_record import DeploymentRecord  # noqa

__all__ = [
    "Base",
    "User",
    "Device",
    "DeviceGroup",
    "Campaign",
    "CampaignContent",
    "Content",
    "Schedule",
    "ScheduleSlot",
    "PlaybackEvent",
    "AppSetting",
    "DeploymentRecord",
]
