"""
JWT Authentication & RBAC

Creates and validates JWT tokens for user authentication.
Works alongside HMAC auth — HMAC for bridge/machine auth, JWT for human users.
"""

import logging
import os
from datetime import datetime, timedelta
from functools import wraps
from typing import Optional

from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT config
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

# Roles hierarchy: higher index = more access
ROLE_HIERARCHY = {
    "observer": 0,
    "analyst": 1,
    "operator": 2,
    "admin": 3,
}


def get_jwt_secret() -> str:
    """Get JWT secret from environment, fail hard if missing in production."""
    secret = os.environ.get("JWT_SECRET", "")
    is_production = os.environ.get("ENVIRONMENT", "").lower() == "production"

    if not secret and is_production:
        raise RuntimeError(
            "JWT_SECRET is not set. Set a strong JWT_SECRET in your .env file."
        )
    return secret or "dev-jwt-secret-not-for-production"


def hash_password(password: str) -> str:
    """Hash a plaintext password."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a hash."""
    return pwd_context.verify(plain, hashed)


def create_access_token(
    user_id: str,
    email: str,
    role: str,
    organization_id: str,
    expires_hours: int = JWT_EXPIRY_HOURS,
) -> str:
    """Create a signed JWT access token."""
    expire = datetime.utcnow() + timedelta(hours=expires_hours)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "org": organization_id,
        "exp": expire,
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token. Returns payload dict or None."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


class JWTUser:
    """Decoded JWT user information attached to requests."""

    def __init__(self, user_id: str, email: str, role: str, organization_id: str):
        self.user_id = user_id
        self.email = email
        self.role = role
        self.organization_id = organization_id

    def has_role(self, required_role: str) -> bool:
        """Check if user has at least the required role level."""
        user_level = ROLE_HIERARCHY.get(self.role, -1)
        required_level = ROLE_HIERARCHY.get(required_role, 99)
        return user_level >= required_level


async def get_current_user(request: Request) -> Optional[JWTUser]:
    """
    Extract JWT user from Authorization header.
    Returns None if no Bearer token present (HMAC auth may still apply).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return JWTUser(
        user_id=payload["sub"],
        email=payload["email"],
        role=payload["role"],
        organization_id=payload["org"],
    )


def require_role(required_role: str):
    """
    Dependency that requires JWT auth with a minimum role level.
    Usage: user = Depends(require_role("operator"))
    """
    async def dependency(request: Request) -> JWTUser:
        user = await get_current_user(request)
        if user is None:
            raise HTTPException(
                status_code=401,
                detail="Authentication required",
            )
        if not user.has_role(required_role):
            raise HTTPException(
                status_code=403,
                detail=f"Requires '{required_role}' role or higher",
            )
        return user

    return dependency
