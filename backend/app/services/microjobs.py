"""
Service layer for handling all micro-job marketplace logic.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db import models
from app.schemas import microjob as microjob_schemas


def create_microjob(
    db: Session, poster: models.User, job_data: microjob_schemas.MicroJobCreate
):
    """
    Creates a new micro-job entry in the DB with a 'pending_funding' status.
    The frontend is responsible for initiating the on-chain funding transaction.
    """
    # This logic assumes job_data.duration_days will be added to your MicroJobCreate schema
    # If not, you can use a default, e.g., timedelta(days=7)
    # expiration = datetime.now(timezone.utc) + timedelta(days=job_data.duration_days)
    expiration = datetime.now(timezone.utc) + timedelta(days=7)  # Defaulting to 7 days

    db_microjob = models.MicroJob(
        poster_id=poster.id,
        title=job_data.title,
        description=job_data.description,
        ton_payment_amount=job_data.ton_payment_amount,
        status="pending_funding",  # Job starts as pending
        expiration_date=expiration,
        verification_criteria=job_data.verification_criteria,
        ziver_fee_percentage=job_data.ziver_fee_percentage,
    )
    db.add(db_microjob)
    db.commit()
    db.refresh(db_microjob)

    # Return details needed for the user to fund the task on-chain
    return {
        "job_details": db_microjob,
        # Remember to replace this with your actual deployed contract address
        "escrow_contract_address": "EQ...YOUR_CONTRACT_ADDRESS...",
    }


def get_microjobs(
    db: Session, user_id: Optional[int] = None, status_filter: Optional[str] = None
):
    """
    Retrieves active micro-jobs. Can be filtered by poster or status.
    """
    query = db.query(models.MicroJob)

    if user_id:
        query = query.filter(models.MicroJob.poster_id == user_id)
        # If fetching user's own jobs, don't filter by status unless specified
        if status_filter:
            query = query.filter(models.MicroJob.status == status_filter)
    else:
        # For public view, only show active, funded jobs that haven't expired
        query = query.filter(
            models.MicroJob.status == "active",
            models.MicroJob.expiration_date > datetime.now(timezone.utc),
        )

    return query.all()


def submit_microjob_completion(
    db: Session,
    worker: models.User,
    submission_data: microjob_schemas.MicroJobSubmissionCreate,
):
    """A worker submits proof of completion for a micro-job."""
    microjob = (
        db.query(models.MicroJob)
        .filter(models.MicroJob.id == submission_data.microjob_id)
        .first()
    )
    if not microjob:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Micro-job not found."
        )

    if microjob.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Micro-job is not active for submissions.",
        )

    if datetime.now(timezone.utc) > microjob.expiration_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Micro-job has expired."
        )

    existing_submission = (
        db.query(models.MicroJobSubmission)
        .filter(
            models.MicroJobSubmission.microjob_id == submission_data.microjob_id,
            models.MicroJobSubmission.worker_id == worker.id,
        )
        .first()
    )
    if existing_submission:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted for this micro-job.",
        )

    db_submission = models.MicroJobSubmission(
        microjob_id=submission_data.microjob_id,
        worker_id=worker.id,
        submission_details=submission_data.submission_details,
        status="submitted",
    )
    db.add(db_submission)
    db.commit()
    db.refresh(db_submission)
    return db_submission


def approve_microjob_completion(db: Session, poster: models.User, submission_id: int):
    """The job poster approves a submission, triggering on-chain payment."""
    submission = (
        db.query(models.MicroJobSubmission)
        .filter(models.MicroJobSubmission.id == submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Micro-job submission not found.",
        )

    if submission.microjob.poster_id != poster.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the poster of this micro-job.",
        )

    if submission.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission is not in 'submitted' status.",
        )

    # --- SIMULATED ON-CHAIN INTERACTION ---
    # Here, you would trigger the `verifyTaskCompletion` transaction on your smart contract.
    # The smart contract handles the payout logic.
    # For now, we simulate the result by updating our local DB.

    worker = submission.worker
    worker.social_capital_score += 50  # Boost Social Capital Score
    db.add(worker)

    submission.status = "approved"
    submission.reviewed_at = datetime.now(timezone.utc)
    db.add(submission)

    # Mark microjob as completed
    submission.microjob.status = "completed"
    db.add(submission.microjob)

    db.commit()
    db.refresh(submission)

    return {
        "message": "Micro-job submission approved. On-chain payout initiated.",
        "submission": submission,
    }


def reject_microjob_completion(db: Session, poster: models.User, submission_id: int):
    """The job poster rejects a submission."""
    submission = (
        db.query(models.MicroJobSubmission)
        .filter(models.MicroJobSubmission.id == submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Micro-job submission not found.",
        )

    if submission.microjob.poster_id != poster.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the poster of this micro-job.",
        )

    if submission.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission is not in 'submitted' status.",
        )

    submission.status = "rejected"
    submission.reviewed_at = datetime.now(timezone.utc)
    db.add(submission)
    db.commit()
    db.refresh(submission)

    return {"message": "Micro-job submission rejected.", "submission": submission}
