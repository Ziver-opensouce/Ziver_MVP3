from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class MiningStartResponse(BaseModel):
    """Schema for response after starting mining."""
    message: str
    mining_ends_at: Optional[datetime] = None

class ZPClaimResponse(BaseModel):
    """Schema for response after claiming ZP."""
    message: str
    zp_claimed: int
    new_zp_balance: int

class MinerUpgradeRequest(BaseModel):
    """Schema for requesting a miner upgrade."""
    upgrade_type: str # e.g., "mining_speed", "mining_capacity", "mining_hours"
    level: int # The target level for the upgrade

class MinerUpgradeResponse(BaseModel):
    """Schema for response after a miner upgrade."""
    message: str
    new_mining_rate_zp_per_hour: int
    new_mining_capacity_zp: int
    new_mining_cycle_hours: int
    new_zp_balance: int
    cost_in_zp: Optional[int] = None
    cost_in_ton: Optional[float] = None # For higher level upgrades
  
