/**
 * KML/KMZ Import Module.
 * Parses KML/KMZ files (Google Earth format) into TrackerRecord objects.
 */

import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import log from 'electron-log';
import { TrackerRecord } from './models';

const KML_NS = 'http://www.opengis.net/kml/2.2';

export class KMLImporter {
  private trackerCounter = 0;

  async parseKMLContent(content: string): Promise<TrackerRecord[]> {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['Placemark', 'Folder', 'Data', 'SimpleData', 'Point', 'LineString', 'when', 'coord'].includes(name),
      removeNSPrefix: true,
    });

    let parsed: any;
    try {
      parsed = parser.parse(content);
    } catch (e) {
      log.error('Failed to parse KML XML:', e);
      return [];
    }

    this.trackerCounter = 0;
    const records: TrackerRecord[] = [];

    // Navigate to Document
    const kml = parsed.kml;
    if (!kml) return records;

    const document = kml.Document || kml;
    this.extractPlacemarks(document, records, null);

    return records;
  }

  async parseKMZFile(buffer: Buffer): Promise<TrackerRecord[]> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const kmlFiles = Object.keys(zip.files).filter((f) => f.toLowerCase().endsWith('.kml'));

      if (kmlFiles.length === 0) {
        log.error('No KML file found inside KMZ archive');
        return [];
      }

      const kmlContent = await zip.files[kmlFiles[0]].async('string');
      return this.parseKMLContent(kmlContent);
    } catch (e) {
      log.error('Error reading KMZ file:', e);
      return [];
    }
  }

  private extractPlacemarks(node: any, records: TrackerRecord[], folderName: string | null): void {
    if (!node) return;

    // Process Folders
    const folders = this.ensureArray(node.Folder);
    for (const folder of folders) {
      const name = folder.name || folderName;
      this.extractPlacemarks(folder, records, name);
    }

    // Process Placemarks
    const placemarks = this.ensureArray(node.Placemark);
    for (const placemark of placemarks) {
      const placemarkRecords = this.parsePlacemark(placemark, folderName);
      records.push(...placemarkRecords);
    }
  }

  private parsePlacemark(placemark: any, folderName: string | null): TrackerRecord[] {
    const records: TrackerRecord[] = [];
    const trackerId = this.extractTrackerId(placemark, folderName);

    // Point geometry
    if (placemark.Point) {
      const points = this.ensureArray(placemark.Point);
      for (const point of points) {
        if (point.coordinates) {
          const coord = this.parseSingleCoordinate(String(point.coordinates).trim());
          if (coord) {
            const timestamp = this.extractTimestamp(placemark);
            records.push(this.createRecord(trackerId, coord.lat, coord.lon, coord.alt, timestamp));
          }
        }
      }
    }

    // LineString geometry
    if (placemark.LineString) {
      const lineStrings = this.ensureArray(placemark.LineString);
      for (const ls of lineStrings) {
        if (ls.coordinates) {
          const coords = this.parseCoordinateList(String(ls.coordinates));
          const timestamp = this.extractTimestamp(placemark) || new Date().toISOString();
          for (const coord of coords) {
            records.push(this.createRecord(trackerId, coord.lat, coord.lon, coord.alt, timestamp));
          }
        }
      }
    }

    // MultiGeometry
    if (placemark.MultiGeometry) {
      const mg = placemark.MultiGeometry;
      if (mg.Point) {
        const points = this.ensureArray(mg.Point);
        for (const point of points) {
          if (point.coordinates) {
            const coord = this.parseSingleCoordinate(String(point.coordinates).trim());
            if (coord) {
              const timestamp = this.extractTimestamp(placemark);
              records.push(this.createRecord(trackerId, coord.lat, coord.lon, coord.alt, timestamp));
            }
          }
        }
      }
      if (mg.LineString) {
        const lineStrings = this.ensureArray(mg.LineString);
        for (const ls of lineStrings) {
          if (ls.coordinates) {
            const coords = this.parseCoordinateList(String(ls.coordinates));
            const timestamp = this.extractTimestamp(placemark) || new Date().toISOString();
            for (const coord of coords) {
              records.push(this.createRecord(trackerId, coord.lat, coord.lon, coord.alt, timestamp));
            }
          }
        }
      }
    }

    // gx:Track
    const track = placemark.Track || placemark['gx:Track'];
    if (track) {
      const trackRecords = this.parseGxTrack(track, trackerId);
      records.push(...trackRecords);
    }

    return records;
  }

  private parseGxTrack(track: any, trackerId: string): TrackerRecord[] {
    const records: TrackerRecord[] = [];

    const whens = this.ensureArray(track.when || []);
    const coords = this.ensureArray(track.coord || track['gx:coord'] || []);

    const count = Math.min(whens.length, coords.length);
    for (let i = 0; i < count; i++) {
      const timestamp = this.parseISOTimestamp(String(whens[i])) || new Date().toISOString();
      const coordText = String(coords[i]).trim();
      const parts = coordText.split(/\s+/);
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;
        if (!isNaN(lon) && !isNaN(lat)) {
          records.push(this.createRecord(trackerId, lat, lon, alt, timestamp));
        }
      }
    }

    // If no paired when/coord, try just coords
    if (records.length === 0 && coords.length > 0) {
      for (const coordElem of coords) {
        const parts = String(coordElem).trim().split(/\s+/);
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;
          if (!isNaN(lon) && !isNaN(lat)) {
            records.push(this.createRecord(trackerId, lat, lon, alt, new Date().toISOString()));
          }
        }
      }
    }

    return records;
  }

  private extractTrackerId(placemark: any, folderName: string | null): string {
    let trackerId: string | null = null;

    // Try ExtendedData
    if (placemark.ExtendedData) {
      const dataItems = this.ensureArray(placemark.ExtendedData.Data || []);
      for (const item of dataItems) {
        const name = (item['@_name'] || '').toLowerCase();
        if (['tracker_id', 'id', 'tracker', 'device_id', 'unit_id'].includes(name)) {
          const val = item.value;
          if (val) {
            trackerId = String(val).trim();
            break;
          }
        }
      }

      // Try SchemaData
      if (!trackerId && placemark.ExtendedData.SchemaData) {
        const simpleData = this.ensureArray(placemark.ExtendedData.SchemaData.SimpleData || []);
        for (const item of simpleData) {
          const name = (item['@_name'] || '').toLowerCase();
          if (['tracker_id', 'id', 'tracker', 'device_id', 'unit_id'].includes(name)) {
            if (item['#text']) {
              trackerId = String(item['#text']).trim();
              break;
            }
          }
        }
      }
    }

    // Try Placemark name
    if (!trackerId && placemark.name) {
      trackerId = String(placemark.name).trim();
    }

    // Try folder name
    if (!trackerId && folderName) {
      trackerId = folderName;
    }

    // Auto-generate
    if (!trackerId) {
      this.trackerCounter++;
      trackerId = `kml_import_${this.trackerCounter}`;
    }

    // Normalize: remove surrounding parentheses
    return trackerId.replace(/^\((.+)\)$/, '$1');
  }

  private extractTimestamp(placemark: any): string | null {
    if (placemark.TimeStamp?.when) {
      return this.parseISOTimestamp(String(placemark.TimeStamp.when));
    }
    if (placemark.TimeSpan?.begin) {
      return this.parseISOTimestamp(String(placemark.TimeSpan.begin));
    }
    return null;
  }

  private parseISOTimestamp(text: string): string | null {
    if (!text) return null;
    text = text.trim();
    try {
      const d = new Date(text);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {
      // ignore
    }
    return null;
  }

  private parseSingleCoordinate(text: string): { lon: number; lat: number; alt: number | null } | null {
    const parts = text.split(',');
    if (parts.length < 2) return null;
    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (isNaN(lon) || isNaN(lat)) return null;
    const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;
    return { lon, lat, alt: alt !== null && !isNaN(alt) ? alt : null };
  }

  private parseCoordinateList(text: string): Array<{ lon: number; lat: number; alt: number | null }> {
    const coords: Array<{ lon: number; lat: number; alt: number | null }> = [];
    for (const token of text.trim().split(/\s+/)) {
      const coord = this.parseSingleCoordinate(token);
      if (coord) coords.push(coord);
    }
    return coords;
  }

  private createRecord(
    trackerId: string,
    lat: number,
    lon: number,
    alt: number | null,
    timestamp: string | null
  ): TrackerRecord {
    const ts = timestamp || new Date().toISOString();
    return {
      tracker_id: trackerId,
      time_local_received: ts,
      time_gps: ts,
      time_received: null,
      lat,
      lon,
      alt_m: alt,
      speed_mps: null,
      course_deg: null,
      hdop: null,
      satellites: null,
      rssi_dbm: null,
      baro_alt_m: null,
      baro_temp_c: null,
      baro_press_hpa: null,
      fix_valid: true,
      battery_mv: null,
      latency_ms: null,
    };
  }

  private ensureArray<T>(val: T | T[] | undefined | null): T[] {
    if (val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
  }
}
