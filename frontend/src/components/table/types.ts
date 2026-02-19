/**
 * Telemetry table types — mirrors backend TrackerRecord + computed fields.
 */

export interface TelemetryRow {
  /** Unique row key: `${tracker_id}_${timestamp_ms}` */
  id: string;
  tracker_id: string;
  /** ISO 8601 local received time */
  timestamp: string;
  /** Unix ms for sorting/timeline sync */
  timestamp_ms: number;
  /** GPS time (ISO string) */
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
  battery_mv: number | null;
  latency_ms: number | null;
  gps_quality: string | null;
  /** Row falls within an engagement window */
  inEngagement?: boolean;
  /** Row falls within a jam burst window */
  inJamBurst?: boolean;
  /** Which engagement this row belongs to */
  engagement_id?: string;
  /** Is a jam burst active at this timestamp */
  jam_active?: boolean;
  /** Distance from CUAS to drone (meters) */
  cuas_distance_m?: number;
  /** Altitude change from pre-engagement baseline */
  alt_delta_m?: number;
  /** For event rows: JAM_ON, GPS_LOST, ENGAGE, DISENGAGE, etc. */
  event_type?: string;
}

/** Column preset identifiers */
export type ColumnPreset = 'overview' | 'gps' | 'signal' | 'engagement' | 'all';

export interface ColumnPresetDef {
  id: ColumnPreset;
  label: string;
  columns: string[];
}
