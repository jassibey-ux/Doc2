/**
 * CSV parser for tracker log files.
 * Supports flexible column mapping for multiple CSV formats.
 */

import { TrackerRecord } from './models';

/** Field name mappings for flexible CSV parsing */
const FIELD_MAPPINGS: Record<string, string[]> = {
  tracker_id: [
    'tracker_id', 'id', 'tracker', 'device_id', 'unit_id', 'unique_id', 'unique id',
    'report_stationid', 'user_loggerid', 'logger_id', 'loggerid', 'station_id', 'stationid',
  ],
  time: [
    'time', 'timestamp', 'datetime', 'time_local', 'received_time',
    'time local received', 'time_local_received',
    'measurement_datetime', 'measurement_receiveddatetime',
  ],
  time_gps: ['time_gps', 'gps_time', 'gps_timestamp'],
  lat: ['lat', 'latitude', 'gps_lat'],
  lon: ['lon', 'lng', 'longitude', 'gps_lon'],
  alt: ['alt', 'altitude', 'alt_m', 'altitude_m', 'gps_alt'],
  speed: ['speed', 'speed_mps', 'speed_m_s', 'gps_sog', 'sog'],
  course: ['course', 'heading', 'course_deg', 'gps_cog', 'cog'],
  hdop: ['hdop', 'dop', 'gps_hdop'],
  satellites: ['satellites', 'sats', 'num_sats', 'gps_satellites', 'sat_count', 'numsat'],
  fix_valid: [
    'fix_valid', 'fix', 'gps_fix', 'valid', 'gps_fix_valid', 'gps fix valid',
    'gps_fixvalid', 'fixvalid',
  ],
  rssi: ['rssi', 'rssi_dbm', 'signal', 'rf_rssi'],
  time_received: [
    'time_received', 'received_time', 'rx_time', 'receive_time',
    'measurement_receiveddatetime', 'received_datetime',
  ],
  baro_alt: [
    'baro_alt', 'baro_altitude', 'baro_alt_m', 'barometric_altitude', 'barometric altitude',
    'barometer_altitude',
  ],
  baro_temp: ['baro_temp', 'baro_temperature', 'temp_c', 'barometer_temperature'],
  baro_press: ['baro_press', 'baro_pressure', 'pressure_hpa', 'barometer_pressure'],
  battery_mv: ['battery_mv', 'battery', 'voltage_mv'],
};

/** Datetime formats to try when parsing */
const DATETIME_FORMATS = [
  // ISO-like formats
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})?$/,
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/,
  // US format
  /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/,
  // European format
  /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/,
];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseDatetime(value: string): string | null {
  if (!value) return null;
  value = value.trim();

  // Try ISO format first (most common)
  const isoMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (isoMatch) {
    const [, yr, mo, dy, hr, mn, sc, ms] = isoMatch;
    const msStr = ms ? `.${ms.padEnd(3, '0').slice(0, 3)}` : '.000';
    return `${yr}-${mo}-${dy}T${hr}:${mn}:${sc}${msStr}`;
  }

  // Try US format: M/D/YYYY H:M:S
  const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (usMatch) {
    const [, mo, dy, yr, hr, mn, sc] = usMatch;
    return `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}T${hr}:${mn}:${sc}.000`;
  }

  // Try European format: D/M/YYYY H:M:S
  const euMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (euMatch) {
    const [, dy, mo, yr, hr, mn, sc] = euMatch;
    return `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}T${hr}:${mn}:${sc}.000`;
  }

  // Last resort: try Date constructor
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString().replace('Z', '');
    }
  } catch {
    // ignore
  }

  return null;
}

export class CSVParser {
  private fieldIndices: Map<string, number> = new Map();

  parseCSVContent(content: string): TrackerRecord[] {
    const records: TrackerRecord[] = [];
    const lines = content.split('\n').filter((l) => l.trim());

    if (lines.length < 2) return records;

    // Parse header
    const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    this.buildFieldIndices(headers);

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const row = parseCSVLine(lines[i]);
        const record = this.parseRow(row);
        if (record) records.push(record);
      } catch {
        // Skip invalid rows
      }
    }

    return records;
  }

  private buildFieldIndices(headers: string[]): void {
    this.fieldIndices.clear();

    for (const [fieldName, variants] of Object.entries(FIELD_MAPPINGS)) {
      for (const variant of variants) {
        const idx = headers.indexOf(variant);
        if (idx !== -1) {
          this.fieldIndices.set(fieldName, idx);
          break;
        }
      }
    }
  }

  private parseRow(row: string[]): TrackerRecord | null {
    // Must have tracker_id
    if (!this.fieldIndices.has('tracker_id')) return null;

    const trackerIdIdx = this.fieldIndices.get('tracker_id')!;
    if (trackerIdIdx >= row.length) return null;

    let trackerId = row[trackerIdIdx].trim();
    if (!trackerId) return null;

    // Normalize tracker_id: remove surrounding parentheses
    trackerId = trackerId.replace(/^\((.+)\)$/, '$1');

    // Parse time
    const timeLocal = this.getDatetime(row, 'time') || new Date().toISOString();
    const timeGps = this.getDatetime(row, 'time_gps');
    const timeReceived = this.getDatetime(row, 'time_received');

    // Parse position
    const lat = this.getFloat(row, 'lat');
    const lon = this.getFloat(row, 'lon');
    const altM = this.getFloat(row, 'alt');

    // Parse speed/course
    const speedMps = this.getFloat(row, 'speed');
    const courseDeg = this.getFloat(row, 'course');

    // Parse GPS quality
    const hdop = this.getFloat(row, 'hdop');
    const satellites = this.getInt(row, 'satellites');
    const fixValid = this.getBool(row, 'fix_valid');

    // Signal strength
    const rssiDbm = this.getFloat(row, 'rssi');

    // Barometer
    const baroAltM = this.getFloat(row, 'baro_alt');
    const baroTempC = this.getFloat(row, 'baro_temp');
    const baroPressHpa = this.getFloat(row, 'baro_press');

    // Battery
    const batteryMv = this.getFloat(row, 'battery_mv');

    // Calculate latency
    let latencyMs: number | null = null;
    if (timeLocal && timeReceived) {
      const localMs = new Date(timeLocal).getTime();
      const receivedMs = new Date(timeReceived).getTime();
      if (!isNaN(localMs) && !isNaN(receivedMs)) {
        latencyMs = receivedMs - localMs;
      }
    }

    return {
      tracker_id: trackerId,
      time_local_received: timeLocal,
      time_gps: timeGps,
      time_received: timeReceived,
      lat,
      lon,
      alt_m: altM,
      speed_mps: speedMps,
      course_deg: courseDeg,
      hdop,
      satellites,
      rssi_dbm: rssiDbm,
      baro_alt_m: baroAltM,
      baro_temp_c: baroTempC,
      baro_press_hpa: baroPressHpa,
      fix_valid: fixValid,
      battery_mv: batteryMv,
      latency_ms: latencyMs,
    };
  }

  private getFloat(row: string[], field: string): number | null {
    if (!this.fieldIndices.has(field)) return null;
    const idx = this.fieldIndices.get(field)!;
    if (idx >= row.length) return null;
    const val = row[idx].trim();
    if (!val) return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  }

  private getInt(row: string[], field: string): number | null {
    if (!this.fieldIndices.has(field)) return null;
    const idx = this.fieldIndices.get(field)!;
    if (idx >= row.length) return null;
    const val = row[idx].trim();
    if (!val) return null;
    const num = Math.round(parseFloat(val));
    return isNaN(num) ? null : num;
  }

  private getBool(row: string[], field: string): boolean {
    if (!this.fieldIndices.has(field)) return false;
    const idx = this.fieldIndices.get(field)!;
    if (idx >= row.length) return false;
    const val = row[idx].trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'valid', 'ok'].includes(val);
  }

  private getDatetime(row: string[], field: string): string | null {
    if (!this.fieldIndices.has(field)) return null;
    const idx = this.fieldIndices.get(field)!;
    if (idx >= row.length) return null;
    return parseDatetime(row[idx]);
  }
}

export function parseCSVFile(content: string): TrackerRecord[] {
  const parser = new CSVParser();
  return parser.parseCSVContent(content);
}
