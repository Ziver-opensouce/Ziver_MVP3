"""
Defines the application's configuration settings.

This module loads settings from a .env file and makes them available
throughout the application via a singleton `settings` instance.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    """
    # Configure Pydantic to load environment variables from a .env file
    # and ignore any extra variables that are not defined in this model.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Name for the authenticator app (e.g., "Ziver (user@example.com)")
    APP_NAME: str = "Ziver"

    # Ziver specific configurations (Phase 1)
    ZP_DAILY_CHECKIN_BONUS: int = 50
    MINING_CYCLE_HOURS: int = 4
    INITIAL_MINING_RATE_ZP_PER_HOUR: int = 10
    INITIAL_MINING_CAPACITY_ZP: int = 50
    MAX_REFERRALS_PER_USER: int = 20
    REFERRAL_INITIAL_ZP_REWARD: int = 1000
    REFERRAL_DAILY_STREAK_ZP_BONUS: int = 50
    REFERRAL_DELETION_ZP_COST_PERCENTAGE: float = 0.5


# Create a single settings instance to be used throughout the application
settings = Settings()
