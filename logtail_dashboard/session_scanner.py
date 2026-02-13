"""Session scanning and discovery - simplified to work with direct CSV folder."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class SessionInfo:
    """Information about the configured data folder."""

    name: str
    path: Path
    last_activity: Optional[datetime]
    file_count: int
    is_active: bool
    size_bytes: int


class SessionScanner:
    """Scan the configured folder for CSV files."""

    def __init__(
        self,
        log_root: Path,
        active_threshold_minutes: int = 30,
        auto_attach_threshold_seconds: int = 30,
    ):
        """
        Initialize session scanner.

        Args:
            log_root: Directory containing CSV files directly.
            active_threshold_minutes: Minutes since last activity to consider active.
            auto_attach_threshold_seconds: Seconds threshold for automatic attachment.
        """
        self.log_root = Path(log_root)
        self.active_threshold = timedelta(minutes=active_threshold_minutes)
        self.auto_attach_threshold = timedelta(seconds=auto_attach_threshold_seconds)

    def scan_sessions(self) -> list[SessionInfo]:
        """
        Scan log root for CSV files (treats log_root itself as the session).

        Returns:
            List with single session representing the configured folder.
        """
        if not self.log_root.exists():
            logger.warning(f"Log root does not exist: {self.log_root}")
            return []

        # Analyze the log_root folder directly (not subfolders)
        session_info = self._analyze_folder(self.log_root)
        if session_info:
            return [session_info]

        return []

    def _analyze_folder(self, folder_path: Path) -> Optional[SessionInfo]:
        """
        Analyze the folder for CSV files.

        Args:
            folder_path: Path to folder containing CSV files.

        Returns:
            SessionInfo if valid folder with CSVs, None otherwise.
        """
        try:
            # Look for CSV files directly in the folder
            csv_files = list(folder_path.glob("*.csv"))

            if not csv_files:
                # No CSV files found
                logger.info(f"No CSV files found in {folder_path}")
                return None

            # Find most recent file modification
            last_activity = None
            total_size = 0

            for csv_file in csv_files:
                try:
                    stat = csv_file.stat()
                    file_mtime = datetime.fromtimestamp(stat.st_mtime)
                    total_size += stat.st_size

                    if last_activity is None or file_mtime > last_activity:
                        last_activity = file_mtime

                except Exception as e:
                    logger.debug(f"Error reading file stats for {csv_file}: {e}")
                    continue

            if last_activity is None:
                return None

            # Determine if folder has recent activity
            time_since_activity = datetime.now() - last_activity
            is_active = time_since_activity <= self.active_threshold

            return SessionInfo(
                name=folder_path.name,
                path=folder_path,
                last_activity=last_activity,
                file_count=len(csv_files),
                is_active=is_active,
                size_bytes=total_size,
            )

        except Exception as e:
            logger.error(f"Error analyzing folder {folder_path}: {e}")
            return None

    def find_most_recent_active(self) -> Optional[SessionInfo]:
        """
        Get the configured folder info.

        Returns:
            SessionInfo for the configured folder, or None.
        """
        sessions = self.scan_sessions()
        return sessions[0] if sessions else None

    def find_auto_attach_session(self) -> Optional[SessionInfo]:
        """
        Get the configured folder for automatic attachment.

        Returns:
            SessionInfo for the folder if it has CSV files.
        """
        return self.find_most_recent_active()

    def format_session_display(self, session: SessionInfo) -> str:
        """
        Format session info for user-friendly display.

        Args:
            session: Session information.

        Returns:
            Formatted string for display.
        """
        if session.last_activity:
            time_ago = self._format_time_ago(datetime.now() - session.last_activity)
            activity_str = f"Last activity: {time_ago}"
        else:
            activity_str = "No recent activity"

        status = "🟢 Active" if session.is_active else "⚪ Inactive"

        return f"{session.name} - {status} - {activity_str} - {session.file_count} files"

    @staticmethod
    def _format_time_ago(delta: timedelta) -> str:
        """
        Format timedelta in human-readable format.

        Args:
            delta: Time delta.

        Returns:
            Human-readable string (e.g., "5 minutes ago").
        """
        total_seconds = int(delta.total_seconds())

        if total_seconds < 60:
            return f"{total_seconds} seconds ago"
        elif total_seconds < 3600:
            minutes = total_seconds // 60
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        elif total_seconds < 86400:
            hours = total_seconds // 3600
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        else:
            days = total_seconds // 86400
            return f"{days} day{'s' if days != 1 else ''} ago"
