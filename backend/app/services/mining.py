from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from app.db import models
from app.schemas import mining as mining_schemas
from app.core.config import settings
from fastapi import HTTPException, status

def start_mining(db: Session, user: models.User):
    """
    Starts the ZP mining cycle for a user.
    """
    if user.mining_started_at:
        # Check if current cycle is still active
        mining_end_time = user.mining_started_at + timedelta(hours=user.current_mining_cycle_hours)
        if datetime.now(timezone.utc) < mining_end_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mining is already active. Next claim available at {mining_end_time.isoformat()}"
            )
        else:
            # Previous cycle ended but not claimed, allow new start after previous one ended
            # Or enforce claim first, current logic allows restart if previous cycle expired
            pass # We'll allow starting a new cycle even if previous wasn't claimed, but ZP won't accumulate

    user.mining_started_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "message": "Mining started successfully.",
        "mining_ends_at": user.mining_started_at + timedelta(hours=user.current_mining_cycle_hours)
    }

def claim_zp(db: Session, user: models.User):
    """
    Calculates and claims ZP earned by the user.
    Handles daily check-in bonus and daily streak.
    """
    if not user.mining_started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active mining session to claim ZP from."
        )

    time_since_started = datetime.now(timezone.utc) - user.mining_started_at
    
    # Calculate mining duration, capped by current_mining_cycle_hours
    mining_duration_seconds = min(
        time_since_started.total_seconds(),
        user.current_mining_cycle_hours * 3600
    )
    
    # Calculate ZP earned based on rate and capped duration
    zp_earned_raw = (mining_duration_seconds / 3600) * user.current_mining_rate_zp_per_hour
    
    # Cap earned ZP by mining capacity
    zp_earned = min(int(zp_earned_raw), user.current_mining_capacity_zp)

    # Handle daily check-in bonus and streak
today = datetime.now(timezone.utc).date()
zp_bonus = 0
if user.last_checkin_date != today:
    zp_bonus = settings.ZP_DAILY_CHECKIN_BONUS
    
    # Correctly check for a streak BEFORE updating the date
    is_consecutive_day = user.last_checkin_date and (today - user.last_checkin_date).days == 1

    if is_consecutive_day:
        user.daily_streak_count += 1
    else:
        user.daily_streak_count = 1
    
    user.last_checkin_date = today

            user.daily_streak_count += 1
        else:
            user.daily_streak_count = 1 # Start/reset streak
    
    total_zp_to_add = zp_earned + zp_bonus

    user.zp_balance += total_zp_to_add
    user.mining_started_at = None  # Reset mining session after claim
    user.last_claim_at = datetime.now(timezone.utc)
    user.social_capital_score += zp_earned # ZP earned contributes to SCS

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": f"Successfully claimed {total_zp_to_add} ZP.",
        "zp_claimed": total_zp_to_add,
        "new_zp_balance": user.zp_balance
    }

def upgrade_miner(db: Session, user: models.User, upgrade_req: mining_schemas.MinerUpgradeRequest):
    """
    Upgrades the user's miner capabilities based on ZP (and later TON) cost.
    """
    # Define upgrade costs and new stats per level (simplified example)
    # In a real app, this would likely be a more complex configuration or database table
    # For MVP, hardcode simple progression
    upgrade_costs_and_stats = {
        "mining_speed": {
            1: {"cost_zp": 100, "rate": 15},
            2: {"cost_zp": 250, "rate": 20},
            3: {"cost_zp": 500, "rate": 25},
            4: {"cost_zp": 1000, "rate": 30},
            # Levels 5+ might require TON/Stars
        },
        "mining_capacity": {
            1: {"cost_zp": 100, "capacity": 75},
            2: {"cost_zp": 250, "capacity": 100},
            3: {"cost_zp": 500, "capacity": 125},
            4: {"cost_zp": 1000, "capacity": 150},
        },
        "mining_hours": {
            1: {"cost_zp": 100, "hours": 6},
            2: {"cost_zp": 250, "hours": 8},
            3: {"cost_zp": 500, "hours": 10},
            4: {"cost_zp": 1000, "hours": 12},
        },
    }

    upgrade_info = upgrade_costs_and_stats.get(upgrade_req.upgrade_type)
    if not upgrade_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid upgrade type."
        )

    target_level_data = upgrade_info.get(upgrade_req.level)
    if not target_level_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unavailable upgrade level."
        )

    cost_zp = target_level_data.get("cost_zp", 0)
    cost_ton = target_level_data.get("cost_ton", 0) # For future TON/Stars integration

    # Check current level to prevent downgrades or re-upgrades to same level if not allowed
    # This requires tracking current level for each upgrade type in User model or dynamically
    # For simplicity, we'll just check if user has enough ZP and then apply
    
    if user.zp_balance < cost_zp:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient ZP balance. Need {cost_zp} ZP."
        )

    user.zp_balance -= cost_zp
    
    # Apply upgrade
    if upgrade_req.upgrade_type == "mining_speed":
        user.current_mining_rate_zp_per_hour = target_level_data["rate"]
    elif upgrade_req.upgrade_type == "mining_capacity":
        user.current_mining_capacity_zp = target_level_data["capacity"]
    elif upgrade_req.upgrade_type == "mining_hours":
        user.current_mining_cycle_hours = target_level_data["hours"]
    
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": f"Miner {upgrade_req.upgrade_type} upgraded to level {upgrade_req.level}.",
        "new_mining_rate_zp_per_hour": user.current_mining_rate_zp_per_hour,
        "new_mining_capacity_zp": user.current_mining_capacity_zp,
        "new_mining_cycle_hours": user.current_mining_cycle_hours,
        "new_zp_balance": user.zp_balance,
        "cost_in_zp": cost_zp
  }
      
