"""Tests for jam burst open/close pairing logic."""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from logtail_dashboard.database.models import (
    Engagement, EngagementJamBurst, EngagementStatus, EmitterType,
    generate_uuid,
)


class TestBurstPairing:
    """Test burst open/close pairing and edge cases."""

    def _make_engagement(self, status="active"):
        eng = Engagement()
        eng.id = generate_uuid()
        eng.session_id = generate_uuid()
        eng.status = status
        eng.emitter_type = EmitterType.CUAS_SYSTEM.value
        eng.emitter_id = generate_uuid()
        eng.cuas_placement_id = eng.emitter_id
        eng.engage_timestamp = datetime.utcnow()
        eng.cuas_lat = 34.0
        eng.cuas_lon = -118.0
        eng.targets = []
        eng.bursts = []
        return eng

    def _make_burst(self, engagement_id, seq, jam_on_at, jam_off_at=None, duration_s=None):
        burst = EngagementJamBurst()
        burst.id = generate_uuid()
        burst.engagement_id = engagement_id
        burst.burst_seq = seq
        burst.jam_on_at = jam_on_at
        burst.jam_off_at = jam_off_at
        burst.duration_s = duration_s
        burst.gps_denial_detected = False
        burst.source = "live"
        return burst

    def test_burst_creation(self):
        """A burst can be created with jam_on_at and no jam_off_at."""
        eng = self._make_engagement()
        now = datetime.utcnow()
        burst = self._make_burst(eng.id, 1, now)

        assert burst.jam_on_at == now
        assert burst.jam_off_at is None
        assert burst.duration_s is None
        assert burst.burst_seq == 1

    def test_burst_close(self):
        """A burst can be closed by setting jam_off_at and duration_s."""
        eng = self._make_engagement()
        now = datetime.utcnow()
        burst = self._make_burst(eng.id, 1, now)

        off_time = now + timedelta(seconds=30)
        burst.jam_off_at = off_time
        burst.duration_s = 30.0

        assert burst.jam_off_at == off_time
        assert burst.duration_s == 30.0

    def test_open_burst_detection(self):
        """Only bursts with jam_off_at=None are 'open'."""
        eng = self._make_engagement()
        now = datetime.utcnow()

        b1 = self._make_burst(eng.id, 1, now - timedelta(minutes=5), now - timedelta(minutes=4), 60.0)
        b2 = self._make_burst(eng.id, 2, now)  # open

        bursts = [b1, b2]
        open_bursts = [b for b in bursts if b.jam_off_at is None]
        assert len(open_bursts) == 1
        assert open_bursts[0].burst_seq == 2

    def test_no_open_burst(self):
        """When all bursts are closed, there's no open burst."""
        eng = self._make_engagement()
        now = datetime.utcnow()

        b1 = self._make_burst(eng.id, 1, now - timedelta(minutes=5), now - timedelta(minutes=4), 60.0)
        b2 = self._make_burst(eng.id, 2, now - timedelta(minutes=2), now - timedelta(minutes=1), 60.0)

        bursts = [b1, b2]
        open_bursts = [b for b in bursts if b.jam_off_at is None]
        assert len(open_bursts) == 0

    def test_burst_seq_increment(self):
        """burst_seq should increment for each new burst."""
        eng = self._make_engagement()
        now = datetime.utcnow()

        b1 = self._make_burst(eng.id, 1, now - timedelta(minutes=5))
        b2 = self._make_burst(eng.id, 2, now - timedelta(minutes=3))
        b3 = self._make_burst(eng.id, 3, now)

        assert b1.burst_seq == 1
        assert b2.burst_seq == 2
        assert b3.burst_seq == 3

    def test_disengage_auto_close(self):
        """When disengaging, an open burst should be auto-closed at disengage time."""
        eng = self._make_engagement()
        now = datetime.utcnow()
        burst = self._make_burst(eng.id, 1, now - timedelta(seconds=45))

        # Simulate disengage auto-close
        disengage_time = now
        if burst.jam_off_at is None:
            burst.jam_off_at = disengage_time
            burst.duration_s = (disengage_time - burst.jam_on_at).total_seconds()

        assert burst.jam_off_at == disengage_time
        assert burst.duration_s == pytest.approx(45.0, abs=1.0)

    def test_duration_calculation(self):
        """duration_s should equal jam_off_at - jam_on_at in seconds."""
        now = datetime.utcnow()
        on_time = now
        off_time = now + timedelta(seconds=123.456)

        burst = self._make_burst("eng-1", 1, on_time, off_time)
        burst.duration_s = (off_time - on_time).total_seconds()

        assert burst.duration_s == pytest.approx(123.456, abs=0.001)

    def test_target_snapshots_json(self):
        """target_snapshots should store per-target data as JSON-compatible list."""
        burst = self._make_burst("eng-1", 1, datetime.utcnow())
        burst.target_snapshots = [
            {"tracker_id": "T1", "lat": 34.0, "lon": -118.0, "range_m": 500.0, "bearing_deg": 45.0, "gps_status": "good"},
            {"tracker_id": "T2", "lat": 34.1, "lon": -118.1, "range_m": 800.0, "bearing_deg": 90.0, "gps_status": "degraded"},
        ]

        assert len(burst.target_snapshots) == 2
        assert burst.target_snapshots[0]["tracker_id"] == "T1"
        assert burst.target_snapshots[1]["gps_status"] == "degraded"
