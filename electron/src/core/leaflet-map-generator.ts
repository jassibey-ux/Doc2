/**
 * Leaflet Map Generator — Creates self-contained interactive HTML maps from session data
 *
 * Produces a single .html file with:
 * - Embedded Leaflet JS/CSS (no CDN dependency)
 * - GPS-quality-segmented drone tracks (good/degraded/lost)
 * - CUAS placements with toggleable coverage zones
 * - Engagement lines, site boundaries, zones, markers, assets
 * - Dark glass info panel, collapsible legend, styled popups
 * - Direction arrows on tracks, scale bar, cursor coords
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

  // Find quality transition indices
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
    // Transitions exceed budget — subsample transition indices to stay within maxPoints
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

// --- HTML Template Builders ---

function buildCSS(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; }

    .info-panel {
      position: absolute; top: 12px; right: 12px; z-index: 1000;
      background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 16px 20px; color: #e2e8f0;
      font-size: 12px; line-height: 1.6; min-width: 220px;
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    .info-panel h2 { font-size: 15px; font-weight: 600; color: #f8fafc; margin-bottom: 8px; }
    .info-panel .brand { color: #ff6b00; font-weight: 700; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; margin-top: 10px; }
    .info-panel .stat { display: flex; justify-content: space-between; gap: 12px; }
    .info-panel .stat-label { color: rgba(255,255,255,0.5); }
    .info-panel .stat-value { color: #f8fafc; font-weight: 500; }

    .legend-panel {
      position: absolute; bottom: 28px; right: 12px; z-index: 1000;
      background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 12px 16px; color: #e2e8f0;
      font-size: 11px; line-height: 1.8; backdrop-filter: blur(12px);
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    .legend-panel .legend-title {
      display: flex; align-items: center; justify-content: space-between;
      cursor: pointer; user-select: none; font-weight: 600; font-size: 12px; margin-bottom: 4px;
    }
    .legend-panel .legend-body.collapsed { display: none; }
    .legend-entry { display: flex; align-items: center; gap: 8px; }
    .legend-swatch {
      width: 20px; height: 4px; border-radius: 2px; flex-shrink: 0;
    }
    .legend-circle {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    .legend-dashed {
      width: 20px; height: 0; border-top: 2px dashed; flex-shrink: 0;
    }

    .coord-display {
      position: absolute; bottom: 6px; left: 60px; z-index: 1000;
      background: rgba(15, 23, 42, 0.8); border-radius: 4px;
      padding: 2px 8px; color: #94a3b8; font-size: 10px;
      font-family: 'SF Mono', 'Fira Code', monospace; pointer-events: none;
    }

    /* Styled popups */
    .leaflet-popup-content-wrapper {
      background: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important;
      border: 1px solid rgba(255,255,255,0.12) !important; border-radius: 10px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    }
    .leaflet-popup-tip { background: rgba(15, 23, 42, 0.95) !important; }
    .leaflet-popup-content {
      font-size: 12px !important; line-height: 1.6 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      margin: 10px 14px !important;
    }
    .popup-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .popup-row { display: flex; justify-content: space-between; gap: 16px; }
    .popup-label { color: rgba(255,255,255,0.5); }
    .popup-value { font-weight: 500; }
    .popup-badge {
      display: inline-block; padding: 1px 8px; border-radius: 4px;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    }

    /* Layer control dark styling */
    .leaflet-control-layers {
      background: rgba(15, 23, 42, 0.92) !important; color: #e2e8f0 !important;
      border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 8px !important;
      backdrop-filter: blur(12px); box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important;
    }
    .leaflet-control-layers-expanded { padding: 8px 12px 8px 8px !important; }
    .leaflet-control-layers label { color: #e2e8f0 !important; }
    .leaflet-control-layers-separator { border-top-color: rgba(255,255,255,0.1) !important; }

    /* Zoom controls */
    .leaflet-control-zoom a {
      background: rgba(15, 23, 42, 0.9) !important; color: #e2e8f0 !important;
      border-color: rgba(255,255,255,0.1) !important;
    }
    .leaflet-control-zoom a:hover { background: rgba(30, 41, 59, 0.95) !important; }

    /* Scale bar */
    .leaflet-control-scale-line {
      background: rgba(15, 23, 42, 0.8) !important; color: #94a3b8 !important;
      border-color: rgba(255,255,255,0.2) !important; font-size: 10px !important;
    }

    /* Direction arrows */
    .track-arrow {
      width: 12px; height: 12px; display: flex; align-items: center; justify-content: center;
    }
    .track-arrow svg { filter: drop-shadow(0 0 2px rgba(0,0,0,0.6)); }
  `;
}

function buildInfoPanel(sessionName: string, meta: Record<string, string>): string {
  const safeName = escapeHtml(sessionName);
  let rows = '';
  for (const [k, v] of Object.entries(meta)) {
    rows += `<div class="stat"><span class="stat-label">${escapeHtml(k)}</span><span class="stat-value">${escapeHtml(v)}</span></div>`;
  }
  return `
    <div class="info-panel" id="info-panel">
      <h2>${safeName}</h2>
      ${rows}
      <div class="brand">SCENSUS</div>
    </div>
  `;
}

function buildLegend(): string {
  return `
    <div class="legend-panel" id="legend-panel">
      <div class="legend-title" onclick="toggleLegend()">
        <span>Legend</span>
        <span id="legend-toggle-icon">&#9660;</span>
      </div>
      <div class="legend-body" id="legend-body">
        <div class="legend-entry"><div class="legend-swatch" style="background:#22c55e"></div>Good GPS</div>
        <div class="legend-entry"><div class="legend-swatch" style="background:#eab308;border-top:2px dashed #eab308;height:0;width:20px"></div>Degraded GPS</div>
        <div class="legend-entry"><div class="legend-swatch" style="background:#ef4444;border-top:2px dashed #ef4444;height:0;width:20px"></div>Lost GPS</div>
        <div class="legend-entry"><div class="legend-circle" style="background:#ff6600;box-shadow:0 0 6px rgba(255,102,0,0.5)"></div>CUAS</div>
        <div class="legend-entry"><div class="legend-dashed" style="border-color:#06b6d4"></div>Engagement</div>
        <div class="legend-entry"><div class="legend-dashed" style="border-color:#ffffff"></div>Site Boundary</div>
        <div class="legend-entry"><div class="legend-circle" style="background:#ffd700;width:8px;height:8px"></div>Site Marker</div>
        <div class="legend-entry"><div class="legend-circle" style="background:#ffffff;width:8px;height:8px"></div>Asset</div>
      </div>
    </div>
  `;
}

function buildPopupForFeature(props: Record<string, unknown>, featureType: string): string {
  const e = (v: unknown) => escapeHtml(String(v ?? ''));

  switch (featureType) {
    case 'drone_track_segment': {
      const qualityColors: Record<string, string> = { good: '#22c55e', degraded: '#eab308', lost: '#ef4444' };
      const q = String(props.gps_quality || 'good');
      const col = qualityColors[q] || '#94a3b8';
      return `<div class="popup-title">Drone Track</div>
        <div class="popup-row"><span class="popup-label">Tracker</span><span class="popup-value">${e(props.tracker_id)}</span></div>
        <div class="popup-row"><span class="popup-label">GPS Quality</span><span class="popup-badge" style="background:${col}33;color:${col}">${e(q)}</span></div>
        <div class="popup-row"><span class="popup-label">Time Range</span><span class="popup-value">${e(props.start_time)} &ndash; ${e(props.end_time)}</span></div>
        <div class="popup-row"><span class="popup-label">Avg Speed</span><span class="popup-value">${e(props.avg_speed_mps)} m/s</span></div>`;
    }
    case 'cuas_placement':
      return `<div class="popup-title" style="color:#ff6600">${e(props.cuas_name)}</div>
        <div class="popup-row"><span class="popup-label">Vendor</span><span class="popup-value">${e(props.cuas_vendor)}</span></div>
        <div class="popup-row"><span class="popup-label">Type</span><span class="popup-value">${e(props.cuas_type)}</span></div>
        <div class="popup-row"><span class="popup-label">Range</span><span class="popup-value">${e(props.effective_range_m)} m</span></div>
        <div class="popup-row"><span class="popup-label">Orientation</span><span class="popup-value">${e(props.orientation_deg)}&deg;</span></div>`;
    case 'engagement_line': {
      const pf = props.pass_fail;
      const pfColor = pf === 'pass' ? '#22c55e' : pf === 'fail' ? '#ef4444' : '#94a3b8';
      return `<div class="popup-title" style="color:#06b6d4">Engagement</div>
        <div class="popup-row"><span class="popup-label">CUAS</span><span class="popup-value">${e(props.cuas_name)}</span></div>
        <div class="popup-row"><span class="popup-label">Target</span><span class="popup-value">${e(props.target_tracker_id)}</span></div>
        <div class="popup-row"><span class="popup-label">Range</span><span class="popup-value">${Number(props.range_m || 0).toFixed(0)} m</span></div>
        <div class="popup-row"><span class="popup-label">Bearing</span><span class="popup-value">${Number(props.bearing_deg || 0).toFixed(1)}&deg;</span></div>
        ${pf ? `<div class="popup-row"><span class="popup-label">Result</span><span class="popup-badge" style="background:${pfColor}33;color:${pfColor}">${e(pf)}</span></div>` : ''}`;
    }
    case 'site_boundary':
      return `<div class="popup-title">Site Boundary</div>
        <div class="popup-row"><span class="popup-label">Name</span><span class="popup-value">${e(props.site_name)}</span></div>
        <div class="popup-row"><span class="popup-label">Environment</span><span class="popup-value">${e(props.environment_type)}</span></div>`;
    case 'site_zone':
      return `<div class="popup-title">Zone: ${e(props.zone_name)}</div>
        <div class="popup-row"><span class="popup-label">Type</span><span class="popup-value">${e(props.zone_type)}</span></div>
        ${props.notes ? `<div class="popup-row"><span class="popup-label">Notes</span><span class="popup-value">${e(props.notes)}</span></div>` : ''}`;
    case 'site_marker':
      return `<div class="popup-title" style="color:#ffd700">${e(props.marker_name)}</div>
        <div class="popup-row"><span class="popup-label">Type</span><span class="popup-value">${e(props.marker_type)}</span></div>
        ${props.notes ? `<div class="popup-row"><span class="popup-label">Notes</span><span class="popup-value">${e(props.notes)}</span></div>` : ''}`;
    case 'asset_placement':
      return `<div class="popup-title">Asset</div>
        <div class="popup-row"><span class="popup-label">Type</span><span class="popup-value">${e(props.asset_type)}</span></div>
        <div class="popup-row"><span class="popup-label">Label</span><span class="popup-value">${e(props.label)}</span></div>
        ${props.notes ? `<div class="popup-row"><span class="popup-label">Notes</span><span class="popup-value">${e(props.notes)}</span></div>` : ''}`;
    case 'cuas_coverage':
      return `<div class="popup-title" style="color:#ff6600">Coverage Zone</div>
        <div class="popup-row"><span class="popup-label">CUAS</span><span class="popup-value">${e(props.cuas_name)}</span></div>
        <div class="popup-row"><span class="popup-label">Range</span><span class="popup-value">${e(props.range_m)} m</span></div>`;
    default:
      return `<div class="popup-title">${e(featureType)}</div>`;
  }
}

function buildMapScript(
  trackSegmentsJSON: string,
  geojsonJSON: string,
): string {
  return `
(function() {
  // Gray fallback tile for offline
  var GRAY_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

  var map = L.map('map', { zoomControl: true, attributionControl: true });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
    errorTileUrl: GRAY_TILE
  }).addTo(map);

  L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

  // Cursor coordinate display
  var coordEl = document.getElementById('coord-display');
  map.on('mousemove', function(e) {
    coordEl.textContent = e.latlng.lat.toFixed(6) + ', ' + e.latlng.lng.toFixed(6);
  });

  // Parse data
  var trackSegments = JSON.parse(document.getElementById('track-data').textContent);
  var geojsonData = JSON.parse(document.getElementById('geojson-data').textContent);

  var allBounds = L.latLngBounds([]);

  // --- Layer groups ---
  var trackGoodHalo = L.layerGroup();
  var trackGood = L.layerGroup();
  var trackDegradedHalo = L.layerGroup();
  var trackDegraded = L.layerGroup();
  var trackLostHalo = L.layerGroup();
  var trackLost = L.layerGroup();
  var cuasMarkers = L.layerGroup();
  var cuasCoverage = L.layerGroup();
  var engagements = L.layerGroup();
  var siteBoundary = L.layerGroup();
  var siteZones = L.layerGroup();
  var siteMarkers = L.layerGroup();
  var assetMarkers = L.layerGroup();
  var arrowLayer = L.layerGroup();

  var QUALITY_STYLES = {
    good:     { color: '#22c55e', dashArray: null,     haloColor: 'rgba(34,197,94,0.2)' },
    degraded: { color: '#eab308', dashArray: '8,6',    haloColor: 'rgba(234,179,8,0.2)' },
    lost:     { color: '#ef4444', dashArray: '14,8',   haloColor: 'rgba(239,68,68,0.25)' }
  };

  // --- Render track segments ---
  var allTrackCoords = [];
  trackSegments.forEach(function(seg) {
    var latlngs = seg.coords.map(function(c) { return [c[1], c[0]]; });
    if (latlngs.length < 2) return;
    var style = QUALITY_STYLES[seg.quality] || QUALITY_STYLES.good;

    // Halo line
    var halo = L.polyline(latlngs, {
      color: style.haloColor, weight: 7, opacity: 1,
      dashArray: style.dashArray, lineCap: 'round', lineJoin: 'round', interactive: false
    });

    // Main line
    var main = L.polyline(latlngs, {
      color: style.color, weight: 3, opacity: 0.9,
      dashArray: style.dashArray, lineCap: 'round', lineJoin: 'round'
    });
    main.bindPopup(seg.popup, { maxWidth: 300 });

    var haloGroup = seg.quality === 'good' ? trackGoodHalo :
                    seg.quality === 'degraded' ? trackDegradedHalo : trackLostHalo;
    var mainGroup = seg.quality === 'good' ? trackGood :
                    seg.quality === 'degraded' ? trackDegraded : trackLost;

    haloGroup.addLayer(halo);
    mainGroup.addLayer(main);
    allBounds.extend(main.getBounds());
    allTrackCoords.push({ latlngs: latlngs, color: style.color, quality: seg.quality });
  });

  // --- Render GeoJSON features (non-track) ---
  geojsonData.features.forEach(function(f) {
    var ft = f.properties.feature_type;
    var coords, latlng, latlngs, layer;

    if (ft === 'cuas_placement') {
      coords = f.geometry.coordinates;
      latlng = [coords[1], coords[0]];
      layer = L.circleMarker(latlng, {
        radius: 8, fillColor: '#ff6600', fillOpacity: 0.9,
        color: '#ff6600', weight: 2, opacity: 0.5
      });
      layer.bindPopup(f.properties._popup, { maxWidth: 300 });
      cuasMarkers.addLayer(layer);
      allBounds.extend(latlng);

    } else if (ft === 'cuas_coverage') {
      latlngs = f.geometry.coordinates[0].map(function(c) { return [c[1], c[0]]; });
      layer = L.polygon(latlngs, {
        fillColor: '#ff6600', fillOpacity: 0.08,
        color: '#ff6600', weight: 1.5, opacity: 0.4, dashArray: '6,4'
      });
      layer.bindPopup(f.properties._popup, { maxWidth: 300 });
      cuasCoverage.addLayer(layer);

    } else if (ft === 'engagement_line') {
      latlngs = f.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
      layer = L.polyline(latlngs, {
        color: '#06b6d4', weight: 2, opacity: 0.8, dashArray: '8,5'
      });
      layer.bindPopup(f.properties._popup, { maxWidth: 300 });
      engagements.addLayer(layer);
      allBounds.extend(L.latLngBounds(latlngs));

    } else if (ft === 'site_boundary') {
      latlngs = f.geometry.coordinates[0].map(function(c) { return [c[1], c[0]]; });
      layer = L.polygon(latlngs, {
        fillColor: 'transparent', fillOpacity: 0,
        color: '#ffffff', weight: 1.5, opacity: 0.5, dashArray: '10,6'
      });
      layer.bindPopup(f.properties._popup, { maxWidth: 300 });
      siteBoundary.addLayer(layer);
      allBounds.extend(L.latLngBounds(latlngs));

    } else if (ft === 'site_zone') {
      latlngs = f.geometry.coordinates[0].map(function(c) { return [c[1], c[0]]; });
      var zoneColor = f.properties.color || '#6366f1';
      layer = L.polygon(latlngs, {
        fillColor: zoneColor, fillOpacity: 0.08,
        color: zoneColor, weight: 1.5, opacity: 0.4, dashArray: '6,4'
      });
      layer.bindPopup(f.properties._popup, { maxWidth: 300 });
      siteZones.addLayer(layer);

    } else if (ft === 'site_marker') {
      coords = f.geometry.coordinates;
      latlng = [coords[1], coords[0]];
      layer = L.circleMarker(latlng, {
        radius: 5, fillColor: '#ffd700', fillOpacity: 0.9,
        color: '#ffd700', weight: 1.5, opacity: 0.5
      });
      layer.bindPopup(f.properties._popup, { maxWidth: 300 });
      siteMarkers.addLayer(layer);
      allBounds.extend(latlng);

    } else if (ft === 'asset_placement') {
      coords = f.geometry.coordinates;
      latlng = [coords[1], coords[0]];
      layer = L.circleMarker(latlng, {
        radius: 5, fillColor: '#ffffff', fillOpacity: 0.9,
        color: '#ffffff', weight: 1.5, opacity: 0.5
      });
      layer.bindPopup(f.properties._popup, { maxWidth: 300 });
      assetMarkers.addLayer(layer);
      allBounds.extend(latlng);
    }
  });

  // --- Build overlay groups for layer control ---
  // Track wrapper groups (contain halo + main for proper toggle)
  var trackGoodGroup     = L.layerGroup([trackGoodHalo, trackGood]);
  var trackDegradedGroup = L.layerGroup([trackDegradedHalo, trackDegraded]);
  var trackLostGroup     = L.layerGroup([trackLostHalo, trackLost]);

  var overlays = {};
  if (trackGood.getLayers().length)     overlays['<span style="color:#22c55e">&#9632;</span> Good GPS']     = trackGoodGroup;
  if (trackDegraded.getLayers().length) overlays['<span style="color:#eab308">&#9632;</span> Degraded GPS'] = trackDegradedGroup;
  if (trackLost.getLayers().length)     overlays['<span style="color:#ef4444">&#9632;</span> Lost GPS']     = trackLostGroup;
  if (cuasMarkers.getLayers().length)   overlays['<span style="color:#ff6600">&#9679;</span> CUAS']         = cuasMarkers;
  if (cuasCoverage.getLayers().length)  overlays['<span style="color:#ff6600">&#9675;</span> Coverage']     = cuasCoverage;
  if (engagements.getLayers().length)   overlays['<span style="color:#06b6d4">&#8211;</span> Engagements']  = engagements;
  if (siteBoundary.getLayers().length)  overlays['<span style="color:#ffffff">&#9633;</span> Boundary']     = siteBoundary;
  if (siteZones.getLayers().length)     overlays['<span style="color:#6366f1">&#9632;</span> Zones']        = siteZones;
  if (siteMarkers.getLayers().length)   overlays['<span style="color:#ffd700">&#9679;</span> Markers']      = siteMarkers;
  if (assetMarkers.getLayers().length)  overlays['<span style="color:#ffffff">&#9679;</span> Assets']       = assetMarkers;

  // --- Add layers to map in render order (bottom to top) ---
  // "Off by default" layers (coverage, zones) are NOT added here
  // siteZones — off by default
  siteBoundary.getLayers().length && siteBoundary.addTo(map);
  // cuasCoverage — off by default
  engagements.getLayers().length && engagements.addTo(map);
  trackGood.getLayers().length && trackGoodGroup.addTo(map);
  trackDegraded.getLayers().length && trackDegradedGroup.addTo(map);
  trackLost.getLayers().length && trackLostGroup.addTo(map);
  cuasMarkers.getLayers().length && cuasMarkers.addTo(map);
  siteMarkers.getLayers().length && siteMarkers.addTo(map);
  assetMarkers.getLayers().length && assetMarkers.addTo(map);
  arrowLayer.addTo(map);

  L.control.layers(null, overlays, { collapsed: true, position: 'topleft' }).addTo(map);

  // --- Direction arrows ---
  var MAX_ARROWS_PER_TRACKER = 50;

  function createArrowIcon(color, angle) {
    return L.divIcon({
      className: 'track-arrow',
      html: '<svg width="12" height="12" viewBox="0 0 12 12" style="transform:rotate(' + angle + 'deg)"><polygon points="6,0 12,12 6,8 0,12" fill="' + color + '" opacity="0.8"/></svg>',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
  }

  function bearing(lat1, lng1, lat2, lng2) {
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    var x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  var arrowDebounceTimer = null;

  function updateArrows() {
    arrowLayer.clearLayers();
    if (!map.hasLayer(trackGoodGroup) && !map.hasLayer(trackDegradedGroup) && !map.hasLayer(trackLostGroup)) return;

    var zoom = map.getZoom();
    var targetPx = 90;

    allTrackCoords.forEach(function(track) {
      if (track.latlngs.length < 2) return;
      // Check if this quality layer is visible
      var layerVisible =
        (track.quality === 'good' && map.hasLayer(trackGoodGroup)) ||
        (track.quality === 'degraded' && map.hasLayer(trackDegradedGroup)) ||
        (track.quality === 'lost' && map.hasLayer(trackLostGroup));
      if (!layerVisible) return;

      var pts = track.latlngs;
      var arrows = [];
      var accumPx = 0;

      for (var i = 1; i < pts.length && arrows.length < MAX_ARROWS_PER_TRACKER; i++) {
        var p1 = map.latLngToContainerPoint(pts[i - 1]);
        var p2 = map.latLngToContainerPoint(pts[i]);
        var dx = p2.x - p1.x, dy = p2.y - p1.y;
        var segPx = Math.sqrt(dx * dx + dy * dy);
        accumPx += segPx;
        if (accumPx >= targetPx) {
          var angle = bearing(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
          arrows.push({ latlng: pts[i], angle: angle });
          accumPx = 0;
        }
      }

      arrows.forEach(function(a) {
        var icon = createArrowIcon(track.color, a.angle);
        L.marker(a.latlng, { icon: icon, interactive: false }).addTo(arrowLayer);
      });
    });
  }

  map.on('zoomend moveend', function() {
    clearTimeout(arrowDebounceTimer);
    arrowDebounceTimer = setTimeout(updateArrows, 150);
  });

  map.on('overlayadd overlayremove', function() {
    clearTimeout(arrowDebounceTimer);
    arrowDebounceTimer = setTimeout(updateArrows, 150);
  });

  // --- Fit bounds ---
  if (allBounds.isValid()) {
    map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 16 });
  } else {
    map.setView([0, 0], 2);
  }

  // Initial arrows after fit
  setTimeout(updateArrows, 300);
})();
  `;
}

// --- Main generator ---

export function generateLeafletMap(
  geojson: GeoJSONFeatureCollection,
  positionsByTracker: Map<string, TrackerPosition[]>,
  sessionName: string,
): string {
  // --- Build track segments with GPS quality ---
  const trackSegments: Array<{
    quality: string;
    coords: number[][];
    popup: string;
    trackerId: string;
  }> = [];

  const MAX_POINTS_PER_TRACKER = 10000;

  for (const [trackerId, rawPositions] of positionsByTracker) {
    if (rawPositions.length < 2) continue;
    const positions = thinPositions(rawPositions, MAX_POINTS_PER_TRACKER);
    const segments = segmentTrackByGPSQuality(positions);

    for (const seg of segments) {
      const coords = seg.positions.map(p => [p.longitude, p.latitude]);
      const speeds = seg.positions.map(p => p.speed_ms).filter(s => s != null);
      const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
      const popup = buildPopupForFeature({
        tracker_id: trackerId,
        gps_quality: seg.quality,
        start_time: seg.positions[0]?.timestamp?.substring(11, 19) || '',
        end_time: seg.positions[seg.positions.length - 1]?.timestamp?.substring(11, 19) || '',
        avg_speed_mps: avgSpeed.toFixed(1),
      }, 'drone_track_segment');

      trackSegments.push({
        quality: seg.quality,
        coords,
        popup,
        trackerId,
      });
    }
  }

  // --- Pre-render popups into GeoJSON features (non-track) ---
  const nonTrackFeatures = geojson.features.filter(
    f => f.properties.feature_type !== 'drone_track' && f.properties.feature_type !== 'session_metadata'
  );
  for (const f of nonTrackFeatures) {
    const ft = f.properties.feature_type as string;
    (f.properties as any)._popup = buildPopupForFeature(f.properties, ft);
  }

  // --- Gather metadata for info panel ---
  const metaFeature = geojson.features.find(f => f.properties.feature_type === 'session_metadata');
  const meta: Record<string, string> = {};

  if (metaFeature) {
    const p = metaFeature.properties;
    if (p.start_time) {
      const start = String(p.start_time);
      meta['Date'] = start.substring(0, 10);
      const end = p.end_time ? String(p.end_time) : '';
      meta['Time'] = start.substring(11, 19) + (end ? ' – ' + end.substring(11, 19) : '');
    }
    if (p.duration_seconds) {
      const dur = Number(p.duration_seconds);
      const m = Math.floor(dur / 60);
      const s = Math.floor(dur % 60);
      meta['Duration'] = `${m}m ${s}s`;
    }
    if (p.tracker_count != null) meta['Trackers'] = String(p.tracker_count);
    if (p.cuas_count != null) meta['CUAS Systems'] = String(p.cuas_count);
    if (p.engagement_count != null) meta['Engagements'] = String(p.engagement_count);
  } else {
    meta['Trackers'] = String(positionsByTracker.size);
  }

  const trackSegmentsJSON = safeInlineJSON(trackSegments);
  const geojsonJSON = safeInlineJSON({ type: 'FeatureCollection', features: nonTrackFeatures });

  const safeTitle = escapeHtml(sessionName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — SCENSUS Map</title>
<style>
/* Leaflet 1.9.4 CSS - embedded for offline use */
.leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute;left:0;top:0}.leaflet-container{overflow:hidden}.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow{-webkit-user-select:none;-moz-user-select:none;user-select:none;-webkit-user-drag:none}.leaflet-tile::selection{background:0 0}.leaflet-safari .leaflet-tile{image-rendering:-webkit-optimize-contrast}.leaflet-safari .leaflet-tile-container{width:1600px;height:1600px;-webkit-transform-origin:0 0}.leaflet-marker-icon,.leaflet-marker-shadow{display:block}.leaflet-container .leaflet-overlay-pane svg{max-width:none!important;max-height:none!important}.leaflet-container .leaflet-marker-pane img,.leaflet-container .leaflet-shadow-pane img,.leaflet-container .leaflet-tile-pane img,.leaflet-container img.leaflet-image-layer,.leaflet-container .leaflet-tile{max-width:none!important;max-height:none!important;width:auto;padding:0}.leaflet-container.leaflet-touch-zoom{-ms-touch-action:pan-x pan-y;touch-action:pan-x pan-y}.leaflet-container.leaflet-touch-drag{-ms-touch-action:pinch-zoom;touch-action:none;touch-action:pinch-zoom}.leaflet-container.leaflet-touch-drag.leaflet-touch-zoom{-ms-touch-action:none;touch-action:none}.leaflet-container{-webkit-tap-highlight-color:transparent}.leaflet-container a{-webkit-tap-highlight-color:rgba(51,181,229,.4)}.leaflet-tile{filter:inherit;visibility:hidden}.leaflet-tile-loaded{visibility:inherit}.leaflet-zoom-box{width:0;height:0;-moz-box-sizing:border-box;box-sizing:border-box;z-index:800}.leaflet-overlay-pane svg{-moz-user-select:none}.leaflet-pane{z-index:400}.leaflet-tile-pane{z-index:200}.leaflet-overlay-pane{z-index:400}.leaflet-shadow-pane{z-index:500}.leaflet-marker-pane{z-index:600}.leaflet-tooltip-pane{z-index:650}.leaflet-popup-pane{z-index:700}.leaflet-map-pane canvas{z-index:100}.leaflet-map-pane svg{z-index:200}.leaflet-vml-shape{width:1px;height:1px}.lvml{behavior:url(#default#VML);display:inline-block;position:absolute}.leaflet-control{position:relative;z-index:800;pointer-events:visiblePainted;pointer-events:auto}.leaflet-top,.leaflet-bottom{position:absolute;z-index:1000;pointer-events:none}.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}.leaflet-control{float:left;clear:both}.leaflet-right .leaflet-control{float:right}.leaflet-top .leaflet-control{margin-top:10px}.leaflet-bottom .leaflet-control{margin-bottom:10px}.leaflet-left .leaflet-control{margin-left:10px}.leaflet-right .leaflet-control{margin-right:10px}.leaflet-fade-anim .leaflet-popup{opacity:0;-webkit-transition:opacity .2s linear;-moz-transition:opacity .2s linear;transition:opacity .2s linear}.leaflet-fade-anim .leaflet-map-pane .leaflet-popup{opacity:1}.leaflet-zoom-animated{-webkit-transform-origin:0 0;-ms-transform-origin:0 0;transform-origin:0 0}.leaflet-zoom-anim .leaflet-zoom-animated{-webkit-transition:-webkit-transform .25s cubic-bezier(0,0,.25,1);-moz-transition:-moz-transform .25s cubic-bezier(0,0,.25,1);transition:transform .25s cubic-bezier(0,0,.25,1)}.leaflet-zoom-anim .leaflet-tile,.leaflet-pan-anim .leaflet-tile{-webkit-transition:none;-moz-transition:none;transition:none}.leaflet-zoom-anim .leaflet-zoom-hide{visibility:hidden}.leaflet-interactive{cursor:pointer}.leaflet-grab{cursor:-webkit-grab;cursor:-moz-grab;cursor:grab}.leaflet-crosshair,.leaflet-crosshair .leaflet-interactive{cursor:crosshair}.leaflet-popup-pane,.leaflet-control{cursor:auto}.leaflet-dragging .leaflet-grab,.leaflet-dragging .leaflet-grab .leaflet-interactive,.leaflet-dragging .leaflet-marker-draggable{cursor:move;cursor:-webkit-grabbing;cursor:-moz-grabbing;cursor:grabbing}.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-image-layer,.leaflet-pane>svg path,.leaflet-tile-container{pointer-events:none}.leaflet-marker-icon.leaflet-interactive,.leaflet-image-layer.leaflet-interactive,.leaflet-pane>svg path.leaflet-interactive,svg.leaflet-image-layer.leaflet-interactive path{pointer-events:visiblePainted;pointer-events:auto}.leaflet-container{background:#ddd;outline-offset:1px}.leaflet-container a{color:#0078a8}.leaflet-zoom-box{border:2px dotted #38f;background:rgba(255,255,255,.5)}.leaflet-container{font-family:"Helvetica Neue",Arial,Helvetica,sans-serif;font-size:12px;font-size:.75rem;line-height:1.5}.leaflet-bar{box-shadow:0 1px 5px rgba(0,0,0,.65);border-radius:4px}.leaflet-bar a{background-color:#fff;border-bottom:1px solid #ccc;width:26px;height:26px;line-height:26px;display:block;text-align:center;text-decoration:none;color:#333}.leaflet-bar a,.leaflet-control-layers-toggle{background-position:50% 50%;background-repeat:no-repeat;display:block}.leaflet-bar a:hover,.leaflet-bar a:focus{background-color:#f4f4f4}.leaflet-bar a:first-child{border-top-left-radius:4px;border-top-right-radius:4px}.leaflet-bar a:last-child{border-bottom-left-radius:4px;border-bottom-right-radius:4px;border-bottom:none}.leaflet-bar a.leaflet-disabled{cursor:default;background-color:#f4f4f4;color:#bbb}.leaflet-touch .leaflet-bar a{width:30px;height:30px;line-height:30px}.leaflet-touch .leaflet-bar a:first-child{border-top-left-radius:2px;border-top-right-radius:2px}.leaflet-touch .leaflet-bar a:last-child{border-bottom-left-radius:2px;border-bottom-right-radius:2px}.leaflet-control-zoom-in,.leaflet-control-zoom-out{font:bold 18px 'Lucida Console',Monaco,monospace;text-indent:1px}.leaflet-touch .leaflet-control-zoom-in,.leaflet-touch .leaflet-control-zoom-out{font-size:22px}.leaflet-control-layers{box-shadow:0 1px 5px rgba(0,0,0,.4);background:#fff;border-radius:5px}.leaflet-control-layers-toggle{background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAaCAYAAACpSkzOAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAJWSURBVEiJtZa9bhNBEMd/e3dnO3FMQkIUQQoqKCiQKHgB3oAnoOQheAIeghIJCYkGIZECJUJBSEhi53x3uw+Dd/Zmzx+JBSOt7nZn5j//mZ29hf+0hP+C7Fx88gYAa8vtXzfJjXc/Xr2/hFx0+fZSvmfhT0ee/3EB4JnX0/EqsQ7nFeCT76fj6JEqQ1UAWCsSgJfWmKryMhxAZACS2qKqdCAFcFDJonHf3+KI3P3wE0JcXABfhY+FU/dTahmb3a3d9aUE5CuTc5k+4NdKjrPVnm11fcepSb5cfTrpVxPH5P0B3mSnCqhLi2J5YA/K51d4O0P99+J6FvSxeLRpXjhfr0Bfq1w7CYXVfkCm4ANJkVvhVM3k9wM7h2pBDiX0HPx5e8AFHsZCgFCmqJI93ZWz86/XZXTO1JcaYCaFI/mXkz3dxCcYlJnBi/RJcuBqf5cAUCxNc8E5J2h++AHBsM+BjfaGjcCgVvd4oHE0K3u6Uf98X7YyHqVlzGR0h9OsXn5x9n2sIEkHXZUmcEGbj+Mx+C6cugIeAHdsSuPdFtDcW1R6vXSjgT3xw72NKdM1FTVz6gMlRb3dqbvdFtqNnT8STgEHAVebv/AJ51gTlAHWQTeXo3Nzs7FrjEXl9cAAUAqUOIk4cA3RKf2mZ3oVFp+BjCvBJ+dRrIBlk4HU6S1JAdHhZyVTjGAlgJcCmm9sD7ACngO2mxI+kTEPIDuEHOSi4UhBCJBw+X2p+PuKR9sDiGTwqRfAMeAE+pIkDjVIB5LZUbTEb50nxF/AX1NQI3YRczEAAAAASUVORK5CYII=);width:36px;height:36px}.leaflet-retina .leaflet-control-layers-toggle{background-image:url(data:image/png;base64,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);background-size:26px 26px}.leaflet-touch .leaflet-control-layers-toggle{width:44px;height:44px}.leaflet-control-layers .leaflet-control-layers-list,.leaflet-control-layers-expanded .leaflet-control-layers-toggle{display:none}.leaflet-control-layers-expanded .leaflet-control-layers-list{display:block;position:relative}.leaflet-control-layers-expanded{padding:6px 10px 6px 6px;color:#333;background:#fff}.leaflet-control-layers-scrollbar{overflow-y:scroll;overflow-x:hidden;padding-right:5px}.leaflet-control-layers-selector{margin-top:2px;position:relative;top:1px}.leaflet-control-layers label{display:block;font-size:13px;font-size:.8125rem}.leaflet-control-layers-separator{height:0;border-top:1px solid #ddd;margin:5px -10px 5px -6px}.leaflet-default-icon-path{background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAFgUlEQVR4Aa1XA5BjWRTN2ouj06telenh0eDgfA58tB0HB8CDA4ABMQN2oO/gBzLGlpwFAER8AGqI7QBRE2210Jomx3fzJa0vnc/Mvm/fPf/7v3P+/z6MpsijEVSxDAqjFCWQggBywKCLgMAJJKAqckMXACAYBIkgIUGyEiUawRAKpmhAgHgEogAKACAyMwYJgjhUDqMBKBGMA8AIAAHAB0CJiFAQBHsJFKCkBMDIBiCQVAJQgkKINQ6dIkqBMDIBNOuAgAIBgDEBQBsBg6CSPLkLv4APKQDSICAxIkCEBAD0ABgJSUagAKLgJYAQKABmYABxQC4CkBAkDAMALAlGIEAmIQqBkGIBCCBwAgQAUiGFJsAiCACBIAw8AIQC6AEIAwDwATAPDAHYBxAMwAaAHgHugAgABDBAHAGYA3AHYBjAAMBUACqDEBSK7BBCRSA4ABjEL0KGBAlMcYKCQACHAFYB5AMk0jljUAoBAJJEIkMSKyEUJCAjYIGCBIhMRBEIBFCwATIkQARABIFICgGYBQA5ANICgBMAAIIhxgEgQIGAHwAjAABAnR2PP4rkVBbsOgLVBjjEHR3u7z6+u7T+JJTSJIT/AgIIE8SAAW/P2fP08P7rOCMAkQAwjEBMRGC4CVBiCQCMAgkAgYARUMEo2yggiYgKkGiaMAFAEg0CQQAcKANkxw0YARAgFjUIGmcRCGWByJMQMOBMZAEJaIZBkINNgdRANkDIPSCRELh6VlrCYPLjHBQVoC0APCBDdSAUCAgYDABJkAhEAGIQIFjBgGIIEl4hQBIiERKAgJhBQQQMFCCkABJAAVDAGIAFABJdAkYQEKaBgoHgKSHhQycgjIBhBhAaYDhBsKFGUJBJkBQoQj0DABP+AjAREDGgCMAgcDOB0BGAYGOgPwFDAXmHA8BzAKgORA4MAAyAMwHQAPCFgQYL0lQHAQkLIAbBAfgIAIQD8O1IPDkXhfRdPkAn+RagFurgZcoADCQEAAzAAMBXAGYAvAEwBjAGYB3AE4BrAAQ0bS7dAJMJAqABYkMzMwR0EVghwQAgUTECEBUKBkGIBYFQoECgQHMBQgYBBwLIIgAoIIiEiKCBSEBIBUiYAKIIkBgFGAEgB0NAJSCYAkB8GAgQOEBBCgQGYJ0CYTMBYAMwDIAgDjAHIBFACIBFAAoBJgEoZg4BE0CBAKYhkGiAHIAGAOgBWAUQB5AEJghwBhACBFGGCAd4GlACAWBGBoJNkAgUIBBAAoYUhCZjgGIBUBJIABAAEIIwByAUYBpAGMAdgCEAIQ1MS8aQOdAEoB+AYEAICnAGYBLANIAFAAkAIg0fqcKAAkJBxgPkAJABIA0gEEAITZIYBSC3RswFEAiQC5AOIBAgEI5f7++RagFtABLJoJBABYkMvMwB0EVihAAkCyIgQAMlBAkEGAUwBiAagByACIBBADUEiAXVzfoFIA4gAAAA==)}.leaflet-container .leaflet-control-attribution{background:#fff;background:rgba(255,255,255,.8);margin:0}.leaflet-control-attribution,.leaflet-control-scale-line{padding:0 5px;color:#333;line-height:1.4}.leaflet-control-attribution a{text-decoration:none}.leaflet-control-attribution a:hover,.leaflet-control-attribution a:focus{text-decoration:underline}.leaflet-attribution-flag{display:inline!important;vertical-align:baseline!important;width:1em;height:.6669em}.leaflet-left .leaflet-control-scale{margin-left:5px}.leaflet-bottom .leaflet-control-scale{margin-bottom:5px}.leaflet-control-scale-line{border:2px solid #777;border-top:none;line-height:1.1;padding:2px 5px 1px;white-space:nowrap;-moz-box-sizing:border-box;box-sizing:border-box;background:rgba(255,255,255,.5)}.leaflet-control-scale-line:not(:first-child){border-top:2px solid #777;border-bottom:none;margin-top:-2px}.leaflet-control-scale-line:not(:first-child):not(:last-child){border-bottom:2px solid #777}.leaflet-touch .leaflet-control-attribution,.leaflet-touch .leaflet-control-layers,.leaflet-touch .leaflet-bar{box-shadow:none}.leaflet-touch .leaflet-control-layers,.leaflet-touch .leaflet-bar{border:2px solid rgba(0,0,0,.2);background-clip:padding-box}.leaflet-popup{position:absolute;text-align:center;margin-bottom:20px}.leaflet-popup-content-wrapper{padding:1px;text-align:left;border-radius:12px}.leaflet-popup-content{margin:13px 24px 13px 20px;line-height:1.3;font-size:13px;font-size:.8125rem;min-height:1px}.leaflet-popup-content p{margin:17px 0;margin:1.3em 0}.leaflet-popup-tip-container{width:40px;height:20px;position:absolute;left:50%;margin-top:-1px;margin-left:-20px;overflow:hidden;pointer-events:none}.leaflet-popup-tip{width:17px;height:17px;padding:1px;margin:-10px auto 0;pointer-events:auto;-webkit-transform:rotate(45deg);-moz-transform:rotate(45deg);-ms-transform:rotate(45deg);transform:rotate(45deg)}.leaflet-popup-content-wrapper,.leaflet-popup-tip{background:#fff;color:#333;box-shadow:0 3px 14px rgba(0,0,0,.4)}.leaflet-container a.leaflet-popup-close-button{position:absolute;top:0;right:0;border:none;text-align:center;width:24px;height:24px;font:16px/24px Tahoma,Verdana,sans-serif;color:#757575;text-decoration:none;background:0 0}.leaflet-container a.leaflet-popup-close-button:hover,.leaflet-container a.leaflet-popup-close-button:focus{color:#585858}.leaflet-popup-scrolled{overflow:auto}.leaflet-oldie .leaflet-popup-content-wrapper{-ms-zoom:1}.leaflet-oldie .leaflet-popup-tip{width:24px;margin:0 auto;-ms-filter:"progid:DXImageTransform.Microsoft.Matrix(M11=0.70710678, M12=0.70710678, M21=-0.70710678, M22=0.70710678)";filter:progid:DXImageTransform.Microsoft.Matrix(M11=0.70710678, M12=0.70710678, M21=-0.70710678, M22=0.70710678)}.leaflet-oldie .leaflet-control-zoom,.leaflet-oldie .leaflet-control-layers,.leaflet-oldie .leaflet-popup-content-wrapper,.leaflet-oldie .leaflet-popup-tip{border:1px solid #999}.leaflet-div-icon{background:#fff;border:1px solid #666}.leaflet-tooltip{position:absolute;padding:6px;background-color:#fff;border:1px solid #fff;border-radius:3px;color:#222;white-space:nowrap;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.4)}.leaflet-tooltip.leaflet-interactive{cursor:pointer;pointer-events:auto}.leaflet-tooltip-top:before,.leaflet-tooltip-bottom:before,.leaflet-tooltip-left:before,.leaflet-tooltip-right:before{position:absolute;pointer-events:none;border:6px solid transparent;background:0 0;content:""}.leaflet-tooltip-bottom{margin-top:6px}.leaflet-tooltip-top{margin-top:-6px}.leaflet-tooltip-bottom:before,.leaflet-tooltip-top:before{left:50%;margin-left:-6px}.leaflet-tooltip-top:before{bottom:0;margin-bottom:-12px;border-top-color:#fff}.leaflet-tooltip-bottom:before{top:0;margin-top:-12px;margin-left:-6px;border-bottom-color:#fff}.leaflet-tooltip-left{margin-left:-6px}.leaflet-tooltip-right{margin-left:6px}.leaflet-tooltip-left:before{right:0;margin-right:-12px;border-left-color:#fff}.leaflet-tooltip-right:before{left:0;margin-left:-12px;border-right-color:#fff}
</style>
<style>${buildCSS()}</style>
</head>
<body>
<div id="map"></div>
${buildInfoPanel(sessionName, meta)}
${buildLegend()}
<div class="coord-display" id="coord-display">0.000000, 0.000000</div>

<script type="application/json" id="track-data">${trackSegmentsJSON}</script>
<script type="application/json" id="geojson-data">${geojsonJSON}</script>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
// Verify Leaflet loaded; if offline CDN failed, show message
if (typeof L === 'undefined' || typeof L.map !== 'function') {
  document.getElementById('map').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:16px;text-align:center;padding:40px"><div><h2 style="color:#f8fafc;margin-bottom:12px">Map Unavailable Offline</h2><p>Leaflet library could not be loaded.<br>An internet connection is required to view this map.<br>Basemap tiles also require internet.</p></div></div>';
} else {
${buildMapScript(trackSegmentsJSON, geojsonJSON)}
}
</script>
<script>
function toggleLegend() {
  var body = document.getElementById('legend-body');
  var icon = document.getElementById('legend-toggle-icon');
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    icon.innerHTML = '&#9660;';
  } else {
    body.classList.add('collapsed');
    icon.innerHTML = '&#9654;';
  }
}
</script>
</body>
</html>`;
}
