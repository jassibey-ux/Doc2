/**
 * Core data models for SCENSUS Dashboard.
 * All interfaces use snake_case to match the frontend API contract.
 */

// ============================================================================
// GPS Health Monitoring Types
// ============================================================================

export type GPSFixType = '2d' | '3d' | 'no_fix' | 'unknown';
export type GPSHealthStatus = 'healthy' | 'degraded' | 'lost';

/**
 * RSSI history entry for tracking signal degradation
 */
export interface RSSIHistoryEntry {
  timestamp_ms: number;
  rssi_dbm: number;
  hdop: number | null;
  satellites: number | null;
}

/**
 * GPS fix loss event - records when GPS was lost and recovered
 */
export interface GPSFixLossEvent {
  id: string;
  lost_at: string;              // ISO timestamp when fix was lost
  recovered_at: string | null;  // ISO timestamp when fix was recovered (null if still lost)
  duration_ms: number;          // Duration of loss (ongoing if not recovered)
  last_position: {              // Last known position before loss
    lat: number;
    lon: number;
    alt_m: number | null;
  } | null;
  recovery_position: {          // Position when fix was recovered
    lat: number;
    lon: number;
    alt_m: number | null;
  } | null;
  hdop_before_loss: number | null;
  satellites_before_loss: number | null;
  rssi_at_loss: number | null;
  // RSSI history before loss (last 10 values) for degradation analysis
  rssi_history_before_loss?: RSSIHistoryEntry[];
}

/**
 * Real-time GPS health state for a tracker
 */
export interface GPSHealthState {
  // Current status
  health_status: GPSHealthStatus;
  fix_valid: boolean;
  fix_type: GPSFixType;
  hdop: number | null;
  vdop: number | null;
  pdop: number | null;
  satellites: number | null;

  // Transition tracking
  fix_lost_at: string | null;       // ISO timestamp when fix was lost
  fix_acquired_at: string | null;   // ISO timestamp when fix was acquired
  last_good_fix_at: string | null;  // Last time we had healthy quality

  // Duration metrics
  current_loss_duration_ms: number | null;  // If currently lost, how long
  last_recovery_time_ms: number | null;     // Time to recover from last loss

  // Session aggregates (running totals)
  total_fix_loss_events: number;
  total_fix_loss_duration_ms: number;
  total_time_valid_ms: number;
  total_time_tracked_ms: number;
  fix_availability_percent: number;

  // Health score (0-100 composite metric)
  health_score: number;

  // Quality history for trends
  hdop_min: number | null;
  hdop_max: number | null;
  hdop_avg: number | null;
  satellites_min: number | null;
  satellites_max: number | null;
  satellites_avg: number | null;
}

/**
 * Session-level GPS health metrics for analysis
 */
export interface GPSHealthMetrics {
  tracker_id: string;
  session_start_time: string;
  session_duration_ms: number;

  // Fix validity metrics
  time_with_fix_ms: number;
  time_without_fix_ms: number;
  fix_availability_percent: number;

  // Fix loss events
  fix_loss_count: number;
  fix_loss_events: GPSFixLossEvent[];
  avg_loss_duration_ms: number;
  max_loss_duration_ms: number;

  // Time to fix metrics
  initial_time_to_fix_ms: number | null;  // Time from first data to first fix
  avg_recovery_time_ms: number;           // Average time to regain fix after loss

  // Quality metrics
  hdop_stats: { min: number; max: number; avg: number; p95: number } | null;
  satellite_stats: { min: number; max: number; avg: number } | null;

  // Health score (0-100)
  health_score: number;
}

/**
 * Per-tracker CUAS effectiveness metrics during a test session
 * Relates GPS behavior to jamming events for effectiveness analysis
 */
export interface TrackerSessionMetrics {
  tracker_id: string;
  session_id: string;

  // Time-to-Effect: JAM_ON timestamp to GPS denial/degradation
  time_to_effect_s: number | null;        // Time to first observable effect (degradation or loss)
  time_to_full_denial_s: number | null;   // Time to complete GPS loss
  time_to_degradation_s: number | null;   // Time to HDOP crossing 2.0 threshold

  // Recovery Time: JAM_OFF to sustained GPS reacquired (5+ sec good HDOP)
  recovery_time_s: number | null;

  // RSSI Degradation Pattern: Last values before GPS loss
  rssi_history_before_loss: RSSIHistoryEntry[];

  // Effective Range: Distance from CUAS to drone when GPS denied
  effective_range_m: number | null;
  cuas_position: { lat: number; lon: number } | null;
  drone_position_at_effect: { lat: number; lon: number; alt_m: number | null } | null;

  // Denial Duration: Total seconds GPS was denied
  total_denial_duration_s: number;
  denial_event_count: number;

  // Position drift during jamming
  max_lateral_drift_m: number;
  altitude_delta_m: number;

  // GPS Quality summary during session
  gps_availability_percent: number;
  avg_hdop: number | null;
  avg_satellites: number | null;
}

/**
 * Create initial GPS health state for a new tracker
 */
export function createInitialGPSHealthState(): GPSHealthState {
  return {
    health_status: 'lost',
    fix_valid: false,
    fix_type: 'unknown',
    hdop: null,
    vdop: null,
    pdop: null,
    satellites: null,
    fix_lost_at: null,
    fix_acquired_at: null,
    last_good_fix_at: null,
    current_loss_duration_ms: null,
    last_recovery_time_ms: null,
    total_fix_loss_events: 0,
    total_fix_loss_duration_ms: 0,
    total_time_valid_ms: 0,
    total_time_tracked_ms: 0,
    fix_availability_percent: 0,
    health_score: 0,
    hdop_min: null,
    hdop_max: null,
    hdop_avg: null,
    satellites_min: null,
    satellites_max: null,
    satellites_avg: null,
  };
}

// ============================================================================
// Tracker Data Types
// ============================================================================

export interface TrackerRecord {
  tracker_id: string;
  time_local_received: string; // ISO datetime
  time_gps: string | null;
  time_received: string | null;
  lat: number | null;
  lon: number | null;
  alt_m: number | null;
  speed_mps: number | null;
  course_deg: number | null;
  hdop: number | null;
  satellites: number | null;
  rssi_dbm: number | null;
  baro_alt_m: number | null;
  baro_temp_c: number | null;
  baro_press_hpa: number | null;
  fix_valid: boolean;
  battery_mv: number | null;
  latency_ms: number | null;
}

export interface TrackerState {
  tracker_id: string;
  time_local_received: string;
  time_gps: string | null;
  time_received: string | null;
  lat: number | null;
  lon: number | null;
  alt_m: number | null;
  speed_mps: number | null;
  course_deg: number | null;
  hdop: number | null;
  satellites: number | null;
  rssi_dbm: number | null;
  baro_alt_m: number | null;
  baro_temp_c: number | null;
  baro_press_hpa: number | null;
  fix_valid: boolean;
  is_stale: boolean;
  age_seconds: number;
  battery_mv: number | null;
  latency_ms: number | null;
  // Last Known Location tracking
  last_known_lat: number | null;
  last_known_lon: number | null;
  last_known_alt_m: number | null;
  last_known_time: string | null;
  stale_since: string | null;
  // Battery status
  low_battery: boolean;
  battery_critical: boolean;
  // GPS Health tracking
  gps_health: GPSHealthState;
}

/**
 * GPS health summary for API responses (subset of full state)
 */
export interface GPSHealthSummary {
  health_status: GPSHealthStatus;
  fix_valid: boolean;
  fix_type: GPSFixType;
  hdop: number | null;
  satellites: number | null;
  current_loss_duration_ms: number | null;
  total_fix_loss_events: number;
  fix_availability_percent: number;
  health_score: number;
}

export interface TrackerSummary {
  tracker_id: string;
  alias?: string;  // Custom display name (from global tracker alias registry)
  lat: number | null;
  lon: number | null;
  alt_m: number | null;
  rssi_dbm: number | null;
  fix_valid: boolean;
  is_stale: boolean;
  age_seconds: number;
  last_update: string;
  battery_mv: number | null;
  // Telemetry for 3D visualization
  speed_mps: number | null;
  heading_deg: number | null;
  // Last Known Location tracking
  last_known_lat: number | null;
  last_known_lon: number | null;
  last_known_alt_m: number | null;
  last_known_time: string | null;
  stale_since: string | null;
  // Battery status
  low_battery: boolean;
  battery_critical: boolean;
  // Barometric altitude (for engagement telemetry)
  baro_alt_m: number | null;
  // GPS Health summary
  gps_health: GPSHealthSummary;
}

export interface HealthResponse {
  status: string;
  version: string;
  active_event: string | null;
  tracker_count: number;
  uptime_seconds: number;
}

export interface ConfigResponse {
  log_root: string;
  log_root_exists: boolean;
  has_sessions: boolean;
  active_event: string | null;
  is_configured: boolean;
  port: number;
  stale_seconds: number;
}

export interface WebSocketMessage {
  type: 'tracker_updated' | 'tracker_stale' | 'active_event_changed' | 'config_changed' | 'replay_state' | 'new_file_detected' | 'anomaly_alert' | 'demo_mode_changed' | 'gps_health_alert' | 'operator_updated' | 'cuas_geotagged' | 'sdr_captured' | 'session_created' | 'tracker_assigned' | 'cuas_placed' | 'engagement_started' | 'engagement_completed' | 'burst_opened' | 'burst_closed';
  data: Record<string, unknown>;
}

export interface SessionInfo {
  name: string;
  file_count: number;
  last_modified: string;
}

export interface ValidatePathResponse {
  valid: boolean;
  exists: boolean;
  is_directory: boolean;
  sessions: SessionInfo[];
  session_count: number;
  message: string;
}

export interface UploadResult {
  processed: number;
  errors: string[];
  trackers_found: string[];
}

export interface PositionPoint {
  lat: number;
  lon: number;
  alt_m: number | null;
  timestamp: number; // Unix timestamp in ms
}

export interface ReplayState {
  active: boolean;
  session_name: string | null;
  total_records: number;
  current_index: number;
  speed: number;
  paused: boolean;
}
