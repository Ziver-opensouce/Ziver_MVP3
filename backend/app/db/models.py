from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, Float, Text, ForeignKey, Date
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class User(Base):
    """Represents a user in the Ziver application."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    telegram_handle = Column(String, unique=True, index=True, nullable=True)
    twitter_handle = Column(String, unique=True, index=True, nullable=True)
    zp_balance = Column(Integer, default=0, nullable=False)
    social_capital_score = Column(Integer, default=0, nullable=False)
    last_checkin_date = Column(Date, default=None, nullable=True)

    # Mining related fields
    current_mining_rate_zp_per_hour = Column(Integer, default=10, nullable=False)
    current_mining_capacity_zp = Column(Integer, default=50, nullable=False)
    current_mining_cycle_hours = Column(Integer, default=4, nullable=False)
    mining_started_at = Column(DateTime(timezone=True), default=None, nullable=True)
    last_claim_at = Column(DateTime(timezone=True), default=None, nullable=True)
    daily_streak_count = Column(Integer, default=0, nullable=False)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 2FA fields
    two_fa_secret = Column(String, nullable=True)
    is_2fa_enabled = Column(Boolean, default=False)

    # Wallet field
    ton_wallet_address = Column(String, unique=True, nullable=True, index=True)

    # Relationships
    referred_users = relationship("Referral", foreign_keys="Referral.referrer_id", back_populates="referrer_user")
    referrer_of = relationship("Referral", foreign_keys="Referral.referred_id", back_populates="referred_user")
    task_completions = relationship("UserTaskCompletion", back_populates="user")
    posted_microjobs = relationship("MicroJob", back_populates="poster")
    microjob_submissions = relationship("MicroJobSubmission", back_populates="worker")
    posted_tasks = relationship("Task", back_populates="poster") # Relationship for sponsored tasks


class Referral(Base):
    """Represents a referral link relationship between two users."""
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    referred_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    status = Column(String, default="pending", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    referrer_user = relationship("User", foreign_keys=[referrer_id], back_populates="referred_users")
    referred_user = relationship("User", foreign_keys=[referred_id], back_populates="referrer_of")


class Task(Base):
    """Represents an interactive task users can complete for ZP."""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=False)
    zp_reward = Column(Integer, nullable=False)
    type = Column(String, nullable=False)
    external_link = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # --- Fields for sponsored tasks ---
    poster_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    expiration_date = Column(DateTime(timezone=True), nullable=True)
    # --- End of sponsored task fields ---

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user_completions = relationship("UserTaskCompletion", back_populates="task")
    poster = relationship("User", back_populates="posted_tasks") # Relationship back to the user


class UserTaskCompletion(Base):
    """Records a user's completion of a specific task."""
    __tablename__ = "user_task_completions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    completed_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="completed", nullable=False)

    user = relationship("User", back_populates="task_completions")
    task = relationship("Task", back_populates="user_completions")


class MicroJob(Base):
    """Represents a micro-job posted by a user in the marketplace."""
    __tablename__ = "microjobs"

    id = Column(Integer, primary_key=True, index=True)
    poster_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=False)
    ton_payment_amount = Column(Float, nullable=False)
    status = Column(String, default="open", nullable=False)
    expiration_date = Column(DateTime(timezone=True), nullable=True)
    verification_criteria = Column(Text, nullable=False)
    ziver_fee_percentage = Column(Float, default=0.05, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    poster = relationship("User", back_populates="posted_microjobs")
    submissions = relationship("MicroJobSubmission", back_populates="microjob")


class MicroJobSubmission(Base):
    """Represents a worker's submission for a micro-job."""
    __tablename__ = "microjob_submissions"

    id = Column(Integer, primary_key=True, index=True)
    microjob_id = Column(Integer, ForeignKey("microjobs.id"), nullable=False)
    worker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    submission_details = Column(Text, nullable=False)
    status = Column(String, default="submitted", nullable=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    microjob = relationship("MicroJob", back_populates="submissions")
    worker = relationship("User", back_populates="microjob_submissions")


class ChatMessage(Base):
    """Represents a chat message associated with a micro-job."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    microjob_id = Column(Integer, ForeignKey("microjobs.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    microjob = relationship("MicroJob")

