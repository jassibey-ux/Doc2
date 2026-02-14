"""Integration tests for the POST /api/v2/telemetry/ingest endpoint.

Tests cover HMAC validation, bulk insert, field alias resolution,
session fallback, and record filtering.
Uses an in-memory SQLite database with pytest-asyncio.
"""

import hashlib
import hmac
import json
import time

import pytest
import pytest_asyncio
from datetime import datetime
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from logtail_dashboard.api_v2 import router as v2_router, _set_active_session_id
from logtail_dashboard.database.connection import DatabaseConfig, DatabaseManager, get_db
from logtail_dashboard.database.models import (
    Base,
    TestSession,
    TrackerTelemetry,
    generate_uuid,
)
from logtail_dashboard.database.repositories.telemetry import TelemetryRepository
from logtail_dashboard.middleware.auth import HMACAuthMiddleware


# ---------------------------------------------------------------------------
# Shared secret used across all HMAC tests
# ---------------------------------------------------------------------------
TEST_SECRET = "test-integration-secret-key"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compute_hmac(secret: str, method: str, path: str, body: bytes) -> tuple[str, str]:
    """Reproduce the bridge _sign_request logic for test assertions."""
    timestamp = str(int(time.time()))
    body_hash = hashlib.sha256(body).hexdigest()
    message = f"{method}\n{path}\n{timestamp}\n{body_hash}"
    signature = hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return signature, timestamp


def _make_payload(
    records: list[dict],
    organization_id: str = "org-test",
    session_id: str | None = None,
) -> dict:
    payload: dict = {
        "organization_id": organization_id,
        "records": records,
    }
    if session_id is not None:
        payload["session_id"] = session_id
    return payload


def _build_authed_app(db_manager, secret: str) -> FastAPI:
    """Build a FastAPI app with HMAC middleware, wired to test DB."""
    test_app = FastAPI()

    async def _override_get_db():
        async with db_manager.get_async_session() as session:
            yield session

    test_app.dependency_overrides[get_db] = _override_get_db
    test_app.add_middleware(HMACAuthMiddleware, secret=secret)
    test_app.include_router(v2_router)
    return test_app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="module")
async def db_manager():
    """Create an in-memory database for the entire test module."""
    config = DatabaseConfig(database_url="sqlite+aiosqlite:///:memory:")
    manager = DatabaseManager(config)
    await manager.create_tables_async()
    yield manager
    await manager.close()


@pytest_asyncio.fixture
async def db(db_manager):
    """Get a fresh database session for each test."""
    async with db_manager.get_async_session() as session:
        yield session


@pytest_asyncio.fixture
async def session_id(db) -> str:
    """Seed a single active TestSession and return its ID."""
    sid = generate_uuid()
    session = TestSession(
        id=sid,
        name="Ingest Test Session",
        status="active",
        start_time=datetime.utcnow(),
    )
    db.add(session)
    await db.flush()
    return sid


@pytest_asyncio.fixture
async def app(db_manager):
    """Build a minimal FastAPI app wired to the test DB (no auth middleware)."""
    test_app = FastAPI()

    async def _override_get_db():
        async with db_manager.get_async_session() as session:
            yield session

    test_app.dependency_overrides[get_db] = _override_get_db
    test_app.include_router(v2_router)
    yield test_app


@pytest_asyncio.fixture
async def authed_app(db_manager):
    """FastAPI app with HMAC middleware enabled, wired to test DB."""
    yield _build_authed_app(db_manager, TEST_SECRET)


# ---------------------------------------------------------------------------
# HMAC validation tests
# ---------------------------------------------------------------------------

class TestHMACValidation:
    """Verify HMAC auth middleware accepts/rejects correctly."""

    @pytest.mark.asyncio
    async def test_hmac_passes_with_correct_signature(self, authed_app, db, session_id):
        """Request with a correct HMAC signature is accepted (200)."""
        path = "/api/v2/telemetry/ingest"
        payload = _make_payload(
            session_id=session_id,
            records=[{
                "tracker_id": "T1",
                "time_local": "2024-06-01T12:00:00",
                "lat": 34.0,
                "lon": -118.0,
            }],
        )
        body = json.dumps(payload).encode("utf-8")
        signature, timestamp = _compute_hmac(TEST_SECRET, "POST", path, body)

        transport = ASGITransport(app=authed_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                path,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-HMAC-Signature": signature,
                    "X-HMAC-Timestamp": timestamp,
                },
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] == 1
        assert data["session_id"] == session_id

    @pytest.mark.asyncio
    async def test_hmac_fails_with_wrong_signature(self, authed_app, db, session_id):
        """Request with an incorrect HMAC signature is rejected (401)."""
        path = "/api/v2/telemetry/ingest"
        payload = _make_payload(
            session_id=session_id,
            records=[{
                "tracker_id": "T1",
                "time_local": "2024-06-01T12:00:00",
                "lat": 34.0,
                "lon": -118.0,
            }],
        )
        body = json.dumps(payload).encode("utf-8")
        timestamp = str(int(time.time()))

        transport = ASGITransport(app=authed_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                path,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-HMAC-Signature": "badc0ffee" * 8,  # wrong sig
                    "X-HMAC-Timestamp": timestamp,
                },
            )

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_hmac_fails_with_missing_headers(self, authed_app):
        """Request without HMAC headers is rejected (401)."""
        path = "/api/v2/telemetry/ingest"
        payload = _make_payload(records=[{"tracker_id": "T1", "lat": 1, "lon": 2}])
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=authed_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                path,
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_hmac_fails_with_expired_timestamp(self, authed_app):
        """Request with a timestamp older than 5 minutes is rejected."""
        path = "/api/v2/telemetry/ingest"
        payload = _make_payload(records=[{"tracker_id": "T1", "lat": 1, "lon": 2}])
        body = json.dumps(payload).encode("utf-8")

        # Timestamp 10 minutes in the past
        old_timestamp = str(int(time.time()) - 600)
        body_hash = hashlib.sha256(body).hexdigest()
        message = f"POST\n{path}\n{old_timestamp}\n{body_hash}"
        signature = hmac.new(
            TEST_SECRET.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        transport = ASGITransport(app=authed_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                path,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-HMAC-Signature": signature,
                    "X-HMAC-Timestamp": old_timestamp,
                },
            )

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Telemetry ingest logic tests (no middleware, testing endpoint logic only)
# ---------------------------------------------------------------------------

class TestBulkInsert:
    """Test bulk insertion of telemetry records via the endpoint."""

    @pytest.mark.asyncio
    async def test_bulk_insert_multiple_records(self, app, db, session_id):
        """Multiple records are inserted and the correct count is returned."""
        records = [
            {
                "tracker_id": "DRONE-A",
                "time_local": f"2024-06-01T12:00:{i:02d}",
                "lat": 34.0 + i * 0.001,
                "lon": -118.0 + i * 0.001,
                "alt_m": 100.0 + i,
                "speed_mps": 5.0 + i,
                "satellites": 12,
                "fix_valid": True,
            }
            for i in range(10)
        ]
        payload = _make_payload(session_id=session_id, records=records)
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] == 10
        assert data["session_id"] == session_id

    @pytest.mark.asyncio
    async def test_inserted_records_are_persisted(self, app, db, session_id):
        """Records inserted via the endpoint are queryable from the database."""
        records = [
            {
                "tracker_id": "PERSIST-1",
                "time_local": "2024-06-01T12:00:00",
                "lat": 35.0,
                "lon": -117.0,
                "alt_m": 200.0,
                "speed_mps": 8.0,
                "course_deg": 90.0,
                "hdop": 1.2,
                "satellites": 10,
                "fix_valid": True,
                "rssi_dbm": -75.0,
                "battery_mv": 3800.0,
            },
        ]
        payload = _make_payload(session_id=session_id, records=records)
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200

        # Query the database directly
        repo = TelemetryRepository(db)
        rows = await repo.get_by_session(session_id, tracker_id="PERSIST-1")
        assert len(rows) >= 1
        row = rows[0]
        assert row.lat == 35.0
        assert row.lon == -117.0
        assert row.alt_m == 200.0
        assert row.speed_mps == 8.0
        assert row.course_deg == 90.0
        assert row.hdop == 1.2
        assert row.satellites == 10
        assert row.fix_valid is True
        assert row.rssi_dbm == -75.0
        assert row.battery_mv == 3800.0


class TestFieldAliasResolution:
    """Test that field aliases in TelemetryRecordInput are correctly mapped."""

    @pytest.mark.asyncio
    async def test_sat_count_alias(self, app, db, session_id):
        """sat_count should resolve to satellites when satellites is absent."""
        payload = _make_payload(
            session_id=session_id,
            records=[{
                "tracker_id": "ALIAS-1",
                "time_local": "2024-06-01T13:00:00",
                "lat": 34.1,
                "lon": -118.1,
                "sat_count": 9,
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        repo = TelemetryRepository(db)
        rows = await repo.get_by_session(session_id, tracker_id="ALIAS-1")
        assert len(rows) >= 1
        assert rows[0].satellites == 9

    @pytest.mark.asyncio
    async def test_speed_alias(self, app, db, session_id):
        """speed should resolve to speed_mps when speed_mps is absent."""
        payload = _make_payload(
            session_id=session_id,
            records=[{
                "tracker_id": "ALIAS-2",
                "time_local": "2024-06-01T13:01:00",
                "lat": 34.2,
                "lon": -118.2,
                "speed": 12.5,
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        repo = TelemetryRepository(db)
        rows = await repo.get_by_session(session_id, tracker_id="ALIAS-2")
        assert len(rows) >= 1
        assert rows[0].speed_mps == 12.5

    @pytest.mark.asyncio
    async def test_course_alias(self, app, db, session_id):
        """course should resolve to course_deg when course_deg is absent."""
        payload = _make_payload(
            session_id=session_id,
            records=[{
                "tracker_id": "ALIAS-3",
                "time_local": "2024-06-01T13:02:00",
                "lat": 34.3,
                "lon": -118.3,
                "course": 270.0,
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        repo = TelemetryRepository(db)
        rows = await repo.get_by_session(session_id, tracker_id="ALIAS-3")
        assert len(rows) >= 1
        assert rows[0].course_deg == 270.0

    @pytest.mark.asyncio
    async def test_timestamp_alias(self, app, db, session_id):
        """timestamp alias should be used when time_local is absent."""
        payload = _make_payload(
            session_id=session_id,
            records=[{
                "tracker_id": "ALIAS-4",
                "timestamp": "2024-06-01T14:00:00",
                "lat": 34.4,
                "lon": -118.4,
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        repo = TelemetryRepository(db)
        rows = await repo.get_by_session(session_id, tracker_id="ALIAS-4")
        assert len(rows) >= 1
        assert rows[0].time_local_received.hour == 14

    @pytest.mark.asyncio
    async def test_fix_type_to_fix_valid(self, app, db, session_id):
        """fix_type='3d' should resolve to fix_valid=True."""
        payload = _make_payload(
            session_id=session_id,
            records=[{
                "tracker_id": "ALIAS-5",
                "time_local": "2024-06-01T15:00:00",
                "lat": 34.5,
                "lon": -118.5,
                "fix_type": "3d",
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        repo = TelemetryRepository(db)
        rows = await repo.get_by_session(session_id, tracker_id="ALIAS-5")
        assert len(rows) >= 1
        assert rows[0].fix_valid is True

    @pytest.mark.asyncio
    async def test_explicit_value_preferred_over_alias(self, app, db, session_id):
        """When both satellites and sat_count are provided, satellites wins."""
        payload = _make_payload(
            session_id=session_id,
            records=[{
                "tracker_id": "ALIAS-6",
                "time_local": "2024-06-01T16:00:00",
                "lat": 34.6,
                "lon": -118.6,
                "satellites": 15,
                "sat_count": 7,
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        repo = TelemetryRepository(db)
        rows = await repo.get_by_session(session_id, tracker_id="ALIAS-6")
        assert len(rows) >= 1
        assert rows[0].satellites == 15


class TestSessionFallback:
    """Test session_id resolution: explicit, active-session fallback, and error."""

    @pytest.mark.asyncio
    async def test_missing_session_id_falls_back_to_active(self, app, db, session_id):
        """When session_id is omitted, the active session is used."""
        # Set the module-level active session
        _set_active_session_id(session_id)

        payload = _make_payload(
            records=[{
                "tracker_id": "FALLBACK-1",
                "time_local": "2024-06-01T17:00:00",
                "lat": 34.7,
                "lon": -118.7,
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == session_id
        assert data["accepted"] == 1

        # Clean up
        _set_active_session_id(None)

    @pytest.mark.asyncio
    async def test_422_when_no_session_available(self, app):
        """When no session_id and no active session, endpoint returns 422."""
        _set_active_session_id(None)

        payload = _make_payload(
            records=[{
                "tracker_id": "ORPHAN-1",
                "time_local": "2024-06-01T18:00:00",
                "lat": 34.8,
                "lon": -118.8,
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_404_when_session_not_found(self, app):
        """When an explicit session_id does not exist, endpoint returns 404."""
        payload = _make_payload(
            session_id="non-existent-session-id",
            records=[{
                "tracker_id": "GHOST-1",
                "time_local": "2024-06-01T19:00:00",
                "lat": 34.9,
                "lon": -118.9,
            }],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 404


class TestRecordFiltering:
    """Test that records without lat/lon are filtered out."""

    @pytest.mark.asyncio
    async def test_records_without_lat_lon_are_skipped(self, app, db, session_id):
        """Records with None lat or lon are skipped; valid ones are accepted."""
        payload = _make_payload(
            session_id=session_id,
            records=[
                {
                    "tracker_id": "FILTER-1",
                    "time_local": "2024-06-01T20:00:00",
                    "lat": None,
                    "lon": -118.0,
                },
                {
                    "tracker_id": "FILTER-2",
                    "time_local": "2024-06-01T20:00:01",
                    "lat": 34.0,
                    "lon": None,
                },
                {
                    "tracker_id": "FILTER-3",
                    "time_local": "2024-06-01T20:00:02",
                    # lat and lon absent entirely
                },
                {
                    "tracker_id": "FILTER-OK",
                    "time_local": "2024-06-01T20:00:03",
                    "lat": 34.5,
                    "lon": -118.5,
                },
            ],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] == 1  # Only FILTER-OK has both lat and lon

    @pytest.mark.asyncio
    async def test_all_records_skipped_returns_zero(self, app, db, session_id):
        """When every record lacks lat/lon, accepted=0 and no DB error."""
        payload = _make_payload(
            session_id=session_id,
            records=[
                {"tracker_id": "SKIP-1", "time_local": "2024-06-01T21:00:00"},
                {"tracker_id": "SKIP-2", "time_local": "2024-06-01T21:00:01", "lat": 34.0},
            ],
        )
        body = json.dumps(payload).encode("utf-8")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v2/telemetry/ingest",
                content=body,
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        assert resp.json()["accepted"] == 0
