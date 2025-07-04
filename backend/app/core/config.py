from pydantic_settings import BaseSettings, SettingsConfigDict
import os

class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    """
    # Configure Pydantic to load environment variables from a .env file
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 # Default to 60 minutes for JWT

    # Ziver specific configurations (Phase 1)
    ZP_DAILY_CHECKIN_BONUS: int = 50 # ZP awarded for daily check-in
    MINING_CYCLE_HOURS: int = 4 # Duration of one mining cycle
    INITIAL_MINING_RATE_ZP_PER_HOUR: int = 10 # ZP mined per hour at base level
    INITIAL_MINING_CAPACITY_ZP: int = 50 # Max ZP that can be mined in one cycle at base level
    MAX_REFERRALS_PER_USER: int = 20 # Maximum number of active referrals a user can have
    REFERRAL_INITIAL_ZP_REWARD: int = 1000 # ZP for a successful new referral
    REFERRAL_DAILY_STREAK_ZP_BONUS: int = 50 # ZP for referred friend maintaining streak
    REFERRAL_DELETION_ZP_COST_PERCENTAGE: float = 0.5 # Percentage of earned ZP lost when deleting a referral

# Create a settings instance to be used throughout the application
settings = Settings()

# You can print settings here to verify they are loaded correctly (for debugging)
# print(f"Database URL: {settings.DATABASE_URL}")
# print(f"Secret Key loaded: {'Yes' if settings.SECRET_KEY else 'No'}")
