import { useEffect, useRef, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type { DroneSummary, PositionPoint, GPSHealthStatus } from '../types/drone';
import type { CUASPlacement, CUASProfile, EnhancedPositionPoint, SiteDefinition, GeoPoint, Engagement, SessionActor, JamBurst } from '../types/workflow';
import {
  generateCUASCoverageGeoJSON,
  generateCUASMarkersGeoJSON,
  createProfilesMap,
} from '../utils/cuasCoverage';
import {
  generateSiteBoundaryGeoJSON,
  generateSiteZonesGeoJSON,
  generateSiteMarkersGeoJSON,
  calculateSiteBounds,
} from '../utils/siteVisualization';
import { createQualityTrackGeoJSON } from '../utils/trackSegmentation';
import { computeEngagementGeometries, engagementGeometriesToGeoJSON } from '../utils/engagementGeometry';

interface MapProps {
  drones: Map<string, DroneSummary>;
  droneHistory: Map<string, PositionPoint[]>;
  enhancedHistory?: Map<string, EnhancedPositionPoint[]>;
  selectedDroneId: string | null;
  onDroneClick: (droneId: string) => void;
  currentTime: number;
  timelineStart: number;
  mapStyle?: 'dark' | 'satellite' | 'street';
  // Track quality visualization
  showQualityColors?: boolean;
  // CUAS coverage props
  cuasPlacements?: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  cuasJamStates?: Map<string, boolean>;
  showCuasCoverage?: boolean;
  // Site visualization props
  selectedSite?: SiteDefinition | null;
  // Drawing mode props
  isDrawingMode?: boolean;
  onDrawingComplete?: (points: GeoPoint[]) => void;
  // CUAS placement mode props
  placingCuasId?: string | null;
  onCuasPlaced?: (placementId: string, lat: number, lon: number) => void;
  // Fly to location
  flyToCenter?: { lat: number; lon: number; zoom?: number } | null;
  onFlyToComplete?: () => void;
  // SD Card track visualization props (dual-track display)
  sdCardTracks?: Map<string, EnhancedPositionPoint[]>;
  showSDCardTracks?: boolean;
  // Viewshed overlay props (terrain-aware LOS/NLOS)
  viewshedImageUrl?: string | null;
  viewshedBounds?: [[number, number], [number, number], [number, number], [number, number]] | null;
  showViewshed?: boolean;
  // Active engagement visualization
  activeEngagements?: Engagement[];
  // Session actors (human emitter operators on the field)
  sessionActors?: SessionActor[];
  // Active jam bursts keyed by engagement ID
  activeBursts?: Map<string, JamBurst>;
  // Map-click engagement mode
  onCuasClick?: (cuasPlacementId: string) => void;
  engagementModeCuasId?: string | null;
}

// Color palette for drone tracks (cycle through for different drones)
const TRACK_COLORS = [
  '#00c8ff', // cyan
  '#ff6b6b', // red
  '#4ecdc4', // teal
  '#f7dc6f', // yellow
  '#bb8fce', // purple
  '#58d68d', // green
  '#f8b500', // orange
  '#5dade2', // blue
];

// Aircraft/plane SVG icon - points up by default
const PLANE_SVG = `
<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L8 10H4L6 12L4 14H8L12 22L16 14H20L18 12L20 10H16L12 2Z"/>
</svg>
`;

// GPS health status colors for marker rings
const GPS_HEALTH_COLORS: Record<GPSHealthStatus, string> = {
  healthy: '#22c55e',  // green
  degraded: '#eab308', // yellow
  lost: '#ef4444',     // red
};

// Custom marker element factory with drone icon
function createMarkerElement(drone: DroneSummary, isSelected: boolean): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'drone-marker';

  if (isSelected) {
    el.classList.add('selected');
  }
  if (drone.is_stale) {
    el.classList.add('stale');
  } else if (!drone.fix_valid) {
    el.classList.add('no-fix');
  }
  if (drone.low_battery) {
    el.classList.add('low-battery');
  }
  if (drone.battery_critical) {
    el.classList.add('battery-critical');
  }

  // Add GPS health status class for styling
  const gpsHealthStatus = drone.gps_health?.health_status ?? 'healthy';
  if (gpsHealthStatus !== 'healthy' && !drone.is_stale) {
    el.classList.add(`gps-${gpsHealthStatus}`);

    // Add GPS health ring indicator (glowing border)
    const ringColor = GPS_HEALTH_COLORS[gpsHealthStatus];
    el.style.boxShadow = `0 0 0 3px ${ringColor}, 0 0 8px ${ringColor}40`;

    // Add pulse animation for non-healthy GPS status
    el.classList.add('gps-warning-pulse');
  }

  // Build badge HTML
  let badgeHtml = '';
  if (drone.is_stale) {
    badgeHtml = '<div class="drone-status-badge stale-badge">LAST KNOWN</div>';
  } else if (drone.battery_critical) {
    badgeHtml = '<div class="drone-status-badge critical-badge">CRITICAL</div>';
  } else if (drone.low_battery) {
    badgeHtml = '<div class="drone-status-badge battery-badge">LOW BAT</div>';
  } else if (gpsHealthStatus === 'lost') {
    // Add GPS lost badge
    badgeHtml = '<div class="drone-status-badge gps-lost-badge">NO GPS</div>';
  } else if (gpsHealthStatus === 'degraded') {
    // Add GPS degraded badge
    badgeHtml = '<div class="drone-status-badge gps-degraded-badge">GPS WEAK</div>';
  }

  // Create inner container with icon, label, and optional badge
  // Using DOM methods instead of innerHTML to prevent XSS from tracker_id

  // Add badge if present
  if (badgeHtml) {
    const badge = document.createElement('div');
    if (drone.is_stale) {
      badge.className = 'drone-status-badge stale-badge';
      badge.textContent = 'LAST KNOWN';
    } else if (drone.battery_critical) {
      badge.className = 'drone-status-badge critical-badge';
      badge.textContent = 'CRITICAL';
    } else if (drone.low_battery) {
      badge.className = 'drone-status-badge battery-badge';
      badge.textContent = 'LOW BAT';
    } else if (gpsHealthStatus === 'lost') {
      badge.className = 'drone-status-badge gps-lost-badge';
      badge.textContent = 'NO GPS';
    } else if (gpsHealthStatus === 'degraded') {
      badge.className = 'drone-status-badge gps-degraded-badge';
      badge.textContent = 'GPS WEAK';
    }
    el.appendChild(badge);
  }

  // Add icon (safe - comes from our constant)
  const iconDiv = document.createElement('div');
  iconDiv.className = 'drone-icon';
  iconDiv.innerHTML = PLANE_SVG;
  el.appendChild(iconDiv);

  // Add label (use textContent for safety)
  // Show alias if set, otherwise show tracker_id
  const labelDiv = document.createElement('div');
  labelDiv.className = 'drone-label';
  labelDiv.textContent = drone.alias || drone.tracker_id; // Safe: textContent escapes HTML
  el.appendChild(labelDiv);

  return el;
}

export default function MapComponent({
  drones,
  droneHistory,
  enhancedHistory,
  selectedDroneId,
  onDroneClick,
  currentTime,
  timelineStart,
  mapStyle = 'satellite',
  showQualityColors = false,
  cuasPlacements = [],
  cuasProfiles = [],
  cuasJamStates = new Map(),
  showCuasCoverage = true,
  selectedSite = null,
  isDrawingMode = false,
  onDrawingComplete,
  placingCuasId = null,
  onCuasPlaced,
  flyToCenter = null,
  onFlyToComplete,
  sdCardTracks,
  showSDCardTracks = true,
  viewshedImageUrl = null,
  viewshedBounds = null,
  showViewshed = true,
  activeEngagements = [],
  sessionActors = [],
  activeBursts = new Map(),
  onCuasClick,
  engagementModeCuasId = null,
}: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, maplibregl.Marker>>(new globalThis.Map());
  const drawRef = useRef<MapboxDraw | null>(null);
  const trackSourceAddedRef = useRef<boolean>(false);
  const cuasSourceAddedRef = useRef<boolean>(false);
  const siteSourceAddedRef = useRef<boolean>(false);
  const sdCardSourceAddedRef = useRef<boolean>(false);
  const viewshedSourceAddedRef = useRef<boolean>(false);
  const engagementSourceAddedRef = useRef<boolean>(false);
  const actorSourceAddedRef = useRef<boolean>(false);
  const onCuasClickRef = useRef(onCuasClick);
  onCuasClickRef.current = onCuasClick;

  // Create a stable mapping of tracker_id to color index
  const droneColorMap = useMemo(() => {
    const colorMap = new Map<string, number>();
    let index = 0;
    for (const trackerId of droneHistory.keys()) {
      if (!colorMap.has(trackerId)) {
        colorMap.set(trackerId, index % TRACK_COLORS.length);
        index++;
      }
    }
    return colorMap;
  }, [droneHistory]);

  // Create color string map from index map
  const droneColorStringMap = useMemo(() => {
    const colorMap = new Map<string, string>();
    for (const [trackerId, index] of droneColorMap) {
      colorMap.set(trackerId, TRACK_COLORS[index]);
    }
    return colorMap;
  }, [droneColorMap]);

  // Filter history to current time range and convert to GeoJSON
  const trackGeoJSON = useMemo(() => {
    // Use quality-based coloring if enabled and enhanced data is available
    if (showQualityColors && enhancedHistory && enhancedHistory.size > 0) {
      return createQualityTrackGeoJSON(
        droneHistory,
        enhancedHistory,
        droneColorStringMap,
        timelineStart,
        currentTime
      );
    }

    // Standard track rendering
    const features: GeoJSON.Feature[] = [];

    for (const [trackerId, positions] of droneHistory) {
      // Filter positions within the time range
      const filteredPositions = positions.filter(
        p => p.timestamp >= timelineStart && p.timestamp <= currentTime
      );

      if (filteredPositions.length < 2) continue;

      const colorIndex = droneColorMap.get(trackerId) || 0;
      const coordinates = filteredPositions.map(p => [p.lon, p.lat]);

      features.push({
        type: 'Feature',
        properties: {
          trackerId,
          color: TRACK_COLORS[colorIndex],
          quality: 'good',
          isDashed: false,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    }

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [droneHistory, enhancedHistory, currentTime, timelineStart, droneColorMap, droneColorStringMap, showQualityColors]);

  // Generate SD Card track GeoJSON (for dual-track visualization)
  const sdCardTrackGeoJSON = useMemo(() => {
    if (!sdCardTracks || sdCardTracks.size === 0) {
      return { type: 'FeatureCollection' as const, features: [] };
    }

    const features: GeoJSON.Feature[] = [];

    for (const [trackerId, points] of sdCardTracks) {
      // Filter points within time range
      const filteredPoints = points.filter(
        p => p.timestamp_ms >= timelineStart && p.timestamp_ms <= currentTime
      );

      // If no points in time range but we have data, use all points
      const pointsToUse = filteredPoints.length >= 2 ? filteredPoints : points;

      if (pointsToUse.length < 2) continue;

      const coordinates = pointsToUse.map(p => [p.lon, p.lat]);

      features.push({
        type: 'Feature',
        properties: {
          trackerId,
          source: 'sd_card',
          color: '#f97316', // Orange for SD card tracks
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    }

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [sdCardTracks, currentTime, timelineStart]);

  // Generate engagement line GeoJSON (CUAS-to-drone lines during active engagement)
  const engagementLinesGeoJSON = useMemo(() => {
    const geometries = computeEngagementGeometries(activeEngagements, activeBursts, cuasPlacements, drones);
    return engagementGeometriesToGeoJSON(geometries);
  }, [activeEngagements, activeBursts, cuasPlacements, drones]);

  // Generate session actor GeoJSON (human emitter operators on the field)
  const sessionActorsGeoJSON = useMemo(() => {
    if (!sessionActors || sessionActors.length === 0) {
      return { type: 'FeatureCollection' as const, features: [] };
    }

    const features: GeoJSON.Feature[] = [];

    for (const actor of sessionActors) {
      // Only include active actors with valid positions
      if (!actor.is_active || actor.lat == null || actor.lon == null) continue;

      features.push({
        type: 'Feature',
        properties: {
          id: actor.id,
          name: actor.name,
          callsign: actor.callsign ?? actor.name,
          heading_deg: actor.heading_deg ?? 0,
          is_active: actor.is_active,
        },
        geometry: {
          type: 'Point',
          coordinates: [actor.lon, actor.lat],
        },
      });
    }

    return { type: 'FeatureCollection' as const, features };
  }, [sessionActors]);

  // Generate CUAS coverage GeoJSON
  const cuasProfilesMap = useMemo(() => createProfilesMap(cuasProfiles), [cuasProfiles]);

  const cuasCoverageGeoJSON = useMemo(() => {
    return generateCUASCoverageGeoJSON(cuasPlacements, cuasProfilesMap, cuasJamStates);
  }, [cuasPlacements, cuasProfilesMap, cuasJamStates]);

  const cuasMarkersGeoJSON = useMemo(() => {
    return generateCUASMarkersGeoJSON(cuasPlacements, cuasProfilesMap, cuasJamStates);
  }, [cuasPlacements, cuasProfilesMap, cuasJamStates]);

  // Update track trails when GeoJSON changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trackSourceAddedRef.current) return;

    const source = map.getSource('drone-tracks') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(trackGeoJSON);
    }
  }, [trackGeoJSON]);

  // Update CUAS coverage when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cuasSourceAddedRef.current) return;

    const coverageSource = map.getSource('cuas-coverage') as maplibregl.GeoJSONSource;
    if (coverageSource) {
      coverageSource.setData(cuasCoverageGeoJSON as GeoJSON.FeatureCollection);
    }

    const markersSource = map.getSource('cuas-markers') as maplibregl.GeoJSONSource;
    if (markersSource) {
      markersSource.setData(cuasMarkersGeoJSON as GeoJSON.FeatureCollection);
    }
  }, [cuasCoverageGeoJSON, cuasMarkersGeoJSON]);

  // Toggle CUAS coverage visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cuasSourceAddedRef.current) return;

    const visibility = showCuasCoverage ? 'visible' : 'none';

    if (map.getLayer('cuas-coverage-fill')) {
      map.setLayoutProperty('cuas-coverage-fill', 'visibility', visibility);
    }
    if (map.getLayer('cuas-coverage-outline')) {
      map.setLayoutProperty('cuas-coverage-outline', 'visibility', visibility);
    }
    if (map.getLayer('cuas-markers-circle')) {
      map.setLayoutProperty('cuas-markers-circle', 'visibility', visibility);
    }
    if (map.getLayer('cuas-markers-inner')) {
      map.setLayoutProperty('cuas-markers-inner', 'visibility', visibility);
    }
  }, [showCuasCoverage]);

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

  // Update SD Card track source when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sdCardSourceAddedRef.current) return;

    const source = map.getSource('sd-card-tracks') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(sdCardTrackGeoJSON);
    }
  }, [sdCardTrackGeoJSON]);

  // Update engagement lines when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !engagementSourceAddedRef.current) return;

    const source = map.getSource('engagement-lines') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(engagementLinesGeoJSON);
    }
  }, [engagementLinesGeoJSON]);

  // Update session actors when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !actorSourceAddedRef.current) return;

    const source = map.getSource('session-actors') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(sessionActorsGeoJSON);
    }
  }, [sessionActorsGeoJSON]);

  // Engagement mode: crosshair cursor + highlight selected CUAS
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cuasSourceAddedRef.current) return;

    if (engagementModeCuasId) {
      map.getCanvas().style.cursor = 'crosshair';
      // Enlarge selected CUAS marker, shrink others
      if (map.getLayer('cuas-markers-circle')) {
        map.setPaintProperty('cuas-markers-circle', 'circle-radius', [
          'case',
          ['==', ['get', 'id'], engagementModeCuasId],
          12,
          8,
        ]);
        map.setPaintProperty('cuas-markers-circle', 'circle-stroke-width', [
          'case',
          ['==', ['get', 'id'], engagementModeCuasId],
          3,
          2,
        ]);
      }
    } else {
      map.getCanvas().style.cursor = '';
      if (map.getLayer('cuas-markers-circle')) {
        map.setPaintProperty('cuas-markers-circle', 'circle-radius', 8);
        map.setPaintProperty('cuas-markers-circle', 'circle-stroke-width', 2);
      }
    }
  }, [engagementModeCuasId]);

  // Toggle SD Card track visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sdCardSourceAddedRef.current) return;

    const visibility = showSDCardTracks ? 'visible' : 'none';

    if (map.getLayer('sd-card-tracks-glow')) {
      map.setLayoutProperty('sd-card-tracks-glow', 'visibility', visibility);
    }
    if (map.getLayer('sd-card-tracks-line')) {
      map.setLayoutProperty('sd-card-tracks-line', 'visibility', visibility);
    }
  }, [showSDCardTracks]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;


    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        name: 'Dark',
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
              visibility: 'none', // Default to satellite, so dark is hidden
            },
          },
          {
            id: 'esri-satellite-layer',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 22,
            // No layout = visible by default (satellite is the default)
          },
          {
            id: 'osm-street-layer',
            type: 'raster',
            source: 'osm-street',
            minzoom: 0,
            maxzoom: 19,
            layout: {
              visibility: 'none',
            },
          },
        ],
      },
      center: [-77.0765, 38.8448], // Default to Virginia (where trackers are)
      zoom: 14,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      touchZoomRotate: true,
    });

    map.on('load', () => {

      // Add track trails source and layer
      map.addSource('drone-tracks', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // Add solid track line layer (under markers) - for non-dashed segments
      map.addLayer({
        id: 'drone-tracks-line',
        type: 'line',
        source: 'drone-tracks',
        filter: ['!=', ['get', 'isDashed'], true],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.8,
        },
      });

      // Add dashed track line layer for lost/gap segments
      map.addLayer({
        id: 'drone-tracks-line-dashed',
        type: 'line',
        source: 'drone-tracks',
        filter: ['==', ['get', 'isDashed'], true],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.6,
          'line-dasharray': [2, 2],
        },
      });

      // Add a glow effect layer behind the main track
      map.addLayer({
        id: 'drone-tracks-glow',
        type: 'line',
        source: 'drone-tracks',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 8,
          'line-opacity': 0.3,
          'line-blur': 3,
        },
      }, 'drone-tracks-line'); // Place glow under the main line

      trackSourceAddedRef.current = true;

      // Add SD Card track source and layers (for dual-track visualization)
      map.addSource('sd-card-tracks', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // SD Card track glow layer (orange, placed below live tracks)
      map.addLayer({
        id: 'sd-card-tracks-glow',
        type: 'line',
        source: 'sd-card-tracks',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#f97316', // Orange for SD card tracks
          'line-width': 10,
          'line-opacity': 0.25,
          'line-blur': 4,
        },
      }, 'drone-tracks-glow'); // Place SD glow under live track glow

      // SD Card track solid line layer
      map.addLayer({
        id: 'sd-card-tracks-line',
        type: 'line',
        source: 'sd-card-tracks',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#f97316', // Orange for SD card tracks
          'line-width': 3,
          'line-opacity': 0.7,
        },
      }, 'drone-tracks-glow'); // Place SD line under live track glow

      sdCardSourceAddedRef.current = true;

      // Add engagement lines source and layers
      map.addSource('engagement-lines', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Engagement line layer - non-jamming (standard dashed line)
      map.addLayer({
        id: 'engagement-lines-line',
        type: 'line',
        source: 'engagement-lines',
        filter: ['all', ['==', ['get', 'type'], 'line'], ['!=', ['get', 'isJamming'], true]],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [4, 4],
        },
      });

      // Engagement line layer - active jamming (red, wider, rapid dashes)
      map.addLayer({
        id: 'engagement-lines-jamming',
        type: 'line',
        source: 'engagement-lines',
        filter: ['all', ['==', ['get', 'type'], 'line'], ['==', ['get', 'isJamming'], true]],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#ef4444', // Red for active jamming
          'line-width': 3.5,
          'line-opacity': 0.95,
          'line-dasharray': [2, 2],
        },
      });

      // Engagement line glow - non-jamming
      map.addLayer({
        id: 'engagement-lines-glow',
        type: 'line',
        source: 'engagement-lines',
        filter: ['all', ['==', ['get', 'type'], 'line'], ['!=', ['get', 'isJamming'], true]],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 6,
          'line-opacity': 0.3,
          'line-blur': 3,
        },
      }, 'engagement-lines-line');

      // Engagement line glow - active jamming (brighter red glow)
      map.addLayer({
        id: 'engagement-lines-jamming-glow',
        type: 'line',
        source: 'engagement-lines',
        filter: ['all', ['==', ['get', 'type'], 'line'], ['==', ['get', 'isJamming'], true]],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#ef4444',
          'line-width': 10,
          'line-opacity': 0.4,
          'line-blur': 4,
        },
      }, 'engagement-lines-jamming');

      // Engagement range + bearing label layer (auto-deconflicts with variable-anchor)
      map.addLayer({
        id: 'engagement-lines-label',
        type: 'symbol',
        source: 'engagement-lines',
        filter: ['==', ['get', 'type'], 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Open Sans Bold'],
          'text-allow-overlap': false,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.5,
        },
        paint: {
          'text-color': [
            'case',
            ['==', ['get', 'isJamming'], true],
            '#fca5a5', // Light red text when jamming
            '#ffffff',
          ],
          'text-halo-color': 'rgba(0, 0, 0, 0.8)',
          'text-halo-width': 2,
        },
      });

      engagementSourceAddedRef.current = true;

      // Engagement line click popup
      map.on('click', 'engagement-lines-line', (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return;
        const props = e.features[0].properties;
        if (!props) return;

        const elapsed = props.engageTimestamp
          ? `${Math.round((Date.now() - new Date(props.engageTimestamp).getTime()) / 1000)}s`
          : '--';

        new maplibregl.Popup({ closeOnClick: true, className: 'engagement-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:monospace;font-size:11px;line-height:1.6;color:#fff;background:rgba(15,15,30,0.92);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(8px);">
              <div style="font-weight:700;margin-bottom:4px;">${props.cuasName || 'CUAS'} → ${props.trackerId}</div>
              <div>Range: <b>${props.rangeM}m</b> | Bearing: <b>${props.bearingDeg}°</b></div>
              <div>Slant: <b>${props.slantRangeM}m</b> | ΔAlt: <b>${props.altitudeDeltaM}m</b></div>
              <div>Jam: <b style="color:${props.isJamming ? '#ef4444' : '#22c55e'}">${props.isJamming ? 'ACTIVE' : 'OFF'}</b> | Time: <b>${elapsed}</b></div>
            </div>
          `)
          .addTo(mapRef.current!);
      });
      map.on('click', 'engagement-lines-jamming', (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return;
        const props = e.features[0].properties;
        if (!props) return;

        const elapsed = props.engageTimestamp
          ? `${Math.round((Date.now() - new Date(props.engageTimestamp).getTime()) / 1000)}s`
          : '--';

        new maplibregl.Popup({ closeOnClick: true, className: 'engagement-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:monospace;font-size:11px;line-height:1.6;color:#fff;background:rgba(15,15,30,0.92);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(8px);">
              <div style="font-weight:700;margin-bottom:4px;color:#fca5a5;">${props.cuasName || 'CUAS'} → ${props.trackerId} [JAMMING]</div>
              <div>Range: <b>${props.rangeM}m</b> | Bearing: <b>${props.bearingDeg}°</b></div>
              <div>Slant: <b>${props.slantRangeM}m</b> | ΔAlt: <b>${props.altitudeDeltaM}m</b></div>
              <div>Time: <b>${elapsed}</b></div>
            </div>
          `)
          .addTo(mapRef.current!);
      });

      // Hover cursor for engagement lines
      map.on('mouseenter', 'engagement-lines-line', () => {
        if (!engagementModeCuasId) map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'engagement-lines-line', () => {
        if (!engagementModeCuasId) map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', 'engagement-lines-jamming', () => {
        if (!engagementModeCuasId) map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'engagement-lines-jamming', () => {
        if (!engagementModeCuasId) map.getCanvas().style.cursor = '';
      });

      // Add session actors source and layers
      map.addSource('session-actors', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Session actor circle layer (magenta dots for human operators)
      map.addLayer({
        id: 'session-actors-circle',
        type: 'circle',
        source: 'session-actors',
        paint: {
          'circle-radius': 7,
          'circle-color': '#d946ef', // Magenta/fuchsia for actors
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Session actor heading indicator (inner directional dot)
      map.addLayer({
        id: 'session-actors-inner',
        type: 'circle',
        source: 'session-actors',
        paint: {
          'circle-radius': 3,
          'circle-color': '#ffffff',
          'circle-translate': [0, -3], // Offset upward to hint at heading
        },
      });

      // Session actor label layer (name/callsign text)
      map.addLayer({
        id: 'session-actors-label',
        type: 'symbol',
        source: 'session-actors',
        layout: {
          'text-field': ['get', 'callsign'],
          'text-size': 10,
          'text-font': ['Open Sans Bold'],
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#e879f9', // Light magenta for labels
          'text-halo-color': 'rgba(0, 0, 0, 0.9)',
          'text-halo-width': 1.5,
        },
      });

      actorSourceAddedRef.current = true;

      // Add CUAS coverage source and layers
      map.addSource('cuas-coverage', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addSource('cuas-markers', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // CUAS coverage fill layer (semi-transparent colored zones)
      map.addLayer({
        id: 'cuas-coverage-fill',
        type: 'fill',
        source: 'cuas-coverage',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['get', 'fillOpacity'],
        },
      }, 'drone-tracks-glow'); // Place coverage under drone tracks

      // CUAS coverage outline layer
      map.addLayer({
        id: 'cuas-coverage-outline',
        type: 'line',
        source: 'cuas-coverage',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2],
        },
      }, 'cuas-coverage-fill');

      // CUAS marker circle layer (positions of CUAS systems)
      map.addLayer({
        id: 'cuas-markers-circle',
        type: 'circle',
        source: 'cuas-markers',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // CUAS marker inner circle (jamming indicator)
      map.addLayer({
        id: 'cuas-markers-inner',
        type: 'circle',
        source: 'cuas-markers',
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isJamming'],
            5, // Larger inner when jamming
            3,
          ],
          'circle-color': [
            'case',
            ['get', 'isJamming'],
            '#ffffff', // White center when jamming
            ['get', 'color'],
          ],
        },
      });

      cuasSourceAddedRef.current = true;

      // CUAS marker click handler — enters engagement mode
      map.on('click', 'cuas-markers-circle', (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (e.features && e.features.length > 0) {
          const cuasId = e.features[0].properties?.id;
          if (cuasId && onCuasClickRef.current) {
            onCuasClickRef.current(cuasId);
          }
        }
      });

      // Change cursor to pointer over CUAS markers
      map.on('mouseenter', 'cuas-markers-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'cuas-markers-circle', () => {
        map.getCanvas().style.cursor = '';
      });

      // Add viewshed overlay source (image source for terrain-aware LOS/NLOS)
      // Starts with a transparent 1x1 pixel - updated when viewshed is computed
      map.addSource('viewshed-overlay', {
        type: 'image',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        coordinates: [
          [-180, 85], // NW
          [180, 85],  // NE
          [180, -85], // SE
          [-180, -85], // SW
        ],
      });

      map.addLayer({
        id: 'viewshed-layer',
        type: 'raster',
        source: 'viewshed-overlay',
        layout: {
          'visibility': 'none', // Hidden until a viewshed is computed
        },
        paint: {
          'raster-opacity': 0.7,
          'raster-fade-duration': 300,
        },
      }, 'cuas-coverage-fill'); // Place viewshed under CUAS geometric coverage

      viewshedSourceAddedRef.current = true;

      // Add site boundary source and layers
      map.addSource('site-boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('site-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('site-markers', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Site boundary fill (semi-transparent orange)
      map.addLayer({
        id: 'site-boundary-fill',
        type: 'fill',
        source: 'site-boundary',
        paint: {
          'fill-color': '#ff8c00',
          'fill-opacity': 0.08,
        },
      }, 'cuas-coverage-fill'); // Place under CUAS coverage

      // Site boundary outline (dashed orange line)
      map.addLayer({
        id: 'site-boundary-outline',
        type: 'line',
        source: 'site-boundary',
        paint: {
          'line-color': '#ff8c00',
          'line-width': 2.5,
          'line-opacity': 0.9,
          'line-dasharray': [4, 3],
        },
      });

      // Site zones fill (use zone-specific colors from properties)
      map.addLayer({
        id: 'site-zones-fill',
        type: 'fill',
        source: 'site-zones',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['get', 'opacity'],
        },
      }, 'site-boundary-fill');

      // Site zones outline
      map.addLayer({
        id: 'site-zones-outline',
        type: 'line',
        source: 'site-zones',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.8,
        },
      });

      // Site markers (points of interest)
      map.addLayer({
        id: 'site-markers-circle',
        type: 'circle',
        source: 'site-markers',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Site marker inner dot
      map.addLayer({
        id: 'site-markers-inner',
        type: 'circle',
        source: 'site-markers',
        paint: {
          'circle-radius': 3,
          'circle-color': '#ffffff',
        },
      });

      siteSourceAddedRef.current = true;
    });


    // Add navigation controls
    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

    // Add scale control
    map.addControl(
      new maplibregl.ScaleControl({
        maxWidth: 100,
        unit: 'metric',
      }),
      'bottom-left'
    );

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle base layer visibility when mapStyle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    map.setLayoutProperty('carto-dark-layer', 'visibility', mapStyle === 'dark' ? 'visible' : 'none');
    map.setLayoutProperty('esri-satellite-layer', 'visibility', mapStyle === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('osm-street-layer', 'visibility', mapStyle === 'street' ? 'visible' : 'none');
  }, [mapStyle]);

  // Handle mapbox-gl-draw integration
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isDrawingMode && !drawRef.current) {
      // Create draw control when entering drawing mode
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
        defaultMode: 'draw_polygon',
      });

      // Add draw control to map (cast to any for MapLibre compatibility)
      map.addControl(draw as any, 'top-left');
      drawRef.current = draw;

      // Listen for polygon creation
      const handleCreate = (e: any) => {
        const feature = e.features[0];
        if (feature && feature.geometry.type === 'Polygon') {
          const coords = feature.geometry.coordinates[0];
          // Convert from [lng, lat] to GeoPoint {lat, lon}
          const points: GeoPoint[] = coords.slice(0, -1).map((c: number[]) => ({
            lat: c[1],
            lon: c[0],
          }));
          onDrawingComplete?.(points);
        }
      };

      const handleUpdate = (e: any) => {
        const feature = e.features[0];
        if (feature && feature.geometry.type === 'Polygon') {
          const coords = feature.geometry.coordinates[0];
          const points: GeoPoint[] = coords.slice(0, -1).map((c: number[]) => ({
            lat: c[1],
            lon: c[0],
          }));
          onDrawingComplete?.(points);
        }
      };

      map.on('draw.create', handleCreate);
      map.on('draw.update', handleUpdate);

      return () => {
        map.off('draw.create', handleCreate);
        map.off('draw.update', handleUpdate);
      };
    } else if (!isDrawingMode && drawRef.current) {
      // Remove draw control when exiting drawing mode
      map.removeControl(drawRef.current as any);
      drawRef.current = null;
    }
  }, [isDrawingMode, onDrawingComplete]);

  // Handle CUAS placement mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !placingCuasId) return;

    // Set crosshair cursor
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      onCuasPlaced?.(placingCuasId, e.lngLat.lat, e.lngLat.lng);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      canvas.style.cursor = '';
    };
  }, [placingCuasId, onCuasPlaced]);

  // Handle flyToCenter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToCenter) return;

    map.flyTo({
      center: [flyToCenter.lon, flyToCenter.lat],
      zoom: flyToCenter.zoom || 16,
      duration: 2000,
      essential: true,
    });

    // Notify parent when flyTo is complete
    const handleMoveEnd = () => {
      onFlyToComplete?.();
      map.off('moveend', handleMoveEnd);
    };
    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [flyToCenter, onFlyToComplete]);

  // Handle marker click
  const handleMarkerClick = useCallback((droneId: string) => {
    onDroneClick(droneId);
  }, [onDroneClick]);

  // Update markers when drones change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentDroneIds = new Set(drones.keys());
    const existingMarkerIds = new Set(markersRef.current.keys());

    // Remove markers for drones that no longer exist
    for (const id of existingMarkerIds) {
      if (!currentDroneIds.has(id)) {
        const marker = markersRef.current.get(id);
        if (marker) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }
    }

    // Update or create markers for current drones
    for (const [id, drone] of drones) {
      // Skip drones without valid coordinates
      if (drone.lat === null || drone.lon === null) {
        continue;
      }

      const isSelected = id === selectedDroneId;
      const existingMarker = markersRef.current.get(id);

      if (existingMarker) {
        // Update existing marker position
        existingMarker.setLngLat([drone.lon, drone.lat]);

        // Update marker element
        const newEl = createMarkerElement(drone, isSelected);
        newEl.addEventListener('click', (e) => {
          e.stopPropagation();
          handleMarkerClick(id);
        });

        const oldEl = existingMarker.getElement();
        oldEl.className = newEl.className;
        oldEl.innerHTML = newEl.innerHTML;
      } else {
        // Create new marker
        const el = createMarkerElement(drone, isSelected);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          handleMarkerClick(id);
        });

        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([drone.lon, drone.lat])
          .addTo(map);

        markersRef.current.set(id, marker);
      }
    }
  }, [drones, selectedDroneId, handleMarkerClick]);

  // Fly to selected drone
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDroneId) return;

    const drone = drones.get(selectedDroneId);
    if (drone && drone.lat !== null && drone.lon !== null) {
      map.flyTo({
        center: [drone.lon, drone.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 1000,
      });
    }
  }, [selectedDroneId, drones]);

  // Fly to selected site and show boundary
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedSite) return;

    // Try to fit bounds to the site boundary if available
    const bounds = calculateSiteBounds(selectedSite);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: 80,
        duration: 1000,
        maxZoom: 16,
      });
    } else if (selectedSite.center) {
      // Fall back to flying to center
      map.flyTo({
        center: [selectedSite.center.lon, selectedSite.center.lat],
        zoom: 15,
        duration: 1000,
      });
    }
  }, [selectedSite?.id]); // Only trigger on site ID change

  // Update site visualization when selectedSite changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !siteSourceAddedRef.current) return;

    // Update boundary source
    const boundarySource = map.getSource('site-boundary') as maplibregl.GeoJSONSource | undefined;
    if (boundarySource) {
      boundarySource.setData(generateSiteBoundaryGeoJSON(selectedSite));
    }

    // Update zones source
    const zonesSource = map.getSource('site-zones') as maplibregl.GeoJSONSource | undefined;
    if (zonesSource) {
      zonesSource.setData(generateSiteZonesGeoJSON(selectedSite));
    }

    // Update markers source
    const markersSource = map.getSource('site-markers') as maplibregl.GeoJSONSource | undefined;
    if (markersSource) {
      markersSource.setData(generateSiteMarkersGeoJSON(selectedSite));
    }
  }, [selectedSite]);

  // Fit bounds to all drones when first data arrives
  const hasInitialFit = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasInitialFit.current || drones.size === 0) return;

    // Wait for map to be ready
    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        fitToDrones();
      });
      return;
    }

    fitToDrones();

    function fitToDrones() {
      const validDrones = Array.from(drones.values()).filter(
        d => d.lat !== null && d.lon !== null
      );

      if (validDrones.length === 0) return;

      if (validDrones.length === 1) {
        const drone = validDrones[0];
        map!.flyTo({
          center: [drone.lon!, drone.lat!],
          zoom: 15,
          duration: 1500,
        });
      } else {
        const bounds = new maplibregl.LngLatBounds();
        for (const drone of validDrones) {
          bounds.extend([drone.lon!, drone.lat!]);
        }

        map!.fitBounds(bounds, {
          padding: { top: 100, bottom: 100, left: 100, right: 400 },
          duration: 1500,
        });
      }

      hasInitialFit.current = true;
    }
  }, [drones]);

  return (
    <div
      ref={mapContainerRef}
      className="map-container"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}
