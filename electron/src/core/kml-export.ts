/**
 * KML Export Module.
 * Generates KML files for visualization in Google Earth.
 */

import { TrackerState } from './models';

export function generateKML(
  trackers: TrackerState[],
  eventName?: string | null
): string {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const docName = `SCENSUS Export - ${eventName || 'Data'} - ${timestamp}`;

  // Group trackers by ID
  const groups = new Map<string, TrackerState[]>();
  for (const tracker of trackers) {
    const list = groups.get(tracker.tracker_id) || [];
    list.push(tracker);
    groups.set(tracker.tracker_id, list);
  }

  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <name>${escapeXml(docName)}</name>
  <description>Exported from SCENSUS UAS Dashboard on ${timestamp}</description>
${generateStyles()}`;

  for (const [trackerId, trackerList] of groups) {
    // Sort by time
    trackerList.sort((a, b) => {
      const tA = a.time_gps || a.time_local_received || '';
      const tB = b.time_gps || b.time_local_received || '';
      return tA.localeCompare(tB);
    });

    kml += `  <Folder>
    <name>Drone ${escapeXml(trackerId)}</name>\n`;

    // Track line if multiple points
    if (trackerList.length > 1) {
      kml += generateTrackLine(trackerId, trackerList);
    }

    // Individual placemarks
    for (let i = 0; i < trackerList.length; i++) {
      kml += generatePointPlacemark(trackerList[i], i);
    }

    kml += `  </Folder>\n`;
  }

  kml += `</Document>
</kml>`;

  return kml;
}

function generateStyles(): string {
  return `  <Style id="droneActive">
    <IconStyle>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/airports.png</href></Icon>
      <color>ff00c8ff</color>
      <scale>1.0</scale>
    </IconStyle>
  </Style>
  <Style id="droneStale">
    <IconStyle>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/airports.png</href></Icon>
      <color>ff0000ff</color>
      <scale>0.8</scale>
    </IconStyle>
  </Style>
  <Style id="trackLine">
    <LineStyle>
      <color>ff00c8ff</color>
      <width>3</width>
    </LineStyle>
  </Style>\n`;
}

function generateTrackLine(trackerId: string, trackers: TrackerState[]): string {
  const coords = trackers
    .filter((t) => t.lat !== null && t.lon !== null)
    .map((t) => `${t.lon},${t.lat},${t.alt_m ?? 0}`)
    .join(' ');

  return `    <Placemark>
      <name>Track - ${escapeXml(trackerId)}</name>
      <styleUrl>#trackLine</styleUrl>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <tessellate>1</tessellate>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>\n`;
}

function generatePointPlacemark(tracker: TrackerState, index: number): string {
  if (tracker.lat === null || tracker.lon === null) return '';

  const descParts: string[] = [];
  if (tracker.time_gps) descParts.push(`Time: ${tracker.time_gps}`);
  if (tracker.alt_m !== null) descParts.push(`Altitude: ${tracker.alt_m.toFixed(1)}m`);
  if (tracker.speed_mps !== null) descParts.push(`Speed: ${tracker.speed_mps.toFixed(1)}m/s`);
  if (tracker.rssi_dbm !== null) descParts.push(`RSSI: ${tracker.rssi_dbm}dBm`);

  const styleUrl = tracker.is_stale ? '#droneStale' : '#droneActive';
  const alt = tracker.alt_m ?? 0;

  let pm = `    <Placemark>
      <name>Position ${index + 1}</name>\n`;

  if (descParts.length > 0) {
    pm += `      <description>${escapeXml(descParts.join('\n'))}</description>\n`;
  }

  pm += `      <styleUrl>${styleUrl}</styleUrl>\n`;

  if (tracker.time_gps) {
    const when = new Date(tracker.time_gps).toISOString();
    pm += `      <TimeStamp><when>${when}</when></TimeStamp>\n`;
  }

  pm += `      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${tracker.lon},${tracker.lat},${alt}</coordinates>
      </Point>
      <ExtendedData>
        <Data name="tracker_id"><value>${escapeXml(tracker.tracker_id)}</value></Data>\n`;

  if (tracker.alt_m !== null) pm += `        <Data name="altitude_m"><value>${tracker.alt_m.toFixed(1)}</value></Data>\n`;
  if (tracker.speed_mps !== null) pm += `        <Data name="speed_mps"><value>${tracker.speed_mps.toFixed(1)}</value></Data>\n`;
  if (tracker.course_deg !== null) pm += `        <Data name="course_deg"><value>${tracker.course_deg.toFixed(1)}</value></Data>\n`;
  if (tracker.rssi_dbm !== null) pm += `        <Data name="rssi_dbm"><value>${tracker.rssi_dbm}</value></Data>\n`;
  if (tracker.battery_mv !== null) pm += `        <Data name="battery_mv"><value>${tracker.battery_mv}</value></Data>\n`;
  if (tracker.satellites !== null) pm += `        <Data name="satellites"><value>${tracker.satellites}</value></Data>\n`;
  if (tracker.hdop !== null) pm += `        <Data name="hdop"><value>${tracker.hdop.toFixed(1)}</value></Data>\n`;
  if (tracker.baro_alt_m !== null) pm += `        <Data name="baro_alt_m"><value>${tracker.baro_alt_m.toFixed(1)}</value></Data>\n`;
  if (tracker.baro_temp_c !== null) pm += `        <Data name="baro_temp_c"><value>${tracker.baro_temp_c.toFixed(1)}</value></Data>\n`;
  if (tracker.baro_press_hpa !== null) pm += `        <Data name="baro_press_hpa"><value>${tracker.baro_press_hpa.toFixed(1)}</value></Data>\n`;

  pm += `        <Data name="fix_valid"><value>${tracker.fix_valid ? 'yes' : 'no'}</value></Data>
        <Data name="is_stale"><value>${tracker.is_stale ? 'yes' : 'no'}</value></Data>
      </ExtendedData>
    </Placemark>\n`;

  return pm;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
