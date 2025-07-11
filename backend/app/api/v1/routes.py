from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import List, Annotated
from datetime import datetime, timedelta, timezone

# --- Database & Model Imports ---
from app.db import models, database

# --- Schema Imports ---
from app.schemas import (
    user as user_schemas,
    wallet as wallet_schemas,
    sponsored_task as sponsored_task_schemas,
    mining as mining_schemas,
    task as task_schemas,
    microjob as microjob_schemas,
    referral as referral_schemas
    # chat as chat_schemas # We will add this later
)

# --- Service Imports ---
from app.services import (
    mining as mining_service,
    tasks as tasks_service,
    microjobs as microjobs_service,
    referrals as referrals_service,
    two_factor_auth as two_fa_service
)

# --- Core Imports ---
from app.core import security
from app.core.config import settings

# --- Router & Auth Setup ---
router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/token")

# =================================================================
#                 --- AUTH & USER DEPENDENCIES ---
# =================================================================

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[Session, Depends(database.get_db)]):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = security.decode_access_token(token)
    if payload is None:
        raise credentials_exception
    email: str = payload.get("sub")
    if email is None:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

async def get_active_user(current_user: Annotated[models.User, Depends(get_current_user)]):
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    return current_user

# =================================================================
#              --- AUTHENTICATION & USER MANAGEMENT ---
# =================================================================

@router.post("/register", response_model=user_schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user: user_schemas.UserCreate, db: Annotated[Session, Depends(database.get_db)]):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # --- Handle optional handles with normalization ---
    hashed_password = security.get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        zp_balance=0,
        current_mining_rate_zp_per_hour=settings.INITIAL_MINING_RATE_ZP_PER_HOUR,
        current_mining_capacity_zp=settings.INITIAL_MINING_CAPACITY_ZP,
        current_mining_cycle_hours=settings.MINING_CYCLE_HOURS,
    )

    if user.telegram_handle:
        normalized_tg = user.telegram_handle.lower()
        if db.query(models.User).filter(models.User.telegram_handle == normalized_tg).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram handle already taken")
        db_user.telegram_handle = normalized_tg

    if user.twitter_handle:
        normalized_tt = user.twitter_handle.lower()
        if db.query(models.User).filter(models.User.twitter_handle == normalized_tt).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Twitter handle already taken")
        db_user.twitter_handle = normalized_tt
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/token", response_model=user_schemas.Token)
def login_for_access_token(login_data: user_schemas.UserLoginWith2FA, db: Annotated[Session, Depends(database.get_db)]):
    user = db.query(models.User).filter(models.User.email == login_data.username).first()
    if not user or not security.verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.is_2fa_enabled:
        if not login_data.two_fa_code:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="2FA is enabled for this account. Please provide your 2FA code.")
        if not two_fa_service.verify_totp_code(user.two_fa_secret, login_data.two_fa_code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code.")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(data={"sub": user.email}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me", response_model=user_schemas.UserResponse)
def read_users_me(current_user: Annotated[models.User, Depends(get_active_user)]):
    return current_user

@router.post("/users/me/link-wallet", response_model=user_schemas.UserResponse)
def link_ton_wallet(wallet_data: wallet_schemas.WalletLinkRequest, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    if db.query(models.User).filter(models.User.ton_wallet_address == wallet_data.wallet_address).first():
        raise HTTPException(status_code=409, detail="This wallet address is already linked to another account.")
    current_user.ton_wallet_address = wallet_data.wallet_address
    db.commit()
    db.refresh(current_user)
    return current_user

@router.post("/users/me/daily-checkin", response_model=mining_schemas.ZPClaimResponse)
def perform_daily_checkin(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    today = datetime.now(timezone.utc).date()
    if current_user.last_checkin_date == today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already checked in today.")

    zp_bonus = settings.ZP_DAILY_CHECKIN_BONUS
    is_consecutive_day = current_user.last_checkin_date and (today - current_user.last_checkin_date).days == 1

    if is_consecutive_day:
        current_user.daily_streak_count += 1
    else:
        current_user.daily_streak_count = 1

    current_user.last_checkin_date = today
    current_user.zp_balance += zp_bonus
    current_user.social_capital_score += zp_bonus
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {
        "message": f"Daily check-in successful! You received {zp_bonus} ZP. Current streak: {current_user.daily_streak_count} days.",
        "zp_claimed": zp_bonus,
        "new_zp_balance": current_user.zp_balance
    }

# =================================================================
#                       --- 2FA MANAGEMENT ---
# =================================================================

@router.post("/users/me/2fa/enable", response_model=user_schemas.TwoFASetupResponse)
def enable_2fa(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return two_fa_service.enable_2fa_for_user(db, current_user)

@router.post("/users/me/2fa/confirm")
def confirm_2fa(two_fa_code: user_schemas.TwoFACode, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    if two_fa_service.confirm_2fa_setup(db, current_user, two_fa_code.code):
        return {"message": "2FA successfully enabled and confirmed!"}
    raise HTTPException(status_code=400, detail="2FA confirmation failed.")


@router.post("/users/me/2fa/disable")
def disable_2fa(two_fa_code: user_schemas.TwoFACode, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    if two_fa_service.disable_2fa_for_user(db, current_user, two_fa_code.code):
        return {"message": "2FA successfully disabled!"}
    raise HTTPException(status_code=400, detail="2FA disable failed.")

# =================================================================
#                         --- ZP MINING ---
# =================================================================

@router.post("/mining/start", response_model=mining_schemas.MiningStartResponse)
def start_mining_cycle(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return mining_service.start_mining(db, current_user)

@router.post("/mining/claim", response_model=mining_schemas.ZPClaimResponse)
def claim_mined_zp(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return mining_service.claim_zp(db, current_user)

@router.post("/mining/upgrade", response_model=mining_schemas.MinerUpgradeResponse)
def upgrade_miner_stats(upgrade_req: mining_schemas.MinerUpgradeRequest, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return mining_service.upgrade_miner(db, current_user, upgrade_req)

# =================================================================
#                     --- INTERACTIVE TASKS ---
# =================================================================

@router.get("/tasks", response_model=List[task_schemas.TaskResponse])
def get_all_active_tasks(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return tasks_service.get_available_tasks(db, current_user.id)

@router.post("/tasks/{task_id}/complete", response_model=task_schemas.UserTaskCompletionResponse)
def complete_task_endpoint(task_id: int, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    result = tasks_service.complete_task(db, current_user, task_id)
    return result["completion"]

@router.post("/tasks/sponsor", response_model=task_schemas.TaskResponse, status_code=201)
def create_user_sponsored_task(task_data: sponsored_task_schemas.UserSponsoredTaskCreate, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return tasks_service.create_sponsored_task(db, current_user, task_data)

# =================================================================
#                  --- MICRO-JOB MARKETPLACE ---
# =================================================================

@router.post("/microjobs", response_model=microjob_schemas.MicroJobResponse, status_code=status.HTTP_201_CREATED)
def create_new_microjob(job_data: microjob_schemas.MicroJobCreate, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return microjobs_service.create_microjob(db, current_user, job_data)

@router.get("/microjobs", response_model=List[microjob_schemas.MicroJobResponse])
def list_microjobs(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return microjobs_service.get_microjobs(db)

@router.post("/microjobs/{microjob_id}/submit", response_model=microjob_schemas.MicroJobSubmissionResponse)
def submit_microjob_completion_endpoint(submission_data: microjob_schemas.MicroJobSubmissionCreate, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return microjobs_service.submit_microjob_completion(db, current_user, submission_data)

@router.post("/microjobs/submissions/{submission_id}/approve")
def approve_microjob_submission_endpoint(submission_id: int, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return microjobs_service.approve_microjob_completion(db, current_user, submission_id)

@router.post("/microjobs/{job_id}/activate", response_model=microjob_schemas.MicroJobResponse)
def activate_microjob(job_id: int, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    microjob = db.query(models.MicroJob).filter(models.MicroJob.id == job_id, models.MicroJob.poster_id == current_user.id).first()
    if not microjob:
        raise HTTPException(status_code=404, detail="Micro-job not found or you are not the poster.")
    if microjob.status != "pending_funding":
        raise HTTPException(status_code=400, detail="Job is not pending funding.")
    microjob.status = "active"
    db.commit()
    db.refresh(microjob)
    # Here you would now send the 'setTaskDetails' transaction to the smart contract
    # from your backend hot wallet, as described in my previous message.
    return microjob

# --- Chat endpoints (placeholders) ---
@router.post("/microjobs/{job_id}/chat")
def post_chat_message(job_id: int, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    # Logic to verify user is part of the job (poster or has submitted)
    # Save the message to the database
    ...

@router.get("/microjobs/{job_id}/chat")
def get_chat_messages(job_id: int, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    # Logic to fetch all messages for the job_id
    # Return the list of messages
    ...

@router.post("/microjobs/submissions/{submission_id}/reject")
def reject_microjob_submission_endpoint(submission_id: int, current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return microjobs_service.reject_microjob_completion(db, current_user, submission_id)

# =================================================================
#                      --- REFERRAL SYSTEM ---
# =================================================================

@router.get("/referrals/my-link", response_model=referral_schemas.ReferralLinkResponse)
def get_my_referral_link(current_user: Annotated[models.User, Depends(get_active_user)]):
    referral_link = referrals_service.get_referral_link(current_user.id)
    return {"referral_link": referral_link}

@router.get("/referrals/my-referred-users", response_model=List[referral_schemas.ReferralResponse])
def get_my_referred_users_list(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    return referrals_service.get_referred_users(db, current_user.id)
