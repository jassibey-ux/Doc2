"""
HMAC Authentication Middleware

Verifies HMAC-signed requests from bridge services and authenticated clients.
Used for cloud deployments where API endpoints must be authenticated.

Signature scheme:
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

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Max age of a valid signature (5 minutes)
MAX_TIMESTAMP_AGE_S = 300


class HMACAuthMiddleware(BaseHTTPMiddleware):
    """HMAC authentication middleware for cloud API endpoints."""

    def __init__(self, app, secret: Optional[str] = None, exclude_paths: Optional[list] = None):
        super().__init__(app)
        self.secret = (secret or os.environ.get("HMAC_SECRET", "")).encode("utf-8")
        self.exclude_paths = exclude_paths or [
            "/api/v2/health",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]

        if not self.secret or self.secret == b"change-me-in-production":
            logger.warning("HMAC_SECRET not set or using default. Auth will be DISABLED.")
            self.enabled = False
        else:
            self.enabled = True
            logger.info("HMAC auth middleware enabled")

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip auth for excluded paths
        if not self.enabled or any(request.url.path.startswith(p) for p in self.exclude_paths):
            return await call_next(request)

        # Extract headers
        signature = request.headers.get("X-HMAC-Signature")
        timestamp_str = request.headers.get("X-HMAC-Timestamp")

        if not signature or not timestamp_str:
            raise HTTPException(status_code=401, detail="Missing HMAC authentication headers")

        # Validate timestamp (replay protection)
        try:
            timestamp = int(timestamp_str)
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid timestamp")

        now = int(time.time())
        if abs(now - timestamp) > MAX_TIMESTAMP_AGE_S:
            raise HTTPException(status_code=401, detail="Request timestamp expired")

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
            raise HTTPException(status_code=401, detail="Invalid HMAC signature")

        return await call_next(request)
