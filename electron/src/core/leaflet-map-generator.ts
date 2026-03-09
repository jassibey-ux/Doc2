/**
 * Leaflet Map Generator — Creates interactive HTML maps from session data
 *
 * Produces a single .html file with:
 * - CDN-loaded Leaflet JS/CSS
 * - GPS-quality-segmented drone tracks (good/degraded/lost)
 * - CUAS placements + coverage polygons
 * - Engagement lines, site boundaries, zones, markers, assets
 * - Static info panel with per-tracker stats and legend
 * - Direction arrows and start/end markers per tracker
 */

import type { TrackerPosition } from './mock-tracker-provider';

interface GeoJSONFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: any };
  properties: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// --- Security helpers ---

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeInlineJSON(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// --- GPS Quality Segmentation ---

interface TrackSegment {
  quality: 'good' | 'degraded' | 'lost';
  positions: TrackerPosition[];
}

function normalizeQuality(q: string): 'good' | 'degraded' | 'lost' {
  if (q === 'poor') return 'lost';
  if (q === 'degraded') return 'degraded';
  if (q === 'lost') return 'lost';
  return 'good';
}

function segmentTrackByGPSQuality(positions: TrackerPosition[]): TrackSegment[] {
  if (positions.length === 0) return [];
  const segments: TrackSegment[] = [];
  let currentQuality = normalizeQuality(positions[0].gps_quality || 'good');
  let currentPositions: TrackerPosition[] = [positions[0]];

  for (let i = 1; i < positions.length; i++) {
    const q = normalizeQuality(positions[i].gps_quality || 'good');
    if (q !== currentQuality) {
      segments.push({ quality: currentQuality, positions: currentPositions });
      // Share boundary point for visual continuity
      currentPositions = [positions[i - 1], positions[i]];
      currentQuality = q;
    } else {
      currentPositions.push(positions[i]);
    }
  }
  if (currentPositions.length > 0) {
    segments.push({ quality: currentQuality, positions: currentPositions });
  }
  return segments;
}

// --- Track Thinning ---

function thinPositions(positions: TrackerPosition[], maxPoints: number): TrackerPosition[] {
  if (positions.length <= maxPoints) return positions;

  const transitionIndices = new Set<number>([0, positions.length - 1]);
  for (let i = 1; i < positions.length; i++) {
    const prev = normalizeQuality(positions[i - 1].gps_quality || 'good');
    const curr = normalizeQuality(positions[i].gps_quality || 'good');
    if (prev !== curr) {
      transitionIndices.add(i - 1);
      transitionIndices.add(i);
    }
  }

  const remaining = maxPoints - transitionIndices.size;
  if (remaining <= 0) {
    const sorted = Array.from(transitionIndices).sort((a, b) => a - b);
    if (sorted.length <= maxPoints) return sorted.map(i => positions[i]);
    const step = sorted.length / maxPoints;
    const subsampled: number[] = [sorted[0]];
    for (let j = 1; j < maxPoints - 1; j++) {
      subsampled.push(sorted[Math.round(j * step)]);
    }
    subsampled.push(sorted[sorted.length - 1]);
    return subsampled.map(i => positions[i]);
  }

  const stride = Math.max(1, Math.floor(positions.length / remaining));
  const indices = new Set(transitionIndices);
  for (let i = 0; i < positions.length && indices.size < maxPoints; i += stride) {
    indices.add(i);
  }

  return Array.from(indices).sort((a, b) => a - b).map(i => positions[i]);
}

// --- Main generator ---

const TRACKER_PALETTE = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6b9d'];
const QUALITY_COLORS: Record<string, string> = { good: '#22c55e', degraded: '#eab308', lost: '#ef4444' };

interface AIAnalysisSummary {
  executive_summary: string;
  operational_assessment?: {
    strengths: string[];
    weaknesses: string[];
    coverage_gaps?: string[];
    placement_recommendations?: string[];
  };
}

export function generateLeafletMap(
  geojson: GeoJSONFeatureCollection,
  positionsByTracker: Map<string, TrackerPosition[]>,
  sessionName: string,
  aiAnalysis?: AIAnalysisSummary,
): string {
  const MAX_POINTS_PER_TRACKER = 10000;
  const safeTitle = escapeHtml(sessionName);

  // --- Per-tracker stats & segmented track features ---
  interface TrackerStats {
    id: string;
    color: string;
    pointCount: number;
    avgSpeed: string;
    duration: string;
    allCoords: number[][];
    startMs: number;
    endMs: number;
  }

  const trackerStats: TrackerStats[] = [];
  const droneTrackFeatures: GeoJSONFeature[] = [];
  let trackerIdx = 0;

  for (const [trackerId, rawPositions] of positionsByTracker) {
    if (rawPositions.length < 2) continue;
    const color = TRACKER_PALETTE[trackerIdx % TRACKER_PALETTE.length];
    const positions = thinPositions(rawPositions, MAX_POINTS_PER_TRACKER);
    const segments = segmentTrackByGPSQuality(positions);

    // Compute stats from raw positions for accuracy
    const speeds = rawPositions.map(p => p.speed_ms).filter(s => s != null && s > 0);
    const avgSpeed = speeds.length > 0 ? (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1) : '0.0';
    const t0 = new Date(rawPositions[0].timestamp).getTime();
    const t1 = new Date(rawPositions[rawPositions.length - 1].timestamp).getTime();
    const durSec = Math.max(0, (t1 - t0) / 1000);
    const m = Math.floor(durSec / 60);
    const s = Math.floor(durSec % 60);
    const duration = `${m}m ${s}s`;

    const allCoords: number[][] = [];

    for (const seg of segments) {
      const coords = seg.positions.map(p => [p.longitude, p.latitude]);
      const coordTimes = seg.positions.map(p => new Date(p.timestamp).getTime());
      allCoords.push(...coords);
      droneTrackFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {
          tracker_id: trackerId,
          tracker_color: color,
          gps_quality: seg.quality,
          point_count: coords.length,
          coord_times: coordTimes,
        },
      });
    }

    trackerStats.push({ id: trackerId, color, pointCount: rawPositions.length, avgSpeed, duration, allCoords, startMs: t0, endMs: t1 });
    trackerIdx++;
  }

  // --- Group non-track features by feature_type ---
  const cuasPlacement: GeoJSONFeature[] = [];
  const cuasCoverage: GeoJSONFeature[] = [];
  const engagementLines: GeoJSONFeature[] = [];
  const siteBoundary: GeoJSONFeature[] = [];
  const siteZones: GeoJSONFeature[] = [];
  const siteMarkers: GeoJSONFeature[] = [];
  const assetPlacements: GeoJSONFeature[] = [];

  for (const f of geojson.features) {
    const ft = f.properties.feature_type as string;
    if (ft === 'drone_track' || ft === 'session_metadata') continue;
    if (ft === 'cuas_placement') cuasPlacement.push(f);
    else if (ft === 'cuas_coverage') cuasCoverage.push(f);
    else if (ft === 'engagement_line') engagementLines.push(f);
    else if (ft === 'site_boundary') siteBoundary.push(f);
    else if (ft === 'site_zone') siteZones.push(f);
    else if (ft === 'site_marker') siteMarkers.push(f);
    else if (ft === 'asset_placement') assetPlacements.push(f);
  }

  // --- Session date from metadata ---
  const metaFeature = geojson.features.find(f => f.properties.feature_type === 'session_metadata');
  const sessionDate = metaFeature?.properties?.start_time
    ? String(metaFeature.properties.start_time).substring(0, 10)
    : new Date().toISOString().substring(0, 10);

  // --- Compute session-wide time bounds ---
  const sessionStartMs = trackerStats.length > 0 ? Math.min(...trackerStats.map(t => t.startMs)) : NaN;
  const sessionEndMs = trackerStats.length > 0 ? Math.max(...trackerStats.map(t => t.endMs)) : NaN;
  const timeBounds = (!isNaN(sessionStartMs) && !isNaN(sessionEndMs) && sessionEndMs > sessionStartMs)
    ? { start: sessionStartMs, end: sessionEndMs }
    : null;

  // --- Build geoData object ---
  const geoData: Record<string, unknown> = {
    drone_tracks: droneTrackFeatures,
    cuas_placement: cuasPlacement,
    cuas_coverage: cuasCoverage,
    engagement_lines: engagementLines,
    site_boundary: siteBoundary,
    site_zones: siteZones,
    site_markers: siteMarkers,
    asset_placements: assetPlacements,
  };
  if (timeBounds) {
    geoData.time_bounds = timeBounds;
  }

  // --- Compute center for initial view ---
  const allPts: number[][] = [];
  for (const ts of trackerStats) allPts.push(...ts.allCoords);
  for (const f of [...cuasPlacement, ...siteMarkers, ...assetPlacements]) {
    if (f.geometry?.type === 'Point') allPts.push(f.geometry.coordinates);
  }
  const centerLat = allPts.length > 0 ? allPts.reduce((s, c) => s + c[1], 0) / allPts.length : 0;
  const centerLon = allPts.length > 0 ? allPts.reduce((s, c) => s + c[0], 0) / allPts.length : 0;

  // --- Build per-tracker stats HTML ---
  const trackerStatsHtml = trackerStats.map(t =>
    `    <div class="track-item">
      <div class="track-name"><span class="dot" style="background:${t.color};"></span>${escapeHtml(t.id)}</div>
      <div class="track-detail">${t.pointCount} pts &middot; ${t.avgSpeed} m/s avg &middot; ${t.duration}</div>
    </div>`
  ).join('\n');

  // --- Build legend items for tracker colors ---
  const trackerLegendHtml = trackerStats.map(t =>
    `    <div class="legend-item"><div class="legend-box" style="background:${t.color};"></div>${escapeHtml(t.id)} track</div>`
  ).join('\n');

  // --- Conditional legend entries ---
  const hasEngagements = engagementLines.length > 0;
  const hasSiteBoundary = siteBoundary.length > 0;
  const hasCuas = cuasCoverage.length > 0 || cuasPlacement.length > 0;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle} — SCENSUS Map</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; }
  #map { width: 100%; height: 100vh; }
  .info-panel {
    position: absolute; top: 12px; right: 12px; z-index: 1000;
    background: rgba(15,15,25,0.92); backdrop-filter: blur(12px);
    border: 1px solid rgba(100,140,255,0.25); border-radius: 10px;
    padding: 16px 18px; color: #e0e8f0; min-width: 260px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  }
  .info-panel h2 { font-size: 14px; color: #8ab4f8; margin-bottom: 10px; letter-spacing: 1px; text-transform: uppercase; }
  .info-panel .session { font-size: 11px; color: #6a7a8a; margin-bottom: 12px; }
  .track-item { padding: 8px 0; border-bottom: 1px solid rgba(100,140,255,0.1); }
  .track-item:last-child { border-bottom: none; }
  .track-name { font-weight: 600; font-size: 13px; }
  .track-detail { font-size: 11px; color: #8a9aaa; margin-top: 3px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .legend-item { display: flex; align-items: center; margin: 6px 0; font-size: 12px; color: #a0b0c0; }
  .legend-box { width: 18px; height: 4px; border-radius: 2px; margin-right: 8px; flex-shrink: 0; }
  .legend-circle { width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; flex-shrink: 0; border: 2px solid; }
  .leaflet-popup-content-wrapper { background: rgba(15,15,25,0.95); color: #e0e8f0; border: 1px solid rgba(100,140,255,0.3); border-radius: 8px; }
  .leaflet-popup-tip { background: rgba(15,15,25,0.95); }
  .leaflet-popup-content { font-size: 12px; line-height: 1.5; }
  .leaflet-popup-content b { color: #8ab4f8; }
  .time-bar { position: absolute; bottom: 30px; left: 60px; right: 280px; z-index: 1000;
    background: rgba(15,15,25,0.92); backdrop-filter: blur(12px);
    border: 1px solid rgba(100,140,255,0.25); border-radius: 8px;
    padding: 8px 14px; display: flex; align-items: center; gap: 10px;
    color: #e0e8f0; font-size: 11px; }
  .time-bar input[type=range] { flex: 1; accent-color: #8ab4f8; }
  .time-bar button { background: none; border: 1px solid rgba(100,140,255,0.3);
    border-radius: 4px; color: #8ab4f8; padding: 2px 8px; cursor: pointer; font-size: 12px; }
  .time-bar button:hover { background: rgba(100,140,255,0.1); }
  .time-bar select { background: rgba(15,15,25,0.9); color: #8ab4f8;
    border: 1px solid rgba(100,140,255,0.3); border-radius: 4px; padding: 2px 4px; font-size: 10px; }
</style>
</head>
<body>
<div id="map"></div>
<div class="info-panel">
  <h2>${safeTitle}</h2>
  <div class="session">${escapeHtml(sessionDate)} &middot; SCENSUS</div>
  <div style="margin-bottom: 12px;">
${trackerStatsHtml}
  </div>
  <div style="border-top: 1px solid rgba(100,140,255,0.15); padding-top: 10px;">
    <div style="font-size: 11px; color: #6a7a8a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Legend</div>
${trackerLegendHtml}
    <div class="legend-item"><div class="legend-box" style="background:#22c55e;"></div>Good GPS</div>
    <div class="legend-item"><div class="legend-box" style="background:#eab308;"></div>Degraded GPS</div>
    <div class="legend-item"><div class="legend-box" style="background:#ef4444;"></div>Lost GPS</div>
    <div class="legend-item"><div class="legend-circle" style="background:rgba(255,107,107,0.15); border-color:#ff6b6b;"></div>Track start</div>
${hasCuas ? `    <div class="legend-item"><div class="legend-box" style="background:rgba(255,170,50,0.3); height:12px; width:12px; border: 1px solid #ffaa32; border-radius:2px;"></div>CUAS coverage</div>
    <div class="legend-item"><div class="legend-circle" style="background:#ffaa32; border-color:#ff8800;"></div>CUAS placement</div>` : ''}
${hasEngagements ? `    <div class="legend-item"><div class="legend-box" style="background:#06b6d4; height:2px; border-top: 2px dashed #06b6d4; background: none;"></div>Engagement</div>` : ''}
${hasSiteBoundary ? `    <div class="legend-item"><div class="legend-box" style="height:2px; border-top: 2px dashed #ffffff; background: none;"></div>Site boundary</div>` : ''}
  </div>
</div>
${aiAnalysis ? `
<div style="position:absolute; top:12px; right:270px; z-index:1000; max-width:400px; font-family:system-ui,-apple-system,sans-serif;">
  <div style="background:rgba(15,15,25,0.92); backdrop-filter:blur(12px); border:1px solid rgba(6,182,212,0.3); border-radius:8px; overflow:hidden;">
    <button onclick="this.parentElement.querySelector('.ai-body').classList.toggle('collapsed')" style="width:100%; padding:10px 14px; background:none; border:none; color:#06b6d4; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; text-align:left;">
      <span style="font-size:14px;">&#x1F9E0;</span> AI Analysis
      <span style="margin-left:auto; font-size:10px; opacity:0.6;">click to toggle</span>
    </button>
    <div class="ai-body" style="padding:0 14px 12px; font-size:11px; line-height:1.6; color:#a0b0c0;">
      <div style="border-left:2px solid #06b6d4; padding-left:10px; margin-bottom:10px;">
        <div style="font-size:10px; color:#06b6d4; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Executive Summary</div>
        ${escapeHtml(aiAnalysis.executive_summary)}
      </div>
      ${aiAnalysis.operational_assessment ? `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
        <div>
          <div style="font-size:10px; color:#22c55e; margin-bottom:4px;">Strengths</div>
          <ul style="margin:0; padding-left:14px; font-size:10px;">
            ${aiAnalysis.operational_assessment.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </div>
        <div>
          <div style="font-size:10px; color:#ef4444; margin-bottom:4px;">Weaknesses</div>
          <ul style="margin:0; padding-left:14px; font-size:10px;">
            ${aiAnalysis.operational_assessment.weaknesses.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
          </ul>
        </div>
      </div>
      ` : ''}
      <div style="font-size:9px; color:#6a7a8a; margin-top:6px; font-style:italic;">AI-generated analysis — review with qualified personnel</div>
    </div>
  </div>
</div>
<style>.ai-body.collapsed { display: none; }</style>
` : ''}
<div class="time-bar" id="time-bar" style="display:none;">
  <button id="play-btn">&#9654;</button>
  <input type="range" id="time-slider" min="0" max="1000" value="1000" step="1">
  <span id="time-label">--:--:--</span>
  <select id="speed-select">
    <option value="1">1x</option><option value="2">2x</option>
    <option value="5">5x</option><option value="10">10x</option>
  </select>
</div>

<script>
const geoData = ${safeInlineJSON(geoData)};

const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${centerLat}, ${centerLon}], 15);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.control.attribution({ position: 'bottomleft' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19
}).addTo(map);

var qualityColors = { good: '#22c55e', degraded: '#eab308', lost: '#ef4444' };
var esc = function(s) { return s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

// 1. Site zones
geoData.site_zones.forEach(function(f) {
  if (!f.geometry) return;
  var c = f.properties.color || '#8ab4f8';
  L.geoJSON(f, { style: { fillColor: c, fillOpacity: 0.06, color: c, weight: 1, opacity: 0.3 } })
    .bindPopup('<b>' + esc(f.properties.zone_name || 'Zone') + '</b>')
    .addTo(map);
});

// 2. Site boundary
geoData.site_boundary.forEach(function(f) {
  if (!f.geometry) return;
  L.geoJSON(f, { style: { color: '#ffffff', weight: 1.5, opacity: 0.5, dashArray: '10,6', fillOpacity: 0 } })
    .bindPopup('<b>' + esc(f.properties.site_name || 'Site Boundary') + '</b>')
    .addTo(map);
});

// 3. CUAS coverage
geoData.cuas_coverage.forEach(function(f) {
  if (!f.geometry) return;
  L.geoJSON(f, { style: { fillColor: '#ffaa32', fillOpacity: 0.08, color: '#ffaa32', weight: 1.5, opacity: 0.5, dashArray: '6,4' } })
    .bindPopup('<b>' + esc(f.properties.cuas_name) + '</b><br>Range: ' + esc(f.properties.range_m) + 'm<br>Pattern: ' + esc(f.properties.antenna_pattern))
    .addTo(map);
});

// 4. Engagement lines
var engagementLayers = [];
geoData.engagement_lines.forEach(function(f) {
  if (!f.geometry) return;
  var layer = L.geoJSON(f, { style: { color: '#06b6d4', weight: 2, dashArray: '8,4', opacity: 0.8 } })
    .bindPopup('<b>Engagement</b><br>CUAS: ' + esc(f.properties.cuas_name) + '<br>Target: ' + esc(f.properties.target_tracker) + '<br>Range: ' + esc(f.properties.range_m) + 'm<br>Bearing: ' + esc(f.properties.bearing_deg) + '&deg;<br>Result: ' + esc(f.properties.result))
    .addTo(map);
  var sMs = new Date(f.properties.start_time).getTime();
  var eMs = new Date(f.properties.end_time).getTime();
  if (!isNaN(sMs) && !isNaN(eMs)) {
    engagementLayers.push({ layer: layer, startMs: sMs, endMs: eMs });
  }
});

// 5. Drone tracks (ghost trail + main per segment)
var hasTimeline = !!(geoData.time_bounds && geoData.drone_tracks.length > 0);
geoData.drone_tracks.forEach(function(f) {
  if (!f.geometry) return;
  var qColor = qualityColors[f.properties.gps_quality] || '#22c55e';
  var dash = f.properties.gps_quality === 'good' ? null : '6,4';
  // Glow (fainter when timeline active)
  L.geoJSON(f, { style: { color: qColor, weight: 6, opacity: hasTimeline ? 0.05 : 0.15 } }).addTo(map);
  // Main line (ghost when timeline active, full when static)
  L.geoJSON(f, { style: { color: qColor, weight: 2.5, opacity: hasTimeline ? 0.15 : 0.85, dashArray: dash } })
    .bindPopup('<b>Drone: ' + esc(f.properties.tracker_id) + '</b><br>GPS: ' + esc(f.properties.gps_quality) + '<br>Points: ' + f.properties.point_count)
    .addTo(map);
});

// 6. CUAS placements
geoData.cuas_placement.forEach(function(f) {
  if (!f.geometry) return;
  var ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
  L.circleMarker(ll, { radius: 8, fillColor: '#ffaa32', color: '#ff8800', weight: 2, fillOpacity: 0.9 })
    .bindPopup('<b>' + esc(f.properties.cuas_name) + '</b><br>Vendor: ' + esc(f.properties.cuas_vendor) + '<br>Type: ' + esc(f.properties.cuas_type) + '<br>Range: ' + esc(f.properties.effective_range_m) + 'm<br>Active: ' + (f.properties.active ? 'Yes' : 'No'))
    .addTo(map);
});

// 7. Site markers
geoData.site_markers.forEach(function(f) {
  if (!f.geometry) return;
  var ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
  L.circleMarker(ll, { radius: 4, fillColor: '#ffd700', color: '#ffd700', weight: 1, fillOpacity: 0.9 })
    .bindPopup('<b>' + esc(f.properties.marker_name || 'Site Marker') + '</b>')
    .addTo(map);
});

// 8. Asset placements
geoData.asset_placements.forEach(function(f) {
  if (!f.geometry) return;
  var ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
  L.circleMarker(ll, { radius: 4, fillColor: '#ffffff', color: '#ffffff', weight: 1, fillOpacity: 0.7 })
    .bindPopup('<b>' + esc(f.properties.asset_name || 'Asset') + '</b>')
    .addTo(map);
});

// 9 & 10. Start/end markers + direction arrows per tracker
var trackerCoords = {};
geoData.drone_tracks.forEach(function(f) {
  if (!f.geometry) return;
  var tid = f.properties.tracker_id;
  if (!trackerCoords[tid]) trackerCoords[tid] = { color: f.properties.tracker_color, coords: [] };
  trackerCoords[tid].coords = trackerCoords[tid].coords.concat(f.geometry.coordinates);
});

Object.keys(trackerCoords).forEach(function(tid) {
  var tc = trackerCoords[tid];
  var coords = tc.coords;
  var color = tc.color;
  if (coords.length < 2) return;

  // Start marker
  var s = coords[0];
  L.circleMarker([s[1], s[0]], { radius: 6, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 })
    .bindPopup('<b>' + esc(tid) + ' - Start</b>').addTo(map);

  // End marker
  var e = coords[coords.length - 1];
  L.circleMarker([e[1], e[0]], { radius: 4, fillColor: color, color: color, weight: 2, fillOpacity: 0.6 })
    .bindPopup('<b>' + esc(tid) + ' - End</b>').addTo(map);

  // Direction arrows
  var step = Math.max(1, Math.floor(coords.length / 6));
  for (var i = 0; i < coords.length - 1; i += step) {
    var p1 = coords[i];
    var p2 = coords[Math.min(i + 3, coords.length - 1)];
    var angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI;
    var mid = [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2];
    L.marker([mid[1], mid[0]], {
      icon: L.divIcon({
        className: '',
        html: '<div style="color:' + color + ';font-size:14px;transform:rotate(' + (-angle+90) + 'deg);opacity:0.7;">&#9650;</div>',
        iconSize: [14, 14], iconAnchor: [7, 7]
      })
    }).addTo(map);
  }
});

// 11. Time slider: build per-tracker timeline + position dots
var trackerTimeline = {};
var positionDots = {};
geoData.drone_tracks.forEach(function(f) {
  if (!f.geometry || !f.properties.coord_times) return;
  var tid = f.properties.tracker_id;
  if (!trackerTimeline[tid]) trackerTimeline[tid] = { color: f.properties.tracker_color, points: [] };
  var coords = f.geometry.coordinates;
  var times = f.properties.coord_times;
  for (var i = 0; i < coords.length; i++) {
    trackerTimeline[tid].points.push({ lng: coords[i][0], lat: coords[i][1], t: times[i] });
  }
});
var activeTrails = {};
Object.keys(trackerTimeline).forEach(function(tid) {
  trackerTimeline[tid].points.sort(function(a, b) { return a.t - b.t; });
  var pts = trackerTimeline[tid].points;
  if (pts.length === 0) return;
  var last = pts[pts.length - 1];
  // Active trail polyline — drawn from start to current slider time
  var allLatLngs = pts.map(function(p) { return [p.lat, p.lng]; });
  activeTrails[tid] = L.polyline(allLatLngs, {
    color: trackerTimeline[tid].color, weight: 3, opacity: 0.9
  }).addTo(map);
  // Position dot on top
  positionDots[tid] = L.circleMarker([last.lat, last.lng], {
    radius: 7, fillColor: trackerTimeline[tid].color, color: '#fff', weight: 2, fillOpacity: 1, pane: 'markerPane'
  }).addTo(map);
});

// Binary search: find index of last point with t <= ms
function bsearch(pts, ms) {
  var lo = 0, hi = pts.length - 1, ans = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (pts[mid].t <= ms) { ans = mid; lo = mid + 1; }
    else { hi = mid - 1; }
  }
  return ans;
}

function formatTime(ms) {
  var d = new Date(ms);
  var h = d.getUTCHours().toString().padStart(2, '0');
  var m = d.getUTCMinutes().toString().padStart(2, '0');
  var s = d.getUTCSeconds().toString().padStart(2, '0');
  return h + ':' + m + ':' + s;
}

function updateTime(ms) {
  // Position dots + active trails
  Object.keys(trackerTimeline).forEach(function(tid) {
    var pts = trackerTimeline[tid].points;
    var dot = positionDots[tid];
    var trail = activeTrails[tid];
    var idx = bsearch(pts, ms);
    if (idx < 0) {
      if (dot) dot.setStyle({ opacity: 0, fillOpacity: 0 });
      if (trail) trail.setLatLngs([]);
    } else {
      var p = pts[idx];
      if (dot) {
        dot.setLatLng([p.lat, p.lng]);
        dot.setStyle({ opacity: 1, fillOpacity: 1 });
      }
      if (trail) {
        var sliced = [];
        for (var i = 0; i <= idx; i++) { sliced.push([pts[i].lat, pts[i].lng]); }
        trail.setLatLngs(sliced);
      }
    }
  });
  // Engagement lines
  engagementLayers.forEach(function(eg) {
    if (ms < eg.startMs) {
      eg.layer.setStyle({ opacity: 0 });
    } else if (ms >= eg.startMs && ms <= eg.endMs) {
      eg.layer.setStyle({ opacity: 0.8 });
    } else {
      eg.layer.setStyle({ opacity: 0.3 });
    }
  });
  // Time label
  var label = document.getElementById('time-label');
  if (label) label.textContent = formatTime(ms);
}

// 12. Wire up time bar
(function() {
  var tb = geoData.time_bounds;
  var bar = document.getElementById('time-bar');
  if (!tb || !bar || geoData.drone_tracks.length === 0) return;
  bar.style.display = 'flex';
  var slider = document.getElementById('time-slider');
  var playBtn = document.getElementById('play-btn');
  var speedSel = document.getElementById('speed-select');
  slider.min = tb.start;
  slider.max = tb.end;
  slider.value = tb.end;
  slider.step = Math.max(1, Math.floor((tb.end - tb.start) / 1000));
  updateTime(tb.end);

  slider.addEventListener('input', function() { updateTime(Number(slider.value)); });

  var playing = false;
  var lastFrame = null;
  function animate(now) {
    if (!playing) return;
    if (lastFrame !== null) {
      var dt = now - lastFrame;
      var speed = Number(speedSel.value) || 1;
      var newVal = Number(slider.value) + dt * speed;
      if (newVal >= tb.end) {
        slider.value = tb.end;
        updateTime(tb.end);
        playing = false;
        playBtn.innerHTML = '&#9654;';
        lastFrame = null;
        return;
      }
      slider.value = newVal;
      updateTime(newVal);
    }
    lastFrame = now;
    requestAnimationFrame(animate);
  }

  playBtn.addEventListener('click', function() {
    if (playing) {
      playing = false;
      playBtn.innerHTML = '&#9654;';
      lastFrame = null;
    } else {
      if (Number(slider.value) >= tb.end) slider.value = tb.start;
      playing = true;
      playBtn.innerHTML = '&#9646;&#9646;';
      lastFrame = null;
      requestAnimationFrame(animate);
    }
  });
})();

// Fit bounds to all features
var allCoords = [];
geoData.drone_tracks.forEach(function(f) { if(f.geometry) f.geometry.coordinates.forEach(function(c) { allCoords.push([c[1],c[0]]); }); });
geoData.cuas_placement.forEach(function(f) { if(f.geometry) allCoords.push([f.geometry.coordinates[1], f.geometry.coordinates[0]]); });
geoData.site_markers.forEach(function(f) { if(f.geometry) allCoords.push([f.geometry.coordinates[1], f.geometry.coordinates[0]]); });
geoData.asset_placements.forEach(function(f) { if(f.geometry) allCoords.push([f.geometry.coordinates[1], f.geometry.coordinates[0]]); });
if (allCoords.length > 0) {
  map.fitBounds(L.latLngBounds(allCoords).pad(0.1));
}
<\/script>
</body>
</html>`;
}
