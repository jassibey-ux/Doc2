"""Replay system for historical session playback."""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from .models import TrackerRecord
from .parser import CSVParser
from .state import StateManager

logger = logging.getLogger(__name__)


@dataclass
class ReplaySession:
    """Metadata for a historical test session."""

    session_id: str
    name: str
    path: Path
    duration_seconds: float
    start_time: datetime
    end_time: datetime
    tracker_ids: list[str]
    file_count: int
    total_records: int
    size_bytes: int


@dataclass
class FrameGroup:
    """Single synchronized frame in timeline."""

    frame_index: int
    timestamp: datetime
    records: dict[str, TrackerRecord]  # tracker_id -> record
    duration_seconds: float = 0.033  # Default ~30fps


class SessionLoader:
    """Load and parse historical sessions."""

    def __init__(self, log_root: Path):
        self.log_root = Path(log_root)
        self.parser = CSVParser()
        # Cache sessions to avoid re-scanning on every load
        self._session_cache: dict[str, ReplaySession] = {}
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl_seconds = 60  # Cache valid for 60 seconds
        # Thread safety lock for cache operations
        self._cache_lock = asyncio.Lock()

    async def scan_sessions(self, force_refresh: bool = False) -> list[ReplaySession]:
        """Discover all available sessions.

        Uses a cache to avoid re-scanning filesystem on every request.
        Cache is invalidated after _cache_ttl_seconds or on force_refresh.
        Thread-safe using asyncio lock.
        """
        async with self._cache_lock:
            # Check if cache is valid
            if not force_refresh and self._cache_timestamp:
                cache_age = (datetime.now() - self._cache_timestamp).total_seconds()
                if cache_age < self._cache_ttl_seconds and self._session_cache:
                    logger.debug(f"Using cached sessions ({len(self._session_cache)} sessions, {cache_age:.1f}s old)")
                    return list(self._session_cache.values())

            sessions = []

            if not self.log_root.exists():
                logger.warning(f"Log root does not exist: {self.log_root}")
                return sessions

            try:
                # First check if log_root itself contains CSV files (direct folder approach)
                csv_in_root = list(self.log_root.glob("*.csv"))
                if csv_in_root:
                    session = await self._analyze_session(self.log_root)
                    if session:
                        sessions.append(session)
                        # Update cache
                        self._session_cache = {session.session_id: session}
                        self._cache_timestamp = datetime.now()
                        return sessions  # Return immediately if direct folder has CSVs

                # Otherwise scan subdirectories (legacy approach)
                for item in self.log_root.iterdir():
                    if not item.is_dir() or item.name.startswith("."):
                        continue

                    session = await self._analyze_session(item)
                    if session:
                        sessions.append(session)

                # Sort by most recent first
                sessions.sort(key=lambda s: s.start_time, reverse=True)

                # Update cache
                self._session_cache = {s.session_id: s for s in sessions}
                self._cache_timestamp = datetime.now()
                logger.info(f"Scanned and cached {len(sessions)} sessions")

                return sessions

            except Exception as e:
                logger.error(f"Error scanning sessions: {e}")
                return []

    def get_cached_session(self, session_id: str) -> Optional[ReplaySession]:
        """Get a session from cache by ID without re-scanning.

        This method is used by load_replay_session to avoid race conditions.
        """
        return self._session_cache.get(session_id)

    def invalidate_cache(self):
        """Invalidate the session cache, forcing a re-scan on next request."""
        self._session_cache = {}
        self._cache_timestamp = None
        logger.info("Session cache invalidated")

    async def _analyze_session(self, session_path: Path) -> Optional[ReplaySession]:
        """Analyze a session directory."""
        try:
            logger.debug(f"Analyzing session: {session_path}")
            csv_files = list(session_path.glob("*.csv"))
            logger.debug(f"Found {len(csv_files)} CSV files in {session_path}")

            if not csv_files:
                return None

            # Quick metadata extraction
            total_size = sum(f.stat().st_size for f in csv_files)
            tracker_ids = set()
            all_times = []
            total_records = 0

            # Parse first and last few records from each file
            for csv_file in csv_files:
                try:
                    # Read first 10 and last 10 lines for timing
                    with open(csv_file, "r") as f:
                        lines = f.readlines()

                    if len(lines) <= 1:  # Skip if only header
                        continue

                    # Parse first and last records using the parser
                    # Create mini CSV content with header + data line
                    header = lines[0]

                    # Parse first record
                    if len(lines) > 1:
                        mini_csv = header + lines[1]
                        records = self.parser.parse_csv_content(mini_csv)
                        if records:
                            tracker_ids.add(records[0].tracker_id)
                            all_times.append(records[0].time_local_received)

                    # Parse last record
                    if len(lines) > 2:
                        mini_csv = header + lines[-1]
                        records = self.parser.parse_csv_content(mini_csv)
                        if records:
                            all_times.append(records[0].time_local_received)

                    total_records += len(lines) - 1  # Exclude header

                except Exception as e:
                    logger.debug(f"Error analyzing {csv_file}: {e}")
                    continue

            if not all_times:
                return None

            start_time = min(all_times)
            end_time = max(all_times)
            duration = (end_time - start_time).total_seconds()

            return ReplaySession(
                session_id=session_path.name,
                name=session_path.name,
                path=session_path,
                duration_seconds=duration,
                start_time=start_time,
                end_time=end_time,
                tracker_ids=sorted(list(tracker_ids)),
                file_count=len(csv_files),
                total_records=total_records,
                size_bytes=total_size,
            )

        except Exception as e:
            logger.error(f"Error analyzing session {session_path}: {e}")
            return None

    async def load_timeline(
        self, session: ReplaySession, selected_trackers: Optional[list[str]] = None
    ) -> list[FrameGroup]:
        """Load and parse all records into synchronized frames."""
        logger.info(f"Loading timeline for session: {session.name}")

        # Collect all records
        all_records = []
        csv_files = list(session.path.glob("*.csv"))

        for csv_file in csv_files:
            try:
                with open(csv_file, "r") as f:
                    content = f.read()

                # Parse the entire CSV file
                records = self.parser.parse_csv_content(content)

                # Filter by selected trackers if specified
                for record in records:
                    if selected_trackers is None or record.tracker_id in selected_trackers:
                        all_records.append(record)

            except Exception as e:
                logger.error(f"Error loading {csv_file}: {e}")
                continue

        if not all_records:
            logger.warning("No records loaded")
            return []

        # Sort by time
        all_records.sort(key=lambda r: r.time_local_received)

        # Build frames
        frames = await self._build_frames(all_records)

        logger.info(f"Loaded {len(frames)} frames with {len(all_records)} total records")

        return frames

    async def _build_frames(
        self, records: list[TrackerRecord], frame_interval: float = 0.5
    ) -> list[FrameGroup]:
        """Organize records into synchronized frames."""
        if not records:
            return []

        frames = []
        start_time = records[0].time_local_received
        end_time = records[-1].time_local_received

        # Group records by tracker
        records_by_tracker = {}
        for record in records:
            if record.tracker_id not in records_by_tracker:
                records_by_tracker[record.tracker_id] = []
            records_by_tracker[record.tracker_id].append(record)

        # Build frames at regular intervals
        current_time = start_time
        frame_index = 0

        while current_time <= end_time:
            frame = FrameGroup(
                frame_index=frame_index, timestamp=current_time, records={}, duration_seconds=frame_interval
            )

            # Find closest record for each tracker
            for tracker_id, tracker_records in records_by_tracker.items():
                # Find record closest to current_time
                best_record = None
                min_delta = None

                for record in tracker_records:
                    delta = abs((record.time_local_received - current_time).total_seconds())

                    if min_delta is None or delta < min_delta:
                        min_delta = delta
                        best_record = record

                # Only include if within reasonable range (2x frame interval)
                if best_record and min_delta < frame_interval * 2:
                    frame.records[tracker_id] = best_record

            if frame.records:  # Only add frames with data
                frames.append(frame)

            current_time += timedelta(seconds=frame_interval)
            frame_index += 1

        return frames


class ReplayEngine:
    """Control playback timeline."""

    def __init__(self, timeline: list[FrameGroup], state_manager: StateManager):
        self.frames = timeline
        self.state_manager = state_manager
        self.current_frame_index = 0
        self.playback_speed = 1.0
        self.is_playing = False
        self._playback_task: Optional[asyncio.Task] = None
        self._broadcast_callback = None

    def set_broadcast_callback(self, callback):
        """Set callback for broadcasting frame updates."""
        self._broadcast_callback = callback

    async def play(self) -> None:
        """Start playback from current frame."""
        if self.is_playing:
            return

        self.is_playing = True
        self._playback_task = asyncio.create_task(self._playback_loop())
        logger.info(f"Playback started at frame {self.current_frame_index}")

    async def pause(self) -> None:
        """Pause playback."""
        self.is_playing = False
        if self._playback_task:
            self._playback_task.cancel()
            try:
                await self._playback_task
            except asyncio.CancelledError:
                pass
        logger.info(f"Playback paused at frame {self.current_frame_index}")

    async def seek(self, frame_index: int) -> None:
        """Jump to specific frame."""
        if frame_index < 0 or frame_index >= len(self.frames):
            logger.warning(f"Invalid frame index: {frame_index}")
            return

        was_playing = self.is_playing

        if was_playing:
            await self.pause()

        self.current_frame_index = frame_index

        # Emit current frame
        await self._emit_frame(self.frames[frame_index])

        logger.info(f"Seeked to frame {frame_index}")

        if was_playing:
            await self.play()

    async def set_speed(self, speed: float) -> None:
        """Change playback speed (0.1x to 10.0x)."""
        # Clamp to valid range
        speed = max(0.1, min(10.0, speed))
        self.playback_speed = speed
        logger.info(f"Playback speed set to {speed}x")

    async def _playback_loop(self) -> None:
        """Main playback loop."""
        try:
            while self.is_playing and self.current_frame_index < len(self.frames):
                frame = self.frames[self.current_frame_index]

                # Emit frame
                await self._emit_frame(frame)

                # Calculate sleep time based on speed
                sleep_time = frame.duration_seconds / self.playback_speed

                # Clamp to prevent blocking
                sleep_time = max(0.001, min(sleep_time, 1.0))

                await asyncio.sleep(sleep_time)

                # Advance
                self.current_frame_index += 1

                # Notify about progress
                if self._broadcast_callback:
                    await self._broadcast_callback(
                        {
                            "type": "replay_progress",
                            "frame": self.current_frame_index,
                            "total": len(self.frames),
                        }
                    )

            # Reached end
            if self.current_frame_index >= len(self.frames):
                self.is_playing = False
                logger.info("Playback completed")

                if self._broadcast_callback:
                    await self._broadcast_callback({"type": "replay_completed"})

        except asyncio.CancelledError:
            logger.info("Playback cancelled")
        except Exception as e:
            logger.error(f"Playback error: {e}")
            self.is_playing = False

    async def _emit_frame(self, frame: FrameGroup) -> None:
        """Emit frame records to state manager."""
        for tracker_id, record in frame.records.items():
            # Update state manager (this triggers WebSocket broadcast)
            self.state_manager.update_tracker(record)

    def get_current_state(self) -> dict:
        """Get current playback state."""
        current_frame = self.frames[self.current_frame_index] if self.current_frame_index < len(self.frames) else None

        return {
            "is_playing": self.is_playing,
            "current_frame": self.current_frame_index,
            "total_frames": len(self.frames),
            "playback_speed": self.playback_speed,
            "current_time": current_frame.timestamp.isoformat() if current_frame else None,
            "progress_percent": (self.current_frame_index / len(self.frames) * 100) if self.frames else 0,
        }
