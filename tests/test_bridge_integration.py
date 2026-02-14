"""End-to-end integration tests: bridge CSV parser -> cloud ingest endpoint.

Verifies that:
  1. The BridgeCSVParser output matches the TelemetryIngestRequest schema.
  2. The bridge _sign_request function produces signatures that the
     HMACAuthMiddleware accepts.
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

from bridge.parser import BridgeCSVParser
from bridge.uploader import _sign_request
from logtail_dashboard.api_v2 import router as v2_router, TelemetryRecordInput, _set_active_session_id
from logtail_dashboard.database.connection import DatabaseConfig, DatabaseManager, get_db
from logtail_dashboard.database.models import (
    TestSession,
    generate_uuid,
)
from logtail_dashboard.database.repositories.telemetry import TelemetryRepository
from logtail_dashboard.middleware.auth import HMACAuthMiddleware


# ---------------------------------------------------------------------------
# Shared test secret
# ---------------------------------------------------------------------------
BRIDGE_SECRET = "bridge-e2e-test-secret"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="module")
async def db_manager():
    """In-memory SQLite database for the module."""
    config = DatabaseConfig(database_url="sqlite+aiosqlite:///:memory:")
    manager = DatabaseManager(config)
    await manager.create_tables_async()
    yield manager
    await manager.close()


@pytest_asyncio.fixture
async def db(db_manager):
    async with db_manager.get_async_session() as session:
        yield session


@pytest_asyncio.fixture
async def session_id(db) -> str:
    """Seed a TestSession for telemetry ingest."""
    sid = generate_uuid()
    sess = TestSession(
        id=sid,
        name="Bridge Integration Session",
        status="active",
        start_time=datetime.utcnow(),
    )
    db.add(sess)
    await db.flush()
    return sid


@pytest_asyncio.fixture
async def authed_app(db_manager):
    """FastAPI app with HMAC middleware, wired to the in-memory DB."""
    test_app = FastAPI()

    async def _override_get_db():
        async with db_manager.get_async_session() as session:
            yield session

    test_app.dependency_overrides[get_db] = _override_get_db
    test_app.add_middleware(HMACAuthMiddleware, secret=BRIDGE_SECRET)
    test_app.include_router(v2_router)
    yield test_app


@pytest_asyncio.fixture
async def app(db_manager):
    """FastAPI app without HMAC middleware (for schema-only tests)."""
    test_app = FastAPI()

    async def _override_get_db():
        async with db_manager.get_async_session() as session:
            yield session

    test_app.dependency_overrides[get_db] = _override_get_db
    test_app.include_router(v2_router)
    yield test_app


# ---------------------------------------------------------------------------
# CSV content fixtures
# ---------------------------------------------------------------------------

SAMPLE_CSV_STANDARD = """\
tracker_id,time,lat,lon,alt,speed,course,hdop,satellites,fix_valid,rssi,baro_alt,battery_mv
DRONE-A,2024-06-01T10:00:00,34.0500,-118.2500,120.5,8.3,45.0,1.2,12,true,-82,115.3,3950
DRONE-A,2024-06-01T10:00:01,34.0501,-118.2499,121.0,8.5,46.0,1.1,13,true,-80,116.0,3945
DRONE-B,2024-06-01T10:00:00,34.0510,-118.2510,130.0,5.0,180.0,1.5,10,true,-90,128.5,4100
"""

SAMPLE_CSV_ALIASED = """\
id,timestamp,latitude,longitude,altitude_m,speed_m_s,heading,dop,sat_count,gps_fix,rssi_dbm,baro_altitude,voltage_mv
DRONE-X,2024-06-01T11:00:00,34.1000,-118.3000,200.0,15.0,90.0,0.9,14,1,-65,198.0,3800
DRONE-X,2024-06-01T11:00:01,34.1001,-118.2999,201.0,15.2,91.0,0.8,14,1,-64,199.0,3795
"""

SAMPLE_CSV_MISSING_POSITION = """\
tracker_id,time,lat,lon,fix_valid
DRONE-Z,2024-06-01T12:00:00,,,false
DRONE-Z,2024-06-01T12:00:01,34.2000,-118.4000,true
"""


# ---------------------------------------------------------------------------
# Bridge CSV parser → ingest format tests
# ---------------------------------------------------------------------------

class TestBridgeCSVParserOutputFormat:
    """Verify BridgeCSVParser output conforms to TelemetryRecordInput schema."""

    def test_standard_csv_produces_valid_records(self):
        """Standard column names parse into dicts that match TelemetryRecordInput."""
        parser = BridgeCSVParser()
        records = parser.parse_content(SAMPLE_CSV_STANDARD)

        assert len(records) == 3

        # Every record should be accepted by the Pydantic model
        for rec in records:
            model = TelemetryRecordInput(**rec)
            assert model.tracker_id == rec["tracker_id"]

    def test_standard_csv_field_mapping(self):
        """Verify specific field names match what the ingest endpoint expects."""
        parser = BridgeCSVParser()
        records = parser.parse_content(SAMPLE_CSV_STANDARD)

        first = records[0]
        assert first["tracker_id"] == "DRONE-A"
        assert first["time_local"] is not None
        assert first["lat"] == 34.05
        assert first["lon"] == -118.25
        assert first["alt_m"] == 120.5
        assert first["speed_mps"] == 8.3
        assert first["course_deg"] == 45.0
        assert first["hdop"] == 1.2
        assert first["satellites"] == 12
        assert first["fix_valid"] is True
        assert first["rssi_dbm"] == -82.0
        assert first["battery_mv"] == 3950.0

    def test_aliased_csv_field_resolution(self):
        """Parser resolves column aliases (id, timestamp, sat_count, etc.)."""
        parser = BridgeCSVParser()
        records = parser.parse_content(SAMPLE_CSV_ALIASED)

        assert len(records) == 2

        first = records[0]
        assert first["tracker_id"] == "DRONE-X"
        assert first["time_local"] is not None
        assert first["lat"] == 34.1
        assert first["lon"] == -118.3
        assert first["alt_m"] == 200.0
        assert first["speed_mps"] == 15.0
        assert first["course_deg"] == 90.0
        assert first["satellites"] == 14
        assert first["fix_valid"] is True

    def test_missing_position_rows_still_parse(self):
        """Rows without lat/lon still produce dicts; filtering happens at ingest."""
        parser = BridgeCSVParser()
        records = parser.parse_content(SAMPLE_CSV_MISSING_POSITION)

        # Parser produces records for rows that have a tracker_id
        assert len(records) == 2

        # First record has no lat/lon
        assert "lat" not in records[0] or records[0].get("lat") is None
        # Second record has lat/lon
        assert records[1]["lat"] == 34.2
        assert records[1]["lon"] == -118.4

    def test_empty_csv_returns_empty_list(self):
        """An empty CSV produces an empty record list."""
        parser = BridgeCSVParser()
        records = parser.parse_content("")
        assert records == []

    def test_header_only_csv_returns_empty_list(self):
        """A CSV with only headers produces an empty record list."""
        parser = BridgeCSVParser()
        records = parser.parse_content("tracker_id,time,lat,lon\n")
        assert records == []


class TestBridgeCSVToIngestEndpoint:
    """End-to-end: parse CSV -> POST to ingest endpoint -> verify DB rows."""

    @pytest.mark.asyncio
    async def test_parsed_csv_accepted_by_endpoint(self, app, db, session_id):
        """Records from BridgeCSVParser are accepted by the ingest endpoint."""
        parser = BridgeCSVParser()
        records = parser.parse_content(SAMPLE_CSV_STANDARD)

        payload = {
            "organization_id": "org-bridge-test",
            "session_id": session_id,
            "records": records,
        }
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
        assert data["accepted"] == 3
        assert data["session_id"] == session_id

    @pytest.mark.asyncio
    async def test_parsed_csv_data_correct_in_db(self, app, db, session_id):
        """Data parsed from CSV and ingested is correctly persisted."""
        parser = BridgeCSVParser()
        records = parser.parse_content(SAMPLE_CSV_STANDARD)

        payload = {
            "organization_id": "org-bridge-test",
            "session_id": session_id,
            "records": records,
        }
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
        rows = await repo.get_by_session(session_id, tracker_id="DRONE-B")
        assert len(rows) >= 1
        row = rows[0]
        assert row.lat == 34.051
        assert row.lon == -118.251
        assert row.alt_m == 130.0
        assert row.speed_mps == 5.0
        assert row.course_deg == 180.0

    @pytest.mark.asyncio
    async def test_csv_with_missing_positions_filtered(self, app, db, session_id):
        """Records without lat/lon from CSV are filtered out at ingest."""
        parser = BridgeCSVParser()
        records = parser.parse_content(SAMPLE_CSV_MISSING_POSITION)

        payload = {
            "organization_id": "org-bridge-test",
            "session_id": session_id,
            "records": records,
        }
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
        # Only the second row (with lat/lon) should be accepted
        assert data["accepted"] == 1


# ---------------------------------------------------------------------------
# HMAC signing compatibility tests
# ---------------------------------------------------------------------------

class TestHMACSigningCompatibility:
    """Verify bridge _sign_request output is accepted by HMACAuthMiddleware."""

    @pytest.mark.asyncio
    async def test_bridge_signature_accepted_by_middleware(self, authed_app, db, session_id):
        """Signature from bridge _sign_request is accepted by cloud middleware."""
        path = "/api/v2/telemetry/ingest"

        parser = BridgeCSVParser()
        records = parser.parse_content(SAMPLE_CSV_STANDARD)

        payload = {
            "organization_id": "org-hmac-test",
            "session_id": session_id,
            "records": records,
        }
        body = json.dumps(payload).encode("utf-8")

        # Use the bridge's actual signing function
        signature, timestamp = _sign_request(BRIDGE_SECRET, "POST", path, body)

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
        assert data["accepted"] == 3

    def test_bridge_and_middleware_produce_same_signature(self):
        """The bridge signing logic matches the middleware verification logic."""
        secret = "shared-secret-for-verification"
        method = "POST"
        path = "/api/v2/telemetry/ingest"
        body = b'{"organization_id":"test","records":[]}'

        # Bridge side: _sign_request
        sig_bridge, ts_bridge = _sign_request(secret, method, path, body)

        # Middleware side: replicate the verification computation
        body_hash = hashlib.sha256(body).hexdigest()
        message = f"{method}\n{path}\n{ts_bridge}\n{body_hash}"
        expected = hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        assert hmac.compare_digest(sig_bridge, expected), (
            "Bridge signature does not match middleware expected signature"
        )

    def test_different_secret_produces_different_signature(self):
        """Different secrets produce non-matching signatures."""
        method = "POST"
        path = "/api/v2/telemetry/ingest"
        body = b'{"organization_id":"test","records":[]}'

        sig_a, ts_a = _sign_request("secret-alpha", method, path, body)

        # Compute with different secret but same timestamp
        body_hash = hashlib.sha256(body).hexdigest()
        message = f"{method}\n{path}\n{ts_a}\n{body_hash}"
        sig_b = hmac.new(
            "secret-beta".encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        assert not hmac.compare_digest(sig_a, sig_b)

    def test_sign_request_includes_body_in_signature(self):
        """Changing the body changes the signature (payload integrity)."""
        secret = "body-integrity-test"
        method = "POST"
        path = "/api/v2/telemetry/ingest"

        body_a = b'{"organization_id":"test","records":[{"tracker_id":"A"}]}'
        body_b = b'{"organization_id":"test","records":[{"tracker_id":"B"}]}'

        sig_a, ts_a = _sign_request(secret, method, path, body_a)

        # Recompute with body_b using the same timestamp
        body_hash_b = hashlib.sha256(body_b).hexdigest()
        message_b = f"{method}\n{path}\n{ts_a}\n{body_hash_b}"
        sig_b = hmac.new(
            secret.encode("utf-8"),
            message_b.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        assert not hmac.compare_digest(sig_a, sig_b), (
            "Signatures should differ when body content changes"
        )

    def test_sign_request_includes_method_and_path(self):
        """Changing method or path changes the signature."""
        secret = "method-path-test"
        body = b'{"data":"test"}'

        sig_post, ts = _sign_request(secret, "POST", "/api/v2/telemetry/ingest", body)

        # Same timestamp, different path
        body_hash = hashlib.sha256(body).hexdigest()
        message_get = f"GET\n/api/v2/telemetry/ingest\n{ts}\n{body_hash}"
        sig_get = hmac.new(
            secret.encode("utf-8"),
            message_get.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        assert not hmac.compare_digest(sig_post, sig_get)

        message_diff_path = f"POST\n/api/v2/other\n{ts}\n{body_hash}"
        sig_diff_path = hmac.new(
            secret.encode("utf-8"),
            message_diff_path.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        assert not hmac.compare_digest(sig_post, sig_diff_path)
