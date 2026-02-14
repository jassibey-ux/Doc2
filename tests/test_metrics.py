"""Tests for engagement metric computation."""

import pytest
from datetime import datetime, timedelta
from logtail_dashboard.analysis import (
    analyze_tracker,
    aggregate_session_metrics,
    extract_jamming_windows,
    calculate_time_to_effect,
    calculate_time_to_full_denial,
    calculate_recovery_time,
    calculate_max_lateral_drift,
    calculate_altitude_delta,
    calculate_effective_range,
    determine_pass_fail,
    DroneTrackData,
    PositionPoint,
    TrackerMetricsResult,
)


def _ts_iso(dt):
    """Convert datetime to ISO string."""
    return dt.isoformat()


def _make_track(tracker_id, points):
    """Helper to create DroneTrackData."""
    return DroneTrackData(
        tracker_id=tracker_id,
        points=points,
        start_time_ms=points[0].timestamp_ms if points else 0,
        end_time_ms=points[-1].timestamp_ms if points else 0,
    )


def _make_point(ts_ms, quality="good", **kwargs):
    """Helper to create a PositionPoint."""
    return PositionPoint(
        lat=kwargs.get("lat", 34.0),
        lon=kwargs.get("lon", -118.0),
        alt_m=kwargs.get("alt_m", 100.0),
        timestamp_ms=ts_ms,
        hdop=kwargs.get("hdop", 1.0),
        satellites=kwargs.get("satellites", 12),
        fix_valid=quality != "lost",
        quality=quality,
    )


class TestExtractJammingWindows:
    """Test extraction of jamming windows from events."""

    def test_single_window(self):
        now = datetime.utcnow()
        events = [
            {"type": "jam_on", "timestamp": _ts_iso(now)},
            {"type": "jam_off", "timestamp": _ts_iso(now + timedelta(seconds=30))},
        ]
        windows = extract_jamming_windows(events)
        assert len(windows) == 1
        assert windows[0].duration_s == pytest.approx(30.0, abs=0.1)

    def test_multiple_windows(self):
        now = datetime.utcnow()
        events = [
            {"type": "jam_on", "timestamp": _ts_iso(now)},
            {"type": "jam_off", "timestamp": _ts_iso(now + timedelta(seconds=20))},
            {"type": "jam_on", "timestamp": _ts_iso(now + timedelta(seconds=40))},
            {"type": "jam_off", "timestamp": _ts_iso(now + timedelta(seconds=60))},
        ]
        windows = extract_jamming_windows(events)
        assert len(windows) == 2

    def test_unclosed_window(self):
        now = datetime.utcnow()
        events = [
            {"type": "jam_on", "timestamp": _ts_iso(now)},
            {"type": "note", "timestamp": _ts_iso(now + timedelta(seconds=45))},
        ]
        windows = extract_jamming_windows(events)
        assert len(windows) == 1
        assert windows[0].duration_s == pytest.approx(45.0, abs=0.1)

    def test_no_jam_events(self):
        events = [
            {"type": "launch", "timestamp": _ts_iso(datetime.utcnow())},
        ]
        windows = extract_jamming_windows(events)
        assert len(windows) == 0


class TestTimeToEffect:
    """Test time-to-effect computation."""

    def test_effect_after_jam(self):
        now = datetime.utcnow()
        events = [{"type": "jam_on", "timestamp": _ts_iso(now)}]
        points = [
            _make_point(int(now.timestamp() * 1000), "good"),
            _make_point(int((now + timedelta(seconds=5)).timestamp() * 1000), "good"),
            _make_point(int((now + timedelta(seconds=10)).timestamp() * 1000), "degraded"),
        ]
        track = _make_track("T1", points)
        tte = calculate_time_to_effect(events, track)
        assert tte == pytest.approx(10.0, abs=1.0)

    def test_no_effect(self):
        now = datetime.utcnow()
        events = [{"type": "jam_on", "timestamp": _ts_iso(now)}]
        points = [
            _make_point(int(now.timestamp() * 1000), "good"),
            _make_point(int((now + timedelta(seconds=30)).timestamp() * 1000), "good"),
        ]
        track = _make_track("T1", points)
        tte = calculate_time_to_effect(events, track)
        assert tte is None

    def test_no_jam_on(self):
        events = [{"type": "note", "timestamp": _ts_iso(datetime.utcnow())}]
        track = _make_track("T1", [_make_point(0)])
        assert calculate_time_to_effect(events, track) is None


class TestDeterminePassFail:
    """Test pass/fail determination logic."""

    def test_quick_effect_is_pass(self):
        assert determine_pass_fail(5.0, 10.0, False) == "pass"

    def test_failsafe_is_pass(self):
        assert determine_pass_fail(None, 50.0, True) == "pass"

    def test_high_drift_is_partial(self):
        assert determine_pass_fail(None, 150.0, False) == "partial"

    def test_no_effect_is_fail(self):
        assert determine_pass_fail(None, 20.0, False) == "fail"

    def test_slow_effect_with_failsafe(self):
        """Failsafe overrides slow TTE."""
        assert determine_pass_fail(45.0, 50.0, True) == "pass"


class TestAggregateMetrics:
    """Test session metrics aggregation."""

    def test_empty_results(self):
        result = aggregate_session_metrics([])
        assert result["pass_fail"] == "fail"
        assert result["total_flight_time_s"] == 0

    def test_single_tracker(self):
        results = [TrackerMetricsResult(
            session_id="s1", tracker_id="t1",
            total_flight_time_s=120.0, time_under_jamming_s=30.0,
            time_to_effect_s=5.0, effective_range_m=500.0,
            max_lateral_drift_m=20.0, pass_fail="pass",
        )]
        agg = aggregate_session_metrics(results)
        assert agg["time_to_effect_s"] == 5.0
        assert agg["effective_range_m"] == 500.0
        assert agg["pass_fail"] == "pass"

    def test_multi_tracker_aggregation(self):
        results = [
            TrackerMetricsResult(
                session_id="s1", tracker_id="t1",
                total_flight_time_s=120.0, time_to_effect_s=5.0,
                effective_range_m=500.0, pass_fail="pass",
            ),
            TrackerMetricsResult(
                session_id="s1", tracker_id="t2",
                total_flight_time_s=100.0, time_to_effect_s=8.0,
                effective_range_m=300.0, pass_fail="fail",
            ),
        ]
        agg = aggregate_session_metrics(results)
        # Min of time_to_effect
        assert agg["time_to_effect_s"] == 5.0
        # Min of effective_range
        assert agg["effective_range_m"] == 300.0
        # Pass if any tracker passes
        assert agg["pass_fail"] == "pass"
        # Max of flight time
        assert agg["total_flight_time_s"] == 120.0
