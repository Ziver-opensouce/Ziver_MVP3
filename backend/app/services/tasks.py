from sqlalchemy.orm import Session
from app.db import models
from app.schemas import task as task_schemas
from app.core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import not_

def get_available_tasks(db: Session, user_id: int):
    """
    Retrieves all active tasks that the user has not yet completed.
    """
    # Get IDs of tasks already completed by the user
    completed_task_ids = db.query(models.UserTaskCompletion.task_id)\
                           .filter(models.UserTaskCompletion.user_id == user_id)\
                           .all()
    completed_task_ids = [task_id for (task_id,) in completed_task_ids]

    # Query active tasks that are NOT in the completed list
    tasks = db.query(models.Task)\
              .filter(models.Task.is_active == True, not_(models.Task.id.in_(completed_task_ids)))\
              .all()
    return tasks

def create_task(db: Session, task_data: task_schemas.TaskCreate):
    """
    Creates a new task. (Admin/internal use)
    """
    db_task = models.Task(**task_data.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

def complete_task(db: Session, user: models.User, task_id: int):
    """
    Records a user's completion of a task and awards ZP.
    """
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found."
        )
    if not task.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task is not active."
        )

    # Check if user has already completed this task
    existing_completion = db.query(models.UserTaskCompletion)\
                            .filter(models.UserTaskCompletion.user_id == user.id,
                                    models.UserTaskCompletion.task_id == task_id)\
                            .first()
    if existing_completion:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Task already completed by this user."
        )

    # Record completion
    db_completion = models.UserTaskCompletion(
        user_id=user.id,
        task_id=task.id,
        status="completed" # Default to completed, can be 'pending_verification' for some types
    )
    db.add(db_completion)

    # Award ZP to the user
    user.zp_balance += task.zp_reward
    user.social_capital_score += task.zp_reward # Task completion contributes to SCS
    db.add(user) # Update user

    db.commit()
    db.refresh(db_completion)
    db.refresh(user)

    return {
        "message": f"Task '{task.title}' completed successfully. {task.zp_reward} ZP awarded.",
        "new_zp_balance": user.zp_balance,
        "completion": db_completion
  }
  
