from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TaskBase(BaseModel):
    """Base schema for task data."""
    title: str
    description: str
    zp_reward: int
    type: str # e.g., 'in_app', 'external', 'sponsored'
    external_link: Optional[str] = None
    is_active: bool = True

class TaskCreate(TaskBase):
    """Schema for creating a new task (e.g., by admin)."""
    pass

class TaskResponse(TaskBase):
    """Schema for returning task data (response model)."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserTaskCompletionCreate(BaseModel):
    """Schema for submitting a task completion."""
    task_id: int
    status: str = "completed" # Can be 'pending_verification' for certain task types

class UserTaskCompletionResponse(BaseModel):
    """Schema for returning user task completion data."""
    id: int
    user_id: int
    task_id: int
    completed_at: datetime
    status: str

    class Config:
        from_attributes = True
      
