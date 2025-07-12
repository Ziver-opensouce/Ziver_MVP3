"""
Defines the application's configuration settings.

This module loads settings from a .env file and makes them available
throughout the application via a singleton `settings` instance.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# This builds the path to the .env file to be in your 'backend' directory
# It finds the path of this config.py file, then goes up two levels.
env_path = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    model_config = SettingsConfigDict(env_file=env_path, extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    APP_NAME: str = "Ziver"

    # Ziver specific configurations
    ZP_DAILY_CHECKIN_BONUS: int = 50
    MINING_CYCLE_HOURS: int = 4
    INITIAL_MINING_RATE_ZP_PER_HOUR: int = 10
    INITIAL_MINING_CAPACITY_ZP: int = 50
    MAX_REFERRALS_PER_USER: int = 20
    REFERRAL_INITIAL_ZP_REWARD: int = 1000
    REFERRAL_DAILY_STREAK_ZP_BONUS: int = 50
    REFERRAL_DELETION_ZP_COST_PERCENTAGE: float = 0.5


settings = Settings()

