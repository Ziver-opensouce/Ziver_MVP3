from pydantic_settings import BaseSettings, SettingsConfigDict
import os

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ZP_DAILY_CHECKIN_BONUS: int = 50 # Example ZP value
    MINING_CYCLE_HOURS: int = 4
    INITIAL_MINING_RATE_ZP_PER_HOUR: int = 10
    INITIAL_MINING_CAPACITY_ZP: int = 50

settings = Settings()
