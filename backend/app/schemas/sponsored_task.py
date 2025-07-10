# app/schemas/sponsored_task.py
from pydantic import BaseModel
from enum import Enum

class DurationOption(str, Enum):
    one_day = "1_day"
    five_days = "5_days"
    fifteen_days = "15_days"

class UserSponsoredTaskCreate(BaseModel):
    title: str
    description: str
    zp_reward: int # The reward the poster wants to give to each user who completes it
    external_link: str # Link to the social media post, etc.
    duration: DurationOption