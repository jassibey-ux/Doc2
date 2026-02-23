/**
 * CUAS Operational Workflow Types
 * Frontend types matching backend models for:
 * Setup → Configure → Execute → Capture → Analyze → Report
 */

// =============================================================================
// Common Types
// =============================================================================

export interface GeoPoint {
  lat: number;
  lon: number;
  alt_m?: number;
}

export interface CameraState3D {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

export interface SiteReconCapture {
  id: string;
  label: string;
  imagePath: string;
  cameraState: CameraState3D;
}

// =============================================================================
// Site Definition (Step 1)
// =============================================================================

export type MarkerType = 'command_post' | 'launch_point' | 'recovery_zone' | 'observation' | 'custom';

export interface SiteMarker {
  id: string;
  name: string;
  type: MarkerType;
  position: GeoPoint;
  icon?: string;
  notes?: string;
}

export type ZoneType = 'jammer_zone' | 'approach_corridor' | 'exclusion' | 'test_area' | 'custom';

export interface SiteZone {
  id: string;
  name: string;
  type: ZoneType;
  polygon: GeoPoint[];
  color: string;
  opacity: number;
  notes?: string;
}

export type EnvironmentType = 'open_field' | 'urban' | 'suburban' | 'wooded' | 'coastal' | 'mountain';

export interface SiteDefinition {
  id: string;
  name: string;
  boundary_polygon: GeoPoint[];
  boundary?: { type: 'Polygon'; coordinates: number[][][] };
  center: GeoPoint;
  markers: SiteMarker[];
  zones: SiteZone[];
  environment_type: EnvironmentType;
  elevation_min_m?: number;
  elevation_max_m?: number;
  rf_notes?: string;
  access_notes?: string;
  photos?: string[];
  recon_status?: 'none' | 'captured' | 'stale';
  recon_captured_at?: string;
  recon_capture_count?: number;
  camera_state_3d?: CameraState3D;
  enhanced_3d?: boolean;
  thumbnail_base64?: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Drone Profiles (Step 2)
// =============================================================================

export type WeightClass = 'micro' | 'mini' | 'small' | 'medium';

export type FailsafeType = 'rth' | 'land' | 'hover' | 'atti_mode' | 'fly_away' | 'unknown';

export type FlightPlan = 'hover' | 'orbit' | 'waypoint' | 'manual' | 'free_flight';

export type JamResistanceCategory = 'none' | 'basic' | 'moderate' | 'hardened';

export interface DroneProfile {
  id: string;
  name: string;
  make: string;
  model: string;
  serial?: string;
  weight_class: WeightClass;
  frequency_bands: string[];
  expected_failsafe: FailsafeType;
  max_speed_mps?: number;
  max_altitude_m?: number;
  endurance_minutes?: number;
  // C2 link characteristics (for J/S modeling)
  c2_protocol?: string;
  c2_frequency_mhz?: number;
  c2_receiver_sensitivity_dbm?: number;
  gps_receiver_type?: string;
  jam_resistance_category?: JamResistanceCategory;
  icon?: string;
  notes?: string;
  model_3d?: string;
  created_at: string;
  updated_at: string;
}

export interface TrackerAssignment {
  id: string;
  tracker_id: string;
  drone_profile_id: string;
  session_color: string;
  target_altitude_m?: number;
  flight_plan?: FlightPlan;
  model_3d_override?: string;
  assigned_at: string;
}

// =============================================================================
// Tracker Aliases (Global persistent naming)
// =============================================================================

/**
 * TrackerAlias - Persistent custom names for tracker hardware IDs
 * These are global (not per-session) and apply everywhere the tracker appears.
 * Different from DroneProfile which describes aircraft types.
 */
export interface TrackerAlias {
  id: string;                    // Unique ID for the alias record
  tracker_id: string;            // The hardware tracker ID (e.g., "17157")
  alias: string;                 // The custom name (e.g., "North Scout")
  notes?: string;                // Optional notes about this tracker
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
}

// =============================================================================
// CUAS Profiles (Step 3)
// =============================================================================

export type CUASType = 'jammer' | 'rf_sensor' | 'radar' | 'eo_ir_camera' | 'acoustic' | 'combined';

export type AntennaPattern = 'omni' | 'directional' | 'sector';

export interface CUASProfile {
  id: string;
  name: string;
  vendor: string;
  model?: string;
  type: CUASType;
  capabilities: string[];
  effective_range_m: number;
  measured_range_m?: number;
  beam_width_deg?: number;
  vertical_coverage_deg?: number;
  antenna_pattern?: AntennaPattern;
  power_output_w?: number;
  antenna_gain_dbi?: number;
  frequency_ranges?: string[];
  // RF engineering parameters (for propagation / J/S modeling)
  eirp_dbm?: number;
  min_js_ratio_db?: number;
  polarization?: string;
  icon?: string;
  notes?: string;
  model_3d?: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Asset Placements (Vehicles & Equipment)
// =============================================================================

export interface AssetPlacement {
  id: string;
  asset_type: 'vehicle' | 'equipment';
  model_id: string;           // key into VEHICLE_MODELS or EQUIPMENT_MODELS
  label: string;
  position: GeoPoint;
  orientation_deg: number;
  notes?: string;
}

export interface CUASPlacement {
  id: string;
  cuas_profile_id: string;
  position: GeoPoint;
  height_agl_m: number;
  orientation_deg: number;
  elevation_deg?: number;
  active: boolean;
  model_3d_override?: string;
  notes?: string;
}

// =============================================================================
// Test Session (Step 4-6)
// =============================================================================

export type SessionStatus = 'planning' | 'active' | 'capturing' | 'analyzing' | 'completed' | 'archived';

export type EventType =
  | 'jam_on'
  | 'jam_off'
  | 'engage'
  | 'disengage'
  | 'engagement_aborted'
  | 'launch'
  | 'recover'
  | 'failsafe'
  | 'note'
  | 'gps_lost'
  | 'gps_acquired'
  | 'altitude_anomaly'
  | 'position_jump'
  | 'geofence_breach'
  | 'link_lost'
  | 'link_restored'
  | 'custom';

export type EventSource = 'manual' | 'auto_detected';

export interface TestEvent {
  id: string;
  type: EventType;
  timestamp: string;
  source: EventSource;
  cuas_id?: string;
  tracker_id?: string;
  engagement_id?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionMetrics {
  total_flight_time_s: number;
  time_under_jamming_s: number;
  time_to_effect_s?: number;
  time_to_full_denial_s?: number;
  recovery_time_s?: number;
  effective_range_m?: number;
  max_altitude_under_jam_m?: number;
  altitude_delta_m?: number;
  max_lateral_drift_m?: number;
  connection_loss_duration_s?: number;
  failsafe_triggered: boolean;
  failsafe_type?: FailsafeType;
  failsafe_expected?: FailsafeType;
  pass_fail?: 'pass' | 'fail' | 'partial';
}

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

// CRM Annotation types (for session-level annotations)
export type AnnotationType = 'note' | 'observation' | 'issue' | 'recommendation';

export interface SessionAnnotation {
  id: string;
  content: string;
  type: AnnotationType;
  timestamp_ref?: string;
  author?: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Session Actor Types
// =============================================================================

export type EmitterType = 'cuas_system' | 'actor';

export interface SessionActor {
  id: string;
  session_id: string;
  name: string;
  callsign?: string;
  lat?: number;
  lon?: number;
  heading_deg?: number;
  tracker_unit_id?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// Jam Burst Types
// =============================================================================

export type JamBurstSource = 'live' | 'sd_card' | 'recomputed';

export interface JamBurstTargetSnapshot {
  tracker_id: string;
  lat?: number;
  lon?: number;
  range_m?: number;
  bearing_deg?: number;
  gps_status?: string;
}

export interface JamBurst {
  id: string;
  engagement_id: string;
  burst_seq: number;
  jam_on_at: string;
  jam_off_at?: string;
  duration_s?: number;
  emitter_lat?: number;
  emitter_lon?: number;
  emitter_heading_deg?: number;
  frequency_mhz?: number;
  power_dbm?: number;
  bandwidth_mhz?: number;
  target_snapshots?: JamBurstTargetSnapshot[];
  gps_denial_detected: boolean;
  denial_onset_at?: string;
  time_to_effect_s?: number;
  source: JamBurstSource;
  notes?: string;
  created_at?: string;
}

// =============================================================================
// Engagement Types
// =============================================================================

export type EngagementStatus = 'planned' | 'active' | 'complete' | 'aborted';

export type EngagementType = 'test' | 'control' | 'operational';

export type EngagementTargetRole = 'primary_target' | 'observer';

export interface EngagementTarget {
  id: string;
  tracker_id: string;
  drone_profile_id?: string;
  role: EngagementTargetRole;
  initial_range_m?: number;
  initial_bearing_deg?: number;
  angle_off_boresight_deg?: number;
  initial_altitude_m?: number;
  drone_lat?: number;
  drone_lon?: number;
  final_range_m?: number;
  final_bearing_deg?: number;
}

export interface EngagementMetrics {
  time_to_effect_s?: number;
  time_to_full_denial_s?: number;
  denial_duration_s?: number;
  denial_consistency_pct?: number;
  recovery_time_s?: number;
  effective_range_m?: number;
  denial_bearing_deg?: number;
  denial_angle_off_boresight_deg?: number;
  min_range_m?: number;
  recovery_range_m?: number;
  max_drift_m?: number;
  max_lateral_drift_m?: number;
  max_vertical_drift_m?: number;
  altitude_change_m?: number;
  failsafe_triggered: boolean;
  failsafe_type?: string;
  pass_fail?: 'pass' | 'fail' | 'inconclusive';
  overall_score?: number;
  data_source?: 'live_only' | 'sd_merged';
  metrics_json?: Record<string, unknown>;
  analyzed_at?: string;
  // Enhanced burst-aware fields
  anchor_type?: string;
  anchor_timestamp?: string;
  denial_onset_timestamp?: string;
  reacquisition_time_s?: number;
  telemetry_loss_duration_s?: number;
  per_burst_json?: Record<string, unknown>[];
  computation_version?: string;
}

export interface Engagement {
  id: string;
  session_id: string;
  cuas_placement_id?: string;
  cuas_name?: string;
  emitter_type: EmitterType;
  emitter_id: string;
  name?: string;
  run_number?: number;
  engagement_type: EngagementType;
  status: EngagementStatus;
  engage_timestamp?: string;
  disengage_timestamp?: string;
  cuas_lat?: number;
  cuas_lon?: number;
  cuas_alt_m?: number;
  cuas_orientation_deg?: number;
  // Merged jam fields (since always 1 burst per engagement)
  jam_on_at?: string;
  jam_off_at?: string;
  jam_duration_s?: number;
  jam_frequency_mhz?: number;
  jam_power_dbm?: number;
  jam_bandwidth_mhz?: number;
  gps_denial_detected?: boolean;
  denial_onset_at?: string;
  time_to_effect_s?: number;
  notes?: string;
  targets: EngagementTarget[];
  bursts: JamBurst[];  // Empty for new engagements, populated for old ones
  metrics?: EngagementMetrics;
  created_at: string;
  updated_at: string;
}

export interface TestSession {
  id: string;
  name: string;
  site_id: string | null;
  status: SessionStatus;
  tracker_assignments: TrackerAssignment[];
  cuas_placements: CUASPlacement[];
  asset_placements?: AssetPlacement[];
  start_time?: string;
  end_time?: string;
  duration_seconds?: number;
  events: TestEvent[];
  engagements?: Engagement[];
  live_data_path?: string;
  sd_card_merged: boolean;
  sd_card_paths?: string[];
  analysis_completed: boolean;
  metrics?: SessionMetrics;
  report_path?: string;
  operator_name?: string;
  weather_notes?: string;
  post_test_notes?: string;
  classification?: string;
  // CRM Fields
  tags?: string[];
  annotations?: SessionAnnotation[];
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Test Template
// =============================================================================

export interface TestTemplate {
  id: string;
  name: string;
  site_id: string;
  drone_profile_ids: string[];
  cuas_placements: Omit<CUASPlacement, 'id'>[];
  default_target_altitude_m?: number;
  default_flight_plan?: FlightPlan;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Track Quality (for SD Card Merge)
// =============================================================================

export type GPSQuality = 'good' | 'degraded' | 'lost';

export type DataSource = 'live' | 'sd_card' | 'interpolated';

export interface EnhancedPositionPoint {
  lat: number;
  lon: number;
  alt_m: number | null;
  baro_alt_m: number | null;
  timestamp_ms: number;
  hdop: number | null;
  satellites: number | null;
  fix_valid: boolean;
  speed_mps: number | null;
  course_deg: number | null;
  rssi_dbm: number | null;
  source: DataSource;
  quality: GPSQuality;
}

export interface TrackSegment {
  tracker_id: string;
  points: EnhancedPositionPoint[];
  quality: GPSQuality | 'sd_only' | 'gap';
  start_time_ms: number;
  end_time_ms: number;
}

// =============================================================================
// Alerts
// =============================================================================

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface AlertMessage {
  id: string;
  level: AlertLevel;
  type: EventType;
  tracker_id?: string;
  cuas_id?: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

// =============================================================================
// Workflow Mode
// =============================================================================

export type WorkflowMode = 'define' | 'configure' | 'execute' | 'analyze';

// =============================================================================
// Event Colors (for timeline display)
// =============================================================================

export const EVENT_COLORS: Record<EventType, string> = {
  jam_on: '#ef4444',      // Red
  jam_off: '#f97316',     // Orange
  engage: '#06b6d4',      // Cyan
  disengage: '#8b5cf6',   // Violet
  engagement_aborted: '#f97316', // Orange
  launch: '#22c55e',      // Green
  recover: '#3b82f6',     // Blue
  failsafe: '#eab308',    // Yellow
  note: '#a855f7',        // Purple
  gps_lost: '#dc2626',    // Dark red
  gps_acquired: '#16a34a', // Dark green
  altitude_anomaly: '#f59e0b', // Amber
  position_jump: '#ec4899', // Pink
  geofence_breach: '#b91c1c', // Darker red
  link_lost: '#991b1b',   // Very dark red
  link_restored: '#166534', // Dark green
  custom: '#6b7280',      // Gray
};

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

export const EVENT_SHORTCUTS: Partial<Record<EventType, string>> = {
  engage: 'e',
  disengage: 'd',
  launch: 'l',
  recover: 'r',
  failsafe: 'f',
  note: 'n',
};
