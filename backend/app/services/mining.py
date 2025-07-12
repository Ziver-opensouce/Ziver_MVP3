"""
Service layer for handling all ZP mining-related logic,
including starting cycles, claiming rewards, and upgrading miners.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import models
from app.schemas import mining as mining_schemas


def start_mining(db: Session, user: models.User):
    """
    Starts the ZP mining cycle for a user.
    A user cannot start a new cycle if one is already active.
    """
    if user.mining_started_at:
        mining_end_time = user.mining_started_at + timedelta(
            hours=user.current_mining_cycle_hours
        )
        if datetime.now(timezone.utc) < mining_end_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mining is already active. Claim available after {mining_end_time.isoformat()}",
            )

    user.mining_started_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "message": "Mining started successfully.",
        "mining_ends_at": user.mining_started_at
        + timedelta(hours=user.current_mining_cycle_hours),
    }


def claim_zp(db: Session, user: models.User):
    """
    Calculates and claims ZP earned by the user.
    Also handles the daily check-in bonus and streak logic.
    """
    if not user.mining_started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active mining session to claim from.",
        )

    time_since_started = datetime.now(timezone.utc) - user.mining_started_at
    mining_duration_seconds = min(
        time_since_started.total_seconds(), user.current_mining_cycle_hours * 3600
    )
    zp_earned_raw = (
        mining_duration_seconds / 3600
    ) * user.current_mining_rate_zp_per_hour
    zp_earned = min(int(zp_earned_raw), user.current_mining_capacity_zp)

    # Handle daily check-in bonus and streak
    today = datetime.now(timezone.utc).date()
    zp_bonus = 0
    if user.last_checkin_date != today:
        zp_bonus = settings.ZP_DAILY_CHECKIN_BONUS
        is_consecutive = user.last_checkin_date and (
            today - user.last_checkin_date
        ).days == 1

        if is_consecutive:
            user.daily_streak_count += 1
        else:
            user.daily_streak_count = 1  # Reset streak

        user.last_checkin_date = today

    total_zp_to_add = zp_earned + zp_bonus
    user.zp_balance += total_zp_to_add
    user.mining_started_at = None  # Reset mining session
    user.last_claim_at = datetime.now(timezone.utc)
    user.social_capital_score += zp_earned

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": f"Successfully claimed {total_zp_to_add} ZP.",
        "zp_claimed": total_zp_to_add,
        "new_zp_balance": user.zp_balance,
    }


def upgrade_miner(
    db: Session, user: models.User, upgrade_req: mining_schemas.MinerUpgradeRequest
):
    """Upgrades the user's miner capabilities based on ZP cost."""
    upgrade_costs = {
        "mining_speed": {
            1: {"cost_zp": 150, "value": 15},
            2: {"cost_zp": 450, "value": 20},
            3: {"cost_zp": 700, "value": 30},
            4: {"cost_zp": 1000, "value": 50},
            5: {"cost_zp": 2500, "value": 100},
        },
        "mining_capacity": {
            1: {"cost_zp": 200, "value": 150},
            2: {"cost_zp": 350, "value": 300},
            3: {"cost_zp": 650, "value": 700},
            4: {"cost_zp": 850, "value": 1000},
            5: {"cost_zp": 1350, "value": 1800},
        },
        "mining_hours": {
            1: {"cost_zp": 250, "value": 3},
            2: {"cost_zp": 500, "value": 4},
            3: {"cost_zp": 700, "value": 5},
            4: {"cost_zp": 1000, "value": 6},
            5: {"cost_zp": 1650, "value": 7},
        },
    }

    upgrade_info = upgrade_costs.get(upgrade_req.upgrade_type)
    if not upgrade_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid upgrade type."
        )

    target_level_data = upgrade_info.get(upgrade_req.level)
    if not target_level_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unavailable upgrade level.",
        )

    cost_zp = target_level_data["cost_zp"]
    if user.zp_balance < cost_zp:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient ZP balance. Need {cost_zp} ZP.",
        )

    user.zp_balance -= cost_zp

    # Apply upgrade
    if upgrade_req.upgrade_type == "mining_speed":
        user.current_mining_rate_zp_per_hour = target_level_data["value"]
    elif upgrade_req.upgrade_type == "mining_capacity":
        user.current_mining_capacity_zp = target_level_data["value"]
    elif upgrade_req.upgrade_type == "mining_hours":
        user.current_mining_cycle_hours = target_level_data["value"]

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": f"Miner {upgrade_req.upgrade_type} upgraded to level {upgrade_req.level}.",
        "new_mining_rate_zp_per_hour": user.current_mining_rate_zp_per_hour,
        "new_mining_capacity_zp": user.current_mining_capacity_zp,
        "new_mining_cycle_hours": user.current_mining_cycle_hours,
        "new_zp_balance": user.zp_balance,
        "cost_in_zp": cost_zp,
    }


