# backend/app/services/two_factor_auth.py

import pyotp
import qrcode
import io
from base64 import b64encode
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.db import models
from app.core.config import settings
from datetime import datetime, timezone

def generate_2fa_secret() -> str:
    """Generates a random base32 secret for TOTP."""
    return pyotp.random_base32()

def get_totp_uri(secret: str, user_email: str) -> str:
    """Generates the OTPAuth URI for authenticator apps."""
    # The 'issuer_name' is your app's name, 'Ziver'
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=user_email,
        issuer_name=settings.APP_NAME
    )

def verify_totp_code(secret: str, code: str) -> bool:
    """Verifies a TOTP code."""
    if not secret: # Should not happen if 2FA is enabled
        return False
    totp = pyotp.TOTP(secret)
    # Drift is for time synchronization tolerance (e.g., 30 seconds before or after current time)
    # interval is typically 30 seconds for TOTP
    return totp.verify(code, valid_window=1) # valid_window=1 allows one step (30s) drift

def enable_2fa_for_user(db: Session, user: models.User):
    """
    Generates a 2FA secret and returns the QR code image for the user to scan.
    The secret is saved, but 2FA is not marked 'enabled' until confirmed.
    """
    if user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled for this account."
        )
    if user.two_fa_secret:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup already initiated. Please confirm or disable existing setup."
        )


    secret = generate_2fa_secret()
    user.two_fa_secret = secret # Save the secret
    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate QR code as base64 image (for frontend display)
    totp_uri = get_totp_uri(secret, user.email)
    img = qrcode.make(totp_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_code_base64 = b64encode(buf.getvalue()).decode("utf-8")

    return {
        "secret": secret,
        "qr_code_image": f"data:image/png;base64,{qr_code_base64}", # Data URL format
        "message": "Scan this QR code with your authenticator app and confirm with a code."
    }

def confirm_2fa_setup(db: Session, user: models.User, code: str) -> bool:
    """
    Confirms 2FA setup by verifying the first code from the user.
    """
    if user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled."
        )
    if not user.two_fa_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup not initiated. Please enable 2FA first."
        )

    if verify_totp_code(user.two_fa_secret, code):
        user.is_2fa_enabled = True
        db.add(user)
        db.commit()
        db.refresh(user)
        return True
    else:
        # Important: do not rollback the secret, allow user to try again
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code. Please try again."
        )

def disable_2fa_for_user(db: Session, user: models.User, code: str) -> bool:
    """
    Disables 2FA for a user after verifying a code.
    """
    if not user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this user."
        )

    if not verify_totp_code(user.two_fa_secret, code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code. 2FA not disabled."
        )

    user.two_fa_secret = None
    user.is_2fa_enabled = False
    db.add(user)
    db.commit()
    db.refresh(user)
    return True
