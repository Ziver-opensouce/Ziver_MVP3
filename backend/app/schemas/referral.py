from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ReferralResponse(BaseModel):
    """Schema for returning referral information."""
    id: int
    referrer_id: int
    referred_id: int
    status: str
    created_at: datetime

    # Optionally include referred user's basic info for context
    referred_user_email: Optional[str] = None
    referred_user_full_name: Optional[str] = None

    class Config:
        from_attributes = True

class ReferralLinkResponse(BaseModel):
    """Schema for returning the user's referral link."""
    referral_link: str
  
