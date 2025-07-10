from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Annotated
from app.schemas import user as user_schemas, wallet as wallet_schemas # Create a new wallet.py schema file
from app.schemas import sponsored_task as sponsored_task_schemas
from app.services import tasks as tasks_service
from datetime import datetime, timedelta, timezone

from app.db import models, database
from app.schemas import user as user_schemas
from app.schemas import mining as mining_schemas
from app.schemas import task as task_schemas
from app.schemas import microjob as microjob_schemas
from app.schemas import referral as referral_schemas
from app.services import mining as mining_service
from app.services import tasks as tasks_service
from app.services import microjobs as microjobs_service
from app.services import referrals as referrals_service
from app.core import security
from app.core.config import settings

# --- ADDED THIS NEW IMPORT FOR 2FA SERVICE ---
from app.services import two_factor_auth as two_fa_service
# --- END OF 2FA SERVICE IMPORT ---

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/token")

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Dependency to get the current authenticated user from a JWT token.
    """
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
    """
    Dependency to ensure the current user is active.
    """
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    return current_user

# --- Authentication & User Management ---
@router.post("/register", response_model=user_schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user: user_schemas.UserCreate, db: Annotated[Session, Depends(database.get_db)]):
    """
    Registers a new user.
    """
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    
    # Handle optional handles for unique constraint
    if user.telegram_handle:
        if db.query(models.User).filter(models.User.telegram_handle == user.telegram_handle).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram handle already taken")
    if user.twitter_handle:
        if db.query(models.User).filter(models.User.twitter_handle == user.twitter_handle).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Twitter handle already taken")

    hashed_password = security.get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        telegram_handle=user.telegram_handle,
        twitter_handle=user.twitter_handle,
        # Initialize ZP balance and mining stats from config
        zp_balance=0, # Users start with 0 ZP
        current_mining_rate_zp_per_hour=settings.INITIAL_MINING_RATE_ZP_PER_HOUR,
        current_mining_capacity_zp=settings.INITIAL_MINING_CAPACITY_ZP,
        current_mining_cycle_hours=settings.MINING_CYCLE_HOURS,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# Add the new endpoint
@router.post("/users/me/link-wallet", response_model=user_schemas.UserResponse)
def link_ton_wallet(
    wallet_data: wallet_schemas.WalletLinkRequest,
    current_user: Annotated[models.User, Depends(get_active_user)],
    db: Annotated[Session, Depends(database.get_db)]
):
    """Links a TON wallet address to the current user's profile."""
    # Check if address is already taken
    if db.query(models.User).filter(models.User.ton_wallet_address == wallet_data.wallet_address).first():
        raise HTTPException(status_code=409, detail="This wallet address is already linked to another account.")
    
    current_user.ton_wallet_address = wallet_data.wallet_address
    db.commit()
    db.refresh(current_user)
    return current_user
    

# --- RE-DEFINE THE login_for_access_token ENDPOINT ---
# Delete the old `login_for_access_token` function completely and replace it with this:

@router.post("/token", response_model=user_schemas.Token)
def login_for_access_token(login_data: user_schemas.UserLoginWith2FA, db: Annotated[Session, Depends(database.get_db)]):
    """
    Authenticates user and returns an access token.
    If 2FA is enabled for the user, a 2FA code must be provided.
    """
    user = db.query(models.User).filter(models.User.email == login_data.username).first()
    if not user or not security.verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.is_2fa_enabled:
        if not login_data.two_fa_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="2FA is enabled for this account. Please provide your 2FA code.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not two_fa_service.verify_totp_code(user.two_fa_secret, login_data.two_fa_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA code.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # If we reached here, credentials and 2FA (if enabled) are valid
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/users/me", response_model=user_schemas.UserResponse)
def read_users_me(current_user: Annotated[models.User, Depends(get_active_user)]):
    """
    Retrieves the current authenticated user's profile.
    """
    return current_user


# --- NEW 2FA ENDPOINTS ---
@router.post("/users/me/2fa/enable", response_model=user_schemas.TwoFASetupResponse)
def enable_2fa(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Enables 2FA for the current user. Returns a secret and QR code image for authenticator app setup.
    The user must then confirm by providing a code from their app.
    """
    return two_fa_service.enable_2fa_for_user(db, current_user)

@router.post("/users/me/2fa/confirm")
def confirm_2fa(two_fa_code: user_schemas.TwoFACode,
                current_user: Annotated[models.User, Depends(get_active_user)],
                db: Annotated[Session, Depends(database.get_db)]):
    """
    Confirms 2FA setup by verifying the first code from the user's authenticator app.
    This step is crucial to activate 2FA for the user.
    """
    if two_fa_service.confirm_2fa_setup(db, current_user, two_fa_code.code):
        return {"message": "2FA successfully enabled and confirmed!"}
    # two_fa_service.confirm_2fa_setup will raise HTTPException on failure
    return {"message": "2FA confirmation failed. Please check your code and try again."}

# --- MODIFY THIS SECTION FOR 2FA CHECK ---
    # If 2FA is enabled for the user:
    if user.is_2fa_enabled:
        # Check if 2FA code was provided in the password field (for OAuth2PasswordRequestForm simplicity)
        # Or you could expect it in a custom header, but modifying form_data is less common.
        # For a truly separate 2FA step with OAuth2PasswordRequestForm,
        # you'd respond differently here and have a *separate* endpoint for 2FA validation.
        
        # For simplicity with OAuth2PasswordRequestForm, we'll make a decision:
        # If 2FA is enabled, and *no* 2FA code (e.g., in a custom header, or part of password) is present,
        # we reject the login with a 403, indicating 2FA is required.
        
        # A more common approach is to create a custom login schema (e.g., UserLoginWith2FA)
        # but OAuth2PasswordRequestForm is fixed.
        # Let's adjust to be clear: if 2FA is enabled, and the client didn't supply the code
        # in the standard 'password' field (e.g., 'password|2facode'), we reject.
        # This is a common hack for simple OAuth2 forms.
        
        # Simpler approach: If 2FA is enabled, the password field *must* contain 'password|2FA_CODE'
        # Or, just enforce that if is_2fa_enabled, they MUST use the separate 2FA confirm endpoint.
        
        # Let's make it explicit for this MVP. If 2FA is enabled, the first attempt without 2FA code fails.
        # The user must make a second attempt with the code if they want to get the token.
        
        # If 2FA is enabled for the user, and the password sent is *just* the password,
        # we reject, instructing the user to include the 2FA code.
        # This means the frontend must send: "username": "email", "password": "yourpassword|123456" for example.
        # OR, we need a custom login endpoint that takes email, password, and optional 2fa_code.
        
        # Let's pivot to using `UserLoginWith2FA` schema for the login endpoint
        # to allow direct 2FA code submission. This is cleaner.
        # So, we need to change `@router.post("/token", ...)`
        # to `@router.post("/token", response_model=user_schemas.Token)`
        # and change `form_data: Annotated[OAuth2PasswordRequestForm, Depends()]`
        # to `login_data: user_schemas.UserLoginWith2FA, ...`

        # Temporarily commenting out the previous definition for clarity
        # We will redefine this endpoint slightly.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login endpoint needs redefinition for 2FA handling. Proceed to next step.",
        )

@router.post("/users/me/2fa/disable")
def disable_2fa(two_fa_code: user_schemas.TwoFACode,
                current_user: Annotated[models.User, Depends(get_active_user)],
                db: Annotated[Session, Depends(database.get_db)]):
    """
    Disables 2FA for the current user after verifying a current code.
    """
    if two_fa_service.disable_2fa_for_user(db, current_user, two_fa_code.code):
        return {"message": "2FA successfully disabled!"}
    # two_fa_service.disable_2fa_for_user will raise HTTPException on failure
    return {"message": "2FA disable failed. Please check your code and try again."}

# --- END OF NEW 2FA ENDPOINTS ---

# ... (Rest of your API routes: ZP Mining, Interactive Tasks, Micro-Job, Referral System) ...


@router.post("/users/me/daily-checkin", response_model=mining_schemas.ZPClaimResponse)
def perform_daily_checkin(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Allows a user to perform a daily check-in to potentially earn bonus ZP and update streak.
    This is handled within the claim_zp logic, but provides a direct endpoint for explicit check-in.
    """
    # The actual ZP claim and streak logic is within mining_service.claim_zp
    # This endpoint can be used to trigger the check-in and claim if a mining cycle just finished.
    # If the user has an active mining session, they will get a message about that.
    # If not, it will attempt to claim if there was a previous session or just give checkin bonus.
    
    # We can simplify this for an explicit "check-in" bonus that doesn't depend on mining cycle completion
    # Or keep it as part of the mining claim mechanism, which encourages users to complete cycles.

    # For Phase 1 MVP, let's keep it simple: `claim_zp` handles the daily check-in side effect.
    # This endpoint could primarily be for *only* getting the daily bonus if a separate mechanic is desired,
    # distinct from mining claim.


today = datetime.now(timezone.utc).date()
if current_user.last_checkin_date == today:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already checked in today.")

zp_bonus = settings.ZP_DAILY_CHECKIN_BONUS

# Correctly check for a streak BEFORE updating the date
is_consecutive_day = current_user.last_checkin_date and (today - current_user.last_checkin_date).days == 1

if is_consecutive_day:
    current_user.daily_streak_count += 1
else:
    current_user.daily_streak_count = 1

# Now update the date and balances
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


# --- ZP Mining ---
@router.post("/mining/start", response_model=mining_schemas.MiningStartResponse)
def start_mining_cycle(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Initiates a ZP mining cycle for the authenticated user.
    """
    return mining_service.start_mining(db, current_user)

@router.post("/mining/claim", response_model=mining_schemas.ZPClaimResponse)
def claim_mined_zp(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Claims ZP earned from the completed mining cycle.
    """
    return mining_service.claim_zp(db, current_user)

@router.post("/mining/upgrade", response_model=mining_schemas.MinerUpgradeResponse)
def upgrade_miner_stats(upgrade_req: mining_schemas.MinerUpgradeRequest,
                        current_user: Annotated[models.User, Depends(get_active_user)],
                        db: Annotated[Session, Depends(database.get_db)]):
    """
    Upgrades the user's ZP miner capabilities.
    """
    return mining_service.upgrade_miner(db, current_user, upgrade_req)


# --- Interactive Tasks ---
@router.get("/tasks", response_model=List[task_schemas.TaskResponse])
def get_all_active_tasks(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Retrieves all available and active tasks that the user has not yet completed.
    """
    return tasks_service.get_available_tasks(db, current_user.id)

@router.post("/tasks/{task_id}/complete", response_model=task_schemas.UserTaskCompletionResponse)
def complete_task_endpoint(task_id: int, 
                           current_user: Annotated[models.User, Depends(get_active_user)],
                           db: Annotated[Session, Depends(database.get_db)]):
    """
    Marks a task as completed by the user and awards ZP.
    """
    result = tasks_service.complete_task(db, current_user, task_id)
    return result["completion"] # Return just the completion object from the service's dict

@router.post("/tasks/sponsor", response_model=task_schemas.TaskResponse, status_code=201)
def create_user_sponsored_task(
    task_data: sponsored_task_schemas.UserSponsoredTaskCreate,
    current_user: Annotated[models.User, Depends(get_active_user)],
    db: Annotated[Session, Depends(database.get_db)]
):
    """Allows an authenticated user to spend ZP to create a sponsored task."""
    return tasks_service.create_sponsored_task(db, current_user, task_data)


# --- Micro-Job Marketplace ---
@router.post("/microjobs", response_model=microjob_schemas.MicroJobResponse, status_code=status.HTTP_201_CREATED)
def create_new_microjob(job_data: microjob_schemas.MicroJobCreate,
                        current_user: Annotated[models.User, Depends(get_active_user)],
                        db: Annotated[Session, Depends(database.get_db)]):
    """
    Allows an authenticated user to post a new micro-job.
    """
    return microjobs_service.create_microjob(db, current_user, job_data)

@router.get("/microjobs", response_model=List[microjob_schemas.MicroJobResponse])
def list_microjobs(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Lists all available micro-jobs.
    """
    return microjobs_service.get_microjobs(db)

@router.get("/microjobs/my-posted-jobs", response_model=List[microjob_schemas.MicroJobResponse])
def list_my_posted_microjobs(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Lists micro-jobs posted by the current authenticated user.
    """
    return microjobs_service.get_microjobs(db, user_id=current_user.id)

@router.post("/microjobs/{microjob_id}/submit", response_model=microjob_schemas.MicroJobSubmissionResponse)
def submit_microjob_completion_endpoint(submission_data: microjob_schemas.MicroJobSubmissionCreate,
                                        current_user: Annotated[models.User, Depends(get_active_user)],
                                        db: Annotated[Session, Depends(database.get_db)]):
    """
    A worker submits proof of completion for a micro-job.
    """
    return microjobs_service.submit_microjob_completion(db, current_user, submission_data)

@router.post("/microjobs/submissions/{submission_id}/approve")
def approve_microjob_submission_endpoint(submission_id: int,
                                        current_user: Annotated[models.User, Depends(get_active_user)],
                                        db: Annotated[Session, Depends(database.get_db)]):
    """
    The micro-job poster approves a submission, triggering payment to the worker.
    """
    return microjobs_service.approve_microjob_completion(db, current_user, submission_id)

# new route

@router.post("/microjobs/{job_id}/activate", response_model=microjob_schemas.MicroJobResponse)
def activate_microjob(
    job_id: int,
    current_user: Annotated[models.User, Depends(get_active_user)],
    db: Annotated[Session, Depends(database.get_db)]
):
    """
    Called by the frontend after it confirms the task has been funded on-chain.
    This activates the job in the local database.
    """
    # This is a simplified version. A more robust solution would have the backend
    # poll the chain itself, but for a hackathon, letting the frontend trigger this
    # after its own polling is perfectly acceptable and much faster to build.
    
    microjob = db.query(models.MicroJob).filter(models.MicroJob.id == job_id, models.MicroJob.poster_id == current_user.id).first()
    if not microjob:
        raise HTTPException(status_code=404, detail="Micro-job not found or you are not the poster.")
    if microjob.status != "pending_funding":
        raise HTTPException(status_code=400, detail="Job is not pending funding.")
        
    # The frontend has confirmed funding, so we trust it and activate the job.
    microjob.status = "active"
    db.commit()
    db.refresh(microjob)
    
    # Here you would now send the 'setTaskDetails' transaction to the smart contract
    # from your backend hot wallet, as described in my previous message.
    
    return microjob

@router.post("/microjobs/{job_id}/chat", response_model=ChatMessageResponse)
def post_chat_message(
    job_id: int,
    message_data: ChatMessageCreate,
    current_user: Annotated[models.User, Depends(get_active_user)],
    db: Annotated[Session, Depends(database.get_db)]
):
    # Logic to verify user is part of the job (poster or has submitted)
    # Save the message to the database
    ...

@router.get("/microjobs/{job_id}/chat", response_model=List[ChatMessageResponse])
def get_chat_messages(
    job_id: int,
    current_user: Annotated[models.User, Depends(get_active_user)],
    db: Annotated[Session, Depends(database.get_db)]
):
    # Logic to fetch all messages for the job_id
    # Return the list of messages
    ...

@router.post("/microjobs/submissions/{submission_id}/reject")
def reject_microjob_submission_endpoint(submission_id: int,
                                        current_user: Annotated[models.User, Depends(get_active_user)],
                                        db: Annotated[Session, Depends(database.get_db)]):
    """
    The micro-job poster rejects a submission.
    """
    return microjobs_service.reject_microjob_completion(db, current_user, submission_id)


# --- Referral System ---
@router.get("/referrals/my-link", response_model=referral_schemas.ReferralLinkResponse)
def get_my_referral_link(current_user: Annotated[models.User, Depends(get_active_user)]):
    """
    Gets the current user's referral link.
    """
    referral_link = referrals_service.get_referral_link(current_user.id)
    return {"referral_link": referral_link}

@router.get("/referrals/my-referred-users", response_model=List[referral_schemas.ReferralResponse])
def get_my_referred_users_list(current_user: Annotated[models.User, Depends(get_active_user)], db: Annotated[Session, Depends(database.get_db)]):
    """
    Lists users referred by the current user.
    """
    return referrals_service.get_referred_users(db, current_user.id)

# Endpoint for a user to track being referred (this might be called on first login if user came via referral link)
@router.post("/referrals/track-referred-user", response_model=referral_schemas.ReferralResponse, status_code=status.HTTP_201_CREATED)
def track_referred_user_endpoint(referrer_id: int,
                                 referred_user_email: user_schemas.EmailStr, # User who just registered
                                 db: Annotated[Session, Depends(database.get_db)]):
    """
    Endpoint for a newly registered user to be tracked as referred.
    This would typically be called by the frontend post-registration if a referral ID was present.
    """
    return referrals_service.track_referral(db, referrer_id, referred_user_email)

@router.post("/referrals/{referred_user_id}/ping")
def ping_referred_user_endpoint(referred_user_id: int,
                                current_user: Annotated[models.User, Depends(get_active_user)]):
    """
    Sends a reminder/ping to a specific referred user.
    (Conceptual - would integrate with Telegram API or notification service)
    """
    # This requires a messaging integration, for now it's a placeholder
    return referrals_service.ping_referred_user(referred_user_id)

@router.delete("/referrals/{referral_id}/delete")
def delete_referral_endpoint(referral_id: int,
                             current_user: Annotated[models.User, Depends(get_active_user)],
                             db: Annotated[Session, Depends(database.get_db)]):
    """
    Allows a referrer to delete a specific referral, incurring a ZP cost.
    """
    return referrals_service.delete_referral(db, current_user, referral_id)
