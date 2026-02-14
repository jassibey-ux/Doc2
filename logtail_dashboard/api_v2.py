"""
API v2 Routes - Database-backed CRM Endpoints

This module provides the v2 API endpoints that use SQLite database
for data persistence. These endpoints complement the existing v1
endpoints and provide CRM functionality.
"""

import hashlib
import logging
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .database import (
    get_db,
    get_db_manager,
    init_database,
    TestSession,
    Site,
    DroneProfile,
    CUASProfile,
    SessionMetrics,
    CSVImporter,
    Engagement,
    EngagementTarget,
    EngagementMetrics,
    SessionActor,
    EngagementJamBurst,
)
from .database.models import (
    TrackerAssignment,
    CUASPlacement,
    TestEvent,
    TrackerTelemetry,
    generate_uuid,
    EngagementStatus,
    EmitterType,
    SDRReading,
    MediaAttachment,
    OperatorPosition,
    WorkspaceLayer,
    TrackerAlias,
)
from .database.repositories import (
    SessionRepository,
    SiteRepository,
    DroneProfileRepository,
    CUASProfileRepository,
    TelemetryRepository,
    AuditRepository,
    EngagementRepository,
    SessionActorRepository,
)
from .database.repositories.sessions import SessionFilters

logger = logging.getLogger(__name__)

# Create the v2 router
router = APIRouter(prefix="/api/v2", tags=["CRM"])


# =============================================================================
# Pydantic Request/Response Models
# =============================================================================

# Session Models
class TrackerAssignmentInput(BaseModel):
    """Inline tracker assignment for session creation."""
    tracker_id: str
    drone_profile_id: Optional[str] = None
    session_color: Optional[str] = None
    target_altitude_m: Optional[float] = None


class CUASPlacementInput(BaseModel):
    """Inline CUAS placement for session creation."""
    cuas_profile_id: Optional[str] = None
    lat: float
    lon: float
    height_agl_m: Optional[float] = None
    orientation_deg: Optional[float] = None
    active: bool = False


class EventInput(BaseModel):
    """Input for creating a test event."""
    type: str
    timestamp: Optional[datetime] = None
    source: str = "manual"
    cuas_id: Optional[str] = None
    tracker_id: Optional[str] = None
    note: Optional[str] = None
    metadata: Optional[Dict] = None


class SessionCreateRequest(BaseModel):
    """Request to create a new session."""
    name: str
    site_id: Optional[str] = None
    operator_name: Optional[str] = None
    weather_notes: Optional[str] = None
    classification: str = "UNCLASSIFIED"
    tracker_assignments: Optional[List[TrackerAssignmentInput]] = None
    cuas_placements: Optional[List[CUASPlacementInput]] = None


class SessionUpdateRequest(BaseModel):
    """Request to update a session."""
    name: Optional[str] = None
    status: Optional[str] = None
    operator_name: Optional[str] = None
    weather_notes: Optional[str] = None
    post_test_notes: Optional[str] = None
    classification: Optional[str] = None
    live_data_path: Optional[str] = None


class SessionSearchRequest(BaseModel):
    """Request body for session search."""
    search: Optional[str] = None
    status: Optional[List[str]] = None
    siteId: Optional[str] = None
    tags: Optional[List[str]] = None
    passFail: Optional[str] = None
    droneProfileId: Optional[str] = None
    cuasProfileId: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    operatorName: Optional[str] = None


class TagRequest(BaseModel):
    """Request to add/remove a tag."""
    tag: str


class AnnotationRequest(BaseModel):
    """Request to create an annotation."""
    content: str
    annotation_type: str = "note"
    timestamp_ref: Optional[datetime] = None
    author: Optional[str] = None


class MetricsRequest(BaseModel):
    """Request to set session metrics."""
    time_to_effect_s: Optional[float] = None
    time_to_full_denial_s: Optional[float] = None
    effective_range_m: Optional[float] = None
    max_lateral_drift_m: Optional[float] = None
    max_vertical_drift_m: Optional[float] = None
    total_flight_time_s: Optional[float] = None
    time_under_jamming_s: Optional[float] = None
    recovery_time_s: Optional[float] = None
    overall_score: Optional[float] = None
    pass_fail: Optional[str] = None
    met_expectations: Optional[bool] = None
    deviation_notes: Optional[str] = None


# Engagement Models
class EngagementTargetInput(BaseModel):
    """Input for an engagement target."""
    tracker_id: str
    drone_profile_id: Optional[str] = None
    role: str = "primary_target"


class EngagementCreateRequest(BaseModel):
    """Request to create an engagement."""
    cuas_placement_id: Optional[str] = None  # nullable for actor-based engagements
    emitter_type: str = "cuas_system"  # 'cuas_system' | 'actor'
    emitter_id: Optional[str] = None  # FK to cuas_placements OR session_actors
    name: Optional[str] = None
    engagement_type: str = "test"
    targets: List[EngagementTargetInput]
    notes: Optional[str] = None


class EngagementQuickRequest(BaseModel):
    """Request for quick-engage (auto-select CUAS + all drones)."""
    cuas_placement_id: Optional[str] = None
    name: Optional[str] = None
    engagement_type: str = "test"


class EngagementUpdateRequest(BaseModel):
    """Request to update an engagement (only when planned)."""
    name: Optional[str] = None
    notes: Optional[str] = None
    targets: Optional[List[EngagementTargetInput]] = None


# Session Actor Models
class SessionActorCreateRequest(BaseModel):
    """Request to create a session actor."""
    name: str
    callsign: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    heading_deg: Optional[float] = None
    tracker_unit_id: Optional[str] = None


class SessionActorUpdateRequest(BaseModel):
    """Request to update a session actor."""
    name: Optional[str] = None
    callsign: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    heading_deg: Optional[float] = None
    tracker_unit_id: Optional[str] = None
    is_active: Optional[bool] = None


# Site Models
class SiteCreateRequest(BaseModel):
    """Request to create a site."""
    name: str
    center_lat: float
    center_lon: float
    description: Optional[str] = None
    boundary_polygon: Optional[Any] = None
    environment_type: Optional[str] = None
    elevation_min_m: Optional[float] = None
    elevation_max_m: Optional[float] = None
    rf_notes: Optional[str] = None
    access_notes: Optional[str] = None
    markers: Optional[List[Dict]] = None
    zones: Optional[List[Dict]] = None
    classification: str = "UNCLASSIFIED"


class SiteUpdateRequest(BaseModel):
    """Request to update a site."""
    name: Optional[str] = None
    description: Optional[str] = None
    boundary_polygon: Optional[Any] = None
    environment_type: Optional[str] = None
    elevation_min_m: Optional[float] = None
    elevation_max_m: Optional[float] = None
    rf_notes: Optional[str] = None
    access_notes: Optional[str] = None
    markers: Optional[List[Dict]] = None
    zones: Optional[List[Dict]] = None
    classification: Optional[str] = None


# Drone Profile Models
class DroneProfileCreateRequest(BaseModel):
    """Request to create a drone profile."""
    name: str
    make: str
    model: str
    serial: Optional[str] = None
    weight_class: Optional[str] = None
    frequency_bands: Optional[List[str]] = None
    expected_failsafe: Optional[str] = None
    max_speed_mps: Optional[float] = None
    max_altitude_m: Optional[float] = None
    endurance_minutes: Optional[float] = None
    notes: Optional[str] = None
    image_path: Optional[str] = None


class DroneProfileUpdateRequest(BaseModel):
    """Request to update a drone profile."""
    name: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    weight_class: Optional[str] = None
    frequency_bands: Optional[List[str]] = None
    expected_failsafe: Optional[str] = None
    max_speed_mps: Optional[float] = None
    max_altitude_m: Optional[float] = None
    endurance_minutes: Optional[float] = None
    notes: Optional[str] = None
    image_path: Optional[str] = None


# CUAS Profile Models
class CUASProfileCreateRequest(BaseModel):
    """Request to create a CUAS profile."""
    name: str
    vendor: str
    model: Optional[str] = None
    type: Optional[str] = None
    capabilities: Optional[List[str]] = None
    effective_range_m: Optional[float] = None
    beam_width_deg: Optional[float] = None
    vertical_coverage_deg: Optional[float] = None
    antenna_pattern: Optional[str] = None
    power_output_w: Optional[float] = None
    antenna_gain_dbi: Optional[float] = None
    frequency_ranges: Optional[List[Dict]] = None
    notes: Optional[str] = None
    classification: str = "UNCLASSIFIED"


class CUASProfileUpdateRequest(BaseModel):
    """Request to update a CUAS profile."""
    name: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    type: Optional[str] = None
    capabilities: Optional[List[str]] = None
    effective_range_m: Optional[float] = None
    measured_range_m: Optional[float] = None
    beam_width_deg: Optional[float] = None
    vertical_coverage_deg: Optional[float] = None
    antenna_pattern: Optional[str] = None
    power_output_w: Optional[float] = None
    antenna_gain_dbi: Optional[float] = None
    frequency_ranges: Optional[List[Dict]] = None
    notes: Optional[str] = None
    classification: Optional[str] = None


# Pagination response
class PaginatedResponse(BaseModel):
    """Standard paginated response."""
    items: List[Any]
    total: int
    skip: int
    limit: int


# =============================================================================
# Helper Functions
# =============================================================================

def session_to_dict(session: TestSession) -> Dict[str, Any]:
    """Convert a session model to a dictionary."""
    return {
        "id": session.id,
        "name": session.name,
        "site_id": session.site_id,
        "status": session.status,
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "end_time": session.end_time.isoformat() if session.end_time else None,
        "duration_seconds": session.duration_seconds,
        "operator_name": session.operator_name,
        "weather_notes": session.weather_notes,
        "post_test_notes": session.post_test_notes,
        "classification": session.classification,
        "live_data_path": session.live_data_path,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
        "tags": [t.tag for t in session.tags] if hasattr(session, 'tags') and session.tags else [],
        "site": {
            "id": session.site.id,
            "name": session.site.name,
        } if hasattr(session, 'site') and session.site else None,
    }


def session_to_dict_full(session: TestSession) -> Dict[str, Any]:
    """Convert a session model to a dictionary with all relations."""
    result = session_to_dict(session)

    # Add tracker assignments
    result["tracker_assignments"] = [
        {
            "id": ta.id,
            "tracker_id": ta.tracker_id,
            "drone_profile_id": ta.drone_profile_id,
            "session_color": ta.session_color,
            "target_altitude_m": ta.target_altitude_m,
            "assigned_at": ta.assigned_at.isoformat() if ta.assigned_at else None,
        }
        for ta in (session.tracker_assignments or [])
    ]

    # Add CUAS placements
    result["cuas_placements"] = [
        {
            "id": cp.id,
            "cuas_profile_id": cp.cuas_profile_id,
            "cuas_profile_name": cp.cuas_profile.name if hasattr(cp, 'cuas_profile') and cp.cuas_profile else None,
            "position": {"lat": cp.lat, "lon": cp.lon},
            "lat": cp.lat,
            "lon": cp.lon,
            "height_agl_m": cp.height_agl_m,
            "orientation_deg": cp.orientation_deg,
            "heading_deg": cp.heading_deg,
            "active": cp.active,
        }
        for cp in (session.cuas_placements or [])
    ]

    # Add events
    result["events"] = [
        {
            "id": ev.id,
            "type": ev.type,
            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
            "source": ev.source,
            "tracker_id": ev.tracker_id,
            "note": ev.note,
            "metadata": ev.event_metadata,
        }
        for ev in (session.events or [])
    ]

    # Add engagements
    result["engagements"] = [
        engagement_to_dict(eng)
        for eng in (session.engagements or [])
    ] if hasattr(session, 'engagements') and session.engagements else []

    # Frontend compat fields
    result["sd_card_merged"] = False
    result["analysis_completed"] = False

    return result


def burst_to_dict(b: EngagementJamBurst) -> Dict[str, Any]:
    """Convert a jam burst to a dictionary."""
    return {
        "id": b.id,
        "engagement_id": b.engagement_id,
        "burst_seq": b.burst_seq,
        "jam_on_at": b.jam_on_at.isoformat() if b.jam_on_at else None,
        "jam_off_at": b.jam_off_at.isoformat() if b.jam_off_at else None,
        "duration_s": b.duration_s,
        "emitter_lat": b.emitter_lat,
        "emitter_lon": b.emitter_lon,
        "emitter_heading_deg": b.emitter_heading_deg,
        "target_snapshots": b.target_snapshots,
        "gps_denial_detected": b.gps_denial_detected,
        "denial_onset_at": b.denial_onset_at.isoformat() if b.denial_onset_at else None,
        "time_to_effect_s": b.time_to_effect_s,
        "source": b.source,
        "notes": b.notes,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def actor_to_dict(a: SessionActor) -> Dict[str, Any]:
    """Convert a session actor to a dictionary."""
    return {
        "id": a.id,
        "session_id": a.session_id,
        "name": a.name,
        "callsign": a.callsign,
        "lat": a.lat,
        "lon": a.lon,
        "heading_deg": a.heading_deg,
        "tracker_unit_id": a.tracker_unit_id,
        "is_active": a.is_active,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


def _json_safe(obj):
    """Recursively convert datetime objects to ISO strings for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def engagement_to_dict(eng: Engagement) -> Dict[str, Any]:
    """Convert an engagement model to a dictionary."""
    # Resolve CUAS profile name via placement → profile
    cuas_name = None
    if hasattr(eng, 'cuas_placement') and eng.cuas_placement:
        if hasattr(eng.cuas_placement, 'cuas_profile') and eng.cuas_placement.cuas_profile:
            cuas_name = eng.cuas_placement.cuas_profile.name

    return {
        "id": eng.id,
        "session_id": eng.session_id,
        "cuas_placement_id": eng.cuas_placement_id,
        "cuas_name": cuas_name,
        "emitter_type": eng.emitter_type,
        "emitter_id": eng.emitter_id,
        "name": eng.name,
        "run_number": eng.run_number,
        "engagement_type": eng.engagement_type,
        "status": eng.status,
        "engage_timestamp": eng.engage_timestamp.isoformat() if eng.engage_timestamp else None,
        "disengage_timestamp": eng.disengage_timestamp.isoformat() if eng.disengage_timestamp else None,
        "cuas_lat": eng.cuas_lat,
        "cuas_lon": eng.cuas_lon,
        "cuas_alt_m": eng.cuas_alt_m,
        "cuas_orientation_deg": eng.cuas_orientation_deg,
        "notes": eng.notes,
        "created_at": eng.created_at.isoformat() if eng.created_at else None,
        "updated_at": eng.updated_at.isoformat() if eng.updated_at else None,
        "targets": [
            {
                "id": t.id,
                "tracker_id": t.tracker_id,
                "drone_profile_id": t.drone_profile_id,
                "role": t.role,
                "initial_range_m": t.initial_range_m,
                "initial_bearing_deg": t.initial_bearing_deg,
                "angle_off_boresight_deg": t.angle_off_boresight_deg,
                "initial_altitude_m": t.initial_altitude_m,
                "drone_lat": t.drone_lat,
                "drone_lon": t.drone_lon,
                "final_range_m": t.final_range_m,
                "final_bearing_deg": t.final_bearing_deg,
            }
            for t in (eng.targets or [])
        ],
        "bursts": [burst_to_dict(b) for b in (eng.bursts or [])],
        "metrics": engagement_metrics_to_dict(eng.metrics) if eng.metrics else None,
    }


def engagement_metrics_to_dict(m: EngagementMetrics) -> Dict[str, Any]:
    """Convert engagement metrics to a dictionary."""
    return {
        "time_to_effect_s": m.time_to_effect_s,
        "time_to_full_denial_s": m.time_to_full_denial_s,
        "denial_duration_s": m.denial_duration_s,
        "denial_consistency_pct": m.denial_consistency_pct,
        "recovery_time_s": m.recovery_time_s,
        "effective_range_m": m.effective_range_m,
        "denial_bearing_deg": m.denial_bearing_deg,
        "denial_angle_off_boresight_deg": m.denial_angle_off_boresight_deg,
        "min_range_m": m.min_range_m,
        "recovery_range_m": m.recovery_range_m,
        "max_drift_m": m.max_drift_m,
        "max_lateral_drift_m": m.max_lateral_drift_m,
        "max_vertical_drift_m": m.max_vertical_drift_m,
        "altitude_change_m": m.altitude_change_m,
        "failsafe_triggered": m.failsafe_triggered,
        "failsafe_type": m.failsafe_type,
        "pass_fail": m.pass_fail,
        "overall_score": m.overall_score,
        "data_source": m.data_source,
        "metrics_json": m.metrics_json,
        "analyzed_at": m.analyzed_at.isoformat() if m.analyzed_at else None,
        # Enhanced burst-aware fields
        "anchor_type": m.anchor_type,
        "anchor_timestamp": m.anchor_timestamp.isoformat() if m.anchor_timestamp else None,
        "denial_onset_timestamp": m.denial_onset_timestamp.isoformat() if m.denial_onset_timestamp else None,
        "reacquisition_time_s": m.reacquisition_time_s,
        "telemetry_loss_duration_s": m.telemetry_loss_duration_s,
        "per_burst_json": m.per_burst_json,
        "computation_version": m.computation_version,
    }


def site_to_dict(site: Site) -> Dict[str, Any]:
    """Convert a site model to a dictionary."""
    return {
        "id": site.id,
        "name": site.name,
        "description": site.description,
        "boundary_polygon": site.boundary_polygon,
        "center_lat": site.center_lat,
        "center_lon": site.center_lon,
        "environment_type": site.environment_type,
        "elevation_min_m": site.elevation_min_m,
        "elevation_max_m": site.elevation_max_m,
        "rf_notes": site.rf_notes,
        "access_notes": site.access_notes,
        "markers": site.markers,
        "zones": site.zones,
        "classification": site.classification,
        "is_active": site.is_active,
        "created_at": site.created_at.isoformat() if site.created_at else None,
        "updated_at": site.updated_at.isoformat() if site.updated_at else None,
    }


def drone_to_dict(profile: DroneProfile) -> Dict[str, Any]:
    """Convert a drone profile model to a dictionary."""
    return {
        "id": profile.id,
        "name": profile.name,
        "make": profile.make,
        "model": profile.model,
        "serial": profile.serial,
        "weight_class": profile.weight_class,
        "frequency_bands": profile.frequency_bands,
        "expected_failsafe": profile.expected_failsafe,
        "max_speed_mps": profile.max_speed_mps,
        "max_altitude_m": profile.max_altitude_m,
        "endurance_minutes": profile.endurance_minutes,
        "notes": profile.notes,
        "image_path": profile.image_path,
        "is_active": profile.is_active,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def cuas_to_dict(profile: CUASProfile) -> Dict[str, Any]:
    """Convert a CUAS profile model to a dictionary."""
    return {
        "id": profile.id,
        "name": profile.name,
        "vendor": profile.vendor,
        "model": profile.model,
        "type": profile.type,
        "capabilities": profile.capabilities,
        "effective_range_m": profile.effective_range_m,
        "measured_range_m": profile.measured_range_m,
        "beam_width_deg": profile.beam_width_deg,
        "vertical_coverage_deg": profile.vertical_coverage_deg,
        "antenna_pattern": profile.antenna_pattern,
        "power_output_w": profile.power_output_w,
        "antenna_gain_dbi": profile.antenna_gain_dbi,
        "frequency_ranges": profile.frequency_ranges,
        "notes": profile.notes,
        "classification": profile.classification,
        "is_active": profile.is_active,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


# =============================================================================
# Telemetry Ingest Endpoint (bridge + electron cloud-sync)
# =============================================================================

class TelemetryRecordInput(BaseModel):
    """A single telemetry record from bridge or Electron cloud-sync."""
    tracker_id: str
    time_local: Optional[str] = None  # ISO-8601 timestamp
    timestamp: Optional[str] = None   # Alias used by some clients
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt_m: Optional[float] = None
    speed_mps: Optional[float] = None
    course_deg: Optional[float] = None
    hdop: Optional[float] = None
    satellites: Optional[int] = None
    sat_count: Optional[int] = None   # Alias
    fix_valid: Optional[bool] = None
    fix_type: Optional[str] = None    # Alias ("3d", "2d", "none")
    rssi_dbm: Optional[float] = None
    battery_mv: Optional[float] = None
    speed: Optional[float] = None     # Alias
    course: Optional[float] = None    # Alias


class TelemetryIngestRequest(BaseModel):
    """Request body for bulk telemetry ingest."""
    organization_id: str
    session_id: Optional[str] = None
    records: List[TelemetryRecordInput]


class TelemetryIngestResponse(BaseModel):
    """Response for telemetry ingest."""
    accepted: int
    session_id: Optional[str] = None


@router.post("/telemetry/ingest", response_model=TelemetryIngestResponse)
async def ingest_telemetry(
    request: TelemetryIngestRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Bulk ingest telemetry records from bridge or Electron cloud-sync.

    Accepts records in the format produced by the bridge CSV parser.
    Maps field aliases, resolves active session, inserts to DB,
    and broadcasts via WebSocket for real-time UI updates.
    """
    # Resolve session ID: explicit or active
    session_id = request.session_id or get_active_session_id()
    if not session_id:
        raise HTTPException(
            status_code=422,
            detail="No session_id provided and no active session running",
        )

    # Verify session exists
    repo = SessionRepository(db)
    session = await repo.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Map records to telemetry format
    telemetry_rows = []
    for rec in request.records:
        # Resolve timestamp: prefer time_local, fall back to timestamp alias
        time_str = rec.time_local or rec.timestamp
        if time_str:
            try:
                time_val = datetime.fromisoformat(time_str.replace("Z", "+00:00").split("+")[0])
            except ValueError:
                time_val = datetime.utcnow()
        else:
            time_val = datetime.utcnow()

        # Resolve aliases
        satellites = rec.satellites if rec.satellites is not None else rec.sat_count
        speed_mps = rec.speed_mps if rec.speed_mps is not None else rec.speed
        course_deg = rec.course_deg if rec.course_deg is not None else rec.course

        # Map fix_type string to boolean
        fix_valid = rec.fix_valid
        if fix_valid is None and rec.fix_type:
            fix_valid = rec.fix_type.lower() in ("3d", "2d", "valid", "true", "1")

        # Skip records with no position data
        if rec.lat is None or rec.lon is None:
            continue

        telemetry_rows.append({
            "tracker_id": rec.tracker_id,
            "time_local_received": time_val,
            "lat": rec.lat,
            "lon": rec.lon,
            "alt_m": rec.alt_m,
            "speed_mps": speed_mps,
            "course_deg": course_deg,
            "hdop": rec.hdop,
            "satellites": satellites,
            "fix_valid": fix_valid if fix_valid is not None else False,
            "rssi_dbm": rec.rssi_dbm,
            "battery_mv": rec.battery_mv,
        })

    if not telemetry_rows:
        return TelemetryIngestResponse(accepted=0, session_id=session_id)

    # Bulk insert
    telemetry_repo = TelemetryRepository(db)
    inserted = await telemetry_repo.bulk_insert(session_id, telemetry_rows)
    await db.commit()

    # Broadcast to WebSocket clients in background
    background_tasks.add_task(_broadcast_telemetry_batch, telemetry_rows)

    logger.info(
        f"Telemetry ingest: {inserted} records for session {session_id} "
        f"(org={request.organization_id})"
    )

    return TelemetryIngestResponse(accepted=inserted, session_id=session_id)


# Module-level broadcast callback (set by DashboardApp on startup)
_ws_broadcast_fn = None


def set_ws_broadcast_fn(fn):
    """Register a WebSocket broadcast function for telemetry ingest."""
    global _ws_broadcast_fn
    _ws_broadcast_fn = fn


async def _broadcast_telemetry_batch(rows: List[Dict[str, Any]]) -> None:
    """Broadcast ingested telemetry to WebSocket clients."""
    if _ws_broadcast_fn is None:
        return

    try:
        from .models import WebSocketMessage

        for row in rows:
            msg = WebSocketMessage(
                type="tracker_updated",
                data={
                    "tracker_id": row["tracker_id"],
                    "lat": row.get("lat"),
                    "lon": row.get("lon"),
                    "alt_m": row.get("alt_m"),
                    "rssi_dbm": row.get("rssi_dbm"),
                    "hdop": row.get("hdop"),
                    "satellites": row.get("satellites"),
                    "fix_valid": row.get("fix_valid", False),
                    "is_stale": False,
                    "age_seconds": 0.0,
                    "last_update": row["time_local_received"].isoformat()
                        if hasattr(row["time_local_received"], "isoformat")
                        else row["time_local_received"],
                },
            )
            await _ws_broadcast_fn(msg)
    except Exception as e:
        logger.debug(f"WebSocket broadcast skipped: {e}")


# =============================================================================
# Authentication Endpoints (JWT)
# =============================================================================

class LoginRequest(BaseModel):
    """Request body for user login."""
    email: str
    password: str


class UserCreateRequest(BaseModel):
    """Request body for creating a user (admin only)."""
    email: str
    password: str
    name: Optional[str] = None
    role: str = "observer"
    organization_id: str


class UserUpdateRequest(BaseModel):
    """Request body for updating a user (admin only)."""
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


@router.post("/auth/login")
async def auth_login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate a user and return a JWT token."""
    from .middleware.jwt_auth import verify_password, create_access_token
    from .database.models import User
    from sqlalchemy import select as sa_select

    result = await db.execute(
        sa_select(User).where(User.email == request.email)
    )
    user = result.scalars().first()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    # Update last login
    user.last_login_at = datetime.utcnow()
    await db.commit()

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        organization_id=user.organization_id,
    )

    return {
        "token": token,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "organization_id": user.organization_id,
    }


@router.get("/auth/me")
async def auth_me(request: Request):
    """Get current authenticated user info from JWT token."""
    from .middleware.jwt_auth import get_current_user

    user = await get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "organization_id": user.organization_id,
    }


@router.get("/auth/users")
async def list_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)."""
    from .middleware.jwt_auth import require_role
    admin_check = require_role("admin")
    await admin_check(request)

    from .database.models import User
    from sqlalchemy import select as sa_select

    result = await db.execute(sa_select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "organization_id": u.organization_id,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        }
        for u in users
    ]


@router.post("/auth/users")
async def create_user(
    request: Request,
    body: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (admin only)."""
    from .middleware.jwt_auth import require_role, hash_password
    admin_check = require_role("admin")
    await admin_check(request)

    from .database.models import User, UserRole
    from sqlalchemy import select as sa_select

    # Check for duplicate email
    existing = await db.execute(
        sa_select(User).where(User.email == body.email)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Validate role
    valid_roles = [r.value for r in UserRole]
    if body.role not in valid_roles:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid role '{body.role}'. Must be one of: {valid_roles}",
        )

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role,
        organization_id=body.organization_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "organization_id": user.organization_id,
        "is_active": user.is_active,
    }


@router.put("/auth/users/{user_id}")
async def update_user(
    user_id: str,
    request: Request,
    body: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a user (admin only)."""
    from .middleware.jwt_auth import require_role
    admin_check = require_role("admin")
    await admin_check(request)

    from .database.models import User, UserRole
    from sqlalchemy import select as sa_select

    result = await db.execute(sa_select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        valid_roles = [r.value for r in UserRole]
        if body.role not in valid_roles:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid role '{body.role}'. Must be one of: {valid_roles}",
            )
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active

    await db.commit()

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_active": user.is_active,
    }


@router.delete("/auth/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a user (admin only). Does not permanently delete."""
    from .middleware.jwt_auth import require_role
    admin_check = require_role("admin")
    await admin_check(request)

    from .database.models import User
    from sqlalchemy import select as sa_select

    result = await db.execute(sa_select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    await db.commit()

    return {"message": f"User {user.email} deactivated"}


# =============================================================================
# Session Endpoints
# =============================================================================

@router.get("/sessions")
async def list_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    status: Optional[List[str]] = Query(None),
    site_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    tags: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    classification: Optional[str] = None,
    pass_fail: Optional[str] = None,
    order_by: str = "created_at",
    descending: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """List sessions with filters and pagination."""
    repo = SessionRepository(db)

    filters = SessionFilters(
        status=status,
        site_id=site_id,
        start_date=start_date,
        end_date=end_date,
        tags=tags,
        search=search,
        classification=classification,
        pass_fail=pass_fail,
    )

    sessions, total = await repo.list_sessions(
        filters=filters,
        skip=skip,
        limit=limit,
        order_by=order_by,
        descending=descending,
    )

    return {
        "items": [session_to_dict(s) for s in sessions],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/sessions/search")
async def search_sessions(
    request: SessionSearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Search sessions with filters (POST body)."""
    repo = SessionRepository(db)

    start_date = None
    end_date = None
    if request.startDate:
        try:
            start_date = datetime.fromisoformat(request.startDate)
        except ValueError:
            pass
    if request.endDate:
        try:
            end_date = datetime.fromisoformat(request.endDate)
        except ValueError:
            pass

    filters = SessionFilters(
        status=request.status,
        site_id=request.siteId,
        start_date=start_date,
        end_date=end_date,
        tags=request.tags,
        search=request.search,
        operator_name=request.operatorName,
        pass_fail=request.passFail,
        drone_profile_id=request.droneProfileId,
        cuas_profile_id=request.cuasProfileId,
    )

    sessions, total = await repo.list_sessions(filters=filters, limit=200)

    return {
        "sessions": [session_to_dict(s) for s in sessions],
        "total": total,
    }


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a session by ID with full details."""
    repo = SessionRepository(db)
    session = await repo.get_with_relations(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = session_to_dict_full(session)

    # Add metrics if available
    if session.session_metrics:
        result["metrics"] = {
            "time_to_effect_s": session.session_metrics.time_to_effect_s,
            "time_to_full_denial_s": session.session_metrics.time_to_full_denial_s,
            "effective_range_m": session.session_metrics.effective_range_m,
            "max_lateral_drift_m": session.session_metrics.max_lateral_drift_m,
            "max_vertical_drift_m": session.session_metrics.max_vertical_drift_m,
            "pass_fail": session.session_metrics.pass_fail,
            "overall_score": session.session_metrics.overall_score,
        }

    # Add annotations
    result["annotations"] = [
        {
            "id": a.id,
            "content": a.content,
            "annotation_type": a.annotation_type,
            "author": a.author,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in session.annotations
    ] if session.annotations else []

    return result


@router.post("/sessions")
async def create_session(
    request: SessionCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new session with optional inline relations."""
    repo = SessionRepository(db)

    session = await repo.create({
        "name": request.name,
        "site_id": request.site_id,
        "operator_name": request.operator_name,
        "weather_notes": request.weather_notes,
        "classification": request.classification,
        "status": "planning",
    })

    # Create inline tracker assignments
    if request.tracker_assignments:
        for ta_input in request.tracker_assignments:
            ta = TrackerAssignment(
                id=generate_uuid(),
                session_id=session.id,
                tracker_id=ta_input.tracker_id,
                drone_profile_id=ta_input.drone_profile_id,
                session_color=ta_input.session_color,
                target_altitude_m=ta_input.target_altitude_m,
            )
            db.add(ta)

    # Create inline CUAS placements
    if request.cuas_placements:
        for cp_input in request.cuas_placements:
            cp = CUASPlacement(
                id=generate_uuid(),
                session_id=session.id,
                cuas_profile_id=cp_input.cuas_profile_id,
                lat=cp_input.lat,
                lon=cp_input.lon,
                height_agl_m=cp_input.height_agl_m,
                orientation_deg=cp_input.orientation_deg,
                active=cp_input.active,
            )
            db.add(cp)

    session_id = session.id
    await db.commit()

    # Re-fetch with all relations loaded
    try:
        session = await repo.get_with_relations(session_id)
        return session_to_dict_full(session)
    except Exception as e:
        logger.error(f"Failed to re-fetch session {session_id} with relations: {e}")
        raise HTTPException(status_code=500, detail=f"Session created but failed to load: {e}")


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: SessionUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a session."""
    repo = SessionRepository(db)

    # Build update dict from non-None fields
    update_data = {k: v for k, v in request.model_dump().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    session = await repo.update(session_id, update_data)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return session_to_dict(session)


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a session."""
    repo = SessionRepository(db)
    deleted = await repo.delete(session_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"success": True}


@router.post("/sessions/{session_id}/clone")
async def clone_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Clone a session's configuration (site, tracker assignments, CUAS placements).

    Creates a new session in 'planning' status with the same setup as the source.
    Useful for running repeated tests with the same configuration.
    """
    repo = SessionRepository(db)
    source = await repo.get_with_relations(session_id)

    if not source:
        raise HTTPException(status_code=404, detail="Session not found")

    # Create the new session
    new_session = await repo.create({
        "name": f"{source.name} (Copy)",
        "site_id": source.site_id,
        "operator_name": source.operator_name,
        "weather_notes": source.weather_notes,
        "classification": source.classification,
        "status": "planning",
    })

    # Clone tracker assignments
    for ta in (source.tracker_assignments or []):
        db.add(TrackerAssignment(
            id=generate_uuid(),
            session_id=new_session.id,
            tracker_id=ta.tracker_id,
            drone_profile_id=ta.drone_profile_id,
            session_color=ta.session_color,
            target_altitude_m=ta.target_altitude_m,
        ))

    # Clone CUAS placements
    for cp in (source.cuas_placements or []):
        db.add(CUASPlacement(
            id=generate_uuid(),
            session_id=new_session.id,
            cuas_profile_id=cp.cuas_profile_id,
            lat=cp.lat,
            lon=cp.lon,
            height_agl_m=cp.height_agl_m,
            orientation_deg=cp.orientation_deg,
            active=cp.active,
        ))

    new_session_id = new_session.id
    await db.commit()

    # Re-fetch with relations
    new_session = await repo.get_with_relations(new_session_id)
    return session_to_dict_full(new_session)


# Session Lifecycle
@router.post("/sessions/{session_id}/start")
async def start_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Start a session — set status to active and record start time."""
    repo = SessionRepository(db)
    session = await repo.get_by_id(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.utcnow()
    session = await repo.update(session_id, {
        "status": "active",
        "start_time": now,
    })

    # Notify DashboardApp of active session for telemetry ingestion
    # (set via module-level variable picked up by api.py)
    _set_active_session_id(session_id)

    try:
        session = await repo.get_with_relations(session_id)
        return session_to_dict_full(session)
    except Exception as e:
        logger.error(f"Failed to re-fetch session {session_id} after start: {e}")
        raise HTTPException(status_code=500, detail=f"Session started but failed to load: {e}")


@router.post("/sessions/{session_id}/stop")
async def stop_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Stop a session — set status to completed, compute duration, export CSV."""
    repo = SessionRepository(db)
    session = await repo.get_with_relations(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.utcnow()
    duration = (now - session.start_time).total_seconds() if session.start_time else 0

    session = await repo.update(session_id, {
        "status": "completed",
        "end_time": now,
        "duration_seconds": duration,
    })

    # Clear active session
    _set_active_session_id(None)

    # Export telemetry to CSV for replay compatibility
    export_summary = await _export_session_telemetry_to_csv(db, session_id)

    session = await repo.get_with_relations(session_id)
    return {
        "session": session_to_dict_full(session),
        "export_summary": export_summary,
    }


@router.post("/sessions/{session_id}/events")
async def add_session_event(
    session_id: str,
    request: EventInput,
    db: AsyncSession = Depends(get_db),
):
    """Add a test event to a session."""
    repo = SessionRepository(db)
    session = await repo.get_by_id(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    event = TestEvent(
        id=generate_uuid(),
        session_id=session_id,
        type=request.type,
        timestamp=request.timestamp or datetime.utcnow(),
        source=request.source,
        cuas_id=request.cuas_id,
        tracker_id=request.tracker_id,
        note=request.note,
        event_metadata=request.metadata,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    return {
        "id": event.id,
        "type": event.type,
        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        "source": event.source,
        "tracker_id": event.tracker_id,
        "note": event.note,
        "metadata": event.event_metadata,
    }


# Module-level active session tracking (shared with api.py via import)
_active_session_id: Optional[str] = None


def _set_active_session_id(session_id: Optional[str]):
    """Set the active session ID for telemetry ingestion."""
    global _active_session_id
    _active_session_id = session_id
    logger.info(f"Active session ID set to: {session_id}")


def get_active_session_id() -> Optional[str]:
    """Get the current active session ID."""
    return _active_session_id


async def _export_session_telemetry_to_csv(
    db: AsyncSession,
    session_id: str,
) -> Dict[str, Any]:
    """Export session telemetry from DB to CSV files for replay compatibility."""
    import csv
    import io

    repo = SessionRepository(db)
    session = await repo.get_with_relations(session_id)
    if not session:
        return {"files_created": [], "total_positions": 0}

    telemetry_repo = TelemetryRepository(db)
    telemetry = await telemetry_repo.get_by_session(session_id)

    if not telemetry:
        return {"files_created": [], "total_positions": 0}

    # Determine output directory
    if session.live_data_path:
        output_dir = Path(session.live_data_path)
    else:
        # Use a default path based on session name
        from .config import get_config_path
        config_path = get_config_path()
        log_root = config_path.parent / "data"
        safe_name = session.name.replace(" ", "_")[:50]
        output_dir = log_root / safe_name

    output_dir.mkdir(parents=True, exist_ok=True)

    # Group telemetry by tracker_id
    by_tracker: Dict[str, list] = {}
    for row in telemetry:
        tid = row.tracker_id
        if tid not in by_tracker:
            by_tracker[tid] = []
        by_tracker[tid].append(row)

    files_created = []
    total_positions = 0

    for tracker_id, rows in by_tracker.items():
        filename = f"tracker_{tracker_id}.csv"
        filepath = output_dir / filename

        with open(filepath, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "time_local_received", "tracker_id", "lat", "lon", "alt_m",
                "hdop", "satellites", "fix_valid", "rssi_dbm",
                "speed_mps", "course_deg", "battery_mv",
            ])
            for row in rows:
                writer.writerow([
                    row.time_local_received.isoformat() if row.time_local_received else "",
                    row.tracker_id,
                    row.lat, row.lon, row.alt_m,
                    row.hdop, row.satellites, row.fix_valid, row.rssi_dbm,
                    row.speed_mps, row.course_deg, row.battery_mv,
                ])
                total_positions += 1

        files_created.append(str(filepath))

    # Update session with the live_data_path
    if not session.live_data_path:
        await repo.update(session_id, {"live_data_path": str(output_dir)})

    logger.info(f"Exported {total_positions} positions to {len(files_created)} CSV files for session {session_id}")

    return {
        "files_created": files_created,
        "total_positions": total_positions,
        "output_path": str(output_dir),
    }


# Session Tags
@router.post("/sessions/{session_id}/tags")
async def add_session_tag(
    session_id: str,
    request: TagRequest,
    db: AsyncSession = Depends(get_db),
):
    """Add a tag to a session."""
    repo = SessionRepository(db)

    try:
        await repo.add_tag(session_id, request.tag)
        tags = await repo.get_tags(session_id)
        return {"tags": tags, "session_id": session_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/sessions/{session_id}/tags/{tag}")
async def remove_session_tag(
    session_id: str,
    tag: str,
    db: AsyncSession = Depends(get_db),
):
    """Remove a tag from a session."""
    repo = SessionRepository(db)
    removed = await repo.remove_tag(session_id, tag)

    if not removed:
        raise HTTPException(status_code=404, detail="Tag not found")

    tags = await repo.get_tags(session_id)
    return {"tags": tags, "success": True}


@router.get("/sessions/{session_id}/tags")
async def get_session_tags(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all tags for a session."""
    repo = SessionRepository(db)
    tags = await repo.get_tags(session_id)
    return {"tags": tags}


# Session Annotations
@router.post("/sessions/{session_id}/annotations")
async def add_annotation(
    session_id: str,
    request: AnnotationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Add an annotation to a session."""
    repo = SessionRepository(db)

    annotation = await repo.add_annotation(
        session_id=session_id,
        content=request.content,
        annotation_type=request.annotation_type,
        timestamp_ref=request.timestamp_ref,
        author=request.author,
    )

    return {
        "id": annotation.id,
        "content": annotation.content,
        "annotation_type": annotation.annotation_type,
        "created_at": annotation.created_at.isoformat(),
    }


@router.get("/sessions/{session_id}/annotations")
async def get_annotations(
    session_id: str,
    annotation_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get all annotations for a session."""
    repo = SessionRepository(db)
    annotations = await repo.get_annotations(session_id, annotation_type)

    return {
        "annotations": [
            {
                "id": a.id,
                "content": a.content,
                "annotation_type": a.annotation_type,
                "timestamp_ref": a.timestamp_ref.isoformat() if a.timestamp_ref else None,
                "author": a.author,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in annotations
        ]
    }


# Session Metrics
@router.put("/sessions/{session_id}/metrics")
async def set_session_metrics(
    session_id: str,
    request: MetricsRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set or update metrics for a session."""
    repo = SessionRepository(db)

    metrics_data = {k: v for k, v in request.model_dump().items() if v is not None}
    metrics = await repo.set_metrics(session_id, metrics_data)

    return {
        "session_id": session_id,
        "metrics_set": True,
    }


@router.get("/sessions/{session_id}/metrics")
async def get_session_metrics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get metrics for a session."""
    repo = SessionRepository(db)
    metrics = await repo.get_metrics(session_id)

    if not metrics:
        return {"metrics": None}

    return {
        "metrics": {
            "time_to_effect_s": metrics.time_to_effect_s,
            "time_to_full_denial_s": metrics.time_to_full_denial_s,
            "effective_range_m": metrics.effective_range_m,
            "max_lateral_drift_m": metrics.max_lateral_drift_m,
            "max_vertical_drift_m": metrics.max_vertical_drift_m,
            "total_flight_time_s": metrics.total_flight_time_s,
            "time_under_jamming_s": metrics.time_under_jamming_s,
            "recovery_time_s": metrics.recovery_time_s,
            "overall_score": metrics.overall_score,
            "pass_fail": metrics.pass_fail,
            "met_expectations": metrics.met_expectations,
            "deviation_notes": metrics.deviation_notes,
            "analyzed_at": metrics.analyzed_at.isoformat() if metrics.analyzed_at else None,
        }
    }


@router.post("/sessions/{session_id}/compute-metrics")
async def compute_metrics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-compute session metrics from telemetry data.
    Triggers the full analysis pipeline: per-tracker metrics → aggregation → storage.
    """
    from .analysis import compute_session_metrics

    result = await compute_session_metrics(db, session_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Session not found or no telemetry data")

    return {"metrics": result, "status": "computed"}


@router.get("/sessions/{session_id}/telemetry")
async def get_session_telemetry(
    session_id: str,
    downsample: int = Query(2000, ge=10, le=50000),
    db: AsyncSession = Depends(get_db),
):
    """
    Get downsampled telemetry tracks for a session.
    Returns all tracker tracks grouped by tracker_id.
    """
    repo = TelemetryRepository(db)
    session_repo = SessionRepository(db)

    # Verify session exists
    session = await session_repo.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get all tracker IDs for this session
    tracker_ids = await repo.get_trackers_for_session(session_id)

    if not tracker_ids:
        return {"session_id": session_id, "tracks": {}, "point_count": 0}

    # Build engagement windows for smart downsampling
    eng_repo = EngagementRepository(db)
    engagements = await eng_repo.get_by_session(session_id)
    engagement_windows = [
        (e.engage_timestamp, e.disengage_timestamp or datetime.utcnow())
        for e in engagements
        if e.engage_timestamp
    ]

    # Downsample per tracker (divide budget across trackers)
    points_per_tracker = max(100, downsample // len(tracker_ids))
    tracks: Dict[str, list] = {}
    total_points = 0

    for tracker_id in tracker_ids:
        if engagement_windows:
            records = await repo.get_downsampled_engagement_aware(
                session_id, tracker_id=tracker_id, target_points=points_per_tracker,
                engagement_windows=engagement_windows,
            )
        else:
            records = await repo.get_downsampled(
                session_id, tracker_id=tracker_id, target_points=points_per_tracker
            )
        tracks[tracker_id] = [
            {
                "lat": r.lat,
                "lon": r.lon,
                "alt_m": r.alt_m,
                "timestamp": r.time_local_received.isoformat() if r.time_local_received else None,
                "speed_mps": r.speed_mps,
                "hdop": r.hdop,
                "satellites": r.satellites,
                "fix_valid": r.fix_valid,
            }
            for r in records
            if r.lat is not None and r.lon is not None
        ]
        total_points += len(tracks[tracker_id])

    return {
        "session_id": session_id,
        "tracks": tracks,
        "point_count": total_points,
    }


# =============================================================================
# Engagement Endpoints
# =============================================================================

@router.post("/sessions/{session_id}/engagements")
async def create_engagement(
    session_id: str,
    request: EngagementCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new engagement (status=planned)."""
    from sqlalchemy import select as sa_select

    session_repo = SessionRepository(db)
    session = await session_repo.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Resolve emitter
    emitter_type = request.emitter_type
    emitter_id = request.emitter_id
    cuas_placement_id = request.cuas_placement_id

    if emitter_type == EmitterType.ACTOR.value:
        # Validate actor exists in session
        if not emitter_id:
            raise HTTPException(status_code=400, detail="emitter_id required for actor emitter")
        actor_result = await db.execute(
            sa_select(SessionActor).where(
                SessionActor.id == emitter_id,
                SessionActor.session_id == session_id,
            )
        )
        actor = actor_result.scalar_one_or_none()
        if not actor:
            raise HTTPException(status_code=400, detail="Session actor not found in this session")
        cuas_placement_id = None  # No CUAS placement for actors
    else:
        # CUAS system emitter - backward compat
        resolved_placement_id = cuas_placement_id or emitter_id
        if not resolved_placement_id:
            raise HTTPException(status_code=400, detail="cuas_placement_id or emitter_id required")

        placement_result = await db.execute(
            sa_select(CUASPlacement).where(
                CUASPlacement.id == resolved_placement_id,
                CUASPlacement.session_id == session_id,
            )
        )
        placement = placement_result.scalar_one_or_none()
        if not placement:
            raise HTTPException(status_code=400, detail="CUAS placement not found in this session")
        cuas_placement_id = resolved_placement_id
        emitter_id = resolved_placement_id

    # Auto-generate run_number and name if not provided
    from sqlalchemy import func as sa_func
    max_run_result = await db.execute(
        sa_select(sa_func.coalesce(sa_func.max(Engagement.run_number), 0))
        .where(Engagement.session_id == session_id)
    )
    next_run_number = (max_run_result.scalar() or 0) + 1
    name = request.name or f"Run {next_run_number}"

    engagement = Engagement(
        id=generate_uuid(),
        session_id=session_id,
        cuas_placement_id=cuas_placement_id,
        emitter_type=emitter_type,
        emitter_id=emitter_id,
        name=name,
        run_number=next_run_number,
        engagement_type=request.engagement_type,
        status=EngagementStatus.PLANNED.value,
        notes=request.notes,
    )
    db.add(engagement)
    await db.flush()

    # Add targets
    for t in request.targets:
        target = EngagementTarget(
            id=generate_uuid(),
            engagement_id=engagement.id,
            tracker_id=t.tracker_id,
            drone_profile_id=t.drone_profile_id,
            role=t.role,
        )
        db.add(target)

    await db.commit()

    # Re-fetch with relations
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement.id)
    return engagement_to_dict(engagement)


@router.post("/sessions/{session_id}/engagements/quick")
async def quick_engage(
    session_id: str,
    request: EngagementQuickRequest,
    db: AsyncSession = Depends(get_db),
):
    """Quick-engage: auto-select CUAS + all drones, create and immediately activate."""
    from sqlalchemy import select as sa_select

    session_repo = SessionRepository(db)
    session = await session_repo.get_with_relations(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Select CUAS placement
    placements = session.cuas_placements or []
    if not placements:
        raise HTTPException(status_code=400, detail="No CUAS placements in session")

    if request.cuas_placement_id:
        placement = next((p for p in placements if p.id == request.cuas_placement_id), None)
        if not placement:
            raise HTTPException(status_code=400, detail="CUAS placement not found")
    else:
        placement = placements[0]

    # Get all tracker assignments
    assignments = session.tracker_assignments or []
    if not assignments:
        raise HTTPException(status_code=400, detail="No tracker assignments in session")

    # Auto-generate run_number and name
    from sqlalchemy import func as sa_func
    max_run_result = await db.execute(
        sa_select(sa_func.coalesce(sa_func.max(Engagement.run_number), 0))
        .where(Engagement.session_id == session_id)
    )
    next_run_number = (max_run_result.scalar() or 0) + 1
    name = request.name or f"Run {next_run_number}"

    # Create engagement
    engagement = Engagement(
        id=generate_uuid(),
        session_id=session_id,
        cuas_placement_id=placement.id,
        emitter_type=EmitterType.CUAS_SYSTEM.value,
        emitter_id=placement.id,
        name=name,
        run_number=next_run_number,
        engagement_type=request.engagement_type,
        status=EngagementStatus.PLANNED.value,
    )
    db.add(engagement)
    await db.flush()

    # Add all drones as targets
    for ta in assignments:
        target = EngagementTarget(
            id=generate_uuid(),
            engagement_id=engagement.id,
            tracker_id=ta.tracker_id,
            drone_profile_id=ta.drone_profile_id,
            role="primary_target",
        )
        db.add(target)

    await db.flush()

    # Immediately transition to active
    now = datetime.utcnow()
    engagement.status = EngagementStatus.ACTIVE.value
    engagement.engage_timestamp = now

    # Compute initial geometry
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement.id)

    from .analysis import compute_engagement_geometry
    await compute_engagement_geometry(db, engagement)

    # Create engagement_start event (Fix 4)
    engage_event = TestEvent(
        id=generate_uuid(),
        session_id=session_id,
        type="engage",
        timestamp=now,
        source="manual",
        cuas_id=placement.cuas_profile_id,
        engagement_id=engagement.id,
        note=f"Quick-engage started: {name}",
    )
    db.add(engage_event)

    # Auto-create first jam burst (Fix 6)
    burst = await eng_repo.create_burst({
        "id": generate_uuid(),
        "engagement_id": engagement.id,
        "burst_seq": 1,
        "jam_on_at": now,
        "emitter_lat": placement.lat,
        "emitter_lon": placement.lon,
        "emitter_heading_deg": placement.heading_deg or placement.orientation_deg,
        "source": "live",
    })

    # Create jam_on event for the auto-burst
    jam_on_event = TestEvent(
        id=generate_uuid(),
        session_id=session_id,
        type="jam_on",
        timestamp=now,
        source="system",
        cuas_id=placement.cuas_profile_id,
        engagement_id=engagement.id,
        burst_id=burst.id,
        note="Burst #1 started (auto)",
    )
    db.add(jam_on_event)

    # Save ID before commit+expire cycle
    eng_id = engagement.id
    await db.commit()

    # Expire cache so re-fetch picks up the new burst and events
    db.expire_all()
    engagement = await eng_repo.get_with_relations(eng_id)
    return engagement_to_dict(engagement)


@router.get("/sessions/{session_id}/engagements")
async def list_engagements(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all engagements for a session."""
    eng_repo = EngagementRepository(db)
    engagements = await eng_repo.get_by_session(session_id)
    return {"engagements": [engagement_to_dict(e) for e in engagements]}


@router.get("/sessions/{session_id}/engagement-summary")
async def get_engagement_summary(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregated engagement summary for a session.
    Returns all engagements with metrics plus session-level stats.
    """
    session_repo = SessionRepository(db)
    session = await session_repo.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    eng_repo = EngagementRepository(db)
    engagements = await eng_repo.get_by_session(session_id)

    runs = []
    total_tte = []
    total_range = []
    pass_count = 0
    fail_count = 0

    for eng in engagements:
        run_data = engagement_to_dict(eng)
        m = eng.metrics
        if m:
            if m.time_to_effect_s is not None:
                total_tte.append(m.time_to_effect_s)
            if m.effective_range_m is not None:
                total_range.append(m.effective_range_m)
            if m.pass_fail == "pass":
                pass_count += 1
            elif m.pass_fail == "fail":
                fail_count += 1
        runs.append(run_data)

    total_runs = len(engagements)
    completed_runs = len([e for e in engagements if e.status in ("complete", "aborted")])

    return {
        "session_id": session_id,
        "runs": runs,
        "stats": {
            "total_runs": total_runs,
            "completed_runs": completed_runs,
            "active_runs": total_runs - completed_runs,
            "pass_count": pass_count,
            "fail_count": fail_count,
            "pass_rate": round(pass_count / completed_runs * 100, 1) if completed_runs > 0 else None,
            "avg_time_to_effect_s": round(sum(total_tte) / len(total_tte), 2) if total_tte else None,
            "avg_effective_range_m": round(sum(total_range) / len(total_range), 1) if total_range else None,
        },
    }


@router.get("/engagements/{engagement_id}")
async def get_engagement(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get an engagement with targets, metrics, and events."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return engagement_to_dict(engagement)


@router.put("/engagements/{engagement_id}")
async def update_engagement(
    engagement_id: str,
    request: EngagementUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update an engagement (only when planned)."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.PLANNED.value:
        raise HTTPException(status_code=400, detail="Can only update planned engagements")

    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.notes is not None:
        update_data["notes"] = request.notes

    if update_data:
        await eng_repo.update(engagement_id, update_data)

    # Update targets if provided
    if request.targets is not None:
        # Remove existing targets
        for t in engagement.targets:
            await db.delete(t)
        await db.flush()

        # Add new targets
        for t in request.targets:
            target = EngagementTarget(
                id=generate_uuid(),
                engagement_id=engagement_id,
                tracker_id=t.tracker_id,
                drone_profile_id=t.drone_profile_id,
                role=t.role,
            )
            db.add(target)

    await db.commit()

    engagement = await eng_repo.get_with_relations(engagement_id)
    return engagement_to_dict(engagement)


@router.delete("/engagements/{engagement_id}")
async def delete_engagement(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete an engagement (only when planned)."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_by_id(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.PLANNED.value:
        raise HTTPException(status_code=400, detail="Can only delete planned engagements")

    await eng_repo.delete(engagement_id)
    await db.commit()
    return {"success": True}


@router.post("/engagements/{engagement_id}/engage")
async def engage(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Transition planned→active, compute initial geometry."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.PLANNED.value:
        raise HTTPException(status_code=400, detail="Can only engage from planned status")

    now = datetime.utcnow()
    engagement.status = EngagementStatus.ACTIVE.value
    engagement.engage_timestamp = now

    # Compute initial geometry
    from .analysis import compute_engagement_geometry
    await compute_engagement_geometry(db, engagement)

    # Create engage event
    event = TestEvent(
        id=generate_uuid(),
        session_id=engagement.session_id,
        type="engage",
        timestamp=now,
        source="manual",
        cuas_id=engagement.cuas_placement.cuas_profile_id if engagement.cuas_placement else None,
        engagement_id=engagement.id,
        note=f"Engagement started: {engagement.name}",
    )
    db.add(event)

    await db.commit()

    engagement = await eng_repo.get_with_relations(engagement_id)
    return engagement_to_dict(engagement)


@router.post("/engagements/{engagement_id}/disengage")
async def disengage(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Transition active→complete, auto-close open burst, compute final geometry + metrics."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Can only disengage from active status")

    now = datetime.utcnow()

    # Auto-close any open burst
    open_burst = await eng_repo.get_open_burst(engagement_id)
    if open_burst:
        duration_s = (now - open_burst.jam_on_at).total_seconds()
        await eng_repo.close_burst(open_burst.id, now, round(duration_s, 3))
        # Record jam_off event for auto-closed burst
        jam_off_event = TestEvent(
            id=generate_uuid(),
            session_id=engagement.session_id,
            type="jam_off",
            timestamp=now,
            source="system",
            engagement_id=engagement.id,
            burst_id=open_burst.id,
            note="Auto-closed by disengage",
        )
        db.add(jam_off_event)

    engagement.status = EngagementStatus.COMPLETE.value
    engagement.disengage_timestamp = now

    # Compute final geometry
    from .analysis import compute_engagement_final_geometry, compute_engagement_metrics
    await compute_engagement_final_geometry(db, engagement)

    # Compute metrics
    metrics = await compute_engagement_metrics(db, engagement)

    # Create disengage event
    event = TestEvent(
        id=generate_uuid(),
        session_id=engagement.session_id,
        type="disengage",
        timestamp=now,
        source="manual",
        cuas_id=engagement.cuas_placement.cuas_profile_id if engagement.cuas_placement else None,
        engagement_id=engagement.id,
        note=f"Engagement complete: {engagement.name}",
        event_metadata={"metrics_summary": _json_safe(metrics)} if metrics else None,
    )
    db.add(event)

    await db.commit()

    engagement = await eng_repo.get_with_relations(engagement_id)
    return engagement_to_dict(engagement)


@router.post("/engagements/{engagement_id}/abort")
async def abort_engagement(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Transition active→aborted."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Can only abort active engagements")

    now = datetime.utcnow()
    engagement.status = EngagementStatus.ABORTED.value
    engagement.disengage_timestamp = now

    # Create abort event
    event = TestEvent(
        id=generate_uuid(),
        session_id=engagement.session_id,
        type="engagement_aborted",
        timestamp=now,
        source="manual",
        engagement_id=engagement.id,
        note=f"Engagement aborted: {engagement.name}",
    )
    db.add(event)

    await db.commit()

    engagement = await eng_repo.get_with_relations(engagement_id)
    return engagement_to_dict(engagement)


@router.post("/engagements/{engagement_id}/compute-metrics")
async def recompute_engagement_metrics(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Re-compute metrics for an engagement."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status not in (EngagementStatus.COMPLETE.value, EngagementStatus.ACTIVE.value):
        raise HTTPException(status_code=400, detail="Can only compute metrics for active or complete engagements")

    from .analysis import compute_engagement_metrics
    metrics = await compute_engagement_metrics(db, engagement)
    if metrics is None:
        raise HTTPException(status_code=400, detail="No telemetry data for metrics computation")

    await db.commit()

    engagement = await eng_repo.get_with_relations(engagement_id)
    return engagement_to_dict(engagement)


@router.get("/engagements/{engagement_id}/summary")
async def get_engagement_summary(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Full engagement summary for reports."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    result = engagement_to_dict(engagement)

    # Add CUAS profile info
    if engagement.cuas_placement and engagement.cuas_placement.cuas_profile_id:
        from .database.models import CUASProfile
        profile = await db.get(CUASProfile, engagement.cuas_placement.cuas_profile_id)
        if profile:
            result["cuas_profile"] = {
                "id": profile.id,
                "name": profile.name,
                "vendor": profile.vendor,
                "type": profile.type,
            }

    # Add events during engagement
    if engagement.engage_timestamp:
        end_time = engagement.disengage_timestamp or datetime.utcnow()
        from sqlalchemy import select as sa_select
        events_result = await db.execute(
            sa_select(TestEvent)
            .where(TestEvent.session_id == engagement.session_id)
            .where(TestEvent.timestamp >= engagement.engage_timestamp)
            .where(TestEvent.timestamp <= end_time)
            .order_by(TestEvent.timestamp)
        )
        events = events_result.scalars().all()
        result["events"] = [
            {
                "id": e.id,
                "type": e.type,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "source": e.source,
                "note": e.note,
            }
            for e in events
        ]

    return result


# =============================================================================
# Jam Burst Endpoints
# =============================================================================

@router.post("/engagements/{engagement_id}/jam-on")
async def jam_on(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Open a new jam burst. Engagement must be active with no open burst."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Can only jam-on during active engagement")

    # Check no open burst exists
    open_burst = await eng_repo.get_open_burst(engagement_id)
    if open_burst:
        raise HTTPException(status_code=400, detail="A burst is already open — call jam-off first")

    now = datetime.utcnow()
    max_seq = await eng_repo.get_max_burst_seq(engagement_id)

    # Resolve emitter position
    emitter_lat = engagement.cuas_lat
    emitter_lon = engagement.cuas_lon
    emitter_heading = engagement.cuas_orientation_deg

    if engagement.emitter_type == EmitterType.ACTOR.value:
        from sqlalchemy import select as sa_select
        actor_result = await db.execute(
            sa_select(SessionActor).where(SessionActor.id == engagement.emitter_id)
        )
        actor = actor_result.scalar_one_or_none()
        if actor:
            emitter_lat = actor.lat
            emitter_lon = actor.lon
            emitter_heading = actor.heading_deg

    # Build target snapshots
    from .geo import compute_range_bearing
    target_snapshots = []
    for target in engagement.targets:
        # Get latest telemetry for target
        from sqlalchemy import select as sa_select
        telem_result = await db.execute(
            sa_select(TrackerTelemetry)
            .where(TrackerTelemetry.session_id == engagement.session_id)
            .where(TrackerTelemetry.tracker_id == target.tracker_id)
            .order_by(TrackerTelemetry.time_local_received.desc())
            .limit(1)
        )
        latest = telem_result.scalar_one_or_none()

        snapshot = {"tracker_id": target.tracker_id}
        if latest and latest.lat and latest.lon:
            snapshot["lat"] = latest.lat
            snapshot["lon"] = latest.lon
            if emitter_lat and emitter_lon:
                range_m, bearing_deg = await compute_range_bearing(
                    emitter_lat, emitter_lon, latest.lat, latest.lon, db
                )
                snapshot["range_m"] = range_m
                snapshot["bearing_deg"] = bearing_deg
            gps_status = "good"
            if not latest.fix_valid:
                gps_status = "lost"
            elif latest.hdop and latest.hdop > 5:
                gps_status = "degraded"
            snapshot["gps_status"] = gps_status
        target_snapshots.append(snapshot)

    # Create burst
    burst = await eng_repo.create_burst({
        "id": generate_uuid(),
        "engagement_id": engagement_id,
        "burst_seq": max_seq + 1,
        "jam_on_at": now,
        "emitter_lat": emitter_lat,
        "emitter_lon": emitter_lon,
        "emitter_heading_deg": emitter_heading,
        "target_snapshots": target_snapshots,
        "source": "live",
    })

    # Create jam_on event
    event = TestEvent(
        id=generate_uuid(),
        session_id=engagement.session_id,
        type="jam_on",
        timestamp=now,
        source="manual",
        cuas_id=engagement.cuas_placement.cuas_profile_id if engagement.cuas_placement else None,
        engagement_id=engagement.id,
        burst_id=burst.id,
        note=f"Burst #{max_seq + 1} started",
    )
    db.add(event)

    await db.commit()
    return burst_to_dict(burst)


@router.post("/engagements/{engagement_id}/jam-off")
async def jam_off(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Close the open jam burst."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status != EngagementStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Can only jam-off during active engagement")

    open_burst = await eng_repo.get_open_burst(engagement_id)
    if not open_burst:
        raise HTTPException(status_code=400, detail="No open burst to close")

    now = datetime.utcnow()
    duration_s = round((now - open_burst.jam_on_at).total_seconds(), 3)

    burst = await eng_repo.close_burst(open_burst.id, now, duration_s)

    # Create jam_off event
    event = TestEvent(
        id=generate_uuid(),
        session_id=engagement.session_id,
        type="jam_off",
        timestamp=now,
        source="manual",
        cuas_id=engagement.cuas_placement.cuas_profile_id if engagement.cuas_placement else None,
        engagement_id=engagement.id,
        burst_id=burst.id,
        note=f"Burst #{burst.burst_seq} ended ({duration_s:.1f}s)",
    )
    db.add(event)

    await db.commit()
    return burst_to_dict(burst)


@router.get("/engagements/{engagement_id}/bursts")
async def list_bursts(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all jam bursts for an engagement."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_by_id(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    bursts = await eng_repo.get_bursts(engagement_id)
    return {"bursts": [burst_to_dict(b) for b in bursts]}


# =============================================================================
# Session Actor Endpoints
# =============================================================================

@router.post("/sessions/{session_id}/actors")
async def create_actor(
    session_id: str,
    request: SessionActorCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new session actor."""
    session_repo = SessionRepository(db)
    session = await session_repo.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    actor_repo = SessionActorRepository(db)
    actor = await actor_repo.create({
        "session_id": session_id,
        "name": request.name,
        "callsign": request.callsign,
        "lat": request.lat,
        "lon": request.lon,
        "heading_deg": request.heading_deg,
        "tracker_unit_id": request.tracker_unit_id,
    })

    await db.commit()
    return actor_to_dict(actor)


@router.get("/sessions/{session_id}/actors")
async def list_actors(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all actors for a session."""
    actor_repo = SessionActorRepository(db)
    actors = await actor_repo.get_by_session(session_id)
    return {"actors": [actor_to_dict(a) for a in actors]}


@router.put("/actors/{actor_id}")
async def update_actor(
    actor_id: str,
    request: SessionActorUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a session actor."""
    actor_repo = SessionActorRepository(db)
    actor = await actor_repo.get_by_id(actor_id)
    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")

    update_data = {}
    for field in ["name", "callsign", "lat", "lon", "heading_deg", "tracker_unit_id", "is_active"]:
        value = getattr(request, field, None)
        if value is not None:
            update_data[field] = value

    if update_data:
        await actor_repo.update(actor_id, update_data)

    await db.commit()

    actor = await actor_repo.get_by_id(actor_id)
    return actor_to_dict(actor)


@router.delete("/actors/{actor_id}")
async def delete_actor(
    actor_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a session actor."""
    actor_repo = SessionActorRepository(db)
    actor = await actor_repo.get_by_id(actor_id)
    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")

    await actor_repo.delete(actor_id)
    await db.commit()
    return {"success": True}


# =============================================================================
# Engagement Metrics Retrieval & Recomputation
# =============================================================================

@router.get("/engagements/{engagement_id}/metrics")
async def get_engagement_metrics(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get metrics for an engagement."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if not engagement.metrics:
        return {"metrics": None, "message": "No metrics computed yet"}

    return {"metrics": engagement_metrics_to_dict(engagement.metrics)}


@router.post("/engagements/{engagement_id}/recompute")
async def recompute_metrics(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Re-compute metrics for an engagement (alias for compute-metrics)."""
    eng_repo = EngagementRepository(db)
    engagement = await eng_repo.get_with_relations(engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")

    if engagement.status not in (EngagementStatus.COMPLETE.value, EngagementStatus.ACTIVE.value):
        raise HTTPException(status_code=400, detail="Can only recompute metrics for active or complete engagements")

    from .analysis import compute_engagement_metrics
    metrics = await compute_engagement_metrics(db, engagement)
    if metrics is None:
        raise HTTPException(status_code=400, detail="No telemetry data for metrics computation")

    await db.commit()

    engagement = await eng_repo.get_with_relations(engagement_id)
    return engagement_to_dict(engagement)


# =============================================================================
# Session Comparison Endpoint
# =============================================================================

@router.get("/sessions/compare")
async def compare_sessions(
    session_ids: str = Query(..., description="Comma-separated session IDs to compare"),
    db: AsyncSession = Depends(get_db),
):
    """Compare metrics between two or more sessions."""
    ids = [s.strip() for s in session_ids.split(",") if s.strip()]
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 session IDs required")

    repo = SessionRepository(db)
    comparison = []

    for sid in ids:
        session = await repo.get_by_id(sid)
        if not session:
            raise HTTPException(status_code=404, detail=f"Session {sid} not found")

        metrics = await repo.get_metrics(sid)
        comparison.append({
            "session_id": sid,
            "name": session.name,
            "status": session.status,
            "start_time": session.start_time.isoformat() if session.start_time else None,
            "duration_seconds": session.duration_seconds,
            "metrics": {
                "time_to_effect_s": metrics.time_to_effect_s if metrics else None,
                "time_to_full_denial_s": metrics.time_to_full_denial_s if metrics else None,
                "effective_range_m": metrics.effective_range_m if metrics else None,
                "max_lateral_drift_m": metrics.max_lateral_drift_m if metrics else None,
                "max_vertical_drift_m": metrics.max_vertical_drift_m if metrics else None,
                "total_flight_time_s": metrics.total_flight_time_s if metrics else None,
                "time_under_jamming_s": metrics.time_under_jamming_s if metrics else None,
                "recovery_time_s": metrics.recovery_time_s if metrics else None,
                "pass_fail": metrics.pass_fail if metrics else None,
            } if metrics else None,
        })

    return {"sessions": comparison}


# =============================================================================
# CSV Telemetry Export Endpoint
# =============================================================================

@router.get("/sessions/{session_id}/export/csv")
async def export_session_csv(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Export session telemetry as CSV download."""
    import csv
    import io

    repo = SessionRepository(db)
    session = await repo.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    telemetry_repo = TelemetryRepository(db)
    telemetry = await telemetry_repo.get_by_session(session_id)

    if not telemetry:
        raise HTTPException(status_code=404, detail="No telemetry data for session")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "timestamp", "tracker_id", "lat", "lon", "alt_m",
        "hdop", "satellites", "fix_valid", "rssi_dbm",
        "speed_mps", "course_deg", "battery_mv",
    ])

    for row in telemetry:
        writer.writerow([
            row.time_local_received.isoformat() if row.time_local_received else "",
            row.tracker_id,
            row.lat,
            row.lon,
            row.alt_m,
            row.hdop,
            row.satellites,
            row.fix_valid,
            row.rssi_dbm,
            row.speed_mps,
            row.course_deg,
            row.battery_mv,
        ])

    csv_content = output.getvalue()
    safe_name = session.name.replace(" ", "_")[:50]
    filename = f"{safe_name}_telemetry.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# =============================================================================
# Site Endpoints
# =============================================================================

@router.get("/sites")
async def list_sites(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = None,
    environment_type: Optional[str] = None,
    is_active: Optional[bool] = True,
    db: AsyncSession = Depends(get_db),
):
    """List sites with filters and pagination."""
    repo = SiteRepository(db)

    sites, total = await repo.list_sites(
        search=search,
        environment_type=environment_type,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )

    return {
        "items": [site_to_dict(s) for s in sites],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/sites/{site_id}")
async def get_site(
    site_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a site by ID."""
    repo = SiteRepository(db)
    site = await repo.get_by_id(site_id)

    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    return site_to_dict(site)


@router.post("/sites")
async def create_site(
    request: SiteCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new site."""
    repo = SiteRepository(db)

    site = await repo.create(request.model_dump())
    return site_to_dict(site)


@router.put("/sites/{site_id}")
async def update_site(
    site_id: str,
    request: SiteUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a site."""
    repo = SiteRepository(db)

    update_data = {k: v for k, v in request.model_dump().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    site = await repo.update(site_id, update_data)

    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    return site_to_dict(site)


@router.delete("/sites/{site_id}")
async def delete_site(
    site_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Archive a site (soft delete)."""
    repo = SiteRepository(db)
    site = await repo.soft_delete(site_id)

    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    return {"success": True}


@router.get("/sites/{site_id}/sessions")
async def get_site_sessions(
    site_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get all sessions for a site."""
    repo = SiteRepository(db)

    sessions, total = await repo.get_sessions_for_site(site_id, skip, limit)

    return {
        "items": [session_to_dict(s) for s in sessions],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/sites/{site_id}/statistics")
async def get_site_statistics(
    site_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get statistics for a site."""
    repo = SiteRepository(db)
    stats = await repo.get_site_statistics(site_id)
    return stats


# =============================================================================
# Drone Profile Endpoints
# =============================================================================

@router.get("/drone-profiles")
async def list_drone_profiles(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = None,
    make: Optional[str] = None,
    weight_class: Optional[str] = None,
    is_active: Optional[bool] = True,
    db: AsyncSession = Depends(get_db),
):
    """List drone profiles with filters and pagination."""
    repo = DroneProfileRepository(db)

    profiles, total = await repo.list_profiles(
        search=search,
        make=make,
        weight_class=weight_class,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )

    return {
        "items": [drone_to_dict(p) for p in profiles],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/drone-profiles/{profile_id}")
async def get_drone_profile(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a drone profile by ID."""
    repo = DroneProfileRepository(db)
    profile = await repo.get_by_id(profile_id)

    if not profile:
        raise HTTPException(status_code=404, detail="Drone profile not found")

    return drone_to_dict(profile)


@router.post("/drone-profiles")
async def create_drone_profile(
    request: DroneProfileCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new drone profile."""
    repo = DroneProfileRepository(db)
    profile = await repo.create(request.model_dump())
    return drone_to_dict(profile)


@router.put("/drone-profiles/{profile_id}")
async def update_drone_profile(
    profile_id: str,
    request: DroneProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a drone profile."""
    repo = DroneProfileRepository(db)

    update_data = {k: v for k, v in request.model_dump().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    profile = await repo.update(profile_id, update_data)

    if not profile:
        raise HTTPException(status_code=404, detail="Drone profile not found")

    return drone_to_dict(profile)


@router.delete("/drone-profiles/{profile_id}")
async def delete_drone_profile(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Archive a drone profile (soft delete)."""
    repo = DroneProfileRepository(db)
    profile = await repo.soft_delete(profile_id)

    if not profile:
        raise HTTPException(status_code=404, detail="Drone profile not found")

    return {"success": True}


@router.get("/drone-profiles/{profile_id}/sessions")
async def get_drone_sessions(
    profile_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get all sessions using a drone profile."""
    repo = DroneProfileRepository(db)

    sessions, total = await repo.get_sessions_for_drone(profile_id, skip, limit)

    return {
        "items": [session_to_dict(s) for s in sessions],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/drone-profiles/{profile_id}/statistics")
async def get_drone_statistics(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get statistics for a drone profile."""
    repo = DroneProfileRepository(db)
    stats = await repo.get_drone_statistics(profile_id)
    return stats


# =============================================================================
# CUAS Profile Endpoints
# =============================================================================

@router.get("/cuas-profiles")
async def list_cuas_profiles(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = None,
    vendor: Optional[str] = None,
    cuas_type: Optional[str] = None,
    is_active: Optional[bool] = True,
    db: AsyncSession = Depends(get_db),
):
    """List CUAS profiles with filters and pagination."""
    repo = CUASProfileRepository(db)

    profiles, total = await repo.list_profiles(
        search=search,
        vendor=vendor,
        cuas_type=cuas_type,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )

    return {
        "items": [cuas_to_dict(p) for p in profiles],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/cuas-profiles/{profile_id}")
async def get_cuas_profile(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a CUAS profile by ID."""
    repo = CUASProfileRepository(db)
    profile = await repo.get_by_id(profile_id)

    if not profile:
        raise HTTPException(status_code=404, detail="CUAS profile not found")

    return cuas_to_dict(profile)


@router.post("/cuas-profiles")
async def create_cuas_profile(
    request: CUASProfileCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new CUAS profile."""
    repo = CUASProfileRepository(db)
    profile = await repo.create(request.model_dump())
    return cuas_to_dict(profile)


@router.put("/cuas-profiles/{profile_id}")
async def update_cuas_profile(
    profile_id: str,
    request: CUASProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a CUAS profile."""
    repo = CUASProfileRepository(db)

    update_data = {k: v for k, v in request.model_dump().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    profile = await repo.update(profile_id, update_data)

    if not profile:
        raise HTTPException(status_code=404, detail="CUAS profile not found")

    return cuas_to_dict(profile)


@router.delete("/cuas-profiles/{profile_id}")
async def delete_cuas_profile(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Archive a CUAS profile (soft delete)."""
    repo = CUASProfileRepository(db)
    profile = await repo.soft_delete(profile_id)

    if not profile:
        raise HTTPException(status_code=404, detail="CUAS profile not found")

    return {"success": True}


@router.get("/cuas-profiles/{profile_id}/sessions")
async def get_cuas_sessions(
    profile_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get all sessions using a CUAS profile."""
    repo = CUASProfileRepository(db)

    sessions, total = await repo.get_sessions_for_cuas(profile_id, skip, limit)

    return {
        "items": [session_to_dict(s) for s in sessions],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/cuas-profiles/{profile_id}/effectiveness")
async def get_cuas_effectiveness(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get effectiveness metrics for a CUAS profile."""
    repo = CUASProfileRepository(db)
    stats = await repo.get_cuas_statistics(profile_id)
    return stats


# =============================================================================
# Dashboard / Analytics Endpoints
# =============================================================================

@router.get("/dashboard/summary")
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard summary metrics."""
    session_repo = SessionRepository(db)
    site_repo = SiteRepository(db)
    drone_repo = DroneProfileRepository(db)
    cuas_repo = CUASProfileRepository(db)

    # Get counts
    status_counts = await session_repo.get_status_counts()
    total_sessions = sum(status_counts.values())

    sites, site_count = await site_repo.list_sites(limit=1)
    drones, drone_count = await drone_repo.list_profiles(limit=1)
    cuas, cuas_count = await cuas_repo.list_profiles(limit=1)

    # Get recent sessions
    recent = await session_repo.get_recent_sessions(limit=5)

    return {
        "sessions": {
            "total": total_sessions,
            "by_status": status_counts,
        },
        "sites": {
            "total": site_count,
        },
        "drone_profiles": {
            "total": drone_count,
        },
        "cuas_profiles": {
            "total": cuas_count,
        },
        "recent_sessions": [session_to_dict(s) for s in recent],
    }


@router.get("/tags")
async def get_all_tags(
    db: AsyncSession = Depends(get_db),
):
    """Get all unique tags with usage counts."""
    repo = SessionRepository(db)
    tags = await repo.get_all_tags()
    return {"tags": tags}


@router.get("/lookup/makes")
async def get_drone_makes(
    db: AsyncSession = Depends(get_db),
):
    """Get all drone manufacturers."""
    repo = DroneProfileRepository(db)
    makes = await repo.get_makes()
    return {"makes": makes}


@router.get("/lookup/weight-classes")
async def get_weight_classes(
    db: AsyncSession = Depends(get_db),
):
    """Get all weight classes."""
    repo = DroneProfileRepository(db)
    classes = await repo.get_weight_classes()
    return {"weight_classes": classes}


@router.get("/lookup/vendors")
async def get_cuas_vendors(
    db: AsyncSession = Depends(get_db),
):
    """Get all CUAS vendors."""
    repo = CUASProfileRepository(db)
    vendors = await repo.get_vendors()
    return {"vendors": vendors}


@router.get("/lookup/cuas-types")
async def get_cuas_types(
    db: AsyncSession = Depends(get_db),
):
    """Get all CUAS types."""
    repo = CUASProfileRepository(db)
    types = await repo.get_types()
    return {"types": types}


@router.get("/lookup/environment-types")
async def get_environment_types(
    db: AsyncSession = Depends(get_db),
):
    """Get all site environment types."""
    repo = SiteRepository(db)
    types = await repo.get_environment_types()
    return {"environment_types": types}


# =============================================================================
# Import / Migration Endpoints
# =============================================================================

class ImportRequest(BaseModel):
    """Request to import sessions from CSV."""
    log_root: str
    import_telemetry: bool = True
    force: bool = False


@router.get("/import/preview")
async def preview_import(
    log_root: str,
):
    """
    Preview what sessions would be imported from a log root.

    Args:
        log_root: Path to the log root directory.

    Returns:
        Preview of sessions that would be imported.
    """
    path = Path(log_root)
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {log_root}")

    db_manager = get_db_manager()
    if not db_manager:
        raise HTTPException(status_code=500, detail="Database not initialized")

    importer = CSVImporter(db_manager, path)
    preview = importer.get_import_preview()

    return preview


@router.post("/import/sessions")
async def import_sessions(
    request: ImportRequest,
    background_tasks: BackgroundTasks,
):
    """
    Import sessions from CSV files into the database.

    This runs as a background task for large imports.

    Args:
        request: Import configuration.

    Returns:
        Import job status.
    """
    path = Path(request.log_root)
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {request.log_root}")

    db_manager = get_db_manager()
    if not db_manager:
        raise HTTPException(status_code=500, detail="Database not initialized")

    importer = CSVImporter(db_manager, path)

    # For small imports, run synchronously
    preview = importer.get_import_preview()
    if preview["pending_import"] <= 5:
        # Small import - run directly
        result = importer.import_all_sessions(
            import_telemetry=request.import_telemetry,
            force=request.force,
        )
        return {
            "status": "completed",
            "result": result,
        }
    else:
        # Large import - run in background
        def run_import():
            importer.import_all_sessions(
                import_telemetry=request.import_telemetry,
                force=request.force,
            )

        background_tasks.add_task(run_import)
        return {
            "status": "started",
            "message": f"Importing {preview['pending_import']} sessions in background",
        }


@router.post("/import/session")
async def import_single_session(
    session_path: str,
    import_telemetry: bool = True,
    force: bool = False,
):
    """
    Import a single session from a folder.

    Args:
        session_path: Path to the session folder.
        import_telemetry: Whether to import telemetry data.
        force: Force re-import if already exists.

    Returns:
        The imported session ID.
    """
    path = Path(session_path)
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {session_path}")

    db_manager = get_db_manager()
    if not db_manager:
        raise HTTPException(status_code=500, detail="Database not initialized")

    # Determine log root (parent of session folder)
    log_root = path.parent

    importer = CSVImporter(db_manager, log_root)

    # Get session info
    sessions = importer.scan_sessions()
    session_info = next(
        (s for s in sessions if s["path"] == str(path)),
        None,
    )

    if not session_info:
        raise HTTPException(status_code=400, detail="No valid session found at path")

    session_id = importer.import_session(
        session_info,
        import_telemetry=import_telemetry,
        force=force,
    )

    if not session_id:
        raise HTTPException(status_code=500, detail="Failed to import session")

    return {
        "success": True,
        "session_id": session_id,
    }


# =============================================================================
# Database Status Endpoints
# =============================================================================

@router.get("/database/status")
async def get_database_status():
    """Get database status and migration info."""
    db_manager = get_db_manager()

    if not db_manager:
        return {
            "initialized": False,
            "message": "Database not initialized",
        }

    from .database.migrations import MigrationManager

    try:
        migration_manager = MigrationManager(db_manager._sync_engine)
        status = migration_manager.get_status()

        return {
            "initialized": True,
            "database_path": db_manager.config.db_path,
            "schema_version": status["current_version"],
            "latest_version": status["latest_version"],
            "pending_migrations": status["pending_migrations"],
            "is_current": status["is_current"],
        }
    except Exception as e:
        logger.error(f"Error getting database status: {e}")
        return {
            "initialized": True,
            "database_path": db_manager.config.db_path,
            "error": str(e),
        }


@router.post("/database/migrate")
async def run_migrations():
    """Run pending database migrations."""
    db_manager = get_db_manager()

    if not db_manager:
        raise HTTPException(status_code=500, detail="Database not initialized")

    from .database.migrations import MigrationManager

    try:
        migration_manager = MigrationManager(db_manager._sync_engine)
        applied = migration_manager.migrate_to_latest()

        return {
            "success": True,
            "migrations_applied": applied,
            "current_version": migration_manager.get_current_version(),
        }
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise HTTPException(status_code=500, detail=f"Migration failed: {e}")


# =============================================================================
# Terrain & Viewshed Endpoints
# =============================================================================

class ElevationRequest(BaseModel):
    """Request elevation at a point."""
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class TerrainProfileRequest(BaseModel):
    """Request terrain profile between two points."""
    lat1: float = Field(..., ge=-90, le=90)
    lon1: float = Field(..., ge=-180, le=180)
    lat2: float = Field(..., ge=-90, le=90)
    lon2: float = Field(..., ge=-180, le=180)
    num_points: int = Field(100, ge=10, le=1000)


class LOSCheckRequest(BaseModel):
    """Request line-of-sight check between two points."""
    lat1: float = Field(..., ge=-90, le=90)
    lon1: float = Field(..., ge=-180, le=180)
    height1_m: float = Field(..., ge=0, le=1000)
    lat2: float = Field(..., ge=-90, le=90)
    lon2: float = Field(..., ge=-180, le=180)
    height2_m: float = Field(..., ge=0, le=1000)
    num_points: int = Field(200, ge=10, le=1000)


class ViewshedRequest(BaseModel):
    """Request viewshed computation."""
    center_lat: float = Field(..., ge=-90, le=90)
    center_lon: float = Field(..., ge=-180, le=180)
    observer_height_m: float = Field(5.0, ge=0, le=100)
    radius_m: float = Field(3000, ge=100, le=20000)
    target_height_m: float = Field(50.0, ge=0, le=500)
    num_radials: int = Field(360, ge=36, le=720)
    distance_step_m: float = Field(50.0, ge=10, le=500)


class PreDownloadRequest(BaseModel):
    """Request to pre-download terrain data for a site."""
    boundary: List[Dict[str, float]]
    buffer_m: float = Field(1000.0, ge=0, le=10000)


def _get_terrain_manager():
    """Get the terrain manager singleton."""
    from .terrain import get_terrain_manager
    return get_terrain_manager()


def _viewshed_cache_key(req: ViewshedRequest) -> str:
    """Generate a cache key for a viewshed request."""
    key = (
        f"{req.center_lat:.6f}_{req.center_lon:.6f}_"
        f"{req.observer_height_m}_{req.radius_m}_"
        f"{req.target_height_m}_{req.num_radials}_{req.distance_step_m}"
    )
    return hashlib.md5(key.encode()).hexdigest()


# In-memory cache for viewshed results (PNG bytes + geo bounds)
_viewshed_cache: Dict[str, Dict] = {}


@router.get("/terrain/elevation")
async def get_elevation(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """
    Get terrain elevation at a single point.

    Returns elevation in meters above sea level from SRTM 30m data.
    """
    tm = _get_terrain_manager()
    elevation = tm.get_elevation(lat, lon)

    if elevation is None:
        raise HTTPException(
            status_code=404,
            detail="Elevation data not available for this location",
        )

    return {
        "lat": lat,
        "lon": lon,
        "elevation_m": round(elevation, 1),
    }


@router.post("/terrain/profile")
async def get_terrain_profile(request: TerrainProfileRequest):
    """
    Get terrain elevation profile between two points.

    Returns distances, elevations, and lat/lon arrays for plotting.
    """
    tm = _get_terrain_manager()
    profile = tm.get_terrain_profile(
        request.lat1, request.lon1,
        request.lat2, request.lon2,
        num_points=request.num_points,
    )

    return profile


@router.post("/terrain/los-check")
async def check_line_of_sight(request: LOSCheckRequest):
    """
    Check line-of-sight between two points at given heights AGL.

    Returns visibility status, obstruction info, and clearance profile.
    """
    tm = _get_terrain_manager()
    result = tm.check_line_of_sight(
        request.lat1, request.lon1, request.height1_m,
        request.lat2, request.lon2, request.height2_m,
        num_points=request.num_points,
    )

    return {
        "is_visible": result["is_visible"],
        "obstruction_distance_m": result["obstruction_distance_m"],
        "obstruction_elevation_m": result["obstruction_elevation_m"],
        "profile": result["profile"],
        "los_clearance_m": result["los_clearance_m"],
    }


@router.post("/terrain/viewshed")
async def compute_viewshed(request: ViewshedRequest):
    """
    Compute viewshed (LOS/NLOS) from an observer position.

    This is a CPU-intensive operation that may take 1-5 seconds depending
    on radius and resolution. Results are cached.

    Returns viewshed statistics and a cache key for retrieving the
    PNG overlay image.
    """
    cache_key = _viewshed_cache_key(request)

    # Check cache
    if cache_key in _viewshed_cache:
        cached = _viewshed_cache[cache_key]
        return {
            "cache_key": cache_key,
            "cached": True,
            "stats": cached["stats"],
            "bounds": cached["bounds"],
            "center": cached["center"],
            "observer_ground_elevation_m": cached["observer_ground_elevation_m"],
            "image_url": f"/api/v2/terrain/viewshed/{cache_key}/image",
            "geojson_url": f"/api/v2/terrain/viewshed/{cache_key}/geojson",
        }

    tm = _get_terrain_manager()

    # Compute viewshed
    result = tm.compute_viewshed(
        center_lat=request.center_lat,
        center_lon=request.center_lon,
        observer_height_m=request.observer_height_m,
        radius_m=request.radius_m,
        target_height_m=request.target_height_m,
        num_radials=request.num_radials,
        distance_step_m=request.distance_step_m,
    )

    # Generate PNG
    png_bytes, geo_bounds = tm.viewshed_to_png(result)

    # Generate GeoJSON
    geojson = tm.viewshed_to_geojson(result)

    # Cache the results
    _viewshed_cache[cache_key] = {
        "png_bytes": png_bytes,
        "geo_bounds": geo_bounds,
        "geojson": geojson,
        "stats": result["stats"],
        "bounds": result["bounds"],
        "center": result["center"],
        "observer_ground_elevation_m": result["observer_ground_elevation_m"],
    }

    # Limit cache size (evict oldest)
    if len(_viewshed_cache) > 20:
        oldest_key = next(iter(_viewshed_cache))
        del _viewshed_cache[oldest_key]

    return {
        "cache_key": cache_key,
        "cached": False,
        "stats": result["stats"],
        "bounds": result["bounds"],
        "center": result["center"],
        "observer_ground_elevation_m": result["observer_ground_elevation_m"],
        "image_url": f"/api/v2/terrain/viewshed/{cache_key}/image",
        "geojson_url": f"/api/v2/terrain/viewshed/{cache_key}/geojson",
    }


@router.get("/terrain/viewshed/{cache_key}/image")
async def get_viewshed_image(cache_key: str):
    """
    Get the viewshed PNG overlay image.

    Returns a transparent PNG that can be used as a MapLibre GL image source.
    The image shows blocked (NLOS) areas in semi-transparent red.
    """
    if cache_key not in _viewshed_cache:
        raise HTTPException(status_code=404, detail="Viewshed not found. Compute it first.")

    cached = _viewshed_cache[cache_key]

    return Response(
        content=cached["png_bytes"],
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Geo-Bounds": str(cached["geo_bounds"]),
        },
    )


@router.get("/terrain/viewshed/{cache_key}/geojson")
async def get_viewshed_geojson(cache_key: str):
    """
    Get the viewshed as GeoJSON.

    Returns a FeatureCollection with polygonal sectors for blocked areas.
    Useful for interactive styling and click events on the map.
    """
    if cache_key not in _viewshed_cache:
        raise HTTPException(status_code=404, detail="Viewshed not found. Compute it first.")

    return _viewshed_cache[cache_key]["geojson"]


@router.get("/terrain/viewshed/{cache_key}/bounds")
async def get_viewshed_bounds(cache_key: str):
    """
    Get the geographic bounds for a viewshed image.

    Returns coordinates in MapLibre GL image source format:
    [[NW_lon, NW_lat], [NE_lon, NE_lat], [SE_lon, SE_lat], [SW_lon, SW_lat]]
    """
    if cache_key not in _viewshed_cache:
        raise HTTPException(status_code=404, detail="Viewshed not found. Compute it first.")

    return _viewshed_cache[cache_key]["geo_bounds"]


@router.post("/terrain/pre-download")
async def pre_download_terrain(request: PreDownloadRequest):
    """
    Pre-download terrain tiles for a site boundary.

    Use this to prepare for offline field use. Downloads all SRTM
    tiles covering the site boundary plus a buffer.
    """
    if not request.boundary or len(request.boundary) < 3:
        raise HTTPException(
            status_code=400,
            detail="Boundary must have at least 3 points",
        )

    tm = _get_terrain_manager()
    result = tm.pre_download_site(
        boundary_polygon=request.boundary,
        buffer_m=request.buffer_m,
    )

    return result


@router.get("/terrain/cache-status")
async def get_terrain_cache_status():
    """
    Get terrain data cache status.

    Returns info about cached DEM tiles and viewshed results.
    """
    tm = _get_terrain_manager()
    srtm_cache = tm.srtm.cache_dir

    # Count cached tiles
    cached_tiles = list(srtm_cache.glob("*.hgt"))
    total_size = sum(f.stat().st_size for f in cached_tiles)

    return {
        "cache_dir": str(tm.cache_dir),
        "srtm_tiles_cached": len(cached_tiles),
        "srtm_cache_size_mb": round(total_size / (1024 * 1024), 1),
        "viewshed_results_cached": len(_viewshed_cache),
        "tile_names": [f.stem for f in cached_tiles],
    }


# ============================================================================
# RF PROPAGATION ENDPOINTS
# ============================================================================

class RFCoverageRequest(BaseModel):
    """Request RF coverage computation."""
    center_lat: float = Field(..., ge=-90, le=90)
    center_lon: float = Field(..., ge=-180, le=180)
    radius_m: float = Field(5000, ge=100, le=30000)
    resolution_m: float = Field(100, ge=25, le=500)
    target_height_m: float = Field(50.0, ge=0, le=500)
    environment: str = Field("open_field")
    cuas_placements: List[Dict[str, Any]] = Field(
        ...,
        description="List of CUAS params: lat, lon, height_agl_m, eirp_dbm, frequency_mhz, antenna_pattern, beam_width_deg, orientation_deg",
    )
    drone_params: Optional[Dict[str, Any]] = Field(None, description="Drone RF params for J/S threshold adjustment")


class LinkBudgetRequest(BaseModel):
    """Request point-to-point link budget."""
    cuas_lat: float = Field(..., ge=-90, le=90)
    cuas_lon: float = Field(..., ge=-180, le=180)
    cuas_height_m: float = Field(5.0, ge=0, le=100)
    cuas_eirp_dbm: float = Field(40.0)
    cuas_frequency_mhz: float = Field(1575.42)
    cuas_antenna_pattern: str = Field("omni")
    cuas_beam_width_deg: float = Field(360.0)
    cuas_orientation_deg: float = Field(0.0)
    cuas_min_js_ratio_db: float = Field(20.0)
    target_lat: float = Field(..., ge=-90, le=90)
    target_lon: float = Field(..., ge=-180, le=180)
    target_height_m: float = Field(50.0, ge=0, le=500)
    environment: str = Field("open_field")


def _get_propagation_engine():
    """Get the propagation engine singleton."""
    from .propagation import get_propagation_engine
    return get_propagation_engine()


# In-memory cache for RF coverage results
_rf_coverage_cache: Dict[str, Dict] = {}


@router.post("/terrain/rf-coverage")
async def compute_rf_coverage(request: RFCoverageRequest):
    """
    Compute RF coverage heatmap for CUAS placements.

    Returns image URL and statistics. Supports multi-CUAS composite coverage.
    """
    from .propagation import CUASParams, DroneRFParams

    # Build CUAS params list
    cuas_list = []
    for cp in request.cuas_placements:
        cuas_list.append(CUASParams(
            lat=cp["lat"],
            lon=cp["lon"],
            height_agl_m=cp.get("height_agl_m", 5.0),
            eirp_dbm=cp.get("eirp_dbm", 40.0),
            frequency_mhz=cp.get("frequency_mhz", 1575.42),
            antenna_gain_dbi=cp.get("antenna_gain_dbi", 6.0),
            antenna_pattern=cp.get("antenna_pattern", "omni"),
            beam_width_deg=cp.get("beam_width_deg", 360.0),
            orientation_deg=cp.get("orientation_deg", 0.0),
            min_js_ratio_db=cp.get("min_js_ratio_db", 20.0),
            name=cp.get("name"),
        ))

    # Build drone params
    drone = None
    if request.drone_params:
        dp = request.drone_params
        drone = DroneRFParams(
            c2_frequency_mhz=dp.get("c2_frequency_mhz", 2400.0),
            c2_receiver_sensitivity_dbm=dp.get("c2_receiver_sensitivity_dbm", -90.0),
            gps_receiver_type=dp.get("gps_receiver_type", "standard"),
            jam_resistance_category=dp.get("jam_resistance_category", "none"),
        )

    # Cache key
    cache_key = hashlib.md5(request.model_dump_json().encode()).hexdigest()

    engine = _get_propagation_engine()
    result = engine.compute_rf_coverage(
        cuas_list=cuas_list,
        center_lat=request.center_lat,
        center_lon=request.center_lon,
        radius_m=request.radius_m,
        resolution_m=request.resolution_m,
        target_height_m=request.target_height_m,
        drone=drone,
        environment=request.environment,
    )

    # Render PNG
    png_bytes, geo_bounds = engine.coverage_to_png(result)

    _rf_coverage_cache[cache_key] = {
        "png_bytes": png_bytes,
        "geo_bounds": geo_bounds,
        "stats": result.stats,
        "bounds": result.bounds,
    }

    return {
        "cache_key": cache_key,
        "image_url": f"/api/v2/terrain/rf-coverage/{cache_key}/image",
        "bounds": result.bounds,
        "geo_bounds": geo_bounds,
        "stats": result.stats,
    }


@router.get("/terrain/rf-coverage/{cache_key}/image")
async def get_rf_coverage_image(cache_key: str):
    """Get RF coverage heatmap PNG image."""
    if cache_key not in _rf_coverage_cache:
        raise HTTPException(status_code=404, detail="RF coverage result not found")

    png_bytes = _rf_coverage_cache[cache_key]["png_bytes"]
    return Response(content=png_bytes, media_type="image/png")


@router.post("/terrain/link-budget")
async def compute_link_budget(request: LinkBudgetRequest):
    """
    Compute point-to-point link budget from CUAS to target.

    Returns path loss, J/S ratio, LOS status, and Fresnel clearance.
    """
    from .propagation import CUASParams

    cuas = CUASParams(
        lat=request.cuas_lat,
        lon=request.cuas_lon,
        height_agl_m=request.cuas_height_m,
        eirp_dbm=request.cuas_eirp_dbm,
        frequency_mhz=request.cuas_frequency_mhz,
        antenna_pattern=request.cuas_antenna_pattern,
        beam_width_deg=request.cuas_beam_width_deg,
        orientation_deg=request.cuas_orientation_deg,
        min_js_ratio_db=request.cuas_min_js_ratio_db,
    )

    engine = _get_propagation_engine()
    result = engine.compute_link_budget(
        cuas=cuas,
        target_lat=request.target_lat,
        target_lon=request.target_lon,
        target_height_m=request.target_height_m,
        environment=request.environment,
    )

    return {
        "distance_m": round(result.distance_m, 1),
        "path_loss_db": round(result.path_loss_db, 1),
        "eirp_dbm": round(result.eirp_dbm, 1),
        "rx_power_dbm": round(result.rx_power_dbm, 1),
        "js_ratio_db": round(result.js_ratio_db, 1),
        "gps_denial_effective": result.gps_denial_effective,
        "terrain_los": result.terrain_los,
        "fresnel_clearance_pct": round(result.fresnel_clearance_pct, 1),
        "clutter_loss_db": result.clutter_loss_db,
        "gps_received_power_dbm": -130.0,
    }


# ============================================================================
# PREDICTED VS ACTUAL COMPARISON
# ============================================================================

@router.get("/sessions/{session_id}/predicted-vs-actual")
async def get_predicted_vs_actual(
    session_id: str,
    resolution_m: float = Query(100.0, ge=25, le=500),
    target_height_m: float = Query(50.0, ge=0, le=500),
    hdop_threshold: float = Query(10.0, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    Compare predicted RF coverage vs actual GPS denial from session telemetry.

    Returns confusion matrix, accuracy metrics, and overlay grid.
    Requires: CUAS placements on the session + telemetry data.
    """
    from .analysis import compute_predicted_vs_actual

    result = await compute_predicted_vs_actual(
        db=db,
        session_id=session_id,
        resolution_m=resolution_m,
        target_height_m=target_height_m,
        hdop_denied_threshold=hdop_threshold,
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Cannot compute comparison: missing placements or telemetry data",
        )

    return result


# ============================================================================
# DEEP HEALTH CHECK
# ============================================================================

@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Deep health check — verifies DB and Redis connectivity.
    Returns structured status for each subsystem.
    """
    import time as _time

    checks = {}
    overall = "healthy"

    # Database check
    try:
        from sqlalchemy import select as sa_select, func as sa_func

        t0 = _time.monotonic()
        result = await db.execute(sa_select(sa_func.count(TestSession.id)))
        session_count = result.scalar() or 0
        db_latency = round((_time.monotonic() - t0) * 1000, 1)
        checks["database"] = {
            "status": "healthy",
            "latency_ms": db_latency,
            "session_count": session_count,
        }
    except Exception as e:
        checks["database"] = {"status": "unhealthy", "error": str(e)}
        overall = "degraded"

    # Redis check
    try:
        import os as _os
        redis_url = _os.environ.get("REDIS_URL")
        if redis_url:
            from redis.asyncio import from_url as redis_from_url

            t0 = _time.monotonic()
            redis_conn = redis_from_url(redis_url)
            pong = await redis_conn.ping()
            redis_latency = round((_time.monotonic() - t0) * 1000, 1)
            await redis_conn.aclose()
            checks["redis"] = {
                "status": "healthy" if pong else "unhealthy",
                "latency_ms": redis_latency,
            }
        else:
            checks["redis"] = {"status": "not_configured"}
    except ImportError:
        checks["redis"] = {"status": "not_available", "note": "redis package not installed"}
    except Exception as e:
        checks["redis"] = {"status": "unhealthy", "error": str(e)}
        overall = "degraded"

    return {
        "status": overall,
        "checks": checks,
        "version": "2.0.0",
    }


# ============================================================================
# SDR READINGS ENDPOINTS
# ============================================================================

@router.post("/sessions/{session_id}/sdr-readings")
async def create_sdr_reading(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create an SDR reading for a session."""
    body = await request.json()
    reading = SDRReading(
        id=generate_uuid(),
        session_id=session_id,
        actor_id=body.get("actor_id"),
        timestamp=datetime.fromisoformat(body["timestamp"]) if body.get("timestamp") else datetime.utcnow(),
        lat=body.get("lat"),
        lon=body.get("lon"),
        alt_m=body.get("alt_m"),
        gps_accuracy_m=body.get("gps_accuracy_m"),
        center_frequency_mhz=body["center_frequency_mhz"],
        bandwidth_mhz=body.get("bandwidth_mhz"),
        sample_rate_mhz=body.get("sample_rate_mhz"),
        gain_db=body.get("gain_db"),
        readings=body.get("readings"),
        device_info=body.get("device_info"),
        notes=body.get("notes"),
    )
    db.add(reading)
    await db.commit()
    await db.refresh(reading)
    return {"id": reading.id, "session_id": session_id}


@router.get("/sessions/{session_id}/sdr-readings")
async def list_sdr_readings(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List SDR readings for a session."""
    from sqlalchemy import select
    result = await db.execute(
        select(SDRReading)
        .where(SDRReading.session_id == session_id)
        .order_by(SDRReading.timestamp.asc())
    )
    readings = list(result.scalars().all())
    return [
        {
            "id": r.id,
            "actor_id": r.actor_id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "lat": r.lat,
            "lon": r.lon,
            "center_frequency_mhz": r.center_frequency_mhz,
            "bandwidth_mhz": r.bandwidth_mhz,
            "gain_db": r.gain_db,
            "readings": r.readings,
            "device_info": r.device_info,
            "notes": r.notes,
        }
        for r in readings
    ]


# ============================================================================
# OPERATOR POSITIONS ENDPOINTS
# ============================================================================

@router.post("/sessions/{session_id}/operator-positions")
async def create_operator_positions(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Bulk insert operator positions (from CoT or GPS)."""
    body = await request.json()
    records = body if isinstance(body, list) else [body]

    for rec in records:
        pos = OperatorPosition(
            session_id=session_id,
            actor_id=rec["actor_id"],
            timestamp=datetime.fromisoformat(rec["timestamp"]) if rec.get("timestamp") else datetime.utcnow(),
            lat=rec["lat"],
            lon=rec["lon"],
            alt_m=rec.get("alt_m"),
            heading_deg=rec.get("heading_deg"),
            speed_mps=rec.get("speed_mps"),
            gps_accuracy_m=rec.get("gps_accuracy_m"),
            source=rec.get("source", "gps"),
        )
        db.add(pos)

    await db.commit()
    return {"inserted": len(records)}


@router.get("/sessions/{session_id}/operator-positions")
async def list_operator_positions(
    session_id: str,
    actor_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List operator positions for a session, optionally filtered by actor."""
    from sqlalchemy import select
    query = select(OperatorPosition).where(OperatorPosition.session_id == session_id)
    if actor_id:
        query = query.where(OperatorPosition.actor_id == actor_id)
    query = query.order_by(OperatorPosition.timestamp.asc())

    result = await db.execute(query)
    positions = list(result.scalars().all())
    return [
        {
            "actor_id": p.actor_id,
            "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            "lat": p.lat,
            "lon": p.lon,
            "alt_m": p.alt_m,
            "heading_deg": p.heading_deg,
            "speed_mps": p.speed_mps,
            "source": p.source,
        }
        for p in positions
    ]


# ============================================================================
# WORKSPACE LAYERS ENDPOINTS
# ============================================================================

@router.post("/workspace-layers")
async def create_workspace_layer(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a workspace layer (GeoJSON, KML, annotation)."""
    body = await request.json()
    layer = WorkspaceLayer(
        id=generate_uuid(),
        session_id=body.get("session_id"),
        site_id=body.get("site_id"),
        name=body["name"],
        layer_type=body.get("layer_type", "geojson"),
        geojson_data=body.get("geojson_data"),
        style=body.get("style"),
        visible=body.get("visible", True),
        sort_order=body.get("sort_order", 0),
    )
    db.add(layer)
    await db.commit()
    await db.refresh(layer)
    return {
        "id": layer.id,
        "name": layer.name,
        "layer_type": layer.layer_type,
    }


@router.get("/workspace-layers")
async def list_workspace_layers(
    session_id: Optional[str] = Query(None),
    site_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List workspace layers, filtered by session or site."""
    from sqlalchemy import select
    query = select(WorkspaceLayer)
    if session_id:
        query = query.where(WorkspaceLayer.session_id == session_id)
    if site_id:
        query = query.where(WorkspaceLayer.site_id == site_id)
    query = query.order_by(WorkspaceLayer.sort_order.asc())

    result = await db.execute(query)
    layers = list(result.scalars().all())
    return [
        {
            "id": l.id,
            "session_id": l.session_id,
            "site_id": l.site_id,
            "name": l.name,
            "layer_type": l.layer_type,
            "geojson_data": l.geojson_data,
            "style": l.style,
            "visible": l.visible,
            "sort_order": l.sort_order,
        }
        for l in layers
    ]


@router.put("/workspace-layers/{layer_id}")
async def update_workspace_layer(
    layer_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update a workspace layer."""
    from sqlalchemy import select
    result = await db.execute(select(WorkspaceLayer).where(WorkspaceLayer.id == layer_id))
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    body = await request.json()
    for field in ["name", "layer_type", "geojson_data", "style", "visible", "sort_order"]:
        if field in body:
            setattr(layer, field, body[field])

    await db.commit()
    return {"id": layer.id, "name": layer.name}


@router.delete("/workspace-layers/{layer_id}")
async def delete_workspace_layer(
    layer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a workspace layer."""
    from sqlalchemy import select, delete as sa_delete
    result = await db.execute(select(WorkspaceLayer).where(WorkspaceLayer.id == layer_id))
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    await db.delete(layer)
    await db.commit()
    return {"success": True}


# ============================================================================
# MEDIA ATTACHMENTS ENDPOINTS
# ============================================================================

@router.post("/media-attachments")
async def create_media_attachment(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a media attachment (file must already be stored on disk)."""
    body = await request.json()
    attachment = MediaAttachment(
        id=generate_uuid(),
        session_id=body.get("session_id"),
        site_id=body.get("site_id"),
        entity_type=body.get("entity_type"),
        entity_id=body.get("entity_id"),
        file_path=body["file_path"],
        file_name=body["file_name"],
        mime_type=body.get("mime_type"),
        file_size_bytes=body.get("file_size_bytes"),
        thumbnail_path=body.get("thumbnail_path"),
        caption=body.get("caption"),
        lat=body.get("lat"),
        lon=body.get("lon"),
        taken_at=datetime.fromisoformat(body["taken_at"]) if body.get("taken_at") else None,
        uploaded_by=body.get("uploaded_by"),
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return {"id": attachment.id, "file_name": attachment.file_name}


@router.get("/media-attachments")
async def list_media_attachments(
    session_id: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List media attachments filtered by session or entity."""
    from sqlalchemy import select
    query = select(MediaAttachment)
    if session_id:
        query = query.where(MediaAttachment.session_id == session_id)
    if entity_type:
        query = query.where(MediaAttachment.entity_type == entity_type)
    if entity_id:
        query = query.where(MediaAttachment.entity_id == entity_id)
    query = query.order_by(MediaAttachment.created_at.desc())

    result = await db.execute(query)
    attachments = list(result.scalars().all())
    return [
        {
            "id": a.id,
            "session_id": a.session_id,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "file_path": a.file_path,
            "file_name": a.file_name,
            "mime_type": a.mime_type,
            "file_size_bytes": a.file_size_bytes,
            "caption": a.caption,
            "lat": a.lat,
            "lon": a.lon,
            "taken_at": a.taken_at.isoformat() if a.taken_at else None,
            "uploaded_by": a.uploaded_by,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in attachments
    ]


# ============================================================================
# TRACKER ALIASES ENDPOINTS
# ============================================================================

@router.get("/tracker-aliases")
async def list_tracker_aliases(
    db: AsyncSession = Depends(get_db),
):
    """List all tracker aliases."""
    from sqlalchemy import select
    result = await db.execute(select(TrackerAlias).order_by(TrackerAlias.tracker_id))
    aliases = list(result.scalars().all())
    return [
        {
            "id": a.id,
            "tracker_id": a.tracker_id,
            "alias": a.alias,
            "notes": a.notes,
        }
        for a in aliases
    ]


@router.put("/tracker-aliases/{tracker_id}")
async def upsert_tracker_alias(
    tracker_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create or update a tracker alias."""
    from sqlalchemy import select
    body = await request.json()

    result = await db.execute(
        select(TrackerAlias).where(TrackerAlias.tracker_id == tracker_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.alias = body["alias"]
        if "notes" in body:
            existing.notes = body["notes"]
    else:
        alias = TrackerAlias(
            tracker_id=tracker_id,
            alias=body["alias"],
            notes=body.get("notes"),
        )
        db.add(alias)

    await db.commit()
    return {"tracker_id": tracker_id, "alias": body["alias"]}


@router.delete("/tracker-aliases/{tracker_id}")
async def delete_tracker_alias(
    tracker_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a tracker alias."""
    from sqlalchemy import select
    result = await db.execute(
        select(TrackerAlias).where(TrackerAlias.tracker_id == tracker_id)
    )
    existing = result.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Alias not found")

    await db.delete(existing)
    await db.commit()
    return {"success": True}
