/**
 * Blue UAS & Event Security Types
 *
 * Types for authorized drone fleet tracking at events (stadiums, venues).
 * Supports the stakeholder dashboard (Google 3D Maps) and operator console.
 */

// =============================================================================
// UAV Classification
// =============================================================================

/** Classification of a UAV within the event airspace */
export type UAVClassification = 'blue_uas' | 'red_uas' | 'unknown';

/** Mission lifecycle status for an authorized drone */
export type MissionStatus = 'preflight' | 'active' | 'rtb' | 'landed' | 'emergency';

/** Geofence compliance state (computed from position vs zone boundaries) */
export type GeofenceCompliance = 'compliant' | 'warning' | 'breach';

// =============================================================================
// Geofence Zone Types
// =============================================================================

/** Type of geofence zone for event security */
export type GeofenceZoneType =
  | 'authorized_corridor'   // Green — drone flight allowed
  | 'restricted_airspace'   // Red — no drones (e.g., over spectators)
  | 'temporary_flight_restriction' // Orange — TFR area
  | 'emergency_zone'        // Purple — active incident response
  | 'observation_only';     // Blue — monitoring zone, no operations

export interface GeofenceZone {
  id: string;
  name: string;
  type: GeofenceZoneType;
  /** Center point for circular geofences */
  center?: { lat: number; lng: number };
  /** Radius in meters for circular geofences (generated via @turf/circle) */
  radiusM?: number;
  /** Explicit polygon coordinates (overrides center+radius) */
  polygon?: Array<{ lat: number; lng: number; altitude?: number }>;
  /** Altitude floor in meters AGL */
  minAltitudeM: number;
  /** Altitude ceiling in meters AGL */
  maxAltitudeM: number;
  /** Fill color (CSS color string) */
  fillColor: string;
  /** Stroke color */
  strokeColor: string;
  /** Fill opacity 0-1 */
  fillOpacity: number;
  /** Whether to render as extruded 3D volume */
  extruded: boolean;
  active: boolean;
}

/** Default zone colors by type */
export const GEOFENCE_COLORS: Record<GeofenceZoneType, { fill: string; stroke: string }> = {
  authorized_corridor:          { fill: 'rgba(34, 197, 94, 0.25)',  stroke: '#22c55e' },
  restricted_airspace:          { fill: 'rgba(239, 68, 68, 0.25)',  stroke: '#ef4444' },
  temporary_flight_restriction: { fill: 'rgba(249, 115, 22, 0.25)', stroke: '#f97316' },
  emergency_zone:               { fill: 'rgba(168, 85, 247, 0.25)', stroke: '#a855f7' },
  observation_only:             { fill: 'rgba(59, 130, 246, 0.20)', stroke: '#3b82f6' },
};

// =============================================================================
// Blue UAS Drone Extension
// =============================================================================

/** Extended drone info for blue UAS event tracking */
export interface BlueUASDroneInfo {
  trackerId: string;
  classification: UAVClassification;
  operatorCallsign?: string;
  missionStatus: MissionStatus;
  geofenceCompliance: GeofenceCompliance;
  /** FAA Remote ID broadcast data */
  remoteId?: {
    serialNumber?: string;
    broadcastId?: string;
    operatorLocation?: { lat: number; lng: number };
  };
  /** Assigned patrol zone ID */
  assignedZoneId?: string;
}

// =============================================================================
// Event Dashboard State
// =============================================================================

/** Summary state for the fleet status bar */
export interface FleetSummary {
  totalDrones: number;
  activeDrones: number;
  landedDrones: number;
  emergencyDrones: number;
  geofenceBreaches: number;
  overallStatus: 'nominal' | 'warning' | 'alert';
}

/** Alert for the event dashboard */
export interface EventAlert {
  id: string;
  type: 'geofence_breach' | 'battery_low' | 'signal_lost' | 'proximity_warning' | 'emergency';
  severity: 'info' | 'warning' | 'critical';
  trackerId: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}
