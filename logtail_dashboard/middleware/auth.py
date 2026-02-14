"""
Authentication Middleware (HMAC + JWT)

Dual auth scheme:
  - HMAC: For bridge/electron machine-to-machine authentication
  - JWT Bearer: For human users authenticated via /api/v2/auth/login

Requests with a valid Bearer token bypass HMAC checks.
Requests with HMAC headers are validated against the shared secret.
Excluded paths (health, login, docs) skip all auth.

HMAC Signature scheme:
  - Header: X-HMAC-Signature: <hex-digest>
  - Header: X-HMAC-Timestamp: <unix-timestamp>
  - Signature = HMAC-SHA256(secret, f"{method}\n{path}\n{timestamp}\n{body_hash}")
  - body_hash = SHA256(request_body) or SHA256("") for GET requests
  - Timestamp must be within 5 minutes of server time (replay protection)
"""

import hashlib
import hmac
import logging
import os
import time
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# Max age of a valid signature (5 minutes)
MAX_TIMESTAMP_AGE_S = 300


class HMACAuthMiddleware(BaseHTTPMiddleware):
    """HMAC + JWT authentication middleware for cloud API endpoints."""

    def __init__(self, app, secret: Optional[str] = None, exclude_paths: Optional[list] = None):
        super().__init__(app)
        raw_secret = secret or os.environ.get("HMAC_SECRET", "")
        self.secret = raw_secret.encode("utf-8")
        self.exclude_paths = exclude_paths or [
            "/api/v2/health",
            "/api/v2/auth/login",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]

        is_production = os.environ.get("ENVIRONMENT", "").lower() == "production"
        is_insecure = not raw_secret or raw_secret == "change-me-in-production"

        if is_insecure and is_production:
            raise RuntimeError(
                "HMAC_SECRET is not set or uses the insecure default. "
                "Set a strong HMAC_SECRET in your .env file for production deployments."
            )

        if is_insecure:
            logger.warning("HMAC_SECRET not set or using default. Auth will be DISABLED.")
            self.enabled = False
        else:
            self.enabled = True
            logger.info("HMAC auth middleware enabled")

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip auth for excluded paths
        if not self.enabled or any(request.url.path.startswith(p) for p in self.exclude_paths):
            return await call_next(request)

        # Check for JWT Bearer token first
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            if self._validate_jwt(token):
                return await call_next(request)
            return self._deny("Invalid or expired token")

        # Fall back to HMAC validation
        signature = request.headers.get("X-HMAC-Signature")
        timestamp_str = request.headers.get("X-HMAC-Timestamp")

        if not signature or not timestamp_str:
            return self._deny("Missing authentication headers")

        # Validate timestamp (replay protection)
        try:
            timestamp = int(timestamp_str)
        except ValueError:
            return self._deny("Invalid timestamp")

        now = int(time.time())
        if abs(now - timestamp) > MAX_TIMESTAMP_AGE_S:
            return self._deny("Request timestamp expired")

        # Read request body for signature verification
        body = await request.body()
        body_hash = hashlib.sha256(body).hexdigest()

        # Compute expected signature
        method = request.method.upper()
        path = request.url.path
        message = f"{method}\n{path}\n{timestamp_str}\n{body_hash}"
        expected_signature = hmac.new(
            self.secret,
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        # Constant-time comparison
        if not hmac.compare_digest(signature, expected_signature):
            logger.warning(f"HMAC auth failed for {method} {path}")
            return self._deny("Invalid HMAC signature")

        return await call_next(request)

    @staticmethod
    def _deny(detail: str) -> JSONResponse:
        """Return a 401 JSON response.

        BaseHTTPMiddleware does not propagate HTTPException correctly,
        so we return a JSONResponse directly instead of raising.
        """
        return JSONResponse(status_code=401, content={"detail": detail})

    @staticmethod
    def _validate_jwt(token: str) -> bool:
        """Validate a JWT token. Returns True if valid."""
        try:
            from .jwt_auth import decode_token
            payload = decode_token(token)
            return payload is not None
        except Exception:
            return False
