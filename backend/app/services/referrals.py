from sqlalchemy.orm import Session, joinedload
from app.db import models
from app.schemas import referral as referral_schemas
from app.core.config import settings
from fastapi import HTTPException, status
import uuid # For generating unique referral IDs/links (optional, could just use user.id)

def get_referral_link(user_id: int) -> str:
    """
    Generates the referral link for a given user.
    For MVP, this can be a simple URL with the user's ID.
    """
    # In a real app, you might use a shorter, unique referral code
    # For now, let's assume the link directly uses the user ID
    # This will be constructed in the frontend or an API gateway
    return f"https://ziver.app/refer?ref={user_id}"

def track_referral(db: Session, referrer_id: int, referred_email: str):
    """
    Tracks a new referral when a user registers via a referral link.
    """
    referrer = db.query(models.User).filter(models.User.id == referrer_id).first()
    if not referrer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referrer not found.")
    
    referred_user = db.query(models.User).filter(models.User.email == referred_email).first()
    if not referred_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referred user (by email) not found.")
    
    if referrer_id == referred_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot refer yourself.")

    # Check if referred user is already referred by someone
    existing_referral_as_referred = db.query(models.Referral)\
                                     .filter(models.Referral.referred_id == referred_user.id)\
                                     .first()
    if existing_referral_as_referred:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This user has already been referred.")

    # Check if referrer has reached max referrals
    current_referrals = db.query(models.Referral)\
                          .filter(models.Referral.referrer_id == referrer_id)\
                          .count()
    if current_referrals >= settings.MAX_REFERRALS_PER_USER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Referrer has reached maximum active referrals.")

    db_referral = models.Referral(
        referrer_id=referrer_id,
        referred_id=referred_user.id,
        status="completed" # Mark as completed on successful sign-up for MVP
    )
    db.add(db_referral)

    # Award initial ZP to referrer
    referrer.zp_balance += settings.REFERRAL_INITIAL_ZP_REWARD
    referrer.social_capital_score += settings.REFERRAL_INITIAL_ZP_REWARD # Referral contributes to SCS
    db.add(referrer)

    db.commit()
    db.refresh(db_referral)
    db.refresh(referrer)

    return db_referral

def get_referred_users(db: Session, referrer_id: int):
    """
    Lists users referred by a specific referrer.
    Includes basic info of the referred user.
    """
    # Eager load referred_user relationship for efficiency
    referrals = db.query(models.Referral)\
                  .options(joinedload(models.Referral.referred_user))\
                  .filter(models.Referral.referrer_id == referrer_id)\
                  .all()
    
    result = []
    for r in referrals:
        referred_user_data = {
            "id": r.id,
            "referrer_id": r.referrer_id,
            "referred_id": r.referred_id,
            "status": r.status,
            "created_at": r.created_at,
            "referred_user_email": r.referred_user.email if r.referred_user else None,
            "referred_user_full_name": r.referred_user.full_name if r.referred_user else None,
        }
        result.append(referral_schemas.ReferralResponse(**referred_user_data))
    return result

def ping_referred_user(referred_user_id: int):
    """
    (Placeholder) Sends a reminder/ping to a referred user.
    This would integrate with Telegram API or notification service.
    """
    # In a real scenario, this would involve sending a Telegram message
    # via the Telegram Bot API or similar. For now, it's a conceptual function.
    print(f"Pinged user with ID: {referred_user_id}")
    return {"message": f"Ping request sent to referred user {referred_user_id}."}

def delete_referral(db: Session, referrer: models.User, referral_id: int):
    """
    Deletes a referral and deducts ZP cost from the referrer.
    """
    referral = db.query(models.Referral)\
                 .filter(models.Referral.id == referral_id, models.Referral.referrer_id == referrer.id)\
                 .first()
    
    if not referral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral not found or does not belong to this user."
        )
    
    # Calculate ZP earned from this referral (simplified: assumed based on initial reward)
    # In a more complex system, this might track actual ZP earned from this specific referral
    zp_earned_from_this_referral = settings.REFERRAL_INITIAL_ZP_REWARD 
    
    cost_to_delete = int(zp_earned_from_this_referral * settings.REFERRAL_DELETION_ZP_COST_PERCENTAGE)

    if referrer.zp_balance < cost_to_delete:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient ZP balance to delete referral. Cost: {cost_to_delete} ZP."
        )
    
    referrer.zp_balance -= cost_to_delete
    db.delete(referral)
    db.add(referrer)
    db.commit()
    
    return {
        "message": f"Referral deleted successfully. {cost_to_delete} ZP deducted.",
        "new_zp_balance": referrer.zp_balance
                            }
  
