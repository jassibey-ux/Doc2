"""Integration tests for the engagement API lifecycle.

Tests the full flow: create → engage → jam-on → jam-off → disengage → verify metrics.
Uses an in-memory SQLite database.
"""

import pytest
import pytest_asyncio
from datetime import datetime
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from logtail_dashboard.database.connection import DatabaseConfig, DatabaseManager
from logtail_dashboard.database.models import (
    Base, TestSession, CUASProfile, CUASPlacement, TrackerAssignment,
    generate_uuid,
)


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="module")
async def db_manager():
    """Create an in-memory database for testing."""
    config = DatabaseConfig(database_url="sqlite+aiosqlite:///:memory:")
    manager = DatabaseManager(config)
    await manager.create_tables_async()
    yield manager
    await manager.close()


@pytest_asyncio.fixture
async def db(db_manager):
    """Get a database session for a test."""
    async with db_manager.get_async_session() as session:
        yield session


@pytest_asyncio.fixture
async def seed_data(db):
    """Seed database with a session, CUAS placement, and tracker assignment."""
    session = TestSession(
        id=generate_uuid(),
        name="Test Session",
        status="active",
        start_time=datetime.utcnow(),
    )
    db.add(session)

    cuas_profile = CUASProfile(
        id=generate_uuid(),
        name="Test Jammer",
        vendor="TestCo",
        type="jammer",
    )
    db.add(cuas_profile)
    await db.flush()

    placement = CUASPlacement(
        id=generate_uuid(),
        session_id=session.id,
        cuas_profile_id=cuas_profile.id,
        lat=34.0,
        lon=-118.0,
        orientation_deg=90.0,
        active=True,
    )
    db.add(placement)

    assignment = TrackerAssignment(
        id=generate_uuid(),
        session_id=session.id,
        tracker_id="DRONE-1",
    )
    db.add(assignment)

    await db.flush()

    return {
        "session_id": session.id,
        "placement_id": placement.id,
        "cuas_profile_id": cuas_profile.id,
        "tracker_id": "DRONE-1",
    }


class TestEngagementAPILifecycle:
    """Test the full engagement API lifecycle."""

    @pytest.mark.asyncio
    async def test_create_engagement(self, db, seed_data):
        """Can create an engagement with emitter_type and targets."""
        from logtail_dashboard.database.repositories.engagements import EngagementRepository
        from logtail_dashboard.database.models import Engagement, EngagementTarget, EngagementStatus, EmitterType

        eng = Engagement(
            id=generate_uuid(),
            session_id=seed_data["session_id"],
            cuas_placement_id=seed_data["placement_id"],
            emitter_type=EmitterType.CUAS_SYSTEM.value,
            emitter_id=seed_data["placement_id"],
            name="Run 1",
            engagement_type="test",
            status=EngagementStatus.PLANNED.value,
        )
        db.add(eng)

        target = EngagementTarget(
            id=generate_uuid(),
            engagement_id=eng.id,
            tracker_id=seed_data["tracker_id"],
            role="primary_target",
        )
        db.add(target)
        await db.flush()

        repo = EngagementRepository(db)
        loaded = await repo.get_with_relations(eng.id)

        assert loaded is not None
        assert loaded.status == "planned"
        assert loaded.emitter_type == "cuas_system"
        assert len(loaded.targets) == 1
        assert loaded.targets[0].tracker_id == "DRONE-1"

    @pytest.mark.asyncio
    async def test_engagement_engage_transition(self, db, seed_data):
        """Can transition planned → active."""
        from logtail_dashboard.database.models import Engagement, EngagementTarget, EngagementStatus, EmitterType

        eng = Engagement(
            id=generate_uuid(),
            session_id=seed_data["session_id"],
            cuas_placement_id=seed_data["placement_id"],
            emitter_type=EmitterType.CUAS_SYSTEM.value,
            emitter_id=seed_data["placement_id"],
            status=EngagementStatus.PLANNED.value,
        )
        db.add(eng)

        target = EngagementTarget(
            id=generate_uuid(),
            engagement_id=eng.id,
            tracker_id=seed_data["tracker_id"],
            role="primary_target",
        )
        db.add(target)
        await db.flush()

        # Transition to active
        eng.status = EngagementStatus.ACTIVE.value
        eng.engage_timestamp = datetime.utcnow()
        await db.flush()

        assert eng.status == "active"
        assert eng.engage_timestamp is not None

    @pytest.mark.asyncio
    async def test_burst_lifecycle(self, db, seed_data):
        """Can create and close jam bursts within an engagement."""
        from logtail_dashboard.database.models import Engagement, EngagementTarget, EngagementStatus, EmitterType
        from logtail_dashboard.database.repositories.engagements import EngagementRepository

        eng = Engagement(
            id=generate_uuid(),
            session_id=seed_data["session_id"],
            cuas_placement_id=seed_data["placement_id"],
            emitter_type=EmitterType.CUAS_SYSTEM.value,
            emitter_id=seed_data["placement_id"],
            status=EngagementStatus.ACTIVE.value,
            engage_timestamp=datetime.utcnow(),
        )
        db.add(eng)

        target = EngagementTarget(
            id=generate_uuid(),
            engagement_id=eng.id,
            tracker_id=seed_data["tracker_id"],
            role="primary_target",
        )
        db.add(target)
        await db.flush()

        repo = EngagementRepository(db)

        # Create burst (jam-on)
        now = datetime.utcnow()
        burst = await repo.create_burst({
            "id": generate_uuid(),
            "engagement_id": eng.id,
            "burst_seq": 1,
            "jam_on_at": now,
            "source": "live",
        })
        assert burst.jam_on_at == now
        assert burst.jam_off_at is None

        # Verify open burst detection
        open_burst = await repo.get_open_burst(eng.id)
        assert open_burst is not None
        assert open_burst.id == burst.id

        # Close burst (jam-off)
        from datetime import timedelta
        off_time = now + timedelta(seconds=30)
        closed = await repo.close_burst(burst.id, off_time, 30.0)
        assert closed.jam_off_at == off_time
        assert closed.duration_s == 30.0

        # No more open bursts
        open_burst = await repo.get_open_burst(eng.id)
        assert open_burst is None

    @pytest.mark.asyncio
    async def test_multi_burst(self, db, seed_data):
        """Can create multiple bursts per engagement."""
        from logtail_dashboard.database.models import Engagement, EngagementStatus, EmitterType
        from logtail_dashboard.database.repositories.engagements import EngagementRepository
        from datetime import timedelta

        eng = Engagement(
            id=generate_uuid(),
            session_id=seed_data["session_id"],
            cuas_placement_id=seed_data["placement_id"],
            emitter_type=EmitterType.CUAS_SYSTEM.value,
            emitter_id=seed_data["placement_id"],
            status=EngagementStatus.ACTIVE.value,
            engage_timestamp=datetime.utcnow(),
        )
        db.add(eng)
        await db.flush()

        repo = EngagementRepository(db)
        now = datetime.utcnow()

        # Burst 1
        b1 = await repo.create_burst({
            "id": generate_uuid(), "engagement_id": eng.id,
            "burst_seq": 1, "jam_on_at": now, "source": "live",
        })
        await repo.close_burst(b1.id, now + timedelta(seconds=20), 20.0)

        # Burst 2
        b2 = await repo.create_burst({
            "id": generate_uuid(), "engagement_id": eng.id,
            "burst_seq": 2, "jam_on_at": now + timedelta(seconds=30), "source": "live",
        })
        await repo.close_burst(b2.id, now + timedelta(seconds=50), 20.0)

        # Burst 3
        b3 = await repo.create_burst({
            "id": generate_uuid(), "engagement_id": eng.id,
            "burst_seq": 3, "jam_on_at": now + timedelta(seconds=60), "source": "live",
        })
        await repo.close_burst(b3.id, now + timedelta(seconds=90), 30.0)

        bursts = await repo.get_bursts(eng.id)
        assert len(bursts) == 3
        assert bursts[0].burst_seq == 1
        assert bursts[1].burst_seq == 2
        assert bursts[2].burst_seq == 3

        max_seq = await repo.get_max_burst_seq(eng.id)
        assert max_seq == 3


class TestSessionActorAPI:
    """Test session actor CRUD operations."""

    @pytest.mark.asyncio
    async def test_create_actor(self, db, seed_data):
        """Can create a session actor."""
        from logtail_dashboard.database.repositories.engagements import SessionActorRepository

        repo = SessionActorRepository(db)
        actor = await repo.create({
            "session_id": seed_data["session_id"],
            "name": "Operator Alpha",
            "callsign": "ALPHA",
            "lat": 34.05,
            "lon": -118.05,
            "heading_deg": 90.0,
        })

        assert actor.name == "Operator Alpha"
        assert actor.callsign == "ALPHA"
        assert actor.is_active is True

    @pytest.mark.asyncio
    async def test_list_actors_by_session(self, db, seed_data):
        """Can list actors for a session."""
        from logtail_dashboard.database.repositories.engagements import SessionActorRepository

        repo = SessionActorRepository(db)
        await repo.create({
            "session_id": seed_data["session_id"],
            "name": "Actor 1",
        })
        await repo.create({
            "session_id": seed_data["session_id"],
            "name": "Actor 2",
        })
        await db.flush()

        actors = await repo.get_by_session(seed_data["session_id"])
        names = [a.name for a in actors]
        assert "Actor 1" in names
        assert "Actor 2" in names

    @pytest.mark.asyncio
    async def test_actor_engagement(self, db, seed_data):
        """Can create an engagement with an actor emitter."""
        from logtail_dashboard.database.repositories.engagements import SessionActorRepository
        from logtail_dashboard.database.models import Engagement, EngagementStatus, EmitterType

        actor_repo = SessionActorRepository(db)
        actor = await actor_repo.create({
            "session_id": seed_data["session_id"],
            "name": "Mobile Jammer",
            "lat": 34.1,
            "lon": -118.1,
        })
        await db.flush()

        eng = Engagement(
            id=generate_uuid(),
            session_id=seed_data["session_id"],
            cuas_placement_id=None,
            emitter_type=EmitterType.ACTOR.value,
            emitter_id=actor.id,
            status=EngagementStatus.PLANNED.value,
        )
        db.add(eng)
        await db.flush()

        assert eng.emitter_type == "actor"
        assert eng.emitter_id == actor.id
        assert eng.cuas_placement_id is None
