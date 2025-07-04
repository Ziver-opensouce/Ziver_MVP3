from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from app.db import models
from app.schemas import microjob as microjob_schemas
from app.core.config import settings
from fastapi import HTTPException, status

def create_microjob(db: Session, poster: models.User, job_data: microjob_schemas.MicroJobCreate):
    """
    Creates a new micro-job.
    """
    # Assuming job_data.ton_payment_amount is the full payment, Ziver's fee will be deducted from it
    # For now, let's assume the poster pays the full amount, and Ziver takes its cut from the payment to the worker.
    # Alternatively, the poster could pay Ziver upfront for listing (time-based) and then the worker payment.
    # Let's align with the pitch deck: "Time-Based Task Listings (Feature 2): TON payments for the duration of micro-job postings."
    # and "Platform Fees (Feature 2): Percentage of completed micro-job payments."

    # For MVP, let's assume the `ton_payment_amount` in `MicroJobCreate` is the amount *worker* receives.
    # The poster will need to pay `ton_payment_amount / (1 - ziver_fee_percentage)` to escrow
    # Or, the poster pays `ton_payment_amount` and ziver fee is taken from the worker's payout.
    
    # For simplicity of MVP, let's assume the ton_payment_amount is the gross amount the poster is willing to pay.
    # Ziver's fee will be deducted when the job is completed and payment is processed.
    
    # Example: If duration_days is provided in schema, calculate expiration_date
    # For now, we don't have duration_days in MicroJobCreate. Let's add a default expiration
    # Or expect frontend to pass the exact expiration_date if flexible.
    # For MVP, let's assume a default expiration if not provided in request, or define it here.
    expiration_date = datetime.now(timezone.utc) + timedelta(days=7) # Default 7 days expiry

    db_microjob = models.MicroJob(
        poster_id=poster.id,
        title=job_data.title,
        description=job_data.description,
        ton_payment_amount=job_data.ton_payment_amount,
        verification_criteria=job_data.verification_criteria,
        ziver_fee_percentage=job_data.ziver_fee_percentage,
        expiration_date=expiration_date,
        status="open" # Initially open
    )
    db.add(db_microjob)
    db.commit()
    db.refresh(db_microjob)
    
    return db_microjob

def get_microjobs(db: Session, user_id: Optional[int] = None, status_filter: Optional[str] = None):
    """
    Retrieves micro-jobs. Can filter by poster_id or status.
    Excludes expired jobs unless explicitly requested (e.g., for poster's own jobs).
    """
    query = db.query(models.MicroJob).filter(models.MicroJob.status == "open") # Only open jobs by default
    
    if status_filter:
        query = query.filter(models.MicroJob.status == status_filter)
    
    if user_id:
        query = query.filter(models.MicroJob.poster_id == user_id)
        # If fetching user's own jobs, include completed/in_progress too
        if not status_filter: # If no specific status filter, show all for the user
             query = db.query(models.MicroJob).filter(models.MicroJob.poster_id == user_id)

    # Filter out expired jobs if not fetching specific user's jobs or already filtered by status
    if not status_filter or status_filter == "open":
        query = query.filter(models.MicroJob.expiration_date > datetime.now(timezone.utc))

    return query.all()

def submit_microjob_completion(db: Session, worker: models.User, submission_data: microjob_schemas.MicroJobSubmissionCreate):
    """
    A worker submits proof of completion for a micro-job.
    """
    microjob = db.query(models.MicroJob).filter(models.MicroJob.id == submission_data.microjob_id).first()
    if not microjob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Micro-job not found.")
    
    if microjob.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Micro-job is not open for submissions.")
    
    if datetime.now(timezone.utc) > microjob.expiration_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Micro-job has expired.")

    # Check if worker already submitted for this job
    existing_submission = db.query(models.MicroJobSubmission)\
                            .filter(models.MicroJobSubmission.microjob_id == submission_data.microjob_id,
                                    models.MicroJobSubmission.worker_id == worker.id)\
                            .first()
    if existing_submission:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already submitted for this micro-job.")

    db_submission = models.MicroJobSubmission(
        microjob_id=submission_data.microjob_id,
        worker_id=worker.id,
        submission_details=submission_data.submission_details,
        status="submitted" # Awaiting poster's review
    )
    db.add(db_submission)

    # Optionally, update microjob status to 'in_progress' if only one submission is expected
    # For MVP, we'll keep it 'open' to allow multiple submissions if desired by job poster
    
    db.commit()
    db.refresh(db_submission)
    return db_submission

def approve_microjob_completion(db: Session, poster: models.User, submission_id: int):
    """
    The micro-job poster approves a submission, triggering payment to the worker.
    """
    submission = db.query(models.MicroJobSubmission).filter(models.MicroJobSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Micro-job submission not found.")

    microjob = db.query(models.MicroJob).filter(models.MicroJob.id == submission.microjob_id).first()
    if not microjob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated micro-job not found.")

    if microjob.poster_id != poster.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the poster of this micro-job.")
    
    if submission.status != "submitted":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submission is not in 'submitted' status.")

    # Calculate net payment to worker and Ziver's fee
    worker_payout = microjob.ton_payment_amount * (1 - microjob.ziver_fee_percentage)
    ziver_fee = microjob.ton_payment_amount * microjob.ziver_fee_percentage

    # --- SIMULATED TON PAYMENT ---
    # In a real TON integration:
    # 1. Verify poster has enough TON in an escrow smart contract or Ziver's wallet.
    # 2. Trigger a TON transaction to transfer `worker_payout` to worker's TON wallet.
    # 3. Transfer `ziver_fee` to Ziver's TON wallet.
    # For MVP, we'll simulate this by just updating internal records if applicable or simply logging.
    
    # Update worker's internal ZP balance if we tie TON payments to ZP (unlikely directly)
    # Or if TON payment is tracked internally for analytical purposes
    worker = db.query(models.User).filter(models.User.id == submission.worker_id).first()
    if worker:
        # Example: if you decide to give a small ZP bonus for completed microjobs
        # worker.zp_balance += 10 # Example bonus
        worker.social_capital_score += 50 # Microjob completion boosts SCS
        db.add(worker)

    submission.status = "approved"
    submission.reviewed_at = datetime.now(timezone.utc)
    db.add(submission)

    # Mark microjob as completed if only one worker is expected or if all payments are done
    # If multiple workers can do the same job, keep it open until expired or all slots filled
    # For MVP, let's mark the job as "completed" after one approval.
    microjob.status = "completed"
    db.add(microjob)

    db.commit()
    db.refresh(submission)
    db.refresh(microjob)
    if worker: db.refresh(worker)

    return {
        "message": f"Micro-job submission approved. Worker payout: {worker_payout:.2f} TON. Ziver fee: {ziver_fee:.2f} TON.",
        "submission": submission
    }

def reject_microjob_completion(db: Session, poster: models.User, submission_id: int):
    """
    The micro-job poster rejects a submission.
    """
    submission = db.query(models.MicroJobSubmission).filter(models.MicroJobSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Micro-job submission not found.")

    microjob = db.query(models.MicroJob).filter(models.MicroJob.id == submission.microjob_id).first()
    if not microjob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated micro-job not found.")

    if microjob.poster_id != poster.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the poster of this micro-job.")
    
    if submission.status != "submitted":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submission is not in 'submitted' status.")

    submission.status = "rejected"
    submission.reviewed_at = datetime.now(timezone.utc)
    db.add(submission)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Micro-job submission rejected.",
        "submission": submission
    }
  
