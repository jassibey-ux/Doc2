"""Tests for state manager."""

import pytest
import asyncio
from datetime import datetime, timedelta

from logtail_dashboard.state import StateManager
from logtail_dashboard.models import TrackerRecord


class TestStateManager:
    """Test state manager functionality."""

    @pytest.fixture
    def state_manager(self):
        """Create a state manager for testing (without starting async loop)."""
        # Don't call start() - most tests don't need the stale check loop
        manager = StateManager(stale_seconds=10)
        yield manager
        # No need to stop since we didn't start

    def test_update_tracker_new(self, state_manager):
        """Test updating a new tracker."""
        record = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            lat=34.0522,
            lon=-118.2437,
            alt_m=125.5,
            fix_valid=True,
        )

        state_manager.update_tracker(record)

        state = state_manager.get_tracker("101")
        assert state is not None
        assert state.tracker_id == "101"
        assert state.lat == 34.0522
        assert state.lon == -118.2437
        assert state.alt_m == 125.5
        assert state.fix_valid is True
        assert state.is_stale is False

    def test_update_tracker_existing(self, state_manager):
        """Test updating an existing tracker."""
        now = datetime.now()

        record1 = TrackerRecord(
            tracker_id="101",
            time_local_received=now,
            lat=34.0522,
            lon=-118.2437,
            fix_valid=True,
        )

        record2 = TrackerRecord(
            tracker_id="101",
            time_local_received=now + timedelta(seconds=30),
            lat=34.0523,
            lon=-118.2436,
            fix_valid=True,
        )

        state_manager.update_tracker(record1)
        state_manager.update_tracker(record2)

        state = state_manager.get_tracker("101")
        assert state.lat == 34.0523
        assert state.lon == -118.2436

    def test_fix_valid_updates_position(self, state_manager):
        """Test that position is updated only when fix is valid."""
        now = datetime.now()

        # First update with valid fix
        record1 = TrackerRecord(
            tracker_id="101",
            time_local_received=now,
            lat=34.0522,
            lon=-118.2437,
            fix_valid=True,
        )

        # Second update with invalid fix but different position
        record2 = TrackerRecord(
            tracker_id="101",
            time_local_received=now + timedelta(seconds=30),
            lat=35.0000,
            lon=-119.0000,
            fix_valid=False,
        )

        state_manager.update_tracker(record1)
        state_manager.update_tracker(record2)

        state = state_manager.get_tracker("101")

        # Position should remain from first update
        assert state.lat == 34.0522
        assert state.lon == -118.2437
        # But fix_valid should be updated
        assert state.fix_valid is False

    def test_rssi_updates_regardless_of_fix(self, state_manager):
        """Test that RSSI updates even when fix is invalid."""
        now = datetime.now()

        record = TrackerRecord(
            tracker_id="101",
            time_local_received=now,
            rssi_dbm=-85,
            fix_valid=False,
        )

        state_manager.update_tracker(record)

        state = state_manager.get_tracker("101")
        assert state.rssi_dbm == -85
        assert state.fix_valid is False

    def test_baro_updates_regardless_of_fix(self, state_manager):
        """Test that barometric data updates even when fix is invalid."""
        now = datetime.now()

        record = TrackerRecord(
            tracker_id="101",
            time_local_received=now,
            baro_alt_m=1200.5,
            baro_temp_c=22.3,
            baro_press_hpa=1013.25,
            fix_valid=False,
        )

        state_manager.update_tracker(record)

        state = state_manager.get_tracker("101")
        assert state.baro_alt_m == 1200.5
        assert state.baro_temp_c == 22.3
        assert state.baro_press_hpa == 1013.25

    def test_get_all_trackers(self, state_manager):
        """Test getting all trackers."""
        now = datetime.now()

        for i in range(5):
            record = TrackerRecord(
                tracker_id=str(100 + i),
                time_local_received=now,
                fix_valid=True,
            )
            state_manager.update_tracker(record)

        trackers = state_manager.get_all_trackers()
        assert len(trackers) == 5

    def test_get_tracker_summaries(self, state_manager):
        """Test getting tracker summaries."""
        now = datetime.now()

        record = TrackerRecord(
            tracker_id="101",
            time_local_received=now,
            lat=34.0522,
            lon=-118.2437,
            alt_m=125.5,
            rssi_dbm=-85,
            fix_valid=True,
        )

        state_manager.update_tracker(record)

        summaries = state_manager.get_tracker_summaries()
        assert len(summaries) == 1

        summary = summaries[0]
        assert summary.tracker_id == "101"
        assert summary.lat == 34.0522
        assert summary.lon == -118.2437
        assert summary.alt_m == 125.5
        assert summary.rssi_dbm == -85
        assert summary.fix_valid is True

    def test_get_tracker_count(self, state_manager):
        """Test getting tracker count."""
        now = datetime.now()

        assert state_manager.get_tracker_count() == 0

        for i in range(3):
            record = TrackerRecord(
                tracker_id=str(100 + i),
                time_local_received=now,
                fix_valid=True,
            )
            state_manager.update_tracker(record)

        assert state_manager.get_tracker_count() == 3

    def test_clear_all(self, state_manager):
        """Test clearing all trackers."""
        now = datetime.now()

        for i in range(3):
            record = TrackerRecord(
                tracker_id=str(100 + i),
                time_local_received=now,
                fix_valid=True,
            )
            state_manager.update_tracker(record)

        assert state_manager.get_tracker_count() == 3

        state_manager.clear_all()

        assert state_manager.get_tracker_count() == 0

    def test_nonexistent_tracker(self, state_manager):
        """Test getting nonexistent tracker."""
        state = state_manager.get_tracker("999")
        assert state is None

    def test_multiple_trackers(self, state_manager):
        """Test managing multiple trackers."""
        now = datetime.now()

        # Add multiple trackers
        for i in range(10):
            record = TrackerRecord(
                tracker_id=str(100 + i),
                time_local_received=now,
                lat=34.0 + i * 0.001,
                lon=-118.0 - i * 0.001,
                fix_valid=True,
            )
            state_manager.update_tracker(record)

        # Verify all are tracked
        assert state_manager.get_tracker_count() == 10

        # Verify each can be retrieved
        for i in range(10):
            state = state_manager.get_tracker(str(100 + i))
            assert state is not None
            assert state.lat == 34.0 + i * 0.001

    def test_updated_callback(self, state_manager):
        """Test update callback is triggered."""
        updated_trackers = []

        def on_update(state):
            updated_trackers.append(state.tracker_id)

        # Create a new manager with callback (no async loop needed)
        manager = StateManager(
            stale_seconds=10,
            on_tracker_updated=on_update,
        )

        record = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record)

        assert "101" in updated_trackers

    def test_staleness_detection(self, state_manager):
        """Test that staleness is correctly detected via _check_staleness."""
        import time as _time

        # Add tracker
        record = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        state_manager.update_tracker(record)

        # Initially not stale (just updated, age_seconds reset to 0)
        state = state_manager.get_tracker("101")
        assert state.is_stale is False

        # Simulate 30 seconds passing by backdating the monotonic last_seen
        state_manager._last_seen["101"] = _time.monotonic() - 30

        # Manually trigger staleness check
        state_manager._check_staleness()

        # Now should be stale (age > 10 seconds threshold)
        state = state_manager.get_tracker("101")
        assert state.is_stale is True
        assert state.age_seconds > 10

    def test_stale_callback(self):
        """Test stale callback is triggered."""
        import time as _time

        stale_trackers = []

        def on_stale(state):
            stale_trackers.append(state.tracker_id)

        manager = StateManager(
            stale_seconds=1,
            on_tracker_stale=on_stale,
        )

        # Add tracker
        record = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record)

        # Simulate 5 seconds passing
        manager._last_seen["101"] = _time.monotonic() - 5

        # Manually trigger staleness check
        manager._check_staleness()

        # Check callback was triggered
        assert "101" in stale_trackers

    def test_last_known_position_captured(self, state_manager):
        """Test that last known position is captured when fix is valid."""
        now = datetime.now()

        record = TrackerRecord(
            tracker_id="101",
            time_local_received=now,
            lat=34.0522,
            lon=-118.2437,
            alt_m=125.5,
            fix_valid=True,
        )

        state_manager.update_tracker(record)

        state = state_manager.get_tracker("101")
        assert state.last_known_lat == 34.0522
        assert state.last_known_lon == -118.2437
        assert state.last_known_alt_m == 125.5
        assert state.last_known_time == now

    def test_last_known_position_preserved_on_invalid_fix(self, state_manager):
        """Test that last known position is preserved when fix becomes invalid."""
        now = datetime.now()

        # First update with valid fix
        record1 = TrackerRecord(
            tracker_id="101",
            time_local_received=now,
            lat=34.0522,
            lon=-118.2437,
            alt_m=125.5,
            fix_valid=True,
        )
        state_manager.update_tracker(record1)

        # Second update with invalid fix
        record2 = TrackerRecord(
            tracker_id="101",
            time_local_received=now + timedelta(seconds=10),
            lat=0.0,
            lon=0.0,
            fix_valid=False,
        )
        state_manager.update_tracker(record2)

        state = state_manager.get_tracker("101")
        # Last known should still be from first update
        assert state.last_known_lat == 34.0522
        assert state.last_known_lon == -118.2437
        assert state.last_known_time == now

    def test_battery_status_low(self, state_manager):
        """Test low battery detection."""
        record = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            battery_mv=3200,  # Below default 3300 threshold
            fix_valid=True,
        )

        state_manager.update_tracker(record)

        state = state_manager.get_tracker("101")
        assert state.low_battery is True
        assert state.battery_critical is False

    def test_battery_status_critical(self, state_manager):
        """Test critical battery detection."""
        record = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            battery_mv=2900,  # Below default 3000 threshold
            fix_valid=True,
        )

        state_manager.update_tracker(record)

        state = state_manager.get_tracker("101")
        assert state.low_battery is True
        assert state.battery_critical is True

    def test_battery_status_normal(self, state_manager):
        """Test normal battery status."""
        record = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            battery_mv=3800,  # Above thresholds
            fix_valid=True,
        )

        state_manager.update_tracker(record)

        state = state_manager.get_tracker("101")
        assert state.low_battery is False
        assert state.battery_critical is False

    def test_stale_since_set_on_staleness(self):
        """Test that stale_since is set when tracker becomes stale."""
        import time as _time

        manager = StateManager(stale_seconds=1)

        # Add tracker
        record = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record)

        # Before staleness check
        state = manager.get_tracker("101")
        assert state.stale_since is None

        # Simulate 5 seconds passing
        manager._last_seen["101"] = _time.monotonic() - 5

        # Trigger staleness check
        manager._check_staleness()

        # After staleness check
        state = manager.get_tracker("101")
        assert state.stale_since is not None
        assert state.is_stale is True

    def test_stale_since_cleared_on_active(self):
        """Test that stale_since is cleared when tracker becomes active again."""
        import time as _time

        manager = StateManager(stale_seconds=1)

        # Add tracker
        record1 = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record1)

        # Simulate 5 seconds passing, then make it stale
        manager._last_seen["101"] = _time.monotonic() - 5
        manager._check_staleness()
        state = manager.get_tracker("101")
        assert state.is_stale is True
        assert state.stale_since is not None

        # Send new update (tracker becomes active)
        record2 = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record2)

        # Should no longer be stale
        state = manager.get_tracker("101")
        assert state.is_stale is False
        assert state.stale_since is None

    def test_tracker_summaries_include_new_fields(self, state_manager):
        """Test that tracker summaries include last known and battery fields."""
        now = datetime.now()

        record = TrackerRecord(
            tracker_id="101",
            time_local_received=now,
            lat=34.0522,
            lon=-118.2437,
            alt_m=125.5,
            battery_mv=3200,
            fix_valid=True,
        )

        state_manager.update_tracker(record)

        summaries = state_manager.get_tracker_summaries()
        assert len(summaries) == 1

        summary = summaries[0]
        assert summary.last_known_lat == 34.0522
        assert summary.last_known_lon == -118.2437
        assert summary.last_known_alt_m == 125.5
        assert summary.last_known_time == now
        assert summary.low_battery is True
        assert summary.battery_critical is False
        assert summary.stale_since is None

    def test_recovered_callback(self):
        """Test that on_tracker_recovered callback is triggered when a stale tracker becomes active."""
        import time as _time

        recovered_trackers = []

        def on_recovered(state):
            recovered_trackers.append(state.tracker_id)

        manager = StateManager(
            stale_seconds=1,
            on_tracker_recovered=on_recovered,
        )

        # Add tracker
        record1 = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record1)

        # Should not have triggered recovery (was not stale)
        assert len(recovered_trackers) == 0

        # Simulate 5 seconds passing, then make it stale
        manager._last_seen["101"] = _time.monotonic() - 5
        manager._check_staleness()

        state = manager.get_tracker("101")
        assert state.is_stale is True

        # Send new update (tracker recovers)
        record2 = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record2)

        # Recovery callback should have been triggered
        assert "101" in recovered_trackers
        state = manager.get_tracker("101")
        assert state.is_stale is False
        assert state.stale_since is None

    def test_recovered_callback_not_triggered_when_not_stale(self):
        """Test that on_tracker_recovered is NOT triggered on normal updates."""
        recovered_trackers = []

        def on_recovered(state):
            recovered_trackers.append(state.tracker_id)

        manager = StateManager(
            stale_seconds=10,
            on_tracker_recovered=on_recovered,
        )

        # Add tracker (first update, not previously stale)
        record1 = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record1)

        # Second normal update (still not stale)
        record2 = TrackerRecord(
            tracker_id="101",
            time_local_received=datetime.now(),
            fix_valid=True,
        )
        manager.update_tracker(record2)

        # Recovery callback should NOT have been triggered
        assert len(recovered_trackers) == 0
