"""File watching and tailing for log files."""

import asyncio
import logging
from pathlib import Path
from typing import Callable, Optional

from watchfiles import awatch, Change

from .parser import CSVParser
from .nmea_parser import NMEAParser
from .kml_import import KMLImporter
from .models import TrackerRecord

logger = logging.getLogger(__name__)


class FileOffsetTracker:
    """Track file read offsets for efficient tailing."""

    def __init__(self):
        """Initialize offset tracker."""
        self._offsets: dict[str, int] = {}

    def get_offset(self, file_path: str) -> int:
        """Get current offset for a file."""
        return self._offsets.get(file_path, 0)

    def set_offset(self, file_path: str, offset: int) -> None:
        """Set offset for a file."""
        self._offsets[file_path] = offset

    def reset_offset(self, file_path: str) -> None:
        """Reset offset to 0 (e.g., after log rotation)."""
        self._offsets[file_path] = 0

    def remove_file(self, file_path: str) -> None:
        """Remove tracking for a file."""
        self._offsets.pop(file_path, None)


class LogTailer:
    """Tail log files and parse new content."""

    def __init__(self):
        """Initialize log tailer."""
        self._csv_parser = CSVParser()
        self._nmea_parser = NMEAParser()
        self._kml_importer = KMLImporter()
        self._offset_tracker = FileOffsetTracker()

    def tail_file(self, file_path: str) -> list[TrackerRecord]:
        """
        Read new content from a file since last read.

        Args:
            file_path: Path to file to tail.

        Returns:
            List of new tracker records.
        """
        path = Path(file_path)

        if not path.exists():
            logger.warning(f"File does not exist: {file_path}")
            self._offset_tracker.remove_file(file_path)
            return []

        # KML/KMZ files are static - always parse completely
        if path.suffix.lower() in ('.kml', '.kmz'):
            return self._parse_complete_file(file_path)

        try:
            file_size = path.stat().st_size
            current_offset = self._offset_tracker.get_offset(file_path)

            # Handle log rotation (file size decreased)
            if file_size < current_offset:
                logger.info(f"Log rotation detected for {file_path}, resetting offset")
                self._offset_tracker.reset_offset(file_path)
                current_offset = 0

            # No new data
            if file_size == current_offset:
                return []

            # Read new content
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(current_offset)
                new_content = f.read()
                new_offset = f.tell()

            # Handle partial writes - ignore incomplete last line
            lines = new_content.split("\n")
            if not new_content.endswith("\n") and len(lines) > 1:
                # Last line is incomplete, don't include it
                complete_content = "\n".join(lines[:-1])
                # Calculate offset excluding incomplete line
                incomplete_line_size = len(lines[-1])
                new_offset = new_offset - incomplete_line_size
            else:
                complete_content = new_content

            # Update offset
            self._offset_tracker.set_offset(file_path, new_offset)

            # For CSV files, we need the header too if this is the first read
            if current_offset == 0:
                # First read - parse complete file content
                return self._parse_complete_file(file_path)
            else:
                # Subsequent read - parse only new lines
                return self._parse_new_lines(file_path, complete_content)

        except Exception as e:
            logger.error(f"Error tailing file {file_path}: {e}")
            return []

    def _parse_complete_file(self, file_path: str) -> list[TrackerRecord]:
        """
        Parse complete file (used for first read).

        Args:
            file_path: Path to file.

        Returns:
            List of tracker records.
        """
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            # Use appropriate parser based on file extension
            path = Path(file_path)
            suffix = path.suffix.lower()
            if suffix == '.nmea':
                return self._nmea_parser.parse_nmea_content(content)
            elif suffix == '.kml':
                return self._kml_importer.parse_kml_content(content)
            elif suffix == '.kmz':
                with open(file_path, "rb") as bf:
                    return self._kml_importer.parse_kmz_file(bf.read())
            else:
                return self._csv_parser.parse_csv_content(content)
        except Exception as e:
            logger.error(f"Error parsing complete file {file_path}: {e}")
            return []

    def _parse_new_lines(self, file_path: str, new_content: str) -> list[TrackerRecord]:
        """
        Parse only new lines (assumes headers already known for CSV).

        Args:
            file_path: Path to file.
            new_content: New content to parse.

        Returns:
            List of tracker records.
        """
        if not new_content.strip():
            return []

        try:
            path = Path(file_path)

            # NMEA files don't need headers - each message block is self-contained
            if path.suffix.lower() == '.nmea':
                return self._nmea_parser.parse_nmea_content(new_content)

            # CSV files need the header line
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                header_line = f.readline()

            # Combine header with new content
            full_content = header_line + new_content
            return self._csv_parser.parse_csv_content(full_content)

        except Exception as e:
            logger.error(f"Error parsing new lines from {file_path}: {e}")
            return []


class LogWatcher:
    """Watch a directory for log file changes."""

    def __init__(
        self,
        event_folder: Path,
        on_records: Callable[[list[TrackerRecord]], None],
        on_new_file: Optional[Callable[[str], None]] = None,
    ):
        """
        Initialize log watcher.

        Args:
            event_folder: Path to event folder to watch.
            on_records: Callback for new records.
            on_new_file: Optional callback when a new file is detected.
        """
        self.event_folder = event_folder
        self.on_records = on_records
        self.on_new_file = on_new_file
        self._tailer = LogTailer()
        self._watch_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self) -> None:
        """Start watching the event folder."""
        if self._running:
            logger.warning("Watcher already running")
            return

        self._running = True

        # Initial scan - process all existing CSV files
        await self._initial_scan()

        # Start watch task
        self._watch_task = asyncio.create_task(self._watch_loop())
        logger.info(f"Started watching: {self.event_folder}")

    async def stop(self) -> None:
        """Stop watching."""
        self._running = False

        if self._watch_task:
            self._watch_task.cancel()
            try:
                await self._watch_task
            except asyncio.CancelledError:
                pass
            self._watch_task = None

        logger.info(f"Stopped watching: {self.event_folder}")

    async def _initial_scan(self) -> None:
        """Scan existing CSV and NMEA files in event folder."""
        if not self.event_folder.exists():
            logger.warning(f"Event folder does not exist: {self.event_folder}")
            return

        # Find CSV, NMEA, KML, and KMZ files
        csv_files = list(self.event_folder.glob("*.csv"))
        nmea_files = list(self.event_folder.glob("*.nmea"))
        kml_files = list(self.event_folder.glob("*.kml"))
        kmz_files = list(self.event_folder.glob("*.kmz"))
        all_files = csv_files + nmea_files + kml_files + kmz_files

        logger.info(f"Initial scan found {len(csv_files)} CSV, {len(nmea_files)} NMEA, {len(kml_files)} KML, {len(kmz_files)} KMZ files")

        for log_file in all_files:
            try:
                records = self._tailer.tail_file(str(log_file))
                if records:
                    logger.info(f"Initial read: {len(records)} records from {log_file.name}")
                    self.on_records(records)
            except Exception as e:
                logger.error(f"Error processing {log_file}: {e}")

    async def _watch_loop(self) -> None:
        """Watch loop for file changes."""
        try:
            async for changes in awatch(self.event_folder):
                if not self._running:
                    break

                for change_type, file_path in changes:
                    await self._handle_change(change_type, file_path)

        except asyncio.CancelledError:
            logger.info("Watch loop cancelled")
        except Exception as e:
            logger.error(f"Error in watch loop: {e}")

    async def _handle_change(self, change_type: Change, file_path: str) -> None:
        """
        Handle a file change event.

        Args:
            change_type: Type of change (added, modified, deleted).
            file_path: Path to changed file.
        """
        path = Path(file_path)

        # Only process CSV, NMEA, KML, and KMZ files
        if path.suffix.lower() not in (".csv", ".nmea", ".kml", ".kmz"):
            return

        try:
            if change_type == Change.deleted:
                logger.info(f"File deleted: {path.name}")
                # No action needed - tracker states will remain
                return

            elif change_type == Change.added:
                logger.info(f"New file detected: {path.name}")

                # Notify about new file
                if self.on_new_file:
                    self.on_new_file(str(path))

                # Tail the file for new content
                records = self._tailer.tail_file(str(path))

                if records:
                    logger.info(f"Read {len(records)} new records from {path.name}")
                    self.on_records(records)

            elif change_type == Change.modified:
                logger.debug(f"File modified: {path.name}")

                # Tail the file for new content
                records = self._tailer.tail_file(str(path))

                if records:
                    logger.info(f"Read {len(records)} new records from {path.name}")
                    self.on_records(records)

        except Exception as e:
            logger.error(f"Error handling change for {path}: {e}")
