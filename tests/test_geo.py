"""Tests for dual-mode geometry helper (haversine vs PostGIS)."""

import pytest
import math
from logtail_dashboard.analysis import haversine_distance, bearing, angle_off_boresight


class TestHaversineDistance:
    """Test haversine distance calculations."""

    def test_same_point(self):
        """Distance between same point should be 0."""
        d = haversine_distance(34.0, -118.0, 34.0, -118.0)
        assert d == pytest.approx(0.0, abs=0.001)

    def test_known_distance(self):
        """Test a known distance between two GPS points.

        LAX (33.9425, -118.4081) to SFO (37.6213, -122.3790)
        Expected: ~543 km
        """
        d = haversine_distance(33.9425, -118.4081, 37.6213, -122.3790)
        assert d == pytest.approx(543_000, rel=0.02)  # within 2%

    def test_short_distance(self):
        """Test a short distance (typical engagement range ~500m)."""
        # Approximately 500m north of origin
        lat1, lon1 = 34.0, -118.0
        lat2 = lat1 + (500 / 111_111)  # ~500m in latitude
        lon2 = lon1

        d = haversine_distance(lat1, lon1, lat2, lon2)
        assert d == pytest.approx(500.0, rel=0.01)

    def test_symmetry(self):
        """Distance A→B should equal B→A."""
        d1 = haversine_distance(34.0, -118.0, 35.0, -117.0)
        d2 = haversine_distance(35.0, -117.0, 34.0, -118.0)
        assert d1 == pytest.approx(d2, abs=0.001)

    def test_equator(self):
        """Test distance along equator."""
        # 1 degree of longitude at equator ≈ 111,320m
        d = haversine_distance(0.0, 0.0, 0.0, 1.0)
        assert d == pytest.approx(111_320, rel=0.01)


class TestBearing:
    """Test bearing calculations."""

    def test_due_north(self):
        """Bearing from south to north should be ~0°."""
        b = bearing(34.0, -118.0, 35.0, -118.0)
        assert b == pytest.approx(0.0, abs=1.0)

    def test_due_east(self):
        """Bearing to east should be ~90°."""
        b = bearing(34.0, -118.0, 34.0, -117.0)
        assert b == pytest.approx(90.0, abs=1.0)

    def test_due_south(self):
        """Bearing to south should be ~180°."""
        b = bearing(35.0, -118.0, 34.0, -118.0)
        assert b == pytest.approx(180.0, abs=1.0)

    def test_due_west(self):
        """Bearing to west should be ~270°."""
        b = bearing(34.0, -117.0, 34.0, -118.0)
        assert b == pytest.approx(270.0, abs=1.0)

    def test_bearing_range(self):
        """Bearing should always be in [0, 360)."""
        for lat2 in [33, 34, 35]:
            for lon2 in [-119, -118, -117]:
                b = bearing(34.0, -118.0, lat2, lon2)
                assert 0 <= b < 360

    def test_same_point(self):
        """Bearing from same point is undefined but should not crash."""
        b = bearing(34.0, -118.0, 34.0, -118.0)
        assert isinstance(b, float)


class TestAngleOffBoresight:
    """Test angle off boresight calculation."""

    def test_on_boresight(self):
        """Target directly in front of CUAS → 0°."""
        assert angle_off_boresight(90.0, 90.0) == 0.0

    def test_perpendicular(self):
        """Target at 90° from boresight."""
        assert angle_off_boresight(0.0, 90.0) == 90.0

    def test_behind(self):
        """Target directly behind CUAS → 180°."""
        assert angle_off_boresight(0.0, 180.0) == 180.0

    def test_wrap_around(self):
        """Test wrapping at 360°/0° boundary."""
        assert angle_off_boresight(350.0, 10.0) == 20.0
        assert angle_off_boresight(10.0, 350.0) == 20.0

    def test_max_180(self):
        """Angle off boresight should never exceed 180°."""
        for orientation in range(0, 360, 30):
            for target_bearing in range(0, 360, 30):
                aob = angle_off_boresight(orientation, target_bearing)
                assert 0 <= aob <= 180
