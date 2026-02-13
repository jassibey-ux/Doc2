"""
CSV to Database Importer

Migrates existing CSV session data into the SQLite database.
Preserves backward compatibility with the file-based storage.
"""

import csv
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from uuid import uuid4

from sqlalchemy.orm import Session

from .models import (
    TestSession,
    TrackerTelemetry,
    TrackerAssignment,
    SessionStatus,
)
from .connection import DatabaseManager

logger = logging.getLogger(__name__)


class CSVImporter:
    """
    Imports CSV session data into the database.

    Supports both incremental imports (new sessions only)
    and full re-imports with telemetry data.
    """

    def __init__(self, db_manager: DatabaseManager, log_root: Path):
        """
        Initialize the CSV importer.

        Args:
            db_manager: Database manager instance.
            log_root: Root directory containing session folders.
        """
        self.db_manager = db_manager
        self.log_root = log_root

    def scan_sessions(self) -> List[Dict[str, Any]]:
        """
        Scan for sessions in the log root.

        Returns:
            List of session metadata dicts.
        """
        sessions = []

        if not self.log_root.exists():
            logger.warning(f"Log root does not exist: {self.log_root}")
            return sessions

        # Check for flat structure (CSVs directly in root)
        root_csvs = list(self.log_root.glob("*.csv"))
        if root_csvs:
            sessions.append(self._scan_session_folder(self.log_root, is_root=True))

        # Scan subdirectories
        for folder in self.log_root.iterdir():
            if not folder.is_dir() or folder.name.startswith("."):
                continue

            csv_files = list(folder.glob("*.csv"))
            if csv_files:
                sessions.append(self._scan_session_folder(folder, is_root=False))

        return [s for s in sessions if s is not None]

    def _scan_session_folder(
        self,
        folder: Path,
        is_root: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """
        Scan a single session folder.

        Args:
            folder: Session folder path.
            is_root: Whether this is the root folder (flat structure).

        Returns:
            Session metadata dict, or None if invalid.
        """
        csv_files = list(folder.glob("*.csv"))
        if not csv_files:
            return None

        # Extract tracker IDs from filenames
        tracker_ids: Set[str] = set()
        for f in csv_files:
            # Format: tracker_<id>_<date>_<time>.csv
            parts = f.stem.split("_")
            if len(parts) >= 2 and parts[0] == "tracker":
                tracker_ids.add(parts[1])
            else:
                # Try to find numeric ID in filename
                for part in parts:
                    if part.isdigit() and len(part) >= 4:
                        tracker_ids.add(part)
                        break

        # Get time range from file stats
        first_modified = min(f.stat().st_mtime for f in csv_files)
        last_modified = max(f.stat().st_mtime for f in csv_files)

        return {
            "name": folder.name,
            "path": str(folder),
            "is_root": is_root,
            "csv_files": [str(f) for f in csv_files],
            "file_count": len(csv_files),
            "tracker_ids": list(tracker_ids),
            "first_activity": datetime.fromtimestamp(first_modified),
            "last_activity": datetime.fromtimestamp(last_modified),
        }

    def import_session(
        self,
        session_info: Dict[str, Any],
        import_telemetry: bool = True,
        force: bool = False,
    ) -> Optional[str]:
        """
        Import a single session into the database.

        Args:
            session_info: Session metadata from scan_sessions().
            import_telemetry: Whether to import telemetry data.
            force: Force re-import even if session exists.

        Returns:
            The session ID if successful, None otherwise.
        """
        session_name = session_info["name"]
        session_path = session_info["path"]

        db = self.db_manager.get_sync_session()

        try:
            # Check if session already exists
            existing = (
                db.query(TestSession)
                .filter(TestSession.live_data_path == session_path)
                .first()
            )

            if existing and not force:
                logger.info(f"Session already imported: {session_name}")
                return existing.id

            if existing and force:
                # Delete existing session and re-import
                logger.info(f"Re-importing session: {session_name}")
                db.delete(existing)
                db.commit()

            # Create session record
            session_id = str(uuid4())
            session = TestSession(
                id=session_id,
                name=session_name,
                status=SessionStatus.COMPLETED.value,
                start_time=session_info["first_activity"],
                end_time=session_info["last_activity"],
                duration_seconds=(
                    session_info["last_activity"] - session_info["first_activity"]
                ).total_seconds(),
                live_data_path=session_path,
            )
            db.add(session)

            # Create tracker assignments
            for tracker_id in session_info["tracker_ids"]:
                assignment = TrackerAssignment(
                    id=str(uuid4()),
                    session_id=session_id,
                    tracker_id=tracker_id,
                )
                db.add(assignment)

            db.commit()

            # Import telemetry if requested
            if import_telemetry:
                telemetry_count = self._import_telemetry(
                    db, session_id, session_info["csv_files"]
                )
                logger.info(
                    f"Imported {telemetry_count} telemetry records for {session_name}"
                )

            logger.info(f"Session imported successfully: {session_name} ({session_id})")
            return session_id

        except Exception as e:
            logger.error(f"Failed to import session {session_name}: {e}")
            db.rollback()
            return None

        finally:
            db.close()

    def _import_telemetry(
        self,
        db: Session,
        session_id: str,
        csv_files: List[str],
    ) -> int:
        """
        Import telemetry data from CSV files.

        Args:
            db: Database session.
            session_id: The session's ID.
            csv_files: List of CSV file paths.

        Returns:
            Number of telemetry records imported.
        """
        total_count = 0

        for csv_path in csv_files:
            path = Path(csv_path)
            if not path.exists():
                continue

            # Extract tracker ID from filename
            parts = path.stem.split("_")
            tracker_id = None
            if len(parts) >= 2 and parts[0] == "tracker":
                tracker_id = parts[1]
            else:
                for part in parts:
                    if part.isdigit() and len(part) >= 4:
                        tracker_id = part
                        break

            if not tracker_id:
                tracker_id = "unknown"

            # Read and import CSV
            try:
                records = self._parse_csv(path, tracker_id)
                for record in records:
                    telemetry = TrackerTelemetry(
                        session_id=session_id,
                        tracker_id=tracker_id,
                        time_local_received=record.get("timestamp"),
                        lat=record.get("lat"),
                        lon=record.get("lon"),
                        alt_m=record.get("alt_m"),
                        speed_mps=record.get("speed_mps"),
                        course_deg=record.get("course_deg"),
                        rssi_dbm=record.get("rssi_dbm"),
                        satellites=record.get("satellites"),
                        fix_valid=record.get("fix_valid"),
                        hdop=record.get("hdop"),
                        battery_mv=record.get("battery_mv"),
                    )
                    db.add(telemetry)
                    total_count += 1

                # Commit in batches
                if total_count % 1000 == 0:
                    db.commit()

            except Exception as e:
                logger.error(f"Error importing telemetry from {csv_path}: {e}")

        db.commit()
        return total_count

    def _parse_csv(self, path: Path, tracker_id: str) -> List[Dict[str, Any]]:
        """
        Parse a CSV file into telemetry records.

        Args:
            path: CSV file path.
            tracker_id: The tracker ID.

        Returns:
            List of telemetry record dicts.
        """
        records = []

        with open(path, "r") as f:
            reader = csv.DictReader(f)

            for row in reader:
                try:
                    record = self._parse_row(row, tracker_id)
                    if record:
                        records.append(record)
                except Exception as e:
                    logger.debug(f"Skipping invalid row: {e}")

        return records

    def _parse_row(self, row: Dict[str, str], tracker_id: str) -> Optional[Dict[str, Any]]:
        """
        Parse a CSV row into a telemetry record.

        Args:
            row: CSV row dict.
            tracker_id: The tracker ID.

        Returns:
            Telemetry record dict, or None if invalid.
        """
        # Try to parse timestamp from various column names
        timestamp = None
        for col in ["time_local_received", "timestamp", "time", "datetime", "utc_time"]:
            if col in row and row[col]:
                try:
                    timestamp = datetime.fromisoformat(row[col].replace("Z", "+00:00"))
                    break
                except ValueError:
                    try:
                        timestamp = datetime.strptime(row[col], "%Y-%m-%d %H:%M:%S")
                        break
                    except ValueError:
                        pass

        if not timestamp:
            return None

        def safe_float(value: str) -> Optional[float]:
            try:
                return float(value) if value else None
            except ValueError:
                return None

        def safe_int(value: str) -> Optional[int]:
            try:
                return int(float(value)) if value else None
            except ValueError:
                return None

        def safe_bool(value: str) -> Optional[bool]:
            if not value:
                return None
            return value.lower() in ("true", "1", "yes", "valid")

        return {
            "tracker_id": tracker_id,
            "timestamp": timestamp,
            "lat": safe_float(row.get("lat") or row.get("latitude")),
            "lon": safe_float(row.get("lon") or row.get("longitude") or row.get("lng")),
            "alt_m": safe_float(row.get("alt_m") or row.get("altitude") or row.get("alt")),
            "speed_mps": safe_float(row.get("speed_mps") or row.get("speed") or row.get("ground_speed")),
            "course_deg": safe_float(row.get("course_deg") or row.get("course") or row.get("heading")),
            "rssi_dbm": safe_float(row.get("rssi_dbm") or row.get("rssi")),
            "satellites": safe_int(row.get("satellites") or row.get("sats") or row.get("num_satellites")),
            "fix_valid": safe_bool(row.get("fix_valid") or row.get("fix") or row.get("gps_fix")),
            "battery_mv": safe_float(row.get("battery_mv") or row.get("battery") or row.get("batt_mv")),
        }

    def import_all_sessions(
        self,
        import_telemetry: bool = True,
        force: bool = False,
    ) -> Dict[str, Any]:
        """
        Import all sessions from the log root.

        Args:
            import_telemetry: Whether to import telemetry data.
            force: Force re-import of existing sessions.

        Returns:
            Summary dict with counts.
        """
        sessions = self.scan_sessions()
        logger.info(f"Found {len(sessions)} sessions to import")

        imported = 0
        skipped = 0
        failed = 0

        for session_info in sessions:
            result = self.import_session(
                session_info,
                import_telemetry=import_telemetry,
                force=force,
            )
            if result:
                imported += 1
            else:
                # Check if it was skipped or failed
                db = self.db_manager.get_sync_session()
                existing = (
                    db.query(TestSession)
                    .filter(TestSession.live_data_path == session_info["path"])
                    .first()
                )
                db.close()

                if existing:
                    skipped += 1
                else:
                    failed += 1

        return {
            "total_found": len(sessions),
            "imported": imported,
            "skipped": skipped,
            "failed": failed,
        }

    def get_import_preview(self) -> Dict[str, Any]:
        """
        Preview what would be imported.

        Returns:
            Preview dict with session details.
        """
        sessions = self.scan_sessions()

        db = self.db_manager.get_sync_session()

        preview = []
        for session_info in sessions:
            existing = (
                db.query(TestSession)
                .filter(TestSession.live_data_path == session_info["path"])
                .first()
            )

            preview.append({
                "name": session_info["name"],
                "path": session_info["path"],
                "file_count": session_info["file_count"],
                "tracker_count": len(session_info["tracker_ids"]),
                "already_imported": existing is not None,
                "existing_id": existing.id if existing else None,
            })

        db.close()

        return {
            "total_sessions": len(sessions),
            "already_imported": sum(1 for p in preview if p["already_imported"]),
            "pending_import": sum(1 for p in preview if not p["already_imported"]),
            "sessions": preview,
        }
