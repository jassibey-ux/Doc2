/**
 * NMEA parser for LoRa GPS RX proprietary format.
 * Parses both standard NMEA GPS sentences and proprietary extensions.
 */

import { TrackerRecord } from './models';

/**
 * Convert NMEA coordinate to decimal degrees.
 * Latitude: DDMM.MMMM, Longitude: DDDMM.MMMM
 */
function nmeaToDecimal(coord: string, direction: string): number | null {
  if (!coord || !direction) return null;
  try {
    const dir = direction.toUpperCase();
    let degrees: number;
    let minutes: number;

    if (dir === 'N' || dir === 'S') {
      degrees = parseInt(coord.substring(0, 2), 10);
      minutes = parseFloat(coord.substring(2));
    } else {
      degrees = parseInt(coord.substring(0, 3), 10);
      minutes = parseFloat(coord.substring(3));
    }

    let decimal = degrees + minutes / 60.0;
    if (dir === 'S' || dir === 'W') {
      decimal = -decimal;
    }
    return decimal;
  } catch {
    return null;
  }
}

interface MessageBlock {
  tracker_id?: string;
  lat?: number;
  lon?: number;
  alt_m?: number;
  speed_mps?: number;
  course_deg?: number;
  hdop?: number;
  vdop?: number;      // Vertical dilution of precision (from GPGSA)
  pdop?: number;      // Position dilution of precision (from GPGSA)
  fix_mode?: number;  // Fix mode: 1=no fix, 2=2D, 3=3D (from GPGSA)
  satellites?: number;
  rssi_dbm?: number;
  baro_alt_m?: number;
  baro_temp_c?: number;
  baro_press_hpa?: number;
  fix_valid?: boolean;
  battery_mv?: number;
  time_gps?: string;
  timestamp?: string;
}

export class NMEAParser {
  parseNMEAContent(content: string): TrackerRecord[] {
    const records: TrackerRecord[] = [];
    let currentBlock: MessageBlock = {};

    for (const rawLine of content.split('\n')) {
      let line = rawLine.trim();
      if (!line || !line.startsWith('$')) continue;

      // Remove checksum
      if (line.includes('*')) {
        line = line.split('*')[0] + '*';
      }

      try {
        const record = this.parseSentence(line, currentBlock);
        if (record) {
          records.push(record);
          currentBlock = {};
        }
      } catch {
        // Skip invalid sentences
      }
    }

    return records;
  }

  private parseSentence(sentence: string, block: MessageBlock): TrackerRecord | null {
    // Remove $ prefix and * suffix
    const cleaned = sentence.replace(/^\$/, '').replace(/\*$/, '');
    const parts = cleaned.split(',');
    if (!parts.length) return null;

    const msgType = parts[0].toUpperCase();

    switch (msgType) {
      case 'RFMSGFROM':
        if (parts.length >= 2) {
          block.tracker_id = parts[1];
        }
        break;

      case 'BAROALT':
        if (parts.length >= 3) {
          const pressurePa = parseFloat(parts[1]);
          if (!isNaN(pressurePa)) {
            block.baro_press_hpa = pressurePa / 100.0;
            block.baro_alt_m = 44330.0 * (1 - Math.pow(pressurePa / 101325.0, 0.1903));
          }
          const temp = parseFloat(parts[2]);
          if (!isNaN(temp)) {
            block.baro_temp_c = temp;
          }
        }
        break;

      case 'BATMV':
        if (parts.length >= 2) {
          const mv = parseFloat(parts[1]);
          if (!isNaN(mv)) block.battery_mv = mv;
        }
        break;

      case 'HRFSSI':
        if (parts.length >= 2) {
          const rssi = parseFloat(parts[1]);
          if (!isNaN(rssi)) block.rssi_dbm = rssi;
        }
        break;

      case 'GPGGA':
        if (parts.length >= 10) {
          const lat = nmeaToDecimal(parts[2], parts[3]);
          if (lat !== null) block.lat = lat;

          const lon = nmeaToDecimal(parts[4], parts[5]);
          if (lon !== null) block.lon = lon;

          const fixQuality = parseInt(parts[6], 10) || 0;
          block.fix_valid = fixQuality > 0;

          if (parts[7]) {
            const sats = parseInt(parts[7], 10);
            if (!isNaN(sats)) block.satellites = sats;
          }

          if (parts[8]) {
            const hdop = parseFloat(parts[8]);
            if (!isNaN(hdop)) block.hdop = hdop;
          }

          if (parts[9]) {
            const alt = parseFloat(parts[9]);
            if (!isNaN(alt)) block.alt_m = alt;
          }
        }
        break;

      case 'GPRMC':
        if (parts.length >= 10) {
          const status = (parts[2] || 'V').toUpperCase();
          if (status === 'A') {
            block.fix_valid = true;

            const lat = nmeaToDecimal(parts[3], parts[4]);
            if (lat !== null) block.lat = lat;

            const lon = nmeaToDecimal(parts[5], parts[6]);
            if (lon !== null) block.lon = lon;
          }

          if (parts[7]) {
            const speedKnots = parseFloat(parts[7]);
            if (!isNaN(speedKnots)) block.speed_mps = speedKnots * 0.514444;
          }

          if (parts[8]) {
            const course = parseFloat(parts[8]);
            if (!isNaN(course)) block.course_deg = course;
          }

          // Parse GPS time from time (field 1) and date (field 9)
          if (parts[1] && parts[9]) {
            const timeStr = parts[1].split('.')[0];
            const dateStr = parts[9];
            if (timeStr.length >= 6 && dateStr.length >= 6) {
              const hour = parseInt(timeStr.substring(0, 2), 10);
              const minute = parseInt(timeStr.substring(2, 4), 10);
              const second = parseInt(timeStr.substring(4, 6), 10);
              const day = parseInt(dateStr.substring(0, 2), 10);
              const month = parseInt(dateStr.substring(2, 4), 10);
              let year = parseInt(dateStr.substring(4, 6), 10);
              year = year < 100 ? 2000 + year : year;

              const d = new Date(year, month - 1, day, hour, minute, second);
              if (!isNaN(d.getTime())) {
                block.time_gps = d.toISOString();
              }
            }
          }
        }
        break;

      case 'RXTIMESTAMP':
        if (parts.length >= 7) {
          const year = parseInt(parts[1], 10);
          const month = parseInt(parts[2], 10);
          const day = parseInt(parts[3], 10);
          const hour = parseInt(parts[4], 10);
          const minute = parseInt(parts[5], 10);
          const secParts = parts[6].split('.');
          const second = parseInt(secParts[0], 10);
          const ms = secParts.length > 1 ? Math.round(parseFloat('0.' + secParts[1]) * 1000) : 0;

          const d = new Date(year, month - 1, day, hour, minute, second, ms);
          if (!isNaN(d.getTime())) {
            block.timestamp = d.toISOString();
          }
        }
        break;

      case 'GPSLAT':
      case 'GPS_LAT':
        if (parts.length >= 2) {
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat)) block.lat = lat;
        }
        break;

      case 'GPSLON':
      case 'GPS_LON':
        if (parts.length >= 2) {
          const lon = parseFloat(parts[1]);
          if (!isNaN(lon)) block.lon = lon;
        }
        break;

      case 'GPSALT':
      case 'GPS_ALT':
        if (parts.length >= 2) {
          const alt = parseFloat(parts[1]);
          if (!isNaN(alt)) block.alt_m = alt;
        }
        break;

      case 'GPSSPEED':
      case 'GPS_SPEED':
        if (parts.length >= 2) {
          const speed = parseFloat(parts[1]);
          if (!isNaN(speed)) block.speed_mps = speed;
        }
        break;

      case 'GPSCOURSE':
      case 'GPS_COURSE':
        if (parts.length >= 2) {
          const course = parseFloat(parts[1]);
          if (!isNaN(course)) block.course_deg = course;
        }
        break;

      case 'GPSFIX':
      case 'GPS_FIX':
        if (parts.length >= 2) {
          const val = parts[1].toLowerCase();
          block.fix_valid = ['1', 'true', 'yes', 'valid'].includes(val);
        }
        break;

      case 'RFMSGEND':
        if (block.tracker_id) {
          return this.createRecord(block);
        }
        break;

      case 'GPGSV':
        // Satellites in view - informational only, skip
        break;

      case 'GPGSA':
        // GPS DOP and active satellites
        // Format: $GPGSA,A,3,19,28,14,18,27,22,31,39,,,,,1.7,1.0,1.3*34
        //         Mode,FixType,SV1-12,PDOP,HDOP,VDOP
        // Mode: A=automatic, M=manual
        // FixType: 1=no fix, 2=2D fix, 3=3D fix
        if (parts.length >= 18) {
          // Fix type (field 2)
          const fixMode = parseInt(parts[2], 10);
          if (!isNaN(fixMode)) {
            block.fix_mode = fixMode;
            // Update fix_valid based on fix mode
            if (fixMode === 1) {
              block.fix_valid = false;
            } else if (fixMode >= 2) {
              block.fix_valid = true;
            }
          }

          // PDOP (field 15)
          const pdop = parseFloat(parts[15]);
          if (!isNaN(pdop)) {
            block.pdop = pdop;
          }

          // HDOP (field 16) - may override GPGGA value
          const hdopGsa = parseFloat(parts[16]);
          if (!isNaN(hdopGsa)) {
            // Only update if not already set from GPGGA (GPGGA is more authoritative)
            if (block.hdop === undefined) {
              block.hdop = hdopGsa;
            }
          }

          // VDOP (field 17)
          const vdop = parseFloat(parts[17]);
          if (!isNaN(vdop)) {
            block.vdop = vdop;
          }
        }
        break;
    }

    return null;
  }

  private createRecord(block: MessageBlock): TrackerRecord | null {
    if (!block.tracker_id) return null;

    const timestamp = block.timestamp || new Date().toISOString();

    return {
      tracker_id: block.tracker_id,
      time_local_received: timestamp,
      time_gps: block.time_gps || null,
      time_received: timestamp,
      lat: block.lat ?? null,
      lon: block.lon ?? null,
      alt_m: block.alt_m ?? null,
      speed_mps: block.speed_mps ?? null,
      course_deg: block.course_deg ?? null,
      hdop: block.hdop ?? null,
      satellites: block.satellites ?? null,
      rssi_dbm: block.rssi_dbm ?? null,
      baro_alt_m: block.baro_alt_m ?? null,
      baro_temp_c: block.baro_temp_c ?? null,
      baro_press_hpa: block.baro_press_hpa ?? null,
      fix_valid: block.fix_valid ?? false,
      battery_mv: block.battery_mv ?? null,
      latency_ms: null,
    };
  }
}

export function parseNMEAContent(content: string): TrackerRecord[] {
  const parser = new NMEAParser();
  return parser.parseNMEAContent(content);
}
