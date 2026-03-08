/**
 * Map3DViewer Component
 * 3D-style visualization of drone tracks with altitude extrusion
 * Uses MapLibre GL's 3D capabilities (pitch, bearing, fill-extrusion)
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { PositionPoint, DroneSummary } from '../types/drone';
import type { EnhancedPositionPoint, SiteDefinition, CUASPlacement, CUASProfile, Engagement, JamBurst } from '../types/workflow';
import { computeEngagementGeometries, engagementGeometriesToGeoJSON } from '../utils/engagementGeometry';
import { QUALITY_COLORS } from '../utils/trackSegmentation';
import { createCUASMarkerElement, CUAS_MARKER_STYLES } from '../utils/cuasIcons';
import { RotateCcw, ChevronUp, ChevronDown, Eye, Settings, Mountain, Building2 } from 'lucide-react';

// MapTiler API key for terrain tiles (free tier: 100k requests/month)
// Get a free key at https://cloud.maptiler.com/account/keys/
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || 'g3Me0QolqB0nPmW2hWkq';

interface Map3DViewerProps {
  droneHistory: Map<string, PositionPoint[]>;
  enhancedHistory?: Map<string, EnhancedPositionPoint[]>;
  currentTime: number;
  timelineStart: number;
  onClose?: () => void;
  showQualityColors?: boolean;
  // Map style
  mapStyle?: 'dark' | 'satellite' | 'street';
  // Site boundary support
  site?: SiteDefinition | null;
  // CUAS placement support
  cuasPlacements?: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  // Jam states for visual feedback
  cuasJamStates?: Map<string, boolean>;
  // Live drone telemetry data for labels
  currentDroneData?: Map<string, DroneSummary>;
  // Drone selection and interaction
  selectedDroneId?: string | null;
  onDroneClick?: (droneId: string) => void;
  // SD Card track visualization props (dual-track display)
  sdCardTracks?: Map<string, EnhancedPositionPoint[]>;
  showSDCardTracks?: boolean;
  // Viewshed overlay props (terrain-aware LOS/NLOS)
  viewshedImageUrl?: string | null;
  viewshedBounds?: [[number, number], [number, number], [number, number], [number, number]] | null;
  showViewshed?: boolean;
  // Engagement visualization
  activeEngagements?: Engagement[];
  activeBursts?: Map<string, JamBurst>;
  // Map-click engagement mode
  onCuasClick?: (cuasPlacementId: string) => void;
  engagementModeCuasId?: string | null;
}

// Track colors
const TRACK_COLORS = [
  '#00c8ff', '#ff6b6b', '#4ecdc4', '#f7dc6f',
  '#bb8fce', '#58d68d', '#f8b500', '#5dade2',
];

// Convert track positions to GeoJSON as simple LineStrings (solid lines)
function createTrack3DGeoJSON(
  history: Map<string, PositionPoint[]>,
  enhancedHistory: Map<string, EnhancedPositionPoint[]> | undefined,
  timelineStart: number,
  currentTime: number,
  showQuality: boolean
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  let colorIndex = 0;

  for (const [trackerId, positions] of history) {
    const color = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
    colorIndex++;

    // Get enhanced data if available
    const enhanced = enhancedHistory?.get(trackerId);

    // Filter by time range - but be lenient: if we have positions, use the most recent ones
    let filteredPositions = positions.filter(
      p => p.timestamp >= timelineStart && p.timestamp <= currentTime
    );

    // If no positions in range but we have history, use all positions (they're probably recent)
    if (filteredPositions.length < 2 && positions.length >= 2) {
      console.log(`[Map3DViewer] Using all ${positions.length} positions for ${trackerId} (none in time range)`);
      filteredPositions = positions;
    }

    if (filteredPositions.length < 2) continue;

    // Create a single LineString for the entire track (simple solid line)
    const coordinates: [number, number][] = filteredPositions
      .filter(p => isFinite(p.lon) && isFinite(p.lat))
      .map(p => [p.lon, p.lat]);

    if (coordinates.length < 2) continue;

    // If showing quality colors, create segments with different colors
    if (showQuality && enhanced) {
      // Create individual line segments for quality coloring
      for (let i = 0; i < filteredPositions.length - 1; i++) {
        const p1 = filteredPositions[i];
        const p2 = filteredPositions[i + 1];

        if (!isFinite(p1.lon) || !isFinite(p1.lat) || !isFinite(p2.lon) || !isFinite(p2.lat)) continue;

        // Determine quality color
        let segmentColor = color;
        const enhancedPoint = enhanced.find(ep => ep.timestamp_ms === p1.timestamp);
        if (enhancedPoint) {
          segmentColor = QUALITY_COLORS[enhancedPoint.quality] || color;
        }

        features.push({
          type: 'Feature',
          properties: {
            trackerId,
            color: segmentColor,
          },
          geometry: {
            type: 'LineString',
            coordinates: [[p1.lon, p1.lat], [p2.lon, p2.lat]],
          },
        });
      }
    } else {
      // Single LineString for the whole track
      features.push({
        type: 'Feature',
        properties: {
          trackerId,
          color,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    }

    // Add marker for latest position only
    const lastPos = filteredPositions[filteredPositions.length - 1];
    if (isFinite(lastPos.lon) && isFinite(lastPos.lat)) {
      features.push({
        type: 'Feature',
        properties: {
          trackerId,
          color,
          altitude: lastPos.alt_m || 0,
          type: 'marker',
        },
        geometry: {
          type: 'Point',
          coordinates: [lastPos.lon, lastPos.lat],
        },
      });
    }
  }

  // Debug logging
  const lineCount = features.filter(f => f.geometry.type === 'LineString').length;
  const markerCount = features.filter(f => f.geometry.type === 'Point').length;
  console.log(`[Map3DViewer] Track GeoJSON: ${lineCount} lines, ${markerCount} markers`);

  return {
    type: 'FeatureCollection',
    features,
  };
}

// Create telemetry labels GeoJSON for displaying altitude/coordinates along tracks
function createTelemetryLabelsGeoJSON(
  history: Map<string, PositionPoint[]>,
  currentDroneData: Map<string, DroneSummary> | undefined,
  timelineStart: number,
  currentTime: number,
  labelInterval: number = 10
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  let colorIndex = 0;

  for (const [trackerId, positions] of history) {
    const color = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
    colorIndex++;

    const filteredPositions = positions.filter(
      p => p.timestamp >= timelineStart && p.timestamp <= currentTime
    );

    if (filteredPositions.length === 0) continue;

    const droneData = currentDroneData?.get(trackerId);

    // Add labels at intervals along the track
    for (let i = 0; i < filteredPositions.length; i += labelInterval) {
      const p = filteredPositions[i];
      const isLatest = i >= filteredPositions.length - labelInterval;

      let labelText = `${(p.alt_m ?? 0).toFixed(0)}m`;

      // Latest point shows full telemetry
      if (isLatest && droneData) {
        labelText = [
          `Alt: ${(droneData.alt_m ?? 0).toFixed(1)}m`,
          `${Math.abs(droneData.lat ?? 0).toFixed(5)}°${(droneData.lat ?? 0) >= 0 ? 'N' : 'S'}`,
          `${Math.abs(droneData.lon ?? 0).toFixed(5)}°${(droneData.lon ?? 0) >= 0 ? 'E' : 'W'}`,
        ].join('\n');
      }

      features.push({
        type: 'Feature',
        properties: { trackerId, color, label: labelText, isLatest },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

// SD Card Orange color for 3D tracks
const SD_CARD_COLOR = '#f97316';

// Create SD Card track GeoJSON as simple LineString (for solid line visualization)
function createSDCardTrack3DGeoJSON(
  sdCardTracks: Map<string, EnhancedPositionPoint[]>,
  timelineStart: number,
  currentTime: number
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const [trackerId, points] of sdCardTracks) {
    // Filter points within time range - use timestamp_ms
    let filteredPoints = points.filter(
      p => p.timestamp_ms >= timelineStart && p.timestamp_ms <= currentTime
    );

    // If no points in range but we have data, use all points
    if (filteredPoints.length < 2 && points.length >= 2) {
      filteredPoints = points;
    }

    if (filteredPoints.length < 2) continue;

    // Create a single LineString for the entire track (simple solid line)
    const coordinates: [number, number][] = filteredPoints
      .filter(p => isFinite(p.lon) && isFinite(p.lat))
      .map(p => [p.lon, p.lat]);

    if (coordinates.length < 2) continue;

    // Add the LineString track
    features.push({
      type: 'Feature',
      properties: {
        trackerId,
        color: SD_CARD_COLOR,
        source: 'sd_card',
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    });

    // Add marker for latest position
    const lastPoint = filteredPoints[filteredPoints.length - 1];
    if (isFinite(lastPoint.lon) && isFinite(lastPoint.lat)) {
      features.push({
        type: 'Feature',
        properties: {
          trackerId,
          color: SD_CARD_COLOR,
          source: 'sd_card',
          type: 'marker',
          altitude: lastPoint.alt_m || 0,
        },
        geometry: {
          type: 'Point',
          coordinates: [lastPoint.lon, lastPoint.lat],
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

// Create a drone marker HTML element with telemetry info - COMPACT VERSION
function createDroneMarkerElement(
  trackerId: string,
  color: string,
  altitude: number,
  speed: number,
  heading: number
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'drone-3d-marker';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: auto;
    cursor: pointer;
  `;

  // Altitude pole (vertical line from ground) - thinner and shorter
  const pole = document.createElement('div');
  pole.className = 'drone-altitude-pole';
  const poleHeight = Math.min(Math.max(altitude * 0.5, 10), 60); // Shorter pole
  pole.style.cssText = `
    width: 1px;
    height: ${poleHeight}px;
    background: linear-gradient(to top, rgba(255,255,255,0.05), ${color}80);
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1;
  `;

  // Drone icon container (at top of pole) - TINY version for track visualization
  const droneIcon = document.createElement('div');
  droneIcon.className = 'drone-icon-3d';
  droneIcon.style.cssText = `
    width: 12px;
    height: 12px;
    background: ${color};
    border: 2px solid white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 8px ${color}, 0 2px 4px rgba(0,0,0,0.3);
    position: relative;
    z-index: 10;
    transform: rotate(${heading}deg);
  `;

  // Tiny drone icon - just a dot with direction indicator
  droneIcon.innerHTML = `
    <div style="width: 0; height: 0; border-left: 3px solid transparent; border-right: 3px solid transparent; border-bottom: 5px solid white; position: absolute; top: -4px;"></div>
  `;

  // Compact telemetry label - only shown on hover via CSS
  const label = document.createElement('div');
  label.className = 'drone-telemetry-label';
  label.style.cssText = `
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid ${color};
    border-radius: 4px;
    padding: 4px 6px;
    margin-top: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 9px;
    color: white;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    z-index: 10;
    opacity: 0.9;
  `;
  label.innerHTML = `
    <div style="color: ${color}; font-weight: 600; font-size: 8px;">${trackerId}</div>
    <div style="display: flex; gap: 6px; margin-top: 2px;">
      <span style="color: #4ade80;">${altitude.toFixed(0)}m</span>
      <span style="color: #60a5fa;">${speed.toFixed(1)}m/s</span>
    </div>
  `;

  container.appendChild(pole);
  container.appendChild(droneIcon);
  container.appendChild(label);

  return container;
}

export default function Map3DViewer({
  droneHistory,
  enhancedHistory,
  currentTime,
  timelineStart,
  onClose,
  showQualityColors = false,
  mapStyle = 'satellite',
  site,
  cuasPlacements = [],
  cuasProfiles = [],
  cuasJamStates = new Map(),
  currentDroneData,
  selectedDroneId,
  onDroneClick,
  sdCardTracks,
  showSDCardTracks = true,
  viewshedImageUrl = null,
  viewshedBounds = null,
  showViewshed = true,
  activeEngagements = [],
  activeBursts = new Map(),
  onCuasClick,
  engagementModeCuasId = null,
}: Map3DViewerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const sourceAddedRef = useRef(false);
  const sdCardSourceAddedRef = useRef(false);
  const engagementSourceAddedRef = useRef(false);
  const viewshedSourceAddedRef = useRef(false);
  const mapLoadedRef = useRef(false);
  const cuasMarkersRef = useRef<maplibregl.Marker[]>([]);
  const droneMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [pitch, setPitch] = useState(60);
  const [bearing, setBearing] = useState(0);
  const [exaggeration, setExaggeration] = useState(3);
  const [showControls, setShowControls] = useState(false); // Collapsed by default
  const [showTelemetryLabels, setShowTelemetryLabels] = useState(true); // Telemetry labels on by default
  const [terrainEnabled, setTerrainEnabled] = useState(true); // 3D terrain on by default
  const [buildingsEnabled, setBuildingsEnabled] = useState(true); // 3D buildings on by default

  // Ref to track current mapStyle for async callbacks (closures capture stale values)
  const mapStyleRef = useRef(mapStyle);

  // Keep mapStyleRef in sync with prop
  useEffect(() => {
    mapStyleRef.current = mapStyle;
    console.log('[Map3DViewer] mapStyleRef updated to:', mapStyle);
  }, [mapStyle]);

  // Engagement line GeoJSON (shared geometry module)
  const engagementLinesGeoJSON = useMemo(() => {
    const geometries = computeEngagementGeometries(activeEngagements, activeBursts, cuasPlacements, currentDroneData ?? new Map());
    return engagementGeometriesToGeoJSON(geometries);
  }, [activeEngagements, activeBursts, cuasPlacements, currentDroneData]);

  // Calculate bounds from data (history + current drones)
  const bounds = useMemo(() => {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    let hasData = false;

    // Include history positions
    for (const positions of droneHistory.values()) {
      for (const p of positions) {
        if (p.timestamp >= timelineStart && p.timestamp <= currentTime) {
          minLat = Math.min(minLat, p.lat);
          maxLat = Math.max(maxLat, p.lat);
          minLon = Math.min(minLon, p.lon);
          maxLon = Math.max(maxLon, p.lon);
          hasData = true;
        }
      }
    }

    // Also include current drone positions (important when history is empty/small)
    if (currentDroneData) {
      currentDroneData.forEach((drone) => {
        if (drone.lat != null && drone.lon != null) {
          minLat = Math.min(minLat, drone.lat);
          maxLat = Math.max(maxLat, drone.lat);
          minLon = Math.min(minLon, drone.lon);
          maxLon = Math.max(maxLon, drone.lon);
          hasData = true;
        }
      });
    }

    return hasData ? { minLat, maxLat, minLon, maxLon } : null;
  }, [droneHistory, currentTime, timelineStart, currentDroneData]);

  // Generate GeoJSON
  const trackGeoJSON = useMemo(() => {
    return createTrack3DGeoJSON(
      droneHistory,
      enhancedHistory,
      timelineStart,
      currentTime,
      showQualityColors
    );
  }, [droneHistory, enhancedHistory, currentTime, timelineStart, showQualityColors]);

  // Generate telemetry labels GeoJSON
  const telemetryLabelsGeoJSON = useMemo(() => {
    if (!showTelemetryLabels) {
      return { type: 'FeatureCollection' as const, features: [] };
    }
    return createTelemetryLabelsGeoJSON(
      droneHistory,
      currentDroneData,
      timelineStart,
      currentTime,
      5 // Show label every 5 points
    );
  }, [droneHistory, currentDroneData, currentTime, timelineStart, showTelemetryLabels]);

  // Generate SD Card track 3D GeoJSON (for dual-track visualization)
  const sdCardTrack3DGeoJSON = useMemo(() => {
    if (!sdCardTracks || sdCardTracks.size === 0) {
      return { type: 'FeatureCollection' as const, features: [] };
    }
    return createSDCardTrack3DGeoJSON(
      sdCardTracks,
      timelineStart,
      currentTime
    );
  }, [sdCardTracks, currentTime, timelineStart]);

  // Update track data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourceAddedRef.current) return;

    const source = map.getSource('tracks-3d') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(trackGeoJSON);
    }
  }, [trackGeoJSON]);

  // Update telemetry labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourceAddedRef.current) return;

    const source = map.getSource('telemetry-labels') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(telemetryLabelsGeoJSON);
    }
  }, [telemetryLabelsGeoJSON]);

  // Update SD Card track 3D data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sdCardSourceAddedRef.current) return;

    const source = map.getSource('sd-tracks-3d') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(sdCardTrack3DGeoJSON);
    }
  }, [sdCardTrack3DGeoJSON]);

  // Toggle map style visibility - use mapStyle prop directly, not ref
  // This effect handles BOTH initial load and subsequent style changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateVisibility = () => {
      // Guard: ensure layers exist before trying to update them
      if (!map.getLayer('carto-dark-layer')) {
        console.log('[Map3DViewer] Layers not ready yet, skipping visibility update');
        return;
      }

      // Use mapStyle prop directly - this effect re-runs when mapStyle changes
      map.setLayoutProperty('carto-dark-layer', 'visibility', mapStyle === 'dark' ? 'visible' : 'none');
      map.setLayoutProperty('esri-satellite-layer', 'visibility', mapStyle === 'satellite' ? 'visible' : 'none');
      map.setLayoutProperty('osm-street-layer', 'visibility', mapStyle === 'street' ? 'visible' : 'none');
      console.log('[Map3DViewer] Map style visibility updated to:', mapStyle);
    };

    if (map.isStyleLoaded()) {
      updateVisibility();
    } else {
      map.once('load', updateVisibility);
    }
  }, [mapStyle]);

  // Toggle SD Card track 3D visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sdCardSourceAddedRef.current) return;

    const visibility = showSDCardTracks ? 'visible' : 'none';

    if (map.getLayer('sd-tracks-line')) {
      map.setLayoutProperty('sd-tracks-line', 'visibility', visibility);
    }
    if (map.getLayer('sd-tracks-line-glow')) {
      map.setLayoutProperty('sd-tracks-line-glow', 'visibility', visibility);
    }
    if (map.getLayer('sd-position-markers')) {
      map.setLayoutProperty('sd-position-markers', 'visibility', visibility);
    }
  }, [showSDCardTracks]);

  // Update viewshed overlay when image URL or bounds change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewshedSourceAddedRef.current) return;

    const source = map.getSource('viewshed-overlay') as maplibregl.ImageSource;
    if (!source) return;

    if (viewshedImageUrl && viewshedBounds) {
      source.updateImage({
        url: viewshedImageUrl,
        coordinates: viewshedBounds,
      });
    }
  }, [viewshedImageUrl, viewshedBounds]);

  // Toggle viewshed visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewshedSourceAddedRef.current) return;

    if (map.getLayer('viewshed-layer')) {
      map.setLayoutProperty(
        'viewshed-layer',
        'visibility',
        showViewshed && viewshedImageUrl ? 'visible' : 'none',
      );
    }
  }, [showViewshed, viewshedImageUrl]);

  // Update engagement lines when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !engagementSourceAddedRef.current) return;

    const source = map.getSource('engagement-lines-3d') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(engagementLinesGeoJSON);
    }
  }, [engagementLinesGeoJSON]);

  // Engagement mode: highlight selected CUAS marker
  useEffect(() => {
    for (const marker of cuasMarkersRef.current) {
      const el = marker.getElement();
      const cuasId = el.dataset?.cuasId;
      if (engagementModeCuasId && cuasId === engagementModeCuasId) {
        el.style.outline = '3px solid #ef4444';
        el.style.outlineOffset = '2px';
        el.style.borderRadius = '50%';
      } else {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }
    }
    // Set crosshair cursor on the map container
    const map = mapRef.current;
    if (map) {
      map.getCanvas().style.cursor = engagementModeCuasId ? 'crosshair' : '';
    }
  }, [engagementModeCuasId]);

  // Update live drone markers with current position and telemetry
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    // Debug log
    console.log('[Map3DViewer] Updating drone markers, count:', currentDroneData?.size ?? 0);

    if (!currentDroneData || currentDroneData.size === 0) {
      // Clear all markers if no drone data
      droneMarkersRef.current.forEach(marker => marker.remove());
      droneMarkersRef.current.clear();
      return;
    }

    let colorIndex = 0;
    const currentMarkerIds = new Set<string>();

    currentDroneData.forEach((drone, trackerId) => {
      if (drone.lat == null || drone.lon == null) {
        console.log('[Map3DViewer] Skipping drone with null coords:', trackerId);
        return;
      }

      currentMarkerIds.add(trackerId);
      const color = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
      colorIndex++;

      const isSelected = selectedDroneId === trackerId;
      const existingMarker = droneMarkersRef.current.get(trackerId);

      if (existingMarker) {
        // Update existing marker position
        existingMarker.setLngLat([drone.lon, drone.lat]);

        // Update the marker element content
        const el = existingMarker.getElement();

        // Update selected state
        el.style.zIndex = isSelected ? '1000' : '10';

        const label = el.querySelector('.drone-telemetry-label') as HTMLElement;
        if (label) {
          label.style.borderWidth = isSelected ? '2px' : '1px';
          label.style.boxShadow = isSelected ? `0 0 12px ${color}` : '0 2px 6px rgba(0,0,0,0.5)';
          // Compact telemetry format
          label.innerHTML = `
            <div style="color: ${color}; font-weight: 600; font-size: 8px;">${trackerId}</div>
            <div style="display: flex; gap: 6px; margin-top: 2px;">
              <span style="color: #4ade80;">${(drone.alt_m ?? 0).toFixed(0)}m</span>
              <span style="color: #60a5fa;">${(drone.speed_mps ?? 0).toFixed(1)}m/s</span>
            </div>
          `;
        }
        // Update pole height - compact version
        const pole = el.querySelector('.drone-altitude-pole') as HTMLElement;
        if (pole) {
          const poleHeight = Math.min(Math.max((drone.alt_m ?? 0) * 0.5, 10), 60);
          pole.style.height = `${poleHeight}px`;
        }
        // Update drone icon rotation and selected state - tiny version
        const droneIcon = el.querySelector('.drone-icon-3d') as HTMLElement;
        if (droneIcon) {
          droneIcon.style.transform = `rotate(${drone.heading_deg ?? 0}deg)`;
          droneIcon.style.borderWidth = isSelected ? '3px' : '2px';
          droneIcon.style.width = isSelected ? '16px' : '12px';
          droneIcon.style.height = isSelected ? '16px' : '12px';
        }
      } else {
        // Create new marker
        console.log('[Map3DViewer] Creating marker for:', trackerId, 'at', drone.lat, drone.lon);
        const el = createDroneMarkerElement(
          trackerId,
          color,
          drone.alt_m ?? 0,
          drone.speed_mps ?? 0,
          drone.heading_deg ?? 0
        );

        // Add click handler for fly-to
        el.addEventListener('click', () => {
          console.log('[Map3DViewer] Drone clicked:', trackerId);
          onDroneClick?.(trackerId);
        });

        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
        })
          .setLngLat([drone.lon, drone.lat])
          .addTo(map);

        droneMarkersRef.current.set(trackerId, marker);
        console.log('[Map3DViewer] Marker added for:', trackerId);
      }
    });

    // Remove markers for drones that are no longer present
    droneMarkersRef.current.forEach((marker, trackerId) => {
      if (!currentMarkerIds.has(trackerId)) {
        marker.remove();
        droneMarkersRef.current.delete(trackerId);
      }
    });
  }, [currentDroneData, selectedDroneId, onDroneClick]);

  // Fly to selected drone
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !selectedDroneId || !currentDroneData) return;

    const drone = currentDroneData.get(selectedDroneId);
    if (drone && drone.lat != null && drone.lon != null) {
      console.log('[Map3DViewer] Flying to drone:', selectedDroneId);
      map.flyTo({
        center: [drone.lon, drone.lat],
        zoom: 17,
        pitch: 60,
        duration: 1500,
      });
    }
  }, [selectedDroneId, currentDroneData]);

  // Update line width based on exaggeration (subtle effect for lines)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourceAddedRef.current) return;

    // Adjust line width based on exaggeration (1x = 3px, 5x = 5px)
    const lineWidth = 3 + (exaggeration - 1) * 0.5;
    if (map.getLayer('tracks-line')) {
      map.setPaintProperty('tracks-line', 'line-width', lineWidth);
    }
  }, [exaggeration]);

  // Toggle terrain
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourceAddedRef.current) return;

    if (terrainEnabled) {
      map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
    } else {
      map.setTerrain(null);
    }
  }, [terrainEnabled]);

  // Toggle 3D buildings
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourceAddedRef.current) return;

    if (buildingsEnabled) {
      if (!map.getLayer('buildings-3d')) {
        map.addLayer({
          id: 'buildings-3d',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
              0, '#4a5568',
              20, '#667eea',
              50, '#764ba2',
              100, '#f093fb',
            ],
            'fill-extrusion-height': [
              'coalesce',
              ['get', 'render_height'],
              ['get', 'height'],
              10,
            ],
            'fill-extrusion-base': [
              'coalesce',
              ['get', 'render_min_height'],
              0,
            ],
            'fill-extrusion-opacity': 0.85,
          },
        });
        console.log('[Map3DViewer] Buildings layer re-added via toggle');
      }
    } else {
      if (map.getLayer('buildings-3d')) {
        map.removeLayer('buildings-3d');
        console.log('[Map3DViewer] Buildings layer removed via toggle');
      }
    }
  }, [buildingsEnabled]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const center: [number, number] = bounds
      ? [(bounds.minLon + bounds.maxLon) / 2, (bounds.minLat + bounds.maxLat) / 2]
      : [-77.0765, 38.8448];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        name: '3D Map',
        // Add glyphs for text labels (required for symbol layers)
        glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap &copy; CARTO',
          },
          'esri-satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: '&copy; Esri',
          },
          'osm-street': {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 22,
            layout: {
              visibility: mapStyle === 'dark' ? 'visible' : 'none',
            },
          },
          {
            id: 'esri-satellite-layer',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 22,
            layout: {
              visibility: mapStyle === 'satellite' ? 'visible' : 'none',
            },
          },
          {
            id: 'osm-street-layer',
            type: 'raster',
            source: 'osm-street',
            minzoom: 0,
            maxzoom: 19,
            layout: {
              visibility: mapStyle === 'street' ? 'visible' : 'none',
            },
          },
        ],
      },
      center,
      zoom: 15,
      pitch,
      bearing,
      attributionControl: false,
      // Enable all 3D navigation gestures
      dragRotate: true,
      touchZoomRotate: true,
      keyboard: true,
      doubleClickZoom: true,
      scrollZoom: true,
      boxZoom: true,
      dragPan: true,
    });

    // Enable keyboard shortcuts for rotation (CTRL+drag or right-click drag)
    console.log('[Map3DViewer] Map created with full 3D navigation enabled');

    map.on('load', () => {
      console.log('[Map3DViewer] Map loaded, adding terrain and buildings...');
      console.log('[Map3DViewer] MapTiler key:', MAPTILER_KEY ? 'Present' : 'MISSING');
      console.log('[Map3DViewer] Current drone data size:', currentDroneData?.size ?? 0);
      mapLoadedRef.current = true;

      // Ensure correct map style visibility on load using the ref (handles async timing)
      // The initial style may have captured a stale mapStyle value
      const currentStyle = mapStyleRef.current;
      console.log('[Map3DViewer] Setting initial visibility in load handler to:', currentStyle);
      map.setLayoutProperty('carto-dark-layer', 'visibility', currentStyle === 'dark' ? 'visible' : 'none');
      map.setLayoutProperty('esri-satellite-layer', 'visibility', currentStyle === 'satellite' ? 'visible' : 'none');
      map.setLayoutProperty('osm-street-layer', 'visibility', currentStyle === 'street' ? 'visible' : 'none');

      try {
        // Add MapTiler terrain source for 3D terrain
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
          tileSize: 256,
        });
        console.log('[Map3DViewer] Terrain source added');

        // Enable 3D terrain rendering
        if (terrainEnabled) {
          map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
          console.log('[Map3DViewer] Terrain enabled with exaggeration 1.5');
        }

        // Add hillshade layer for depth and shadow effects
        map.addLayer({
          id: 'hillshade',
          type: 'hillshade',
          source: 'terrain-dem',
          paint: {
            'hillshade-shadow-color': '#000000',
            'hillshade-highlight-color': '#ffffff',
            'hillshade-accent-color': '#000000',
            'hillshade-illumination-direction': 315,
            'hillshade-illumination-anchor': 'viewport',
            'hillshade-exaggeration': 0.5,
          },
        });
        console.log('[Map3DViewer] Hillshade layer added');

        // Add OpenMapTiles vector source for 3D buildings
        map.addSource('openmaptiles', {
          type: 'vector',
          url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
        });
        console.log('[Map3DViewer] OpenMapTiles source added');

        // Add 3D building extrusions layer with BRIGHT colors for visibility
        if (buildingsEnabled) {
          map.addLayer({
            id: 'buildings-3d',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 13, // Lower minzoom to show buildings earlier
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
                0, '#4a5568',   // Gray for short buildings
                20, '#667eea',  // Purple-blue
                50, '#764ba2',  // Purple
                100, '#f093fb', // Pink for tall buildings
              ],
              'fill-extrusion-height': [
                'coalesce',
                ['get', 'render_height'],
                ['get', 'height'],
                10,
              ],
              'fill-extrusion-base': [
                'coalesce',
                ['get', 'render_min_height'],
                0,
              ],
              'fill-extrusion-opacity': 0.85,
            },
          });
          console.log('[Map3DViewer] 3D buildings layer added');
        }
      } catch (error) {
        console.error('[Map3DViewer] Error setting up terrain/buildings:', error);
      }

      // Add site boundary if available
      if (site?.boundary_polygon && site.boundary_polygon.length >= 3) {
        // Convert boundary_polygon (GeoPoint[]) to GeoJSON Polygon
        const coords: [number, number][] = site.boundary_polygon.map(p => [p.lon, p.lat]);
        // Close the polygon by repeating the first point
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
          coords.push(coords[0]);
        }

        map.addSource('site-boundary', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { name: site.name },
            geometry: {
              type: 'Polygon',
              coordinates: [coords],
            },
          },
        });

        // Site boundary fill
        map.addLayer({
          id: 'site-boundary-fill',
          type: 'fill',
          source: 'site-boundary',
          paint: {
            'fill-color': '#ff8c00',
            'fill-opacity': 0.08,
          },
        });

        // Site boundary line
        map.addLayer({
          id: 'site-boundary-line',
          type: 'line',
          source: 'site-boundary',
          paint: {
            'line-color': '#ff8c00',
            'line-width': 2,
            'line-dasharray': [4, 4],
            'line-opacity': 0.6,
          },
        });
      }

      // Add CUAS range circles and markers if available
      if (cuasPlacements.length > 0) {
        // CUAS range circles (coverage visualization)
        cuasPlacements.forEach((placement, index) => {
          const profile = cuasProfiles.find(p => p.id === placement.cuas_profile_id);
          const range = profile?.effective_range_m || 500;

          // Create circle approximation
          const circleCoords: [number, number][] = [];
          for (let angle = 0; angle <= 360; angle += 10) {
            const rad = (angle * Math.PI) / 180;
            const lat = placement.position.lat + (range / 111320) * Math.cos(rad);
            const lon = placement.position.lon + (range / (111320 * Math.cos(placement.position.lat * Math.PI / 180))) * Math.sin(rad);
            circleCoords.push([lon, lat]);
          }

          map.addSource(`cuas-range-${index}`, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [circleCoords],
              },
            },
          });

          map.addLayer({
            id: `cuas-range-fill-${index}`,
            type: 'fill',
            source: `cuas-range-${index}`,
            paint: {
              'fill-color': '#ef4444',
              'fill-opacity': 0.1,
            },
          });

          map.addLayer({
            id: `cuas-range-line-${index}`,
            type: 'line',
            source: `cuas-range-${index}`,
            paint: {
              'line-color': '#ef4444',
              'line-width': 2,
              'line-dasharray': [3, 3],
              'line-opacity': 0.5,
            },
          });
        });

        // Create HTML markers with equipment-specific icons
        cuasPlacements.forEach((placement) => {
          const profile = cuasProfiles.find(p => p.id === placement.cuas_profile_id);
          if (!profile) return;

          const isJamming = cuasJamStates.get(placement.id) || false;

          const el = createCUASMarkerElement(
            profile.type,
            profile.name,
            placement.orientation_deg,
            isJamming
          );

          // Make CUAS marker clickable for engagement mode
          el.style.cursor = 'pointer';
          el.dataset.cuasId = placement.id;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onCuasClick) onCuasClick(placement.id);
          });

          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([placement.position.lon, placement.position.lat])
            .addTo(map);

          cuasMarkersRef.current.push(marker);
        });
      }

      // Add engagement lines source and layers
      map.addSource('engagement-lines-3d', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Engagement line - non-jamming (dashed, GPS-health colored)
      map.addLayer({
        id: 'engagement-lines-3d-line',
        type: 'line',
        source: 'engagement-lines-3d',
        filter: ['all', ['==', ['get', 'type'], 'line'], ['!=', ['get', 'isJamming'], true]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [4, 4],
        },
      });

      // Engagement line - active jamming (GPS-health color, wider)
      map.addLayer({
        id: 'engagement-lines-3d-jamming',
        type: 'line',
        source: 'engagement-lines-3d',
        filter: ['all', ['==', ['get', 'type'], 'line'], ['==', ['get', 'isJamming'], true]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3.5,
          'line-opacity': 0.95,
          'line-dasharray': [2, 2],
        },
      });

      // Engagement glow - non-jamming
      map.addLayer({
        id: 'engagement-lines-3d-glow',
        type: 'line',
        source: 'engagement-lines-3d',
        filter: ['all', ['==', ['get', 'type'], 'line'], ['!=', ['get', 'isJamming'], true]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 6,
          'line-opacity': 0.3,
          'line-blur': 3,
        },
      }, 'engagement-lines-3d-line');

      // Engagement glow - jamming (GPS-health color, brighter glow)
      map.addLayer({
        id: 'engagement-lines-3d-jamming-glow',
        type: 'line',
        source: 'engagement-lines-3d',
        filter: ['all', ['==', ['get', 'type'], 'line'], ['==', ['get', 'isJamming'], true]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 10,
          'line-opacity': 0.4,
          'line-blur': 4,
        },
      }, 'engagement-lines-3d-jamming');

      // Engagement range + bearing label
      map.addLayer({
        id: 'engagement-lines-3d-label',
        type: 'symbol',
        source: 'engagement-lines-3d',
        filter: ['==', ['get', 'type'], 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Open Sans Bold'],
          'text-allow-overlap': true,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.5,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0, 0, 0, 0.8)',
          'text-halo-width': 2,
        },
      });

      engagementSourceAddedRef.current = true;

      // Engagement line click popup
      const engLineClickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return;
        const props = e.features[0].properties;
        if (!props) return;

        const elapsed = props.engageTimestamp
          ? `${Math.round((Date.now() - new Date(props.engageTimestamp).getTime()) / 1000)}s`
          : '--';

        new maplibregl.Popup({ closeOnClick: true })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:monospace;font-size:11px;line-height:1.6;color:#fff;background:rgba(15,15,30,0.92);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(8px);">
              <div style="font-weight:700;margin-bottom:4px;">${props.cuasName || 'CUAS'} → ${props.trackerId}</div>
              <div>Range: <b>${props.rangeM}m</b> | Bearing: <b>${props.bearingDeg}°</b></div>
              <div>Slant: <b>${props.slantRangeM}m</b> | ΔAlt: <b>${props.altitudeDeltaM}m</b></div>
              <div>Jam: <b style="color:${props.isJamming ? '#ef4444' : '#22c55e'}">${props.isJamming ? 'ACTIVE' : 'OFF'}</b> | Time: <b>${elapsed}</b></div>
            </div>
          `)
          .addTo(map);
      };
      map.on('click', 'engagement-lines-3d-line', engLineClickHandler);
      map.on('click', 'engagement-lines-3d-jamming', engLineClickHandler);

      // Add viewshed overlay source (terrain-aware LOS/NLOS)
      map.addSource('viewshed-overlay', {
        type: 'image',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        coordinates: [
          [-180, 85],
          [180, 85],
          [180, -85],
          [-180, -85],
        ],
      });

      map.addLayer({
        id: 'viewshed-layer',
        type: 'raster',
        source: 'viewshed-overlay',
        layout: {
          'visibility': 'none',
        },
        paint: {
          'raster-opacity': 0.6,
          'raster-fade-duration': 300,
        },
      });

      viewshedSourceAddedRef.current = true;

      // Add 3D tracks source
      map.addSource('tracks-3d', {
        type: 'geojson',
        data: trackGeoJSON,
      });

      // Add glow line layer for tracks
      map.addLayer({
        id: 'tracks-line-glow',
        type: 'line',
        source: 'tracks-3d',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5,
          'line-opacity': 0.25,
          'line-blur': 2,
        },
      });

      // Add solid line layer for tracks
      map.addLayer({
        id: 'tracks-line',
        type: 'line',
        source: 'tracks-3d',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.9,
        },
      });

      // Add position markers
      map.addLayer({
        id: 'position-markers',
        type: 'circle',
        source: 'tracks-3d',
        filter: ['==', ['get', 'type'], 'marker'],
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.8,
        },
      });

      // Add telemetry labels source and layer
      map.addSource('telemetry-labels', {
        type: 'geojson',
        data: telemetryLabelsGeoJSON,
      });

      map.addLayer({
        id: 'telemetry-labels-text',
        type: 'symbol',
        source: 'telemetry-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': ['case', ['get', 'isLatest'], 12, 10],
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-justify': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'symbol-placement': 'point',
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': 'rgba(0, 0, 0, 0.9)',
          'text-halo-width': 2,
          'text-opacity': ['case', ['get', 'isLatest'], 1.0, 0.7],
        },
      });

      sourceAddedRef.current = true;

      // Add SD Card 3D tracks source and layers (for dual-track visualization)
      map.addSource('sd-tracks-3d', {
        type: 'geojson',
        data: sdCardTrack3DGeoJSON,
      });

      // SD Card track glow line (orange, placed below live tracks)
      map.addLayer({
        id: 'sd-tracks-line-glow',
        type: 'line',
        source: 'sd-tracks-3d',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#f97316', // Orange
          'line-width': 5,
          'line-opacity': 0.25,
          'line-blur': 2,
        },
      });

      // SD Card track solid line (orange)
      map.addLayer({
        id: 'sd-tracks-line',
        type: 'line',
        source: 'sd-tracks-3d',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#f97316', // Orange
          'line-width': 2,
          'line-opacity': 0.9,
        },
      });

      // SD Card position markers
      map.addLayer({
        id: 'sd-position-markers',
        type: 'circle',
        source: 'sd-tracks-3d',
        filter: ['==', ['get', 'type'], 'marker'],
        paint: {
          'circle-radius': 3,
          'circle-color': '#f97316', // Orange
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.7,
        },
      }, 'position-markers'); // Place below live position markers

      sdCardSourceAddedRef.current = true;
      console.log('[Map3DViewer] SD Card 3D tracks source and layers added');

      // Add initial drone markers
      if (currentDroneData && currentDroneData.size > 0) {
        console.log('[Map3DViewer] Adding initial drone markers:', currentDroneData.size);
        let colorIndex = 0;
        currentDroneData.forEach((drone, trackerId) => {
          if (drone.lat == null || drone.lon == null) return;

          const color = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
          colorIndex++;

          const el = createDroneMarkerElement(
            trackerId,
            color,
            drone.alt_m ?? 0,
            drone.speed_mps ?? 0,
            drone.heading_deg ?? 0
          );

          // Add click handler for fly-to
          el.addEventListener('click', () => {
            console.log('[Map3DViewer] Drone clicked:', trackerId);
            onDroneClick?.(trackerId);
          });

          const marker = new maplibregl.Marker({
            element: el,
            anchor: 'bottom',
          })
            .setLngLat([drone.lon, drone.lat])
            .addTo(map);

          droneMarkersRef.current.set(trackerId, marker);
          console.log('[Map3DViewer] Initial marker added for:', trackerId);
        });
      }

      // Fit to bounds - prefer site bounds, then track bounds
      if (site?.boundary_polygon && site.boundary_polygon.length >= 3) {
        const siteBounds = site.boundary_polygon.reduce(
          (acc, p) => ({
            minLon: Math.min(acc.minLon, p.lon),
            maxLon: Math.max(acc.maxLon, p.lon),
            minLat: Math.min(acc.minLat, p.lat),
            maxLat: Math.max(acc.maxLat, p.lat),
          }),
          { minLon: 180, maxLon: -180, minLat: 90, maxLat: -90 }
        );
        map.fitBounds(
          [[siteBounds.minLon, siteBounds.minLat], [siteBounds.maxLon, siteBounds.maxLat]],
          { padding: 100, pitch, bearing, duration: 1000 }
        );
      } else if (bounds) {
        map.fitBounds(
          [[bounds.minLon, bounds.minLat], [bounds.maxLon, bounds.maxLat]],
          { padding: 100, pitch, bearing, duration: 1000 }
        );
      }
    });

    // Add navigation controls
    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

    mapRef.current = map;

    return () => {
      // Clean up CUAS markers
      cuasMarkersRef.current.forEach(marker => marker.remove());
      cuasMarkersRef.current = [];
      // Clean up drone markers
      droneMarkersRef.current.forEach(marker => marker.remove());
      droneMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle pitch/bearing changes
  const handlePitchChange = useCallback((delta: number) => {
    const newPitch = Math.max(0, Math.min(85, pitch + delta));
    setPitch(newPitch);
    mapRef.current?.easeTo({ pitch: newPitch, duration: 300 });
  }, [pitch]);

  const handleBearingReset = useCallback(() => {
    setBearing(0);
    setPitch(60);
    mapRef.current?.easeTo({ bearing: 0, pitch: 60, duration: 500 });
  }, []);

  const handleExaggerationChange = useCallback((delta: number) => {
    const newExag = Math.max(1, Math.min(10, exaggeration + delta));
    setExaggeration(newExag);
  }, [exaggeration]);

  // Inject CUAS marker styles
  useEffect(() => {
    const styleId = 'cuas-marker-3d-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = CUAS_MARKER_STYLES;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#0a0a1a',
        zIndex: 50, // Lower z-index so map controls remain accessible
      }}
    >
      {/* Map container - ensure it receives all pointer events */}
      <div
        ref={mapContainerRef}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: 'grab',
        }}
      />

      {/* Header - ensure pointer-events don't block map interaction */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          background: 'rgba(20, 20, 35, 0.95)',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      >
        <Eye size={18} style={{ color: '#00c8ff' }} />
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
          3D Track View
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              marginLeft: '12px',
              padding: '6px 12px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Close 3D View
          </button>
        )}
      </div>

      {/* Controls toggle button */}
      <button
        onClick={() => setShowControls(prev => !prev)}
        title={showControls ? 'Hide Controls' : 'Show Controls'}
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '16px',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: showControls ? 'rgba(255, 140, 0, 0.3)' : 'rgba(20, 20, 35, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          color: showControls ? '#ff8c00' : 'rgba(255, 255, 255, 0.7)',
          cursor: 'pointer',
          zIndex: 11,
          transition: 'all 0.2s ease',
          pointerEvents: 'auto',
        }}
      >
        <Settings size={16} />
      </button>

      {/* Controls panel - collapsible */}
      {showControls && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '60px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px',
            background: 'rgba(20, 20, 35, 0.95)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          {/* Pitch control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', width: '50px' }}>
              Pitch
            </span>
            <button
              onClick={() => handlePitchChange(-10)}
              style={controlBtnStyle}
            >
              <ChevronDown size={14} />
            </button>
            <span style={{ fontSize: '12px', color: '#fff', width: '40px', textAlign: 'center' }}>
              {pitch}°
            </span>
            <button
              onClick={() => handlePitchChange(10)}
              style={controlBtnStyle}
            >
              <ChevronUp size={14} />
            </button>
          </div>

          {/* Exaggeration control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', width: '50px' }}>
              Height
            </span>
            <button
              onClick={() => handleExaggerationChange(-1)}
              style={controlBtnStyle}
            >
              <ChevronDown size={14} />
            </button>
            <span style={{ fontSize: '12px', color: '#fff', width: '40px', textAlign: 'center' }}>
              {exaggeration}x
            </span>
            <button
              onClick={() => handleExaggerationChange(1)}
              style={controlBtnStyle}
            >
              <ChevronUp size={14} />
            </button>
          </div>

          {/* Telemetry Labels Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', width: '50px' }}>
              Labels
            </span>
            <button
              onClick={() => setShowTelemetryLabels(prev => !prev)}
              style={{
                ...controlBtnStyle,
                flex: 1,
                justifyContent: 'center',
                background: showTelemetryLabels ? 'rgba(0, 200, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                color: showTelemetryLabels ? '#00c8ff' : '#fff',
              }}
            >
              {showTelemetryLabels ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />

          {/* Terrain Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mountain size={14} style={{ color: 'rgba(255,255,255,0.6)', width: '16px', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', width: '44px' }}>
              Terrain
            </span>
            <button
              onClick={() => setTerrainEnabled(prev => !prev)}
              style={{
                ...controlBtnStyle,
                flex: 1,
                justifyContent: 'center',
                background: terrainEnabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                color: terrainEnabled ? '#22c55e' : '#fff',
              }}
            >
              {terrainEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Buildings Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={14} style={{ color: 'rgba(255,255,255,0.6)', width: '16px', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', width: '44px' }}>
              Buildings
            </span>
            <button
              onClick={() => setBuildingsEnabled(prev => !prev)}
              style={{
                ...controlBtnStyle,
                flex: 1,
                justifyContent: 'center',
                background: buildingsEnabled ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                color: buildingsEnabled ? '#a855f7' : '#fff',
              }}
            >
              {buildingsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Reset button */}
          <button
            onClick={handleBearingReset}
            style={{
              ...controlBtnStyle,
              width: '100%',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '4px',
            }}
          >
            <RotateCcw size={14} />
            Reset View
          </button>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '60px',
          padding: '10px 14px',
          background: 'rgba(20, 20, 35, 0.95)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
          ALTITUDE (×{exaggeration})
        </div>
        <div
          style={{
            width: '120px',
            height: '8px',
            background: 'linear-gradient(to right, #00c8ff, #4ecdc4, #f7dc6f, #ff6b6b)',
            borderRadius: '4px',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
          <span>0m</span>
          <span>50m</span>
          <span>100m+</span>
        </div>
      </div>
    </div>
  );
}

const controlBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 8px',
  background: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '4px',
  color: '#fff',
  cursor: 'pointer',
};
