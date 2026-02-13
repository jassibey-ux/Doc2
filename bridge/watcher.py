"""
CSV Folder Watcher for Bridge Service

Watches a local folder (default C:\\Temp) for new/modified CSV files from GPSLogger.
Reads new rows incrementally and feeds them into the SQLite buffer for cloud push.
"""

import asyncio
import logging
from pathlib import Path
from typing import Callable, Optional

from watchfiles import awatch, Change

from .parser import BridgeCSVParser

logger = logging.getLogger(__name__)


class FileOffsetTracker:
    """Track read offsets for efficient incremental tailing."""

    def __init__(self):
        self._offsets: dict[str, int] = {}
        self._headers: dict[str, str] = {}

    def get_offset(self, path: str) -> int:
        return self._offsets.get(path, 0)

    def set_offset(self, path: str, offset: int) -> None:
        self._offsets[path] = offset

    def get_header(self, path: str) -> Optional[str]:
        return self._headers.get(path)

    def set_header(self, path: str, header: str) -> None:
        self._headers[path] = header

    def reset(self, path: str) -> None:
        self._offsets[path] = 0
        self._headers.pop(path, None)


class BridgeWatcher:
    """Watch a folder for CSV changes and parse new rows."""

    def __init__(
        self,
        watch_folder: str,
        on_records: Callable[[list[dict]], None],
        glob_pattern: str = "*.csv",
    ):
        self.watch_folder = Path(watch_folder)
        self.on_records = on_records
        self.glob_pattern = glob_pattern
        self._parser = BridgeCSVParser()
        self._offsets = FileOffsetTracker()
        self._running = False
        self._watch_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start watching the folder."""
        if self._running:
            return

        self._running = True

        # Initial scan
        await self._initial_scan()

        # Start watch loop
        self._watch_task = asyncio.create_task(self._watch_loop())
        logger.info(f"Bridge watcher started: {self.watch_folder}")

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
        logger.info("Bridge watcher stopped")

    async def _initial_scan(self) -> None:
        """Scan existing CSV files in the watch folder."""
        if not self.watch_folder.exists():
            logger.warning(f"Watch folder does not exist: {self.watch_folder}")
            return

        csv_files = list(self.watch_folder.glob(self.glob_pattern))
        logger.info(f"Initial scan found {len(csv_files)} CSV files")

        for csv_file in csv_files:
            self._tail_file(str(csv_file))

    async def _watch_loop(self) -> None:
        """Main watch loop using watchfiles."""
        try:
            async for changes in awatch(self.watch_folder):
                if not self._running:
                    break
                for change_type, file_path in changes:
                    self._handle_change(change_type, file_path)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Watch loop error: {e}")

    def _handle_change(self, change_type: Change, file_path: str) -> None:
        """Handle a file change event."""
        path = Path(file_path)
        if not path.match(self.glob_pattern):
            return

        if change_type == Change.deleted:
            logger.info(f"File deleted: {path.name}")
            return

        if change_type in (Change.added, Change.modified):
            self._tail_file(file_path)

    def _tail_file(self, file_path: str) -> None:
        """Read new content from a CSV file since last read."""
        path = Path(file_path)
        if not path.exists():
            return

        try:
            file_size = path.stat().st_size
            current_offset = self._offsets.get_offset(file_path)

            # Log rotation detection
            if file_size < current_offset:
                logger.info(f"File truncated, resetting: {path.name}")
                self._offsets.reset(file_path)
                current_offset = 0

            if file_size == current_offset:
                return

            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(current_offset)
                new_content = f.read()
                new_offset = f.tell()

            # Handle partial writes — don't process incomplete last line
            lines = new_content.split("\n")
            if not new_content.endswith("\n") and len(lines) > 1:
                incomplete_size = len(lines[-1])
                new_content = "\n".join(lines[:-1])
                new_offset -= incomplete_size

            self._offsets.set_offset(file_path, new_offset)

            if current_offset == 0:
                # First read — full content including header
                header_line = lines[0] if lines else ""
                self._offsets.set_header(file_path, header_line)
                records = self._parser.parse_content(new_content)
            else:
                # Incremental — prepend cached header
                header = self._offsets.get_header(file_path)
                if header is None:
                    # Read header from file start
                    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                        header = f.readline().rstrip("\n")
                    self._offsets.set_header(file_path, header)
                records = self._parser.parse_new_lines(header, new_content)

            if records:
                logger.info(f"Parsed {len(records)} records from {path.name}")
                self.on_records(records)

        except Exception as e:
            logger.error(f"Error tailing {file_path}: {e}")
