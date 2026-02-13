"""
Metrics Computation Engine (Python)

Ports the TypeScript metrics-engine.ts logic to Python for cloud deployments.
Calculates CUAS effectiveness metrics from test session telemetry data.
"""

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .database.models import (
    TestSession,
    TrackerTelemetry,
    TestEvent,
    SessionMetrics,
    CUASPlacement,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Data Types
# =============================================================================

@dataclass
class PositionPoint:
    """A single telemetry point."""
    lat: float
    lon: float
    alt_m: Optional[float]
    timestamp_ms: int
    hdop: Optional[float] = None
    satellites: Optional[int] = None
    speed_mps: Optional[float] = None
    course_deg: Optional[float] = None
    fix_valid: bool = True
    rssi_dbm: Optional[float] = None
    quality: str = "good"  # good, degraded, lost


@dataclass
class DroneTrackData:
    """Track data for a single drone/tracker."""
    tracker_id: str
    points: List[PositionPoint]
    start_time_ms: int
    end_time_ms: int


@dataclass
class JammingWindow:
    """A period of active jamming."""
    start_time_ms: int
    end_time_ms: int
    duration_s: float
    cuas_id: Optional[str] = None


@dataclass
class TrackerMetricsResult:
    """Metrics computed for a single tracker."""
    session_id: str
    tracker_id: str
    total_flight_time_s: float = 0.0
    time_under_jamming_s: float = 0.0
    time_to_effect_s: Optional[float] = None
    time_to_full_denial_s: Optional[float] = None
    recovery_time_s: Optional[float] = None
    effective_range_m: Optional[float] = None
    altitude_delta_m: Optional[float] = None
    max_lateral_drift_m: Optional[float] = None
    failsafe_triggered: bool = False
    failsafe_type: Optional[str] = None
    pass_fail: str = "fail"


# =============================================================================
# Helper Functions
# =============================================================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two GPS points in meters."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) *
         math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def classify_quality(
    fix_valid: bool,
    hdop: Optional[float],
    satellites: Optional[int],
    hdop_degraded: float = 5.0,
    hdop_lost: float = 20.0,
    sats_degraded: int = 4,
    sats_lost: int = 2,
) -> str:
    """Classify GPS quality based on fix validity, HDOP, and satellite count."""
    if not fix_valid:
        return "lost"
    if hdop is not None and hdop > hdop_lost:
        return "lost"
    if hdop is not None and hdop > hdop_degraded:
        return "degraded"
    if satellites is not None and satellites < sats_lost:
        return "lost"
    if satellites is not None and satellites < sats_degraded:
        return "degraded"
    return "good"


# =============================================================================
# Core Analysis Functions
# =============================================================================

def extract_jamming_windows(events: List[dict]) -> List[JammingWindow]:
    """Extract jamming windows from session events."""
    windows: List[JammingWindow] = []
    jam_start_time: Optional[int] = None
    current_cuas_id: Optional[str] = None

    for event in events:
        event_type = event.get("type", "")
        timestamp_str = event.get("timestamp", "")
        try:
            ts_ms = int(datetime.fromisoformat(timestamp_str.replace("Z", "+00:00")).timestamp() * 1000)
        except (ValueError, AttributeError):
            continue

        if event_type == "jam_on":
            jam_start_time = ts_ms
            current_cuas_id = event.get("cuas_id")
        elif event_type == "jam_off" and jam_start_time is not None:
            windows.append(JammingWindow(
                start_time_ms=jam_start_time,
                end_time_ms=ts_ms,
                duration_s=(ts_ms - jam_start_time) / 1000,
                cuas_id=current_cuas_id,
            ))
            jam_start_time = None
            current_cuas_id = None

    # Handle unclosed jamming window
    if jam_start_time is not None and events:
        last_ts_str = events[-1].get("timestamp", "")
        try:
            last_ts = int(datetime.fromisoformat(last_ts_str.replace("Z", "+00:00")).timestamp() * 1000)
            windows.append(JammingWindow(
                start_time_ms=jam_start_time,
                end_time_ms=last_ts,
                duration_s=(last_ts - jam_start_time) / 1000,
                cuas_id=current_cuas_id,
            ))
        except (ValueError, AttributeError):
            pass

    return windows


def calculate_time_to_effect(
    events: List[dict],
    track_data: DroneTrackData,
) -> Optional[float]:
    """Time from jam_on until first GPS degradation."""
    jam_on = next((e for e in events if e.get("type") == "jam_on"), None)
    if not jam_on:
        return None

    try:
        jam_start = int(datetime.fromisoformat(
            jam_on["timestamp"].replace("Z", "+00:00")
        ).timestamp() * 1000)
    except (ValueError, KeyError):
        return None

    for p in track_data.points:
        if p.timestamp_ms >= jam_start and p.quality in ("degraded", "lost"):
            return (p.timestamp_ms - jam_start) / 1000

    return None


def calculate_time_to_full_denial(
    events: List[dict],
    track_data: DroneTrackData,
) -> Optional[float]:
    """Time from jam_on until complete GPS loss."""
    jam_on = next((e for e in events if e.get("type") == "jam_on"), None)
    if not jam_on:
        return None

    try:
        jam_start = int(datetime.fromisoformat(
            jam_on["timestamp"].replace("Z", "+00:00")
        ).timestamp() * 1000)
    except (ValueError, KeyError):
        return None

    for p in track_data.points:
        if p.timestamp_ms >= jam_start and p.quality == "lost":
            return (p.timestamp_ms - jam_start) / 1000

    return None


def calculate_recovery_time(
    events: List[dict],
    track_data: DroneTrackData,
) -> Optional[float]:
    """Time from jam_off until GPS is restored."""
    jam_off = next((e for e in events if e.get("type") == "jam_off"), None)
    if not jam_off:
        return None

    try:
        jam_end = int(datetime.fromisoformat(
            jam_off["timestamp"].replace("Z", "+00:00")
        ).timestamp() * 1000)
    except (ValueError, KeyError):
        return None

    for p in track_data.points:
        if p.timestamp_ms >= jam_end and p.quality == "good":
            return (p.timestamp_ms - jam_end) / 1000

    return None


def calculate_max_lateral_drift(
    track_data: DroneTrackData,
    jamming_windows: List[JammingWindow],
) -> float:
    """Calculate maximum lateral drift during jamming."""
    max_drift = 0.0

    for window in jamming_windows:
        pre_jam = [
            p for p in track_data.points
            if window.start_time_ms - 5000 <= p.timestamp_ms < window.start_time_ms
        ]
        if not pre_jam:
            continue

        avg_lat = sum(p.lat for p in pre_jam) / len(pre_jam)
        avg_lon = sum(p.lon for p in pre_jam) / len(pre_jam)

        jam_points = [
            p for p in track_data.points
            if window.start_time_ms <= p.timestamp_ms <= window.end_time_ms
        ]

        for p in jam_points:
            drift = haversine_distance(avg_lat, avg_lon, p.lat, p.lon)
            max_drift = max(max_drift, drift)

    return round(max_drift, 1)


def calculate_altitude_delta(
    track_data: DroneTrackData,
    jamming_windows: List[JammingWindow],
) -> float:
    """Calculate altitude delta during jamming."""
    max_delta = 0.0

    for window in jamming_windows:
        pre_jam = [
            p for p in track_data.points
            if window.start_time_ms - 5000 <= p.timestamp_ms < window.start_time_ms
            and p.alt_m is not None
        ]
        if not pre_jam:
            continue

        avg_alt = sum(p.alt_m for p in pre_jam) / len(pre_jam)

        jam_points = [
            p for p in track_data.points
            if window.start_time_ms <= p.timestamp_ms <= window.end_time_ms
            and p.alt_m is not None
        ]

        for p in jam_points:
            delta = abs(p.alt_m - avg_alt)
            max_delta = max(max_delta, delta)

    return round(max_delta, 1)


def calculate_effective_range(
    cuas_lat: float,
    cuas_lon: float,
    events: List[dict],
    track_data: DroneTrackData,
) -> Optional[float]:
    """Calculate effective range from CUAS to drone at first effect."""
    jam_on = next((e for e in events if e.get("type") == "jam_on"), None)
    if not jam_on:
        return None

    try:
        jam_start = int(datetime.fromisoformat(
            jam_on["timestamp"].replace("Z", "+00:00")
        ).timestamp() * 1000)
    except (ValueError, KeyError):
        return None

    # Find drone position at jam start (within 1 second)
    drone_at_jam = next(
        (p for p in track_data.points
         if jam_start <= p.timestamp_ms <= jam_start + 1000),
        None,
    )
    if not drone_at_jam:
        return None

    return round(haversine_distance(cuas_lat, cuas_lon, drone_at_jam.lat, drone_at_jam.lon))


def determine_pass_fail(
    time_to_effect: Optional[float],
    max_drift: Optional[float],
    failsafe_triggered: bool,
) -> str:
    """Determine pass/fail status."""
    if time_to_effect is not None and time_to_effect < 30:
        return "pass"
    if failsafe_triggered:
        return "pass"
    if max_drift is not None and max_drift > 100:
        return "partial"
    return "fail"


# =============================================================================
# Main Analysis Entry Point
# =============================================================================

def analyze_tracker(
    session_id: str,
    tracker_id: str,
    track_data: DroneTrackData,
    events: List[dict],
    cuas_positions: Dict[str, Tuple[float, float]],
) -> TrackerMetricsResult:
    """Compute all metrics for a single tracker in a session."""
    jamming_windows = extract_jamming_windows(events)
    total_jamming = sum(w.duration_s for w in jamming_windows)

    time_to_effect = calculate_time_to_effect(events, track_data)
    time_to_full_denial = calculate_time_to_full_denial(events, track_data)
    recovery_time = calculate_recovery_time(events, track_data)
    max_drift = calculate_max_lateral_drift(track_data, jamming_windows)
    alt_delta = calculate_altitude_delta(track_data, jamming_windows)

    # Effective range from first CUAS
    effective_range = None
    if cuas_positions:
        first_cuas_id = next(iter(cuas_positions))
        lat, lon = cuas_positions[first_cuas_id]
        effective_range = calculate_effective_range(lat, lon, events, track_data)

    # Detect failsafe from events
    failsafe_event = next((e for e in events if e.get("type") == "failsafe"), None)
    failsafe_triggered = failsafe_event is not None
    failsafe_type = failsafe_event.get("metadata", {}).get("failsafe_type") if failsafe_event else None

    pass_fail = determine_pass_fail(time_to_effect, max_drift, failsafe_triggered)

    flight_time = (track_data.end_time_ms - track_data.start_time_ms) / 1000

    return TrackerMetricsResult(
        session_id=session_id,
        tracker_id=tracker_id,
        total_flight_time_s=flight_time,
        time_under_jamming_s=total_jamming,
        time_to_effect_s=time_to_effect,
        time_to_full_denial_s=time_to_full_denial,
        recovery_time_s=recovery_time,
        effective_range_m=effective_range,
        altitude_delta_m=alt_delta,
        max_lateral_drift_m=max_drift,
        failsafe_triggered=failsafe_triggered,
        failsafe_type=failsafe_type,
        pass_fail=pass_fail,
    )


def aggregate_session_metrics(
    tracker_results: List[TrackerMetricsResult],
) -> dict:
    """Aggregate per-tracker results into session-level metrics."""
    if not tracker_results:
        return {
            "total_flight_time_s": 0,
            "time_under_jamming_s": 0,
            "failsafe_triggered": False,
            "pass_fail": "fail",
        }

    times_to_effect = [r.time_to_effect_s for r in tracker_results if r.time_to_effect_s is not None]
    times_to_denial = [r.time_to_full_denial_s for r in tracker_results if r.time_to_full_denial_s is not None]
    recovery_times = [r.recovery_time_s for r in tracker_results if r.recovery_time_s is not None]
    ranges = [r.effective_range_m for r in tracker_results if r.effective_range_m is not None]
    drifts = [r.max_lateral_drift_m for r in tracker_results if r.max_lateral_drift_m is not None]
    alt_deltas = [r.altitude_delta_m for r in tracker_results if r.altitude_delta_m is not None]

    pass_fails = [r.pass_fail for r in tracker_results]
    overall = "fail"
    if "pass" in pass_fails:
        overall = "pass"
    elif "partial" in pass_fails:
        overall = "partial"

    return {
        "total_flight_time_s": max(r.total_flight_time_s for r in tracker_results),
        "time_under_jamming_s": max(r.time_under_jamming_s for r in tracker_results),
        "time_to_effect_s": min(times_to_effect) if times_to_effect else None,
        "time_to_full_denial_s": min(times_to_denial) if times_to_denial else None,
        "recovery_time_s": max(recovery_times) if recovery_times else None,
        "effective_range_m": min(ranges) if ranges else None,
        "altitude_delta_m": max(alt_deltas) if alt_deltas else None,
        "max_lateral_drift_m": max(drifts) if drifts else None,
        "failsafe_triggered": any(r.failsafe_triggered for r in tracker_results),
        "failsafe_type": next((r.failsafe_type for r in tracker_results if r.failsafe_type), None),
        "pass_fail": overall,
    }


# =============================================================================
# Database-backed Analysis
# =============================================================================

async def compute_session_metrics(
    db: AsyncSession,
    session_id: str,
) -> Optional[dict]:
    """
    Compute metrics for a session from database telemetry.
    This is the Python-backend equivalent of autoComputeOnSessionComplete().
    """
    # Fetch session
    result = await db.execute(
        select(TestSession).where(TestSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        logger.warning(f"Session {session_id} not found")
        return None

    # Fetch telemetry
    telemetry_result = await db.execute(
        select(TrackerTelemetry)
        .where(TrackerTelemetry.session_id == session_id)
        .order_by(TrackerTelemetry.time_local_received)
    )
    telemetry_rows = telemetry_result.scalars().all()

    if not telemetry_rows:
        logger.warning(f"No telemetry for session {session_id}")
        return None

    # Group telemetry by tracker
    tracker_points: Dict[str, List[PositionPoint]] = {}
    for row in telemetry_rows:
        tid = row.tracker_id
        if tid not in tracker_points:
            tracker_points[tid] = []

        quality = classify_quality(
            fix_valid=bool(row.fix_valid),
            hdop=row.hdop,
            satellites=row.satellites,
        )

        tracker_points[tid].append(PositionPoint(
            lat=row.lat or 0.0,
            lon=row.lon or 0.0,
            alt_m=row.alt_m,
            timestamp_ms=int(row.time_local_received.timestamp() * 1000),
            hdop=row.hdop,
            satellites=row.satellites,
            speed_mps=row.speed_mps,
            course_deg=row.course_deg,
            fix_valid=bool(row.fix_valid),
            rssi_dbm=row.rssi_dbm,
            quality=quality,
        ))

    # Build track data
    track_data_map: Dict[str, DroneTrackData] = {}
    for tid, points in tracker_points.items():
        if not points:
            continue
        track_data_map[tid] = DroneTrackData(
            tracker_id=tid,
            points=points,
            start_time_ms=points[0].timestamp_ms,
            end_time_ms=points[-1].timestamp_ms,
        )

    # Fetch events
    events_result = await db.execute(
        select(TestEvent)
        .where(TestEvent.session_id == session_id)
        .order_by(TestEvent.timestamp)
    )
    events = events_result.scalars().all()
    event_dicts = [
        {
            "type": e.type,
            "timestamp": e.timestamp.isoformat() if e.timestamp else "",
            "cuas_id": e.cuas_id,
            "metadata": e.event_metadata or {},
        }
        for e in events
    ]

    # Fetch CUAS placements
    placements_result = await db.execute(
        select(CUASPlacement)
        .where(CUASPlacement.session_id == session_id)
    )
    placements = placements_result.scalars().all()
    cuas_positions: Dict[str, Tuple[float, float]] = {}
    for p in placements:
        if p.cuas_profile_id and p.lat and p.lon:
            cuas_positions[p.cuas_profile_id] = (p.lat, p.lon)

    # Analyze each tracker
    tracker_results: List[TrackerMetricsResult] = []
    for tid, td in track_data_map.items():
        result = analyze_tracker(session_id, tid, td, event_dicts, cuas_positions)
        tracker_results.append(result)

    # Aggregate
    aggregated = aggregate_session_metrics(tracker_results)

    # Save to database
    existing_metrics = await db.execute(
        select(SessionMetrics).where(SessionMetrics.session_id == session_id)
    )
    metrics_row = existing_metrics.scalar_one_or_none()

    if metrics_row:
        metrics_row.total_flight_time_s = aggregated["total_flight_time_s"]
        metrics_row.time_under_jamming_s = aggregated["time_under_jamming_s"]
        metrics_row.time_to_effect_s = aggregated.get("time_to_effect_s")
        metrics_row.time_to_full_denial_s = aggregated.get("time_to_full_denial_s")
        metrics_row.recovery_time_s = aggregated.get("recovery_time_s")
        metrics_row.effective_range_m = aggregated.get("effective_range_m")
        metrics_row.max_lateral_drift_m = aggregated.get("max_lateral_drift_m")
        metrics_row.max_vertical_drift_m = aggregated.get("altitude_delta_m")
        metrics_row.pass_fail = aggregated.get("pass_fail")
        metrics_row.analyzed_at = datetime.utcnow()
        metrics_row.analysis_version = "1.0"
    else:
        metrics_row = SessionMetrics(
            session_id=session_id,
            total_flight_time_s=aggregated["total_flight_time_s"],
            time_under_jamming_s=aggregated["time_under_jamming_s"],
            time_to_effect_s=aggregated.get("time_to_effect_s"),
            time_to_full_denial_s=aggregated.get("time_to_full_denial_s"),
            recovery_time_s=aggregated.get("recovery_time_s"),
            effective_range_m=aggregated.get("effective_range_m"),
            max_lateral_drift_m=aggregated.get("max_lateral_drift_m"),
            max_vertical_drift_m=aggregated.get("altitude_delta_m"),
            pass_fail=aggregated.get("pass_fail"),
            analysis_version="1.0",
        )
        db.add(metrics_row)

    # Update session status
    session.status = "completed"
    session.metrics = aggregated

    await db.flush()

    logger.info(f"Computed metrics for session {session_id}: pass_fail={aggregated.get('pass_fail')}")
    return aggregated


# =============================================================================
# Predicted vs Actual Comparison
# =============================================================================

@dataclass
class GridCell:
    """A single cell in the comparison grid."""
    lat: float
    lon: float
    predicted_denied: bool  # Model says GPS denied here
    actual_denied: bool  # Telemetry shows GPS denied here
    has_data: bool  # Whether we have actual data for this cell


@dataclass
class PredictedVsActualResult:
    """Result of predicted vs actual comparison."""
    true_positive: int  # Predicted denied & actually denied
    true_negative: int  # Predicted not denied & actually not denied
    false_positive: int  # Predicted denied but actually not denied
    false_negative: int  # Predicted not denied but actually denied
    accuracy_pct: float
    precision_pct: float
    recall_pct: float
    grid: List[List[int]]  # 0=TN, 1=TP, 2=FP, 3=FN, -1=no data
    bounds: Dict


async def compute_predicted_vs_actual(
    db: AsyncSession,
    session_id: str,
    resolution_m: float = 100.0,
    target_height_m: float = 50.0,
    hdop_denied_threshold: float = 10.0,
) -> Optional[Dict]:
    """
    Compare ITM-predicted GPS denial zones against actual telemetry.

    Steps:
    1. Get CUAS placements for the session → compute predicted J/S coverage
    2. Get telemetry → bin GPS health into grid cells
    3. Compare predicted vs actual at each cell

    Returns dict with confusion matrix, accuracy, and grid overlay.
    """
    from .propagation import CUASParams, get_propagation_engine

    # Load session with placements
    session = await db.get(TestSession, session_id)
    if not session:
        return None

    # Load CUAS placements
    placement_rows = (await db.execute(
        select(CUASPlacement).where(CUASPlacement.session_id == session_id)
    )).scalars().all()

    if not placement_rows:
        logger.warning(f"No CUAS placements for session {session_id}")
        return None

    # Load telemetry
    telem_rows = (await db.execute(
        select(TrackerTelemetry)
        .where(TrackerTelemetry.session_id == session_id)
        .order_by(TrackerTelemetry.time_local_received)
    )).scalars().all()

    if not telem_rows:
        logger.warning(f"No telemetry for session {session_id}")
        return None

    # Build CUAS params from placements
    cuas_list = []
    for p in placement_rows:
        # Load CUAS profile for RF params
        from .database.models import CUASProfile
        profile = await db.get(CUASProfile, p.cuas_profile_id) if p.cuas_profile_id else None

        cuas_list.append(CUASParams(
            lat=p.lat,
            lon=p.lon,
            height_agl_m=p.height_agl_m or 5.0,
            eirp_dbm=profile.eirp_dbm if profile and profile.eirp_dbm else 40.0,
            frequency_mhz=1575.42,  # GPS L1
            antenna_pattern=profile.antenna_pattern if profile and profile.antenna_pattern else "omni",
            beam_width_deg=profile.beam_width_deg if profile and profile.beam_width_deg else 360.0,
            orientation_deg=p.orientation_deg or 0.0,
            min_js_ratio_db=profile.min_js_ratio_db if profile and profile.min_js_ratio_db else 20.0,
        ))

    # Determine area bounds from telemetry
    valid_lats = [t.lat for t in telem_rows if t.lat is not None]
    valid_lons = [t.lon for t in telem_rows if t.lon is not None]
    if not valid_lats or not valid_lons:
        return None

    min_lat = min(valid_lats) - 0.005
    max_lat = max(valid_lats) + 0.005
    min_lon = min(valid_lons) - 0.005
    max_lon = max(valid_lons) + 0.005
    center_lat = (min_lat + max_lat) / 2
    center_lon = (min_lon + max_lon) / 2

    # Compute predicted coverage
    engine = get_propagation_engine()
    radius_m = max(
        _haversine(center_lat, center_lon, min_lat, min_lon),
        _haversine(center_lat, center_lon, max_lat, max_lon),
    ) + 500

    coverage = engine.compute_rf_coverage(
        cuas_list=cuas_list,
        center_lat=center_lat,
        center_lon=center_lon,
        radius_m=radius_m,
        resolution_m=resolution_m,
        target_height_m=target_height_m,
    )

    # Build actual denial grid from telemetry
    import numpy as np

    n_rows, n_cols = coverage.effectiveness_grid.shape
    lat_step = (coverage.bounds["max_lat"] - coverage.bounds["min_lat"]) / n_rows
    lon_step = (coverage.bounds["max_lon"] - coverage.bounds["min_lon"]) / n_cols

    # Count denied / total per cell
    denied_counts = np.zeros((n_rows, n_cols), dtype=int)
    total_counts = np.zeros((n_rows, n_cols), dtype=int)

    for t in telem_rows:
        if t.lat is None or t.lon is None:
            continue

        r = int((t.lat - coverage.bounds["min_lat"]) / lat_step)
        c = int((t.lon - coverage.bounds["min_lon"]) / lon_step)
        r = max(0, min(r, n_rows - 1))
        c = max(0, min(c, n_cols - 1))

        total_counts[r, c] += 1

        # Determine if this point shows GPS denial
        is_denied = False
        if not t.fix_valid:
            is_denied = True
        elif t.hdop is not None and t.hdop > hdop_denied_threshold:
            is_denied = True

        if is_denied:
            denied_counts[r, c] += 1

    # Build comparison grid
    # -1=no data, 0=TN, 1=TP, 2=FP, 3=FN
    comparison_grid = np.full((n_rows, n_cols), -1, dtype=int)

    tp = fp = tn = fn = 0

    for r in range(n_rows):
        for c in range(n_cols):
            if total_counts[r, c] == 0:
                continue  # No telemetry data in this cell

            predicted_denied = coverage.effectiveness_grid[r, c] >= 2
            actual_denied = (denied_counts[r, c] / total_counts[r, c]) > 0.5

            if predicted_denied and actual_denied:
                comparison_grid[r, c] = 1  # True positive
                tp += 1
            elif not predicted_denied and not actual_denied:
                comparison_grid[r, c] = 0  # True negative
                tn += 1
            elif predicted_denied and not actual_denied:
                comparison_grid[r, c] = 2  # False positive
                fp += 1
            else:
                comparison_grid[r, c] = 3  # False negative
                fn += 1

    total = tp + tn + fp + fn
    accuracy = (tp + tn) / max(total, 1) * 100
    precision = tp / max(tp + fp, 1) * 100
    recall = tp / max(tp + fn, 1) * 100

    return {
        "true_positive": tp,
        "true_negative": tn,
        "false_positive": fp,
        "false_negative": fn,
        "accuracy_pct": round(accuracy, 1),
        "precision_pct": round(precision, 1),
        "recall_pct": round(recall, 1),
        "total_cells_with_data": total,
        "grid": comparison_grid.tolist(),
        "grid_size": [n_rows, n_cols],
        "bounds": coverage.bounds,
        "predicted_stats": coverage.stats,
    }


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in meters."""
    R = 6_371_000.0
    lat1_r, lon1_r = math.radians(lat1), math.radians(lon1)
    lat2_r, lon2_r = math.radians(lat2), math.radians(lon2)
    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))
