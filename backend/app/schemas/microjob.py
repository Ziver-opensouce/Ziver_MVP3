from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta

class MicroJobBase(BaseModel):
    """Base schema for micro-job data."""
    title: str
    description: str
    ton_payment_amount: float = Field(..., gt=0) # Must be positive
    verification_criteria: str
    ziver_fee_percentage: float = Field(0.05, ge=0, le=1) # Ziver's cut (0-1)

class MicroJobCreate(MicroJobBase):
    """Schema for creating a new micro-job."""
    # duration_days: int = Field(7, gt=0) # How many days the job will be active
    # The expiration_date will be calculated in the service layer
    pass

class MicroJobResponse(MicroJobBase):
    """Schema for returning micro-job data (response model)."""
    id: int
    poster_id: int
    status: str
    expiration_date: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MicroJobSubmissionCreate(BaseModel):
    """Schema for a worker submitting a micro-job completion."""
    microjob_id: int
    submission_details: str # E.g., a link to proof, or descriptive text

class MicroJobSubmissionResponse(BaseModel):
    """Schema for returning micro-job submission data."""
    id: int
    microjob_id: int
    worker_id: int
    submission_details: str
    status: str
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MicroJobSubmissionApproval(BaseModel):
    """Schema for poster approving/rejecting a submission."""
    status: str = Field(..., pattern="^(approved|rejected)$") # Must be 'approved' or 'rejected'
  
