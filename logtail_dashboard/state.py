"""Tracker state management."""

import asyncio
import logging
from datetime import datetime
from typing import Callable, Optional

from .models import TrackerRecord, TrackerState, TrackerSummary

logger = logging.getLogger(__name__)


class StateManager:
    """Manage tracker states and staleness detection."""

    def __init__(
        self,
        stale_seconds: int,
        on_tracker_updated: Optional[Callable[[TrackerState], None]] = None,
        on_tracker_stale: Optional[Callable[[TrackerState], None]] = None,
        low_battery_mv: int = 3300,
        critical_battery_mv: int = 3000,
    ):
        """
        Initialize state manager.

        Args:
            stale_seconds: Threshold for marking tracker as stale.
            on_tracker_updated: Callback when tracker is updated.
            on_tracker_stale: Callback when tracker becomes stale.
            low_battery_mv: Threshold for low battery warning (millivolts).
            critical_battery_mv: Threshold for critical battery warning (millivolts).
        """
        self.stale_seconds = stale_seconds
        self.on_tracker_updated = on_tracker_updated
        self.on_tracker_stale = on_tracker_stale
        self.low_battery_mv = low_battery_mv
        self.critical_battery_mv = critical_battery_mv

        self._trackers: dict[str, TrackerState] = {}
        self._stale_check_task: Optional[asyncio.Task] = None
        self._running = False

    def start(self) -> None:
        """Start staleness checking."""
        if self._running:
            return

        self._running = True
        self._stale_check_task = asyncio.create_task(self._stale_check_loop())
        logger.info("State manager started")

    async def stop(self) -> None:
        """Stop staleness checking."""
        self._running = False

        if self._stale_check_task:
            self._stale_check_task.cancel()
            try:
                await self._stale_check_task
            except asyncio.CancelledError:
                pass
            self._stale_check_task = None

        logger.info("State manager stopped")

    def update_tracker(self, record: TrackerRecord) -> None:
        """
        Update tracker state from a new record.

        Args:
            record: New tracker record.
        """
        tracker_id = record.tracker_id

        # Get or create tracker state
        if tracker_id not in self._trackers:
            state = TrackerState(
                tracker_id=tracker_id,
                time_local_received=record.time_local_received,
            )
            self._trackers[tracker_id] = state
        else:
            state = self._trackers[tracker_id]

        # Update timestamp always
        state.time_local_received = record.time_local_received
        state.time_gps = record.time_gps

        # Update position fields only if fix is valid
        if record.fix_valid:
            state.lat = record.lat
            state.lon = record.lon
            state.alt_m = record.alt_m
            state.speed_mps = record.speed_mps
            state.course_deg = record.course_deg
            state.hdop = record.hdop
            state.fix_valid = True

            # Capture last known good position
            state.last_known_lat = record.lat
            state.last_known_lon = record.lon
            state.last_known_alt_m = record.alt_m
            state.last_known_time = record.time_local_received
        else:
            # Mark fix as invalid but keep last known position
            state.fix_valid = False

        # Update satellites count (independent of fix validity)
        if record.satellites is not None:
            state.satellites = record.satellites

        # Always update RSSI, baro data, and battery (independent of GPS fix)
        if record.rssi_dbm is not None:
            state.rssi_dbm = record.rssi_dbm
        if record.baro_alt_m is not None:
            state.baro_alt_m = record.baro_alt_m
        if record.baro_temp_c is not None:
            state.baro_temp_c = record.baro_temp_c
        if record.baro_press_hpa is not None:
            state.baro_press_hpa = record.baro_press_hpa
        if record.battery_mv is not None:
            state.battery_mv = record.battery_mv
            # Check battery thresholds
            state.battery_critical = record.battery_mv <= self.critical_battery_mv
            state.low_battery = record.battery_mv <= self.low_battery_mv

        # Update latency if available
        if record.latency_ms is not None:
            state.latency_ms = record.latency_ms
        if record.time_received is not None:
            state.time_received = record.time_received

        # Update age and staleness
        state.age_seconds = 0.0
        was_stale = state.is_stale
        state.is_stale = False

        # Clear stale_since when tracker becomes active again
        if was_stale:
            state.stale_since = None
            logger.info(f"Tracker {tracker_id} became active again")

        # Always notify on update
        if self.on_tracker_updated:
            self.on_tracker_updated(state)

    def get_tracker(self, tracker_id: str) -> Optional[TrackerState]:
        """
        Get tracker state by ID.

        Args:
            tracker_id: Tracker identifier.

        Returns:
            TrackerState or None if not found.
        """
        return self._trackers.get(tracker_id)

    def get_all_trackers(self) -> list[TrackerState]:
        """
        Get all tracker states.

        Returns:
            List of all tracker states.
        """
        return list(self._trackers.values())

    def get_tracker_summaries(self) -> list[TrackerSummary]:
        """
        Get summary list of all trackers.

        Returns:
            List of tracker summaries.
        """
        summaries = []

        for state in self._trackers.values():
            summary = TrackerSummary(
                tracker_id=state.tracker_id,
                lat=state.lat,
                lon=state.lon,
                alt_m=state.alt_m,
                rssi_dbm=state.rssi_dbm,
                fix_valid=state.fix_valid,
                is_stale=state.is_stale,
                age_seconds=state.age_seconds,
                last_update=state.time_local_received,
                battery_mv=state.battery_mv,
                # Last Known Location tracking
                last_known_lat=state.last_known_lat,
                last_known_lon=state.last_known_lon,
                last_known_alt_m=state.last_known_alt_m,
                last_known_time=state.last_known_time,
                stale_since=state.stale_since,
                # Battery status
                low_battery=state.low_battery,
                battery_critical=state.battery_critical,
            )
            summaries.append(summary)

        # Sort by tracker_id
        summaries.sort(key=lambda s: s.tracker_id)

        return summaries

    def get_tracker_count(self) -> int:
        """Get number of tracked trackers."""
        return len(self._trackers)

    def clear_all(self) -> None:
        """Clear all tracker states."""
        self._trackers.clear()
        logger.info("Cleared all tracker states")

    def get_tracker_ids(self) -> list[str]:
        """Get list of all tracker IDs."""
        return list(self._trackers.keys())

    async def _stale_check_loop(self) -> None:
        """Periodic task to check for stale trackers."""
        try:
            while self._running:
                await asyncio.sleep(5)  # Check every 5 seconds
                self._check_staleness()

        except asyncio.CancelledError:
            logger.info("Stale check loop cancelled")
        except Exception as e:
            logger.error(f"Error in stale check loop: {e}")

    def _check_staleness(self) -> None:
        """Check all trackers for staleness."""
        now = datetime.now()

        for state in self._trackers.values():
            # Calculate age
            age = (now - state.time_local_received).total_seconds()
            state.age_seconds = age

            # Check if became stale
            was_stale = state.is_stale
            is_now_stale = age > self.stale_seconds

            if is_now_stale and not was_stale:
                state.is_stale = True
                state.stale_since = now  # Record when communication was lost
                logger.warning(f"Tracker {state.tracker_id} became stale (age: {age:.1f}s)")

                if self.on_tracker_stale:
                    self.on_tracker_stale(state)
