"""FastAPI application and routes."""

import asyncio
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from typing import List
import tempfile
import shutil

from . import __version__
from .config import Config, save_config_atomic
from .models import (
    HealthResponse,
    EventListResponse,
    TrackerSummary,
    TrackerState,
    WebSocketMessage,
)
from .parser import TrackerRecord
from .state import StateManager
from .watcher import LogWatcher
from .session_scanner import SessionScanner
from .replay import SessionLoader, ReplayEngine
from .kml_export import generate_kml
from .kml_import import KMLImporter
from .api_v2 import router as v2_router
from .database import init_database

logger = logging.getLogger(__name__)


def get_static_dir() -> Path:
    """Get the static files directory, handling both dev and frozen (PyInstaller) modes."""
    import sys

    if getattr(sys, 'frozen', False):
        # Running as frozen executable (PyInstaller)
        # Static files are in _internal/logtail_dashboard/static/
        base_path = Path(sys._MEIPASS)
        static_dir = base_path / "logtail_dashboard" / "static"
        if static_dir.exists():
            return static_dir
        # Fallback: check relative to executable
        exe_dir = Path(sys.executable).parent
        static_dir = exe_dir / "_internal" / "logtail_dashboard" / "static"
        if static_dir.exists():
            return static_dir

    # Development mode - relative to this file
    return Path(__file__).parent / "static"


# Request models for new endpoints
from pydantic import BaseModel as PydanticBaseModel


class SetLogRootRequest(PydanticBaseModel):
    """Request to set log root folder."""
    path: str




class DashboardApp:
    """Main dashboard application."""

    def __init__(self, config: Config):
        """
        Initialize dashboard application.

        Args:
            config: Application configuration.
        """
        self.config = config
        self.start_time = time.time()

        # State manager
        self.state_manager = StateManager(
            stale_seconds=config.stale_seconds,
            on_tracker_updated=self._on_tracker_updated,
            on_tracker_stale=self._on_tracker_stale,
            low_battery_mv=config.low_battery_mv,
            critical_battery_mv=config.critical_battery_mv,
        )

        # File watcher
        self.watcher: Optional[LogWatcher] = None
        self.active_event: Optional[str] = None

        # Session scanner
        self.scanner = SessionScanner(
            log_root=Path(config.log_root_folder),
            active_threshold_minutes=30,
            auto_attach_threshold_seconds=30,
        )

        # Replay system
        self.session_loader = SessionLoader(Path(config.log_root_folder))
        self.replay_engine: Optional[ReplayEngine] = None
        self.replay_mode = False

        # WebSocket connections
        self.ws_connections: set[WebSocket] = set()

        # FastAPI app
        self.app = FastAPI(
            title="LogTail Dashboard",
            version=__version__,
        )

        # Include v2 CRM router
        self.app.include_router(v2_router)

        # Setup routes
        self._setup_routes()

    def _setup_routes(self) -> None:
        """Setup FastAPI routes."""

        @self.app.get("/api/health", response_model=HealthResponse)
        async def health() -> HealthResponse:
            """Health check endpoint."""
            return HealthResponse(
                status="ok",
                version=__version__,
                active_event=self.active_event,
                tracker_count=self.state_manager.get_tracker_count(),
                uptime_seconds=time.time() - self.start_time,
            )

        @self.app.get("/api/config")
        async def get_config():
            """Get current configuration status."""
            log_root = Path(self.config.log_root_folder)
            log_root_exists = log_root.exists() and log_root.is_dir()

            # Check if there are any sessions in the log root
            has_sessions = False
            if log_root_exists:
                try:
                    subdirs = [d for d in log_root.iterdir() if d.is_dir() and not d.name.startswith(".")]
                    has_sessions = len(subdirs) > 0
                except Exception:
                    pass

            return {
                "log_root": str(self.config.log_root_folder),
                "log_root_exists": log_root_exists,
                "has_sessions": has_sessions,
                "active_event": self.active_event,
                "is_configured": log_root_exists,
                "port": self.config.port,
                "stale_seconds": self.config.stale_seconds,
            }

        @self.app.post("/api/config/log-root")
        async def set_log_root(request: SetLogRootRequest):
            """Set or change the log root folder."""
            new_path = Path(request.path)

            # Validate the path exists
            if not new_path.exists():
                return {
                    "success": False,
                    "message": f"Path does not exist: {request.path}",
                }

            if not new_path.is_dir():
                return {
                    "success": False,
                    "message": f"Path is not a directory: {request.path}",
                }

            try:
                # Stop current watcher if running
                if self.watcher:
                    await self.watcher.stop()
                    self.watcher = None

                # Clear tracker states
                self.state_manager.clear_all()
                self.active_event = None

                # Update configuration
                old_path = self.config.log_root_folder
                self.config = self.config.model_copy(update={"log_root_folder": str(new_path)})

                # Update scanner with new path
                self.scanner = SessionScanner(
                    log_root=new_path,
                    active_threshold_minutes=30,
                    auto_attach_threshold_seconds=30,
                )

                # Update session loader for replay and invalidate cache
                self.session_loader = SessionLoader(new_path)
                self.session_loader.invalidate_cache()

                # Save to config file
                from .config import get_config_path
                config_file = get_config_path()
                config_data = {}
                if config_file.exists():
                    try:
                        with open(config_file, "r") as f:
                            config_data = json.load(f)
                    except Exception:
                        pass

                config_data["log_root_folder"] = str(new_path)
                save_config_atomic(config_data, config_file)

                logger.info(f"Log root changed from {old_path} to {new_path}")

                # Notify clients
                await self._broadcast_message(
                    WebSocketMessage(
                        type="config_changed",
                        data={
                            "log_root": str(new_path),
                            "log_root_exists": True,
                        },
                    )
                )

                # Immediately start monitoring the configured folder
                self.watcher = LogWatcher(
                    event_folder=new_path,
                    on_records=self._on_records,
                    on_new_file=self._on_new_file,
                )
                await self.watcher.start()
                self.active_event = new_path.name

                logger.info(f"Now monitoring: {new_path}")

                # Notify clients of active monitoring
                await self._broadcast_message(
                    WebSocketMessage(
                        type="active_event_changed",
                        data={"event_name": new_path.name},
                    )
                )

                return {
                    "success": True,
                    "message": f"Now monitoring: {new_path}",
                    "log_root": str(new_path),
                }

            except Exception as e:
                logger.error(f"Error setting log root: {e}")
                return {
                    "success": False,
                    "message": f"Failed to set log root: {e}",
                }

        @self.app.get("/api/validate-path")
        async def validate_path(path: str):
            """Validate a path and return session preview info."""
            if not path or not path.strip():
                return {
                    "valid": False,
                    "exists": False,
                    "is_directory": False,
                    "sessions": [],
                    "message": "Path is empty"
                }

            check_path = Path(path.strip())

            try:
                path_exists = check_path.exists()
            except (PermissionError, OSError):
                return {
                    "valid": False,
                    "exists": False,
                    "is_directory": False,
                    "sessions": [],
                    "message": "Cannot access path (permission denied)"
                }

            if not path_exists:
                return {
                    "valid": False,
                    "exists": False,
                    "is_directory": False,
                    "sessions": [],
                    "message": "Path does not exist"
                }

            try:
                is_dir = check_path.is_dir()
            except (PermissionError, OSError):
                return {
                    "valid": False,
                    "exists": True,
                    "is_directory": False,
                    "sessions": [],
                    "message": "Cannot access path (permission denied)"
                }

            if not is_dir:
                return {
                    "valid": False,
                    "exists": True,
                    "is_directory": False,
                    "sessions": [],
                    "message": "Path is not a directory"
                }

            # Path is valid directory - scan for sessions and direct files
            try:
                sessions = []
                subdirs = sorted([d for d in check_path.iterdir() if d.is_dir() and not d.name.startswith(".")],
                                key=lambda x: x.stat().st_mtime, reverse=True)

                for d in subdirs[:5]:  # Limit to 5 most recent
                    csv_files = list(d.glob("*.csv"))
                    if csv_files:
                        last_mod = max(f.stat().st_mtime for f in csv_files)
                        sessions.append({
                            "name": d.name,
                            "file_count": len(csv_files),
                            "last_modified": datetime.fromtimestamp(last_mod).isoformat()
                        })

                # Also check for supported files directly in the folder
                supported_exts = ['*.csv', '*.nmea', '*.kml', '*.kmz']
                direct_files = []
                for ext in supported_exts:
                    direct_files.extend(list(check_path.glob(ext)))
                direct_file_count = len(direct_files)

                # Build message
                if sessions:
                    message = f"Found {len(subdirs)} session(s)"
                elif direct_file_count > 0:
                    message = f"Found {direct_file_count} file(s)"
                else:
                    message = "No log files found"

                return {
                    "valid": True,
                    "exists": True,
                    "is_directory": True,
                    "sessions": sessions,
                    "session_count": len(subdirs),
                    "direct_file_count": direct_file_count,
                    "message": message
                }
            except Exception as e:
                return {
                    "valid": True,
                    "exists": True,
                    "is_directory": True,
                    "sessions": [],
                    "direct_file_count": 0,
                    "message": f"Error scanning: {e}"
                }

        @self.app.get("/api/select-folder")
        async def select_folder():
            """Open native folder picker dialog."""
            def _pick():
                import tkinter as tk
                from tkinter import filedialog
                root = tk.Tk()
                root.withdraw()
                root.attributes('-topmost', True)
                folder = filedialog.askdirectory(title="Select Data Folder")
                root.destroy()
                return folder or ""
            loop = asyncio.get_event_loop()
            path = await loop.run_in_executor(None, _pick)
            return {"path": path}

        @self.app.get("/api/events", response_model=EventListResponse)
        async def list_events() -> EventListResponse:
            """List available event folders."""
            log_root = Path(self.config.log_root_folder)

            if not log_root.exists():
                logger.warning(f"Log root folder does not exist: {log_root}")
                return EventListResponse(events=[])

            try:
                # List subdirectories
                events = [
                    d.name
                    for d in log_root.iterdir()
                    if d.is_dir() and not d.name.startswith(".")
                ]
                events.sort()
                return EventListResponse(events=events)

            except Exception as e:
                logger.error(f"Error listing events: {e}")
                return EventListResponse(events=[])

        @self.app.get("/api/sessions/scan")
        async def scan_sessions():
            """Scan for available sessions with activity status."""
            sessions = self.scanner.scan_sessions()

            return {
                "sessions": [
                    {
                        "name": s.name,
                        "last_activity": s.last_activity.isoformat() if s.last_activity else None,
                        "is_active": s.is_active,
                        "file_count": s.file_count,
                        "display_name": self.scanner.format_session_display(s),
                    }
                    for s in sessions
                ]
            }

        @self.app.get("/api/sessions")
        async def list_sessions():
            """List all sessions (folders) in the log root for monitoring console."""
            log_root = Path(self.config.log_root_folder)

            if not log_root.exists():
                return {"sessions": [], "log_root": str(log_root)}

            sessions = []

            # Check for flat structure (CSV files directly in log_root)
            try:
                root_csv_files = list(log_root.glob("*.csv"))
                root_nmea_files = list(log_root.glob("*.nmea"))
                root_files = root_csv_files + root_nmea_files

                if root_files:
                    # Flat structure: treat log_root itself as a session
                    last_modified = max(f.stat().st_mtime for f in root_files)
                    total_size = sum(f.stat().st_size for f in root_files)

                    # Parse tracker IDs from filenames
                    tracker_ids = set()
                    for f in root_files:
                        # Format: tracker_<id>_<date>_<time>.csv or similar patterns
                        parts = f.stem.split("_")
                        if len(parts) >= 2 and parts[0] == "tracker":
                            tracker_ids.add(parts[1])
                        else:
                            # Try to find numeric ID in filename parts
                            for part in parts:
                                if part.isdigit() and len(part) >= 4:
                                    tracker_ids.add(part)
                                    break

                    sessions.append({
                        "name": log_root.name,
                        "path": str(log_root),
                        "file_count": len(root_files),
                        "tracker_ids": list(tracker_ids),
                        "tracker_count": len(tracker_ids),
                        "last_modified": datetime.fromtimestamp(last_modified).isoformat(),
                        "total_size_bytes": total_size,
                        "is_active": self.active_event == log_root.name,
                        "is_root_folder": True,  # Flag for frontend
                    })

            except Exception as e:
                logger.error(f"Error checking root folder for CSV files: {e}")

            # Also scan subdirectories (nested structure / backward compatibility)
            try:
                for d in sorted(log_root.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
                    if not d.is_dir() or d.name.startswith("."):
                        continue

                    csv_files = list(d.glob("*.csv"))
                    if not csv_files:
                        continue

                    # Get file info
                    last_modified = max(f.stat().st_mtime for f in csv_files)
                    total_size = sum(f.stat().st_size for f in csv_files)

                    # Parse tracker IDs from filenames
                    tracker_ids = []
                    for f in csv_files:
                        # Format: tracker_<id>_<date>_<time>.csv
                        parts = f.stem.split("_")
                        if len(parts) >= 2 and parts[0] == "tracker":
                            tracker_ids.append(parts[1])

                    sessions.append({
                        "name": d.name,
                        "path": str(d),
                        "file_count": len(csv_files),
                        "tracker_ids": list(set(tracker_ids)),
                        "tracker_count": len(set(tracker_ids)),
                        "last_modified": datetime.fromtimestamp(last_modified).isoformat(),
                        "total_size_bytes": total_size,
                        "is_active": self.active_event == d.name,
                        "is_root_folder": False,
                    })

            except Exception as e:
                logger.error(f"Error listing sessions: {e}")

            return {
                "sessions": sessions,
                "log_root": str(log_root),
                "active_session": self.active_event,
            }

        @self.app.get("/api/sessions/{session_name}/files")
        async def get_session_files(session_name: str):
            """Get files in a specific session."""
            log_root = Path(self.config.log_root_folder)

            # Handle flat structure: session_name == log_root.name
            if session_name == log_root.name:
                session_path = log_root
            else:
                session_path = log_root / session_name

            if not session_path.exists():
                raise HTTPException(status_code=404, detail="Session not found")

            files = []
            try:
                csv_files = list(session_path.glob("*.csv"))
                nmea_files = list(session_path.glob("*.nmea"))
                all_files = csv_files + nmea_files
                for f in sorted(all_files, key=lambda x: x.stat().st_mtime, reverse=True):
                    stat = f.stat()
                    files.append({
                        "name": f.name,
                        "path": str(f),
                        "size_bytes": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    })

            except Exception as e:
                logger.error(f"Error getting session files: {e}")
                raise HTTPException(status_code=500, detail=str(e))

            return {
                "session_name": session_name,
                "files": files,
                "file_count": len(files),
            }

        @self.app.get("/api/sessions/{session_name}/history")
        async def get_session_history(session_name: str, tracker_id: Optional[str] = None):
            """Get track history for a session (for replay visualization)."""
            log_root = Path(self.config.log_root_folder)

            # Handle flat structure: session_name == log_root.name
            if session_name == log_root.name:
                session_path = log_root
            else:
                session_path = log_root / session_name

            if not session_path.exists():
                raise HTTPException(status_code=404, detail="Session not found")

            try:
                from .parser import Parser
                parser = Parser()

                # Get all CSV files (or filter by tracker_id)
                csv_files = list(session_path.glob("*.csv"))
                if tracker_id:
                    csv_files = [f for f in csv_files if f"tracker_{tracker_id}" in f.stem]

                # Parse records from all files
                all_records = []
                for csv_file in csv_files:
                    records = parser.parse_csv(csv_file)
                    all_records.extend(records)

                # Sort by timestamp
                all_records.sort(key=lambda r: r.timestamp)

                # Group by tracker ID
                tracks = {}
                for record in all_records:
                    tid = record.tracker_id
                    if tid not in tracks:
                        tracks[tid] = []

                    if record.lat is not None and record.lon is not None:
                        tracks[tid].append({
                            "lat": record.lat,
                            "lon": record.lon,
                            "alt_m": record.alt_m,
                            "timestamp": record.timestamp.isoformat(),
                            "timestamp_ms": int(record.timestamp.timestamp() * 1000),
                            "speed_mps": record.speed_mps,
                            "course_deg": record.course_deg,
                            "rssi_dbm": record.rssi_dbm,
                        })

                # Calculate time range
                start_time = all_records[0].timestamp if all_records else None
                end_time = all_records[-1].timestamp if all_records else None

                return {
                    "session_name": session_name,
                    "tracks": tracks,
                    "tracker_ids": list(tracks.keys()),
                    "total_points": sum(len(t) for t in tracks.values()),
                    "start_time": start_time.isoformat() if start_time else None,
                    "end_time": end_time.isoformat() if end_time else None,
                    "duration_seconds": (end_time - start_time).total_seconds() if start_time and end_time else 0,
                }

            except Exception as e:
                logger.error(f"Error getting session history: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @self.app.get("/api/file/history")
        async def get_file_history(path: str):
            """Get track history for a specific CSV or NMEA file (for replay visualization)."""
            logger.info(f"[FILE HISTORY] Received path parameter: {repr(path)}")
            file_path = Path(path)
            logger.info(f"[FILE HISTORY] Path object: {file_path}")
            logger.info(f"[FILE HISTORY] Path exists: {file_path.exists()}")

            if not file_path.exists():
                logger.error(f"[FILE HISTORY] File not found: {file_path}")
                raise HTTPException(status_code=404, detail="File not found")

            suffix = file_path.suffix.lower()
            if suffix not in (".csv", ".nmea"):
                raise HTTPException(status_code=400, detail="File must be a CSV or NMEA file")

            try:
                # Parse records from the specific file
                if suffix == ".csv":
                    from .parser import Parser
                    parser = Parser()
                    all_records = parser.parse_csv(file_path)
                else:  # .nmea
                    from .nmea_parser import NMEAParser
                    nmea_parser = NMEAParser()
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    all_records = nmea_parser.parse_nmea_content(content)

                if not all_records:
                    return {
                        "file_name": file_path.name,
                        "file_path": str(file_path),
                        "tracks": {},
                        "tracker_ids": [],
                        "total_points": 0,
                        "start_time": None,
                        "end_time": None,
                        "duration_seconds": 0,
                    }

                # Sort by timestamp
                all_records.sort(key=lambda r: r.timestamp)

                # Group by tracker ID
                tracks = {}
                for record in all_records:
                    tid = record.tracker_id
                    if tid not in tracks:
                        tracks[tid] = []

                    if record.lat is not None and record.lon is not None:
                        tracks[tid].append({
                            "lat": record.lat,
                            "lon": record.lon,
                            "alt_m": record.alt_m,
                            "timestamp": record.timestamp.isoformat(),
                            "timestamp_ms": int(record.timestamp.timestamp() * 1000),
                            "speed_mps": record.speed_mps,
                            "course_deg": record.course_deg,
                            "rssi_dbm": record.rssi_dbm,
                        })

                # Calculate time range
                start_time = all_records[0].timestamp if all_records else None
                end_time = all_records[-1].timestamp if all_records else None

                return {
                    "file_name": file_path.name,
                    "file_path": str(file_path),
                    "tracks": tracks,
                    "tracker_ids": list(tracks.keys()),
                    "total_points": sum(len(t) for t in tracks.values()),
                    "start_time": start_time.isoformat() if start_time else None,
                    "end_time": end_time.isoformat() if end_time else None,
                    "duration_seconds": (end_time - start_time).total_seconds() if start_time and end_time else 0,
                }

            except Exception as e:
                logger.error(f"Error getting file history: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @self.app.get("/api/trackers", response_model=list[TrackerSummary])
        async def list_trackers() -> list[TrackerSummary]:
            """Get list of all trackers."""
            return self.state_manager.get_tracker_summaries()

        @self.app.get("/api/trackers/{tracker_id}", response_model=TrackerState)
        async def get_tracker(tracker_id: str) -> TrackerState:
            """Get detailed tracker state."""
            state = self.state_manager.get_tracker(tracker_id)

            if state is None:
                raise HTTPException(status_code=404, detail="Tracker not found")

            return state

        @self.app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            """WebSocket endpoint for real-time updates."""
            await websocket.accept()
            self.ws_connections.add(websocket)

            logger.info(f"WebSocket client connected (total: {len(self.ws_connections)})")

            # Send initial state
            try:
                summaries = self.state_manager.get_tracker_summaries()
                for summary in summaries:
                    msg = WebSocketMessage(
                        type="tracker_updated",
                        data=summary.model_dump(mode="json"),
                    )
                    await websocket.send_text(msg.model_dump_json())

                # Send active event
                if self.active_event:
                    msg = WebSocketMessage(
                        type="active_event_changed",
                        data={"event_name": self.active_event},
                    )
                    await websocket.send_text(msg.model_dump_json())

            except Exception as e:
                logger.error(f"Error sending initial state: {e}")

            # Keep connection alive
            try:
                while True:
                    # Wait for messages (ping/pong)
                    await websocket.receive_text()

            except WebSocketDisconnect:
                logger.info("WebSocket client disconnected")
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
            finally:
                self.ws_connections.discard(websocket)

        # Replay endpoints
        @self.app.get("/api/replay/sessions")
        async def list_replay_sessions() -> dict:
            """List available test sessions for replay."""
            try:
                sessions = await self.session_loader.scan_sessions()
                logger.info(f"Scanned for replay sessions: found {len(sessions)} sessions")
                return {
                    "sessions": [
                        {
                            "session_id": s.session_id,
                            "name": s.name,
                            "start_time": s.start_time.isoformat(),
                            "end_time": s.end_time.isoformat(),
                            "duration_seconds": s.duration_seconds,
                            "tracker_ids": s.tracker_ids,
                            "file_count": s.file_count,
                            "total_records": s.total_records,
                            "size_bytes": s.size_bytes,
                        }
                        for s in sessions
                    ],
                    "log_root": str(self.session_loader.log_root),
                }
            except Exception as e:
                logger.error(f"Error listing replay sessions: {e}")
                return {"sessions": []}

        @self.app.post("/api/replay/load/{session_id}")
        async def load_replay_session(
            session_id: str, trackers: Optional[list[str]] = None
        ):
            """Load session and prepare for playback."""
            try:
                # First try to get session from cache (avoids race conditions)
                session = self.session_loader.get_cached_session(session_id)

                # If not in cache, scan sessions (will populate cache)
                if not session:
                    logger.info(f"Session {session_id} not in cache, scanning...")
                    sessions = await self.session_loader.scan_sessions()
                    session = next((s for s in sessions if s.session_id == session_id), None)

                if not session:
                    raise HTTPException(status_code=404, detail="Session not found")

                logger.info(f"Loading replay session: {session.name}")

                # Load timeline
                timeline = await self.session_loader.load_timeline(session, trackers)

                if not timeline:
                    raise HTTPException(status_code=400, detail="No data in session")

                # Stop live watcher if running
                if self.watcher:
                    await self.watcher.stop()
                    self.watcher = None

                # Clear old state
                self.state_manager.clear_all()

                # Create replay engine
                self.replay_engine = ReplayEngine(timeline, self.state_manager)

                # Wrap broadcast callback to convert dict to WebSocketMessage
                async def replay_broadcast(msg_dict):
                    msg = WebSocketMessage(type=msg_dict["type"], data=msg_dict.get("data", msg_dict))
                    await self._broadcast_message(msg)

                self.replay_engine.set_broadcast_callback(replay_broadcast)
                self.replay_mode = True

                logger.info(f"Replay session loaded: {len(timeline)} frames")

                return {
                    "success": True,
                    "session": {
                        "session_id": session.session_id,
                        "name": session.name,
                        "duration_seconds": session.duration_seconds,
                        "frame_count": len(timeline),
                        "tracker_ids": session.tracker_ids,
                    },
                }

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error loading replay session: {e}")
                return {"success": False, "error": str(e)}

        @self.app.post("/api/replay/load-path")
        async def load_replay_from_path(request: SetLogRootRequest):
            """Load a replay session from a specific folder path."""
            try:
                session_path = Path(request.path)

                if not session_path.exists():
                    return {
                        "success": False,
                        "message": f"Path does not exist: {request.path}"
                    }

                if not session_path.is_dir():
                    return {
                        "success": False,
                        "message": f"Path is not a directory: {request.path}"
                    }

                # Check if folder contains CSV files
                csv_files = list(session_path.glob("*.csv"))
                if not csv_files:
                    return {
                        "success": False,
                        "message": "No CSV files found in the selected folder"
                    }

                # Create a session ID from the path
                session_id = session_path.name

                # Scan to create session info
                from .replay import ReplaySession
                sessions = await self.session_loader.scan_sessions()

                # Check if this session already exists
                session = next((s for s in sessions if s.name == session_id or s.session_id == session_id), None)

                if not session:
                    # Try to load directly from the path
                    # Update session loader to use this path temporarily
                    temp_loader = SessionLoader(session_path.parent)
                    sessions = await temp_loader.scan_sessions()
                    session = next((s for s in sessions if s.name == session_id), None)

                if not session:
                    return {
                        "success": False,
                        "message": "Could not parse session data from folder"
                    }

                logger.info(f"Loading replay session from path: {session_path}")

                # Load timeline
                timeline = await self.session_loader.load_timeline(session)

                if not timeline:
                    return {
                        "success": False,
                        "message": "No valid data in session"
                    }

                # Stop live watcher if running
                if self.watcher:
                    await self.watcher.stop()
                    self.watcher = None

                # Clear old state
                self.state_manager.clear_all()

                # Create replay engine
                self.replay_engine = ReplayEngine(timeline, self.state_manager)

                async def replay_broadcast(msg_dict):
                    msg = WebSocketMessage(type=msg_dict["type"], data=msg_dict.get("data", msg_dict))
                    await self._broadcast_message(msg)

                self.replay_engine.set_broadcast_callback(replay_broadcast)
                self.replay_mode = True

                return {
                    "success": True,
                    "session_id": session.session_id,
                    "session": {
                        "session_id": session.session_id,
                        "name": session.name,
                        "duration_seconds": session.duration_seconds,
                        "frame_count": len(timeline),
                        "tracker_ids": session.tracker_ids,
                    },
                }

            except Exception as e:
                logger.error(f"Error loading replay from path: {e}")
                return {"success": False, "message": str(e)}

        @self.app.post("/api/replay/upload")
        async def upload_replay_files(files: List[UploadFile] = File(...)):
            """Upload CSV files directly for replay (from native folder picker)."""
            try:
                if not files:
                    return {"success": False, "message": "No files uploaded"}

                # Filter for CSV files only
                csv_files = [f for f in files if f.filename and f.filename.endswith('.csv')]
                if not csv_files:
                    return {"success": False, "message": "No CSV files found in selection"}

                # Create a temporary directory to store uploaded files
                temp_dir = Path(tempfile.mkdtemp(prefix="scensus_replay_"))

                # Extract session name from the first file's path
                first_file = csv_files[0]
                # webkitRelativePath format: "FolderName/filename.csv"
                # We need to get the folder name from the relative path
                session_name = "UploadedSession"

                # Save files to temp directory
                for csv_file in csv_files:
                    file_path = temp_dir / csv_file.filename
                    with open(file_path, "wb") as f:
                        content = await csv_file.read()
                        f.write(content)
                    logger.info(f"Saved uploaded file: {file_path}")

                # Create a SessionLoader for the temp directory
                from .replay import SessionLoader, SessionInfo

                # Scan the temp directory for the session
                temp_loader = SessionLoader(temp_dir.parent)
                sessions = await temp_loader.scan_sessions()

                # Find the session we just created
                session = next((s for s in sessions if temp_dir.name in s.session_id), None)

                if not session:
                    # Create session info manually
                    csv_paths = list(temp_dir.glob("*.csv"))
                    tracker_ids = [p.stem.replace("tracker_", "") for p in csv_paths]

                    # Parse first file to get time range
                    from .parser import Parser
                    parser = Parser()
                    all_records = []
                    for csv_path in csv_paths:
                        records = await asyncio.get_event_loop().run_in_executor(
                            None, parser.parse_csv, csv_path
                        )
                        all_records.extend(records)

                    if not all_records:
                        shutil.rmtree(temp_dir)
                        return {"success": False, "message": "No valid records in CSV files"}

                    all_records.sort(key=lambda r: r.timestamp)
                    start_time = all_records[0].timestamp
                    end_time = all_records[-1].timestamp
                    duration = (end_time - start_time).total_seconds()

                    session = SessionInfo(
                        session_id=temp_dir.name,
                        name=session_name,
                        path=temp_dir,
                        start_time=start_time,
                        end_time=end_time,
                        duration_seconds=duration,
                        tracker_ids=tracker_ids,
                        record_count=len(all_records),
                        file_size_bytes=sum(p.stat().st_size for p in csv_paths)
                    )

                # Load timeline
                timeline = await temp_loader.load_timeline(session)

                if not timeline:
                    shutil.rmtree(temp_dir)
                    return {"success": False, "message": "No valid data in uploaded files"}

                # Stop live watcher if running
                if self.watcher:
                    await self.watcher.stop()
                    self.watcher = None

                # Clear old state
                self.state_manager.clear_all()

                # Create replay engine
                self.replay_engine = ReplayEngine(timeline, self.state_manager)

                async def replay_broadcast(msg_dict):
                    msg = WebSocketMessage(type=msg_dict["type"], data=msg_dict.get("data", msg_dict))
                    await self._broadcast_message(msg)

                self.replay_engine.set_broadcast_callback(replay_broadcast)
                self.replay_mode = True

                # Store temp_dir path for cleanup later
                self._temp_replay_dir = temp_dir

                return {
                    "success": True,
                    "session_id": session.session_id,
                    "session": {
                        "session_id": session.session_id,
                        "name": session.name,
                        "duration_seconds": session.duration_seconds,
                        "frame_count": len(timeline),
                        "tracker_ids": session.tracker_ids,
                    },
                }

            except Exception as e:
                logger.error(f"Error uploading replay files: {e}")
                import traceback
                traceback.print_exc()
                return {"success": False, "message": str(e)}

        @self.app.post("/api/replay/control")
        async def replay_control(action: str, frame: Optional[int] = None, speed: Optional[float] = None):
            """Control playback (play, pause, seek, speed)."""
            if not self.replay_engine:
                raise HTTPException(status_code=400, detail="No session loaded")

            try:
                if action == "play":
                    await self.replay_engine.play()

                elif action == "pause":
                    await self.replay_engine.pause()

                elif action == "seek":
                    if frame is None:
                        raise HTTPException(
                            status_code=400, detail="Frame required for seek"
                        )
                    await self.replay_engine.seek(frame)

                elif action == "speed":
                    if speed is None:
                        raise HTTPException(
                            status_code=400, detail="Speed required"
                        )
                    await self.replay_engine.set_speed(speed)

                else:
                    raise HTTPException(status_code=400, detail="Invalid action")

                # Get current state
                state = self.replay_engine.get_current_state()

                # Broadcast update
                await self._broadcast_message(
                    WebSocketMessage(type="replay_state", data=state)
                )

                return {"success": True, **state}

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Replay control error: {e}")
                return {"success": False, "error": str(e)}

        @self.app.get("/api/replay/state")
        async def get_replay_state() -> dict:
            """Get current replay state."""
            if not self.replay_engine:
                return {"replay_mode": False}

            state = self.replay_engine.get_current_state()
            state["replay_mode"] = True
            return state

        @self.app.post("/api/replay/stop")
        async def stop_replay():
            """Stop replay mode and return to live mode."""
            try:
                if self.replay_engine:
                    await self.replay_engine.pause()
                    self.replay_engine = None

                self.replay_mode = False
                self.state_manager.clear_all()

                # Invalidate session cache to ensure fresh data on next load
                self.session_loader.invalidate_cache()

                logger.info("Replay mode stopped")

                return {"success": True, "message": "Replay stopped"}

            except Exception as e:
                logger.error(f"Error stopping replay: {e}")
                return {"success": False, "error": str(e)}

        @self.app.get("/")
        async def root():
            """Redirect to React dashboard."""
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url="/app", status_code=302)

        @self.app.get("/app")
        @self.app.get("/app/")
        async def react_app() -> FileResponse:
            """Serve React dashboard."""
            react_dir = get_static_dir() / "react"
            index_path = react_dir / "index.html"

            if not index_path.exists():
                return HTMLResponse(
                    content="<h1>React Dashboard not built. Run 'npm run build' in frontend/ directory.</h1>",
                    status_code=404,
                )

            return FileResponse(index_path)

        @self.app.get("/app/{filename:path}")
        async def react_static_files(filename: str) -> FileResponse:
            """Serve React static files."""
            react_dir = get_static_dir() / "react"
            file_path = react_dir / filename

            # Security: prevent directory traversal
            try:
                file_path = file_path.resolve()
                react_dir = react_dir.resolve()
                if not str(file_path).startswith(str(react_dir)):
                    raise HTTPException(status_code=404, detail="File not found")
            except Exception:
                raise HTTPException(status_code=404, detail="File not found")

            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)

            # For SPA routing, return index.html for unmatched paths
            index_path = react_dir / "index.html"
            if index_path.exists():
                return FileResponse(index_path)

            raise HTTPException(status_code=404, detail="File not found")

        @self.app.get("/{filename:path}")
        async def static_files(filename: str) -> FileResponse:
            """Serve static files."""
            static_dir = get_static_dir()
            file_path = static_dir / filename

            # Security: prevent directory traversal
            try:
                file_path = file_path.resolve()
                static_dir = static_dir.resolve()
                if not str(file_path).startswith(str(static_dir)):
                    raise HTTPException(status_code=404, detail="File not found")
            except Exception:
                raise HTTPException(status_code=404, detail="File not found")

            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)

            raise HTTPException(status_code=404, detail="File not found")

        @self.app.get("/api/export/csv")
        async def export_csv() -> FileResponse:
            """Export current tracker data to CSV."""
            import csv
            import tempfile
            from datetime import datetime

            trackers = self.state_manager.get_all_trackers()

            # Create temporary CSV file
            temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv', newline='')

            try:
                writer = csv.writer(temp_file)

                # Write header
                writer.writerow([
                    'tracker_id', 'time_local_received', 'time_gps',
                    'lat', 'lon', 'alt_m', 'speed_mps', 'course_deg',
                    'hdop', 'satellites', 'rssi_dbm', 'baro_alt_m', 'baro_temp_c',
                    'baro_press_hpa', 'fix_valid', 'battery_mv', 'latency_ms',
                    'is_stale', 'age_seconds'
                ])

                # Write data
                for tracker in trackers:
                    writer.writerow([
                        tracker.tracker_id,
                        tracker.time_local_received.isoformat() if tracker.time_local_received else '',
                        tracker.time_gps.isoformat() if tracker.time_gps else '',
                        tracker.lat or '',
                        tracker.lon or '',
                        tracker.alt_m or '',
                        tracker.speed_mps or '',
                        tracker.course_deg or '',
                        tracker.hdop or '',
                        tracker.satellites or '',
                        tracker.rssi_dbm or '',
                        tracker.baro_alt_m or '',
                        tracker.baro_temp_c or '',
                        tracker.baro_press_hpa or '',
                        tracker.fix_valid,
                        tracker.battery_mv or '',
                        tracker.latency_ms or '',
                        tracker.is_stale,
                        tracker.age_seconds
                    ])

                temp_file.close()

                # Generate filename with timestamp
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename = f"scensus_export_{self.active_event or 'data'}_{timestamp}.csv"

                return FileResponse(
                    temp_file.name,
                    media_type="text/csv",
                    filename=filename
                )

            except Exception as e:
                logger.error(f"Error exporting CSV: {e}")
                raise HTTPException(status_code=500, detail="Export failed")

        @self.app.get("/api/export/kml")
        async def export_kml(event: Optional[str] = None) -> Response:
            """Export current tracker data to KML for Google Earth."""
            from datetime import datetime

            trackers = self.state_manager.get_all_trackers()

            if not trackers:
                raise HTTPException(status_code=404, detail="No tracker data to export")

            try:
                # Generate KML content
                kml_content = generate_kml(
                    trackers=trackers,
                    event_name=event or self.active_event,
                    include_extended_data=True
                )

                # Generate filename with timestamp
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename = f"scensus_export_{event or self.active_event or 'data'}_{timestamp}.kml"

                return Response(
                    content=kml_content,
                    media_type="application/vnd.google-earth.kml+xml",
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"'
                    }
                )

            except Exception as e:
                logger.error(f"Error exporting KML: {e}")
                raise HTTPException(status_code=500, detail="KML export failed")

        @self.app.post("/api/upload/files")
        async def upload_data_files(files: List[UploadFile] = File(...)):
            """Upload and parse data files (NMEA, CSV, KML, KMZ)."""
            from .parser import CSVParser
            from .nmea_parser import NMEAParser

            csv_parser = CSVParser()
            nmea_parser = NMEAParser()
            kml_importer = KMLImporter()

            results = {"processed": 0, "errors": [], "trackers_found": []}
            trackers_set = set()

            for file in files:
                if not file.filename:
                    continue

                suffix = Path(file.filename).suffix.lower()
                content = await file.read()
                records = []

                try:
                    if suffix == '.nmea':
                        records = nmea_parser.parse_nmea_content(content.decode('utf-8', errors='replace'))
                    elif suffix == '.csv':
                        records = csv_parser.parse_csv_content(content.decode('utf-8', errors='replace'))
                    elif suffix == '.kml':
                        records = kml_importer.parse_kml_content(content.decode('utf-8', errors='replace'))
                    elif suffix == '.kmz':
                        records = kml_importer.parse_kmz_file(content)
                    else:
                        results["errors"].append(f"Unsupported file type: {file.filename}")
                        continue

                    for record in records:
                        self.state_manager.update_tracker(record)
                        trackers_set.add(record.tracker_id)
                    results["processed"] += len(records)

                except Exception as e:
                    logger.error(f"Error processing uploaded file {file.filename}: {e}")
                    results["errors"].append(f"Error processing {file.filename}: {str(e)}")

            results["trackers_found"] = list(trackers_set)

            logger.info(f"Upload: processed {results['processed']} records from {len(trackers_set)} trackers")

            # Broadcast updates to WebSocket clients
            if trackers_set:
                await self._broadcast_message(
                    WebSocketMessage(
                        type="upload_complete",
                        data={
                            "processed": results["processed"],
                            "trackers_found": results["trackers_found"],
                        },
                    )
                )

            return results

    async def startup(self) -> None:
        """Application startup - auto-watch configured folder."""
        logger.info("=" * 60)
        logger.info("SCENSUS Dashboard - Initializing")
        logger.info("=" * 60)

        # Start state manager
        self.state_manager.start()

        # Get configured folder path
        log_root = Path(self.config.log_root_folder)

        if not log_root.exists():
            logger.warning(f"Data folder does not exist: {log_root}")
            logger.info("Please configure a valid data folder path")
            return

        # Check for CSV and NMEA files in the folder
        folder_info = self.scanner.find_most_recent_active()
        csv_files = list(log_root.glob("*.csv"))
        nmea_files = list(log_root.glob("*.nmea"))
        has_data_files = folder_info or csv_files or nmea_files

        if has_data_files:
            logger.info("=" * 60)
            logger.info(f"Data folder: {log_root}")
            logger.info(f"  CSV files: {len(csv_files)}")
            logger.info(f"  NMEA files: {len(nmea_files)}")
            if folder_info and folder_info.last_activity:
                time_ago = self.scanner._format_time_ago(
                    datetime.now() - folder_info.last_activity
                )
                logger.info(f"  Last activity: {time_ago}")
            logger.info("=" * 60)

        # Always start watching the folder if it exists
        self.watcher = LogWatcher(
            event_folder=log_root,
            on_records=self._on_records,
            on_new_file=self._on_new_file,
        )
        await self.watcher.start()
        self.active_event = log_root.name

        if has_data_files:
            logger.info(f"Monitoring: {log_root}")
        else:
            logger.info(f"Monitoring {log_root} (no data files yet)")

    async def shutdown(self) -> None:
        """Application shutdown."""
        logger.info("Shutting down dashboard application")

        # Stop watcher
        if self.watcher:
            await self.watcher.stop()

        # Stop state manager
        await self.state_manager.stop()

        # Close WebSocket connections
        for ws in list(self.ws_connections):
            try:
                await ws.close()
            except Exception:
                pass

        self.ws_connections.clear()

    def _on_records(self, records: list[TrackerRecord]) -> None:
        """
        Callback for new tracker records.

        Args:
            records: List of new records.
        """
        for record in records:
            self.state_manager.update_tracker(record)

    def _on_new_file(self, filepath: str) -> None:
        """
        Callback when a new log file is detected.

        Args:
            filepath: Path to the new file.
        """
        filename = Path(filepath).name
        logger.info(f"Broadcasting new file detected: {filename}")

        msg = WebSocketMessage(
            type="new_file_detected",
            data={
                "filename": filename,
                "path": filepath,
                "timestamp": datetime.now().isoformat(),
            },
        )

        asyncio.create_task(self._broadcast_message(msg))

    def _on_tracker_updated(self, state: TrackerState) -> None:
        """
        Callback when tracker is updated.

        Args:
            state: Updated tracker state.
        """
        # Broadcast update to WebSocket clients
        summary = TrackerSummary(
            tracker_id=state.tracker_id,
            lat=state.lat,
            lon=state.lon,
            alt_m=state.alt_m,
            rssi_dbm=state.rssi_dbm,
            hdop=state.hdop,
            satellites=state.satellites,
            fix_valid=state.fix_valid,
            is_stale=state.is_stale,
            age_seconds=state.age_seconds,
            last_update=state.time_local_received,
            battery_mv=state.battery_mv,
        )

        msg = WebSocketMessage(
            type="tracker_updated",
            data=summary.model_dump(mode="json"),
        )

        asyncio.create_task(self._broadcast_message(msg))

    def _on_tracker_stale(self, state: TrackerState) -> None:
        """
        Callback when tracker becomes stale.

        Args:
            state: Stale tracker state.
        """
        msg = WebSocketMessage(
            type="tracker_stale",
            data={
                "tracker_id": state.tracker_id,
                "age_seconds": state.age_seconds,
            },
        )

        asyncio.create_task(self._broadcast_message(msg))

    async def _broadcast_message(self, message: WebSocketMessage) -> None:
        """
        Broadcast message to all WebSocket clients.

        Args:
            message: Message to broadcast.
        """
        if not self.ws_connections:
            return

        json_msg = message.model_dump_json()

        # Send to all connected clients
        disconnected = set()

        for ws in self.ws_connections:
            try:
                await ws.send_text(json_msg)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket client: {e}")
                disconnected.add(ws)

        # Remove disconnected clients
        self.ws_connections -= disconnected


def create_app(config: Config) -> tuple[FastAPI, DashboardApp]:
    """
    Create FastAPI application.

    Args:
        config: Application configuration.

    Returns:
        Tuple of (FastAPI app, DashboardApp instance).
    """
    dashboard = DashboardApp(config)

    # Register startup/shutdown events
    @dashboard.app.on_event("startup")
    async def startup_event():
        # Initialize CRM database
        try:
            await init_database()
            logger.info("CRM database initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize CRM database: {e}")

        await dashboard.startup()

    @dashboard.app.on_event("shutdown")
    async def shutdown_event():
        await dashboard.shutdown()

    return dashboard.app, dashboard
