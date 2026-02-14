"""Tests for debounced GPS denial detection algorithm."""

import pytest
from logtail_dashboard.analysis import (
    detect_gps_denial_debounced,
    compute_telemetry_loss_duration,
    PositionPoint,
    classify_quality,
)


def _make_point(ts_ms, fix_valid=True, hdop=1.0, satellites=12, lat=34.0, lon=-118.0):
    """Helper to create a PositionPoint."""
    return PositionPoint(
        lat=lat, lon=lon, alt_m=100.0, timestamp_ms=ts_ms,
        hdop=hdop, satellites=satellites, fix_valid=fix_valid,
        quality=classify_quality(fix_valid, hdop, satellites),
    )


class TestDebouncedDenialDetection:
    """Test the debounced GPS denial detection algorithm."""

    def test_no_denial_all_good(self):
        """When all points have good GPS, no denial should be detected."""
        points = [_make_point(i * 1000) for i in range(20)]
        result = detect_gps_denial_debounced(points)
        assert result["denial_detected"] is False

    def test_single_bad_point_no_denial(self):
        """A single bad point should not trigger denial (need N consecutive)."""
        points = [_make_point(i * 1000) for i in range(10)]
        points[5] = _make_point(5000, fix_valid=False)  # One bad point
        result = detect_gps_denial_debounced(points, n_consecutive=3)
        assert result["denial_detected"] is False

    def test_two_bad_points_no_denial(self):
        """Two consecutive bad points should not trigger when N=3."""
        points = [_make_point(i * 1000) for i in range(10)]
        points[4] = _make_point(4000, fix_valid=False)
        points[5] = _make_point(5000, fix_valid=False)
        result = detect_gps_denial_debounced(points, n_consecutive=3)
        assert result["denial_detected"] is False

    def test_three_consecutive_bad_triggers_denial(self):
        """Three consecutive bad points (N=3) should trigger denial."""
        points = [_make_point(i * 1000) for i in range(10)]
        points[3] = _make_point(3000, fix_valid=False)
        points[4] = _make_point(4000, fix_valid=False)
        points[5] = _make_point(5000, fix_valid=False)
        result = detect_gps_denial_debounced(points, n_consecutive=3)
        assert result["denial_detected"] is True
        assert result["onset_timestamp_ms"] == 3000

    def test_denial_via_low_satellites(self):
        """Low satellite count (< 4) should count as denied."""
        points = [_make_point(i * 1000) for i in range(10)]
        points[2] = _make_point(2000, satellites=2)
        points[3] = _make_point(3000, satellites=1)
        points[4] = _make_point(4000, satellites=3)
        result = detect_gps_denial_debounced(points, n_consecutive=3)
        assert result["denial_detected"] is True

    def test_denial_via_high_hdop(self):
        """High HDOP (> 20) should count as denied."""
        points = [_make_point(i * 1000) for i in range(10)]
        points[4] = _make_point(4000, hdop=25.0)
        points[5] = _make_point(5000, hdop=30.0)
        points[6] = _make_point(6000, hdop=50.0)
        result = detect_gps_denial_debounced(points, n_consecutive=3)
        assert result["denial_detected"] is True
        assert result["onset_timestamp_ms"] == 4000

    def test_recovery_detection(self):
        """Recovery should be detected when N consecutive good points appear after denial."""
        points = []
        # Good points 0-4
        for i in range(5):
            points.append(_make_point(i * 1000))
        # Bad points 5-9
        for i in range(5, 10):
            points.append(_make_point(i * 1000, fix_valid=False))
        # Good points 10-14
        for i in range(10, 15):
            points.append(_make_point(i * 1000))

        result = detect_gps_denial_debounced(points, n_consecutive=3)
        assert result["denial_detected"] is True
        assert result["onset_timestamp_ms"] == 5000
        assert result["recovery_timestamp_ms"] == 10000

    def test_no_recovery_if_still_denied(self):
        """If denial continues to end, recovery should be None."""
        points = []
        for i in range(5):
            points.append(_make_point(i * 1000))
        for i in range(5, 15):
            points.append(_make_point(i * 1000, fix_valid=False))

        result = detect_gps_denial_debounced(points, n_consecutive=3)
        assert result["denial_detected"] is True
        assert result["recovery_timestamp_ms"] is None

    def test_empty_points(self):
        """Empty telemetry should return no denial."""
        result = detect_gps_denial_debounced([])
        assert result["denial_detected"] is False

    def test_denied_count(self):
        """denied_count should count total denied points."""
        points = [_make_point(i * 1000) for i in range(10)]
        points[3] = _make_point(3000, fix_valid=False)
        points[4] = _make_point(4000, fix_valid=False)
        points[5] = _make_point(5000, fix_valid=False)
        points[7] = _make_point(7000, fix_valid=False)

        result = detect_gps_denial_debounced(points, n_consecutive=3)
        assert result["denied_count"] == 4
        assert result["total_count"] == 10

    def test_n_consecutive_1(self):
        """With N=1, even a single bad point triggers denial."""
        points = [_make_point(i * 1000) for i in range(5)]
        points[2] = _make_point(2000, fix_valid=False)

        result = detect_gps_denial_debounced(points, n_consecutive=1)
        assert result["denial_detected"] is True
        assert result["onset_timestamp_ms"] == 2000


class TestTelemetryLoss:
    """Test telemetry loss duration computation."""

    def test_no_gaps(self):
        """Continuous 1Hz data has no gaps."""
        points = [_make_point(i * 1000) for i in range(10)]
        loss = compute_telemetry_loss_duration(points, gap_threshold_s=3.0)
        assert loss == 0.0

    def test_single_gap(self):
        """A 10-second gap should be detected."""
        points = [
            _make_point(0),
            _make_point(1000),
            _make_point(11000),  # 10s gap
            _make_point(12000),
        ]
        loss = compute_telemetry_loss_duration(points, gap_threshold_s=3.0)
        assert loss == 10.0

    def test_multiple_gaps(self):
        """Multiple gaps should be summed."""
        points = [
            _make_point(0),
            _make_point(5000),   # 5s gap
            _make_point(6000),
            _make_point(16000),  # 10s gap
        ]
        loss = compute_telemetry_loss_duration(points, gap_threshold_s=3.0)
        assert loss == 15.0

    def test_gap_below_threshold(self):
        """Gaps below threshold should not be counted."""
        points = [
            _make_point(0),
            _make_point(2000),  # 2s gap (below 3s threshold)
            _make_point(4000),
        ]
        loss = compute_telemetry_loss_duration(points, gap_threshold_s=3.0)
        assert loss == 0.0

    def test_empty_points(self):
        """Empty input returns 0."""
        assert compute_telemetry_loss_duration([]) == 0.0

    def test_single_point(self):
        """Single point returns 0."""
        assert compute_telemetry_loss_duration([_make_point(0)]) == 0.0


class TestClassifyQuality:
    """Test GPS quality classification."""

    def test_good_quality(self):
        assert classify_quality(True, 1.0, 12) == "good"

    def test_lost_no_fix(self):
        assert classify_quality(False, 1.0, 12) == "lost"

    def test_lost_high_hdop(self):
        assert classify_quality(True, 25.0, 12) == "lost"

    def test_degraded_hdop(self):
        assert classify_quality(True, 8.0, 12) == "degraded"

    def test_lost_low_sats(self):
        assert classify_quality(True, 1.0, 1) == "lost"

    def test_degraded_low_sats(self):
        assert classify_quality(True, 1.0, 3) == "degraded"

    def test_none_values(self):
        """None HDOP and satellites should be treated as good."""
        assert classify_quality(True, None, None) == "good"
