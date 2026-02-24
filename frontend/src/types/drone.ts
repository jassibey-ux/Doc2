/**
 * Drone/Tracker data types matching the backend models
 */

// ============================================================================
// GPS Health Monitoring Types
// ============================================================================

export type GPSFixType = '2d' | '3d' | 'no_fix' | 'unknown';
export type GPSHealthStatus = 'healthy' | 'degraded' | 'lost';

/**
 * GPS health summary for real-time display
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

/**
 * GPS fix loss event for session analysis
 */
export interface GPSFixLossEvent {
  id: string;
  lost_at: string;
  recovered_at: string | null;
  duration_ms: number;
  last_position: {
    lat: number;
    lon: number;
    alt_m: number | null;
  } | null;
  recovery_position: {
    lat: number;
    lon: number;
    alt_m: number | null;
  } | null;
  hdop_before_loss: number | null;
  satellites_before_loss: number | null;
  rssi_at_loss: number | null;
}

/**
 * Session-level GPS health metrics for analysis
 */
export interface GPSHealthMetrics {
  tracker_id: string;
  session_start_time: string;
  session_duration_ms: number;
  time_with_fix_ms: number;
  time_without_fix_ms: number;
  fix_availability_percent: number;
  fix_loss_count: number;
  fix_loss_events: GPSFixLossEvent[];
  avg_loss_duration_ms: number;
  max_loss_duration_ms: number;
  initial_time_to_fix_ms: number | null;
  avg_recovery_time_ms: number;
  hdop_stats: { min: number; max: number; avg: number; p95: number } | null;
  satellite_stats: { min: number; max: number; avg: number } | null;
  health_score: number;
}

// ============================================================================
// Tracker Data Types
// ============================================================================

export interface DroneState {
  tracker_id: string;
  alias?: string;  // Custom display name (from global tracker alias registry)
  time_local_received: string;
  time_gps: string | null;
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
  gps_health: GPSHealthSummary;
  // Camera support (future feature)
  camera_url?: string;
  camera_type?: 'hls' | 'youtube' | 'direct';
}

export interface DroneSummary {
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
  battery_mv?: number | null;
  // Telemetry for 3D visualization
  speed_mps?: number | null;
  heading_deg?: number | null;
  // Last Known Location tracking
  last_known_lat?: number | null;
  last_known_lon?: number | null;
  last_known_alt_m?: number | null;
  last_known_time?: string | null;
  stale_since?: string | null;
  // Battery status
  low_battery?: boolean;
  battery_critical?: boolean;
  // Barometric altitude (for engagement telemetry)
  baro_alt_m?: number | null;
  // GPS Health summary
  gps_health?: GPSHealthSummary;
}

export interface WebSocketMessage {
  type: 'tracker_updated' | 'tracker_stale' | 'active_event_changed' | 'config_changed' | 'replay_state' | 'new_file_detected' | 'anomaly_alert' | 'demo_mode_changed' | 'replay_frames_ready' | 'replay_frames_error' | 'replay_build_progress' | 'gps_health_alert' | 'engagement_started' | 'engagement_ended' | 'engagement_completed' | 'engagement_metrics_ready' | 'burst_opened' | 'burst_closed' | 'gps_denial_detected';
  data: Record<string, unknown>;
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

// Position history point for track trails
export interface PositionPoint {
  lat: number;
  lon: number;
  alt_m: number | null;
  timestamp: number; // Unix timestamp in ms
}

// Track history for a drone
export interface DroneTrack {
  tracker_id: string;
  positions: PositionPoint[];
}
