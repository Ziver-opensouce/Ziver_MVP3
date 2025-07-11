"""
Service layer for handling all Two-Factor Authentication (2FA) logic,
including enabling, confirming, and disabling TOTP for users.
"""
import io
from base64 import b64encode

import pyotp
import qrcode
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import models


def generate_2fa_secret() -> str:
    """Generates a random base32 secret for TOTP."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, user_email: str) -> str:
    """Generates the OTPAuth URI for authenticator apps."""
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=user_email, issuer_name=settings.APP_NAME
    )


def verify_totp_code(secret: str, code: str) -> bool:
    """
    Verifies a TOTP code against the user's secret.
    Allows for a 30-second time drift.
    """
    if not secret:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def enable_2fa_for_user(db: Session, user: models.User):
    """
    Generates a 2FA secret and returns data for QR code generation.
    The secret is saved temporarily, but 2FA is not enabled until confirmed.
    """
    if user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled for this account.",
        )
    if user.two_fa_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup already initiated. Please confirm or disable the existing setup.",
        )

    secret = generate_2fa_secret()
    user.two_fa_secret = secret
    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate QR code as a base64 data URL for the frontend
    totp_uri = get_totp_uri(secret, user.email)
    img = qrcode.make(totp_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_code_base64 = b64encode(buf.getvalue()).decode("utf-8")

    return {
        "secret": secret,
        "qr_code_image": f"data:image/png;base64,{qr_code_base64}",
        "message": "Scan this QR code with your authenticator app and confirm with a code.",
    }


def confirm_2fa_setup(db: Session, user: models.User, code: str) -> bool:
    """Confirms and activates 2FA setup by verifying the first code."""
    if user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is already enabled."
        )
    if not user.two_fa_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup has not been initiated. Please enable 2FA first.",
        )

    if verify_totp_code(user.two_fa_secret, code):
        user.is_2fa_enabled = True
        db.add(user)
        db.commit()
        db.refresh(user)
        return True

    # Pylint suggestion: No need for 'else' after a return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid 2FA code. Please try again.",
    )


def disable_2fa_for_user(db: Session, user: models.User, code: str) -> bool:
    """Disables 2FA for a user after verifying a current code."""
    if not user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this user.",
        )

    if not verify_totp_code(user.two_fa_secret, code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code. 2FA not disabled.",
        )

    user.two_fa_secret = None
    user.is_2fa_enabled = False
    db.add(user)
    db.commit()
    db.refresh(user)
    return True
