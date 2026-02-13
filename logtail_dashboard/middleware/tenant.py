"""
Tenant Isolation Middleware

Ensures all database queries are scoped to the requesting organization.
Used in cloud deployments for multi-tenant data isolation.

Tenant ID is extracted from:
  1. X-Organization-ID header (set by authenticated bridge/portal)
  2. JWT token claims (future: when JWT auth is added)
"""

import logging
from typing import Optional

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger(__name__)


class TenantMiddleware(BaseHTTPMiddleware):
    """Multi-tenant isolation middleware."""

    def __init__(self, app, enabled: bool = True, exclude_paths: Optional[list] = None):
        super().__init__(app)
        self.enabled = enabled
        self.exclude_paths = exclude_paths or [
            "/api/v2/health",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not self.enabled or any(request.url.path.startswith(p) for p in self.exclude_paths):
            return await call_next(request)

        # Extract organization ID from header
        org_id = request.headers.get("X-Organization-ID")

        if not org_id:
            raise HTTPException(
                status_code=400,
                detail="X-Organization-ID header required for cloud deployments"
            )

        # Store in request state for downstream access
        request.state.organization_id = org_id

        return await call_next(request)


def get_organization_id(request: Request) -> str:
    """FastAPI dependency to extract organization_id from request state."""
    org_id = getattr(request.state, "organization_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID not available")
    return org_id
