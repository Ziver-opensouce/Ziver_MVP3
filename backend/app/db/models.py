from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, Text, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base
import datetime

class User(Base):
    """
    Represents a user in the Ziver application.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    telegram_handle = Column(String, unique=True, index=True, nullable=True)
    twitter_handle = Column(String, unique=True, index=True, nullable=True)
    zp_balance = Column(Integer, default=0, nullable=False)
    social_capital_score = Column(Integer, default=0, nullable=False)
    last_checkin_date = Column(Date, default=None, nullable=True) # For daily streak tracking

    # Mining related fields
    current_mining_rate_zp_per_hour = Column(Integer, default=10, nullable=False)
    current_mining_capacity_zp = Column(Integer, default=50, nullable=False)
    current_mining_cycle_hours = Column(Integer, default=4, nullable=False)
    mining_started_at = Column(DateTime(timezone=True), default=None, nullable=True)
    last_claim_at = Column(DateTime(timezone=True), default=None, nullable=True) # Last time ZP was claimed
    daily_streak_count = Column(Integer, default=0, nullable=False) # Consecutive days of mining/check-ins

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # --- ADDED THESE TWO NEW LINES FOR 2FA ---
    two_fa_secret = Column(String, nullable=True) # Stores the base32 secret for TOTP
    is_2fa_enabled = Column(Boolean, default=False)

    ton_wallet_address = Column(String, unique=True, nullable=True, index=True) # <-- ADD THIS LINE

    # --- END OF 2FA ADDITION ---

    # Relationships
    referred_users = relationship("Referral", foreign_keys="Referral.referrer_id", back_populates="referrer_user")
    referrer_of = relationship("Referral", foreign_keys="Referral.referred_id", back_populates="referred_user")
    task_completions = relationship("UserTaskCompletion", back_populates="user")
    posted_microjobs = relationship("MicroJob", back_populates="poster")
    microjob_submissions = relationship("MicroJobSubmission", back_populates="worker")


class Referral(Base):
    """
    Represents a referral link relationship between two users.
    """
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    referred_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False) # Each user can only be referred once

    status = Column(String, default="pending", nullable=False) # e.g., 'pending', 'completed' (when referred user signs up and maybe takes first action)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    referrer_user = relationship("User", foreign_keys=[referrer_id], back_populates="referred_users")
    referred_user = relationship("User", foreign_keys=[referred_id], back_populates="referrer_of")


class Task(Base):
    """
    Represents an interactive task users can complete for ZP.
    """
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=False)
    zp_reward = Column(Integer, nullable=False)
    type = Column(String, nullable=False) # e.g., 'in_app', 'external', 'sponsored'
    external_link = Column(String, nullable=True) # URL for external tasks
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user_completions = relationship("UserTaskCompletion", back_populates="task")


class UserTaskCompletion(Base):
    """
    Records a user's completion of a specific task.
    """
    __tablename__ = "user_task_completions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    completed_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="completed", nullable=False) # e.g., 'completed', 'pending_verification'

    # Relationships
    user = relationship("User", back_populates="task_completions")
    task = relationship("Task", back_populates="user_completions")


class MicroJob(Base):
    """
    Represents a micro-job posted by a user (or project) in the marketplace.
    """
    __tablename__ = "microjobs"

    id = Column(Integer, primary_key=True, index=True)
    poster_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=False)
    ton_payment_amount = Column(Float, nullable=False) # Payment in TON or Telegram Stars (represented as TON for now)
    status = Column(String, default="open", nullable=False) # e.g., 'open', 'in_progress', 'completed', 'disputed'
    expiration_date = Column(DateTime(timezone=True), nullable=True) # For time-based listing
    verification_criteria = Column(Text, nullable=False) # Instructions for job completion verification
    ziver_fee_percentage = Column(Float, default=0.05, nullable=False) # Ziver's fee (e.g., 5%)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    poster = relationship("User", back_populates="posted_microjobs")
    submissions = relationship("MicroJobSubmission", back_populates="microjob")


class MicroJobSubmission(Base):
    """
    Represents a worker's submission for a micro-job.
    """
    __tablename__ = "microjob_submissions"

    id = Column(Integer, primary_key=True, index=True)
    microjob_id = Column(Integer, ForeignKey("microjobs.id"), nullable=False)
    worker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    submission_details = Column(Text, nullable=False) # e.g., proof link, text description
    status = Column(String, default="submitted", nullable=False) # e.g., 'submitted', 'approved', 'rejected'
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True) # When the poster reviewed it

    # Relationships
    microjob = relationship("MicroJob", back_populates="submissions")
    worker = relationship("User", back_populates="microjob_submissions")
