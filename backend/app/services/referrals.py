"""
Service layer for handling all user referral logic, including tracking,
listing, and managing referrals.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db import models
from app.schemas import referral as referral_schemas


def get_referral_link(user_id: int) -> str:
    """Generates a unique referral link for a given user."""
    # For now, the link directly uses the user ID.
    # This will be constructed and shared by the frontend.
    return f"https://ziver.app/refer?ref={user_id}"


def track_referral(db: Session, referrer_id: int, referred_email: str):
    """
    Creates a referral relationship after a new user registers.
    Awards ZP to the referrer.
    """
    referrer = db.query(models.User).filter(models.User.id == referrer_id).first()
    if not referrer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Referrer not found."
        )

    referred_user = db.query(models.User).filter(models.User.email == referred_email).first()
    if not referred_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referred user account not found.",
        )

    if referrer_id == referred_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot refer yourself."
        )

    # Check if the new user has already been referred by someone else
    if db.query(models.Referral).filter(
        models.Referral.referred_id == referred_user.id
    ).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user has already been referred.",
        )

    # Check if the referrer has reached their referral limit
    if (
        db.query(models.Referral)
        .filter(models.Referral.referrer_id == referrer_id)
        .count()
        >= settings.MAX_REFERRALS_PER_USER
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Referrer has reached maximum active referrals.",
        )

    db_referral = models.Referral(
        referrer_id=referrer_id, referred_id=referred_user.id, status="completed"
    )
    db.add(db_referral)

    # Award initial ZP to the referrer
    referrer.zp_balance += settings.REFERRAL_INITIAL_ZP_REWARD
    referrer.social_capital_score += settings.REFERRAL_INITIAL_ZP_REWARD
    db.add(referrer)

    db.commit()
    db.refresh(db_referral)
    return db_referral


def get_referred_users(db: Session, referrer_id: int):
    """Lists all users referred by a specific referrer."""
    referrals = (
        db.query(models.Referral)
        .options(joinedload(models.Referral.referred_user))
        .filter(models.Referral.referrer_id == referrer_id)
        .all()
    )

    # Using a list comprehension for a cleaner look
    return [
        referral_schemas.ReferralResponse(
            id=r.id,
            referrer_id=r.referrer_id,
            referred_id=r.referred_id,
            status=r.status,
            created_at=r.created_at,
            referred_user_email=r.referred_user.email if r.referred_user else None,
            referred_user_full_name=r.referred_user.full_name
            if r.referred_user
            else None,
        )
        for r in referrals
    ]


def ping_referred_user(referred_user_id: int):
    """(Placeholder) Sends a reminder/ping to a referred user."""
    # This would integrate with a notification service (e.g., Telegram Bot API)
    print(f"Pinged user with ID: {referred_user_id}")
    return {"message": f"Ping request sent to referred user {referred_user_id}."}


def delete_referral(db: Session, referrer: models.User, referral_id: int):
    """Deletes a referral and deducts a ZP cost from the referrer."""
    referral = (
        db.query(models.Referral)
        .filter(
            models.Referral.id == referral_id,
            models.Referral.referrer_id == referrer.id,
        )
        .first()
    )

    if not referral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral not found or does not belong to this user.",
        )

    # Simplified cost calculation based on the initial reward
    zp_earned = settings.REFERRAL_INITIAL_ZP_REWARD
    cost_to_delete = int(zp_earned * settings.REFERRAL_DELETION_ZP_COST_PERCENTAGE)

    if referrer.zp_balance < cost_to_delete:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient ZP. Cost to delete is {cost_to_delete} ZP.",
        )

    referrer.zp_balance -= cost_to_delete
    db.delete(referral)
    db.add(referrer)
    db.commit()

    return {
        "message": f"Referral deleted successfully. {cost_to_delete} ZP deducted.",
        "new_zp_balance": referrer.zp_balance,
    }

