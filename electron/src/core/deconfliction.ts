/**
 * IFF Deconfliction / Correlation Engine
 * Compares incoming detections against the blue force IFF registry to determine
 * whether a contact is friendly, hostile, unknown, or neutral. Also performs
 * proximity-based correlation against known blue trackers.
 */

import log from 'electron-log';
import {
  IFFCategory,
  IFFClassification,
  Detection,
  iffRegistry,
  UASRegistryEntry,
} from './models/iff';
import { CotEvent, getCotAffiliation, CotAffiliation } from './cot-parser';

// =============================================================================
// Types
// =============================================================================

export type DeconflictionAlertLevel = 'info' | 'warning' | 'critical';

export interface DeconflictionAlert {
  id: string;
  detection_id: string;
  tracker_id: string | null;
  level: DeconflictionAlertLevel;
  iff_category: IFFCategory;
  message: string;
  lat: number;
  lon: number;
  timestamp: string;
}

export type AlertCallback = (alert: DeconflictionAlert) => void;

/**
 * Known tracker position for proximity correlation
 */
export interface TrackerPosition {
  tracker_id: string;
  lat: number;
  lon: number;
  alt_m: number | null;
  timestamp: string;
}

export interface DeconflictionConfig {
  /** Distance in meters within which to auto-correlate with a known blue tracker */
  proximity_threshold_m: number;
  /** Maximum age in seconds for a blue tracker position to be valid for correlation */
  position_staleness_s: number;
}

const DEFAULT_CONFIG: DeconflictionConfig = {
  proximity_threshold_m: 50,
  position_staleness_s: 60,
};

// =============================================================================
// Utility: Haversine Distance
// =============================================================================

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two lat/lon points in meters.
 */
export function haversineDistanceM(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// =============================================================================
// Detection Store (in-memory rolling buffer)
// =============================================================================

const MAX_DETECTIONS = 1000;

let detectionStore: Detection[] = [];
let detectionIdCounter = 0;

function generateDetectionId(): string {
  detectionIdCounter++;
  return `det-${Date.now()}-${detectionIdCounter}`;
}

export function getRecentDetections(limit = 100): Detection[] {
  return detectionStore.slice(-limit);
}

export function getDetectionById(id: string): Detection | undefined {
  return detectionStore.find(d => d.id === id);
}

export function updateDetectionClassification(
  id: string,
  iffCategory: IFFCategory,
  notes?: string
): Detection | undefined {
  const detection = detectionStore.find(d => d.id === id);
  if (!detection) return undefined;

  detection.iff_category = iffCategory;
  detection.classification = {
    tracker_id: detection.tracker_id || '',
    iff_category: iffCategory,
    confidence: 1.0,
    matched_entry_id: null,
    reason: 'Manual operator classification',
  };
  if (notes !== undefined) {
    detection.notes = notes;
  }

  log.info(`[Deconfliction] Detection ${id} manually classified as ${iffCategory}`);
  return detection;
}

function pushDetection(detection: Detection): void {
  detectionStore.push(detection);
  // Trim to rolling window
  if (detectionStore.length > MAX_DETECTIONS) {
    detectionStore = detectionStore.slice(-MAX_DETECTIONS);
  }
}

export function clearDetections(): void {
  detectionStore = [];
}

// =============================================================================
// Deconfliction Engine
// =============================================================================

export class DeconflictionEngine {
  private config: DeconflictionConfig;
  private alertCallback: AlertCallback | null = null;
  private knownPositions: Map<string, TrackerPosition> = new Map();

  constructor(config?: Partial<DeconflictionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the callback to receive deconfliction alerts.
   */
  setAlertCallback(callback: AlertCallback): void {
    this.alertCallback = callback;
  }

  /**
   * Update config values.
   */
  updateConfig(config: Partial<DeconflictionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Feed a known blue tracker position for proximity correlation.
   * Should be called whenever a friendly tracker updates its position.
   */
  updateTrackerPosition(position: TrackerPosition): void {
    this.knownPositions.set(position.tracker_id, position);
  }

  /**
   * Remove a tracker from the known positions map.
   */
  removeTrackerPosition(trackerId: string): void {
    this.knownPositions.delete(trackerId);
  }

  /**
   * Process a CoT event through the deconfliction pipeline.
   * Returns the resulting Detection with IFF classification.
   */
  processCotEvent(event: CotEvent): Detection {
    const classification = this.classify(event.uid, event.lat, event.lon, event.type);

    const detection: Detection = {
      id: generateDetectionId(),
      tracker_id: event.uid,
      lat: event.lat,
      lon: event.lon,
      alt_m: event.alt_m,
      speed_mps: event.speed_mps,
      course_deg: event.course_deg,
      timestamp: event.timestamp,
      source: 'cot',
      iff_category: classification.iff_category,
      classification,
      raw_type: event.type,
      created_at: new Date().toISOString(),
    };

    pushDetection(detection);
    this.emitAlertIfNeeded(detection);

    return detection;
  }

  /**
   * Process a raw detection from any source (sensor, manual entry, etc.)
   */
  processDetection(params: {
    tracker_id: string | null;
    lat: number;
    lon: number;
    alt_m?: number | null;
    speed_mps?: number | null;
    course_deg?: number | null;
    source: Detection['source'];
    raw_type?: string;
    notes?: string;
  }): Detection {
    const classification = this.classify(
      params.tracker_id,
      params.lat,
      params.lon,
      params.raw_type || null
    );

    const detection: Detection = {
      id: generateDetectionId(),
      tracker_id: params.tracker_id,
      lat: params.lat,
      lon: params.lon,
      alt_m: params.alt_m ?? null,
      speed_mps: params.speed_mps ?? null,
      course_deg: params.course_deg ?? null,
      timestamp: new Date().toISOString(),
      source: params.source,
      iff_category: classification.iff_category,
      classification,
      raw_type: params.raw_type,
      notes: params.notes,
      created_at: new Date().toISOString(),
    };

    pushDetection(detection);
    this.emitAlertIfNeeded(detection);

    return detection;
  }

  // ===========================================================================
  // Classification Logic
  // ===========================================================================

  /**
   * Core classification: check IFF registry, then CoT type, then proximity.
   */
  private classify(
    trackerId: string | null,
    lat: number,
    lon: number,
    cotType: string | null
  ): IFFClassification {
    // Step 1: Direct IFF registry lookup by tracker_id
    if (trackerId) {
      const registryEntry = iffRegistry.getByTrackerId(trackerId);
      if (registryEntry) {
        return {
          tracker_id: trackerId,
          iff_category: registryEntry.iff_category,
          confidence: 1.0,
          matched_entry_id: registryEntry.id,
          reason: `Matched IFF registry entry: ${registryEntry.callsign} (${registryEntry.iff_category})`,
        };
      }
    }

    // Step 2: CoT type-based affiliation
    if (cotType) {
      const affiliation = getCotAffiliation(cotType);
      const cotCategory = this.affiliationToIFF(affiliation);

      if (cotCategory !== IFFCategory.YELLOW) {
        return {
          tracker_id: trackerId || '',
          iff_category: cotCategory,
          confidence: 0.7,
          matched_entry_id: null,
          reason: `CoT type affiliation: ${cotType} -> ${affiliation}`,
        };
      }
    }

    // Step 3: Proximity correlation against known blue trackers
    const proximityMatch = this.checkProximity(lat, lon);
    if (proximityMatch) {
      return {
        tracker_id: trackerId || '',
        iff_category: IFFCategory.BLUE,
        confidence: 0.6,
        matched_entry_id: null,
        reason: `Proximity match: within ${this.config.proximity_threshold_m}m of blue tracker ${proximityMatch.tracker_id}`,
      };
    }

    // Step 4: Default to YELLOW (unknown)
    return {
      tracker_id: trackerId || '',
      iff_category: IFFCategory.YELLOW,
      confidence: 0.0,
      matched_entry_id: null,
      reason: 'No match found in registry, CoT type, or proximity. Classified as UNKNOWN.',
    };
  }

  /**
   * Check if a position is within proximity_threshold_m of any known blue tracker.
   */
  private checkProximity(lat: number, lon: number): TrackerPosition | null {
    const now = Date.now();
    const stalenessMs = this.config.position_staleness_s * 1000;

    // Get all BLUE entries from registry
    const blueEntries = iffRegistry.getByCategory(IFFCategory.BLUE);
    const blueTrackerIds = new Set(blueEntries.map(e => e.tracker_id));

    for (const [trackerId, position] of this.knownPositions) {
      // Only consider blue-force trackers
      if (!blueTrackerIds.has(trackerId)) continue;

      // Check staleness
      const posAge = now - new Date(position.timestamp).getTime();
      if (posAge > stalenessMs) continue;

      // Check distance
      const distance = haversineDistanceM(lat, lon, position.lat, position.lon);
      if (distance <= this.config.proximity_threshold_m) {
        log.debug(
          `[Deconfliction] Proximity match: ${distance.toFixed(1)}m from blue tracker ${trackerId}`
        );
        return position;
      }
    }

    return null;
  }

  /**
   * Map CoT affiliation to IFF category.
   */
  private affiliationToIFF(affiliation: CotAffiliation): IFFCategory {
    switch (affiliation) {
      case 'friendly':
        return IFFCategory.BLUE;
      case 'hostile':
        return IFFCategory.RED;
      case 'neutral':
        return IFFCategory.GRAY;
      case 'unknown':
      case 'other':
      default:
        return IFFCategory.YELLOW;
    }
  }

  /**
   * Emit an alert if the detection warrants operator attention.
   */
  private emitAlertIfNeeded(detection: Detection): void {
    if (!this.alertCallback) return;

    let level: DeconflictionAlertLevel | null = null;
    let message = '';

    switch (detection.iff_category) {
      case IFFCategory.RED:
        level = 'critical';
        message = `HOSTILE contact detected: ${detection.tracker_id || 'unknown'} at ${detection.lat.toFixed(5)}, ${detection.lon.toFixed(5)}`;
        break;

      case IFFCategory.YELLOW:
        level = 'warning';
        message = `UNKNOWN contact detected: ${detection.tracker_id || 'unidentified'} at ${detection.lat.toFixed(5)}, ${detection.lon.toFixed(5)}`;
        break;

      case IFFCategory.BLUE:
        // Friendly - no alert needed (info level only if confidence is low)
        if (detection.classification && detection.classification.confidence < 0.8) {
          level = 'info';
          message = `Friendly contact (low confidence): ${detection.tracker_id || 'unknown'} - ${detection.classification.reason}`;
        }
        break;

      case IFFCategory.GRAY:
        level = 'info';
        message = `Neutral contact: ${detection.tracker_id || 'unknown'} at ${detection.lat.toFixed(5)}, ${detection.lon.toFixed(5)}`;
        break;
    }

    if (level) {
      const alert: DeconflictionAlert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        detection_id: detection.id,
        tracker_id: detection.tracker_id,
        level,
        iff_category: detection.iff_category,
        message,
        lat: detection.lat,
        lon: detection.lon,
        timestamp: new Date().toISOString(),
      };

      log.info(`[Deconfliction] Alert [${level}]: ${message}`);
      this.alertCallback(alert);
    }
  }
}

// Singleton instance
export const deconflictionEngine = new DeconflictionEngine();
