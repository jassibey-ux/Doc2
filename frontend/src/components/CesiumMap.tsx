/**
 * CesiumJS Globe Component — Full Feature Parity
 *
 * Full 3D globe view with Google 3D Tiles support, Cesium Ion terrain,
 * track rendering, quality-colored segments, CUAS coverage overlays,
 * engagement visualization, drone selection/fly-to, and site boundaries.
 *
 * Used as the "Globe" mode alternative to the MapLibre 2D/3D views.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PositionPoint, DroneSummary } from '../types/drone';
import type {
  EnhancedPositionPoint,
  CUASPlacement,
  CUASProfile,
  SiteDefinition,
  Engagement,
  JamBurst,
  CameraState3D,
  DroneProfile,
} from '../types/workflow';
import { QUALITY_COLORS } from '../utils/trackSegmentation';
import { computeEngagementGeometries } from '../utils/engagementGeometry';
import { getDroneModel, getCUASModel } from '../utils/modelRegistry';
import { createModelGraphicsOptions, createModelOrientation, precheckAllModels, isModelCached } from '../utils/modelLoader';

// Cesium types - lazy loaded
type CesiumViewer = any;
type CesiumModule = any;

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN || '';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

// Track colors matching Map3DViewer
const TRACK_COLORS = [
  '#00c8ff', '#ff6b6b', '#4ecdc4', '#f7dc6f',
  '#bb8fce', '#58d68d', '#f8b500', '#5dade2',
];

interface CesiumMapProps {
  droneHistory: Map<string, PositionPoint[]>;
  enhancedHistory?: Map<string, EnhancedPositionPoint[]>;
  currentTime: number;
  timelineStart: number;
  site?: SiteDefinition | null;
  cuasPlacements?: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  cuasJamStates?: Map<string, boolean>;
  currentDroneData?: Map<string, DroneSummary>;
  selectedDroneId?: string | null;
  onDroneClick?: (droneId: string) => void;
  engagements?: Engagement[];
  viewshedImageUrl?: string | null;
  viewshedBounds?: [[number, number], [number, number], [number, number], [number, number]] | null;
  rfCoverageImageUrl?: string | null;
  rfCoverageBounds?: [[number, number], [number, number], [number, number], [number, number]] | null;
  onClose?: () => void;
  activeBursts?: Map<string, JamBurst>;
  onCuasClick?: (cuasPlacementId: string) => void;
  engagementModeCuasId?: string | null;
  initialCameraState3D?: CameraState3D;
  onCameraStateChange?: (state: CameraState3D) => void;
  droneProfiles?: DroneProfile[];
  droneProfileMap?: Map<string, DroneProfile>;
}

const CesiumMap: React.FC<CesiumMapProps> = ({
  droneHistory,
  enhancedHistory,
  currentTime,
  timelineStart,
  site,
  cuasPlacements,
  cuasProfiles,
  cuasJamStates,
  currentDroneData,
  selectedDroneId,
  onDroneClick,
  engagements,
  onClose,
  activeBursts,
  onCuasClick,
  engagementModeCuasId,
  initialCameraState3D,
  onCameraStateChange,
  droneProfiles,
  droneProfileMap,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer>(null);
  const cesiumRef = useRef<CesiumModule>(null);
  const [cesiumLoaded, setCesiumLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terrainEnabled, setTerrainEnabled] = useState(true);
  const [google3DEnabled, setGoogle3DEnabled] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const initialFlyDone = useRef(false);

  // Lazy load Cesium
  useEffect(() => {
    const loadCesium = async () => {
      try {
        const Cesium = await import('cesium');
        cesiumRef.current = Cesium;
        // @ts-ignore
        window.Cesium = Cesium;

        if (CESIUM_TOKEN) {
          Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;
        }

        if (!containerRef.current) return;

        const viewer = new Cesium.Viewer(containerRef.current, {
          terrain: CESIUM_TOKEN ? Cesium.Terrain.fromWorldTerrain() : undefined,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          infoBox: false,
          selectionIndicator: false,
        });

        // Dark atmosphere
        viewer.scene.globe.enableLighting = true;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;

        // Entity click handler for drone selection
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click: any) => {
          const pickedObject = viewer.scene.pick(click.position);
          if (Cesium.defined(pickedObject) && pickedObject.id) {
            const entity = pickedObject.id;
            const name = entity.name || '';
            if (name.startsWith('drone_') && onDroneClick) {
              const droneId = name.replace('drone_', '').replace('_marker', '').replace('_track', '');
              onDroneClick(droneId);
            } else if (name.startsWith('cuas_') && onCuasClick) {
              // Extract placement ID stored in entity description
              const placementId = entity.description?.getValue?.() || '';
              if (placementId) onCuasClick(placementId);
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Add OSM Buildings for 3D context (free, no API key needed)
        try {
          const osmBuildings = await Cesium.createOsmBuildingsAsync();
          (osmBuildings as any)._site3dOsm = true; // Tag for identification
          viewer.scene.primitives.add(osmBuildings);
        } catch (e) {
          console.warn('[CesiumMap] OSM Buildings not available:', e);
        }

        // If explicit 3D camera state provided, fly to it
        if (initialCameraState3D) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              initialCameraState3D.longitude,
              initialCameraState3D.latitude,
              initialCameraState3D.height,
            ),
            orientation: {
              heading: Cesium.Math.toRadians(initialCameraState3D.heading),
              pitch: Cesium.Math.toRadians(initialCameraState3D.pitch),
              roll: Cesium.Math.toRadians(initialCameraState3D.roll),
            },
            duration: 2,
          });
        }

        // Report camera state changes back to parent
        if (onCameraStateChange) {
          viewer.camera.moveEnd.addEventListener(() => {
            const cam = viewer.camera;
            const carto = Cesium.Cartographic.fromCartesian(cam.position);
            onCameraStateChange({
              longitude: Cesium.Math.toDegrees(carto.longitude),
              latitude: Cesium.Math.toDegrees(carto.latitude),
              height: carto.height,
              heading: Cesium.Math.toDegrees(cam.heading),
              pitch: Cesium.Math.toDegrees(cam.pitch),
              roll: Cesium.Math.toDegrees(cam.roll),
            });
          });
        }

        viewerRef.current = viewer;
        setCesiumLoaded(true);

        // Precheck all model GLBs so render loop can use sync isModelCached()
        precheckAllModels();
      } catch (e: any) {
        setError(`Failed to load CesiumJS: ${e.message}`);
      }
    };

    loadCesium();

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Toggle Google 3D Tiles
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    if (google3DEnabled && GOOGLE_MAPS_API_KEY) {
      (async () => {
        try {
          const tileset = await Cesium.Cesium3DTileset.fromUrl(
            `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`
          );
          tileset._cesiumMapGoogle3D = true;
          viewer.scene.primitives.add(tileset);
        } catch (e) {
          console.warn('Google 3D Tiles not available:', e);
        }
      })();
    } else {
      // Remove Google 3D tiles
      const primitives = viewer.scene.primitives;
      for (let i = primitives.length - 1; i >= 0; i--) {
        const p = primitives.get(i);
        if (p._cesiumMapGoogle3D) {
          primitives.remove(p);
        }
      }
    }
  }, [cesiumLoaded, google3DEnabled]);

  // Update entities when data changes
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;

    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Remove existing entities
    viewer.entities.removeAll();

    let hasPositions = false;

    // ── Site Boundary ──
    if (site?.boundary_polygon && site.boundary_polygon.length >= 3) {
      const boundaryPositions = site.boundary_polygon.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0)
      );
      // Close the polygon
      boundaryPositions.push(boundaryPositions[0]);

      viewer.entities.add({
        name: 'site_boundary',
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            site.boundary_polygon.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat))
          ),
          material: Cesium.Color.ORANGE.withAlpha(0.1),
          outline: true,
          outlineColor: Cesium.Color.ORANGE.withAlpha(0.8),
          outlineWidth: 2,
          height: 0,
          classificationType: Cesium.ClassificationType.BOTH,
        },
      });

      // Boundary outline polyline (for visibility)
      viewer.entities.add({
        name: 'site_boundary_outline',
        polyline: {
          positions: boundaryPositions,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.ORANGE.withAlpha(0.8),
            dashLength: 16.0,
          }),
          clampToGround: true,
        },
      });
    }

    // ── CUAS Placements with Coverage Circles ──
    if (cuasPlacements) {
      for (const placement of cuasPlacements) {
        const isJamming = cuasJamStates?.get(placement.id);
        const profile = cuasProfiles?.find((p) => p.id === placement.cuas_profile_id);
        const effectiveRange = profile?.effective_range_m || 500;
        const placementColor = isJamming ? '#ef4444' : '#f97316';

        // CUAS marker (description stores placement ID for click handler)
        const isSelected = engagementModeCuasId === placement.id;
        const cuasModelAsset = profile ? getCUASModel(profile.type) : null;
        const glbExists = cuasModelAsset ? isModelCached(cuasModelAsset.glbPath) === true : false;
        const cuasAlt = (placement.height_agl_m || 0) + 2;
        const orientationDeg = placement.orientation_deg ?? 0;
        const cuasColor = Cesium.Color.fromCssColorString(placementColor);
        const isSensor = profile?.type === 'rf_sensor' || profile?.type === 'radar' || profile?.type === 'eo_ir_camera' || profile?.type === 'acoustic';

        const cuasMarkerEntity: any = {
          name: `cuas_${placement.id}`,
          description: placement.id,
          position: Cesium.Cartesian3.fromDegrees(
            placement.position.lon,
            placement.position.lat,
            cuasAlt,
          ),
          label: showLabels ? {
            text: profile?.name || 'CUAS',
            font: '11px monospace',
            fillColor: cuasColor,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20),
          } : undefined,
        };

        if (cuasModelAsset && glbExists) {
          // 3D model entity
          cuasMarkerEntity.model = new Cesium.ModelGraphics(
            createModelGraphicsOptions(Cesium, cuasModelAsset, orientationDeg, false)
          );
          cuasMarkerEntity.orientation = createModelOrientation(
            Cesium, placement.position.lon, placement.position.lat, cuasAlt, orientationDeg
          );
        } else if (isSensor) {
          // Sensor fallback: ellipsoid (1m x 1m x 1.5m)
          cuasMarkerEntity.ellipsoid = {
            radii: new Cesium.Cartesian3(1.0, 1.0, 1.5),
            material: cuasColor.withAlpha(0.8),
            outline: true,
            outlineColor: cuasColor,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          };
          // Billboard overlay for visibility at distance
          cuasMarkerEntity.billboard = {
            image: createCUASDataUri(placementColor),
            width: isSelected ? 36 : 28,
            height: isSelected ? 36 : 28,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          };
        } else {
          // Jammer/combined fallback: cylinder (1.5m radius x 2m tall)
          cuasMarkerEntity.cylinder = {
            length: 2.0,
            topRadius: 1.5,
            bottomRadius: 1.5,
            material: cuasColor.withAlpha(0.8),
            outline: true,
            outlineColor: cuasColor,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          };
          // Billboard overlay for visibility at distance
          cuasMarkerEntity.billboard = {
            image: createCUASDataUri(placementColor),
            width: isSelected ? 36 : 28,
            height: isSelected ? 36 : 28,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          };
        }

        viewer.entities.add(cuasMarkerEntity);

        // Coverage circle (36 points)
        const circlePositions: any[] = [];
        for (let deg = 0; deg <= 360; deg += 10) {
          const rad = (deg * Math.PI) / 180;
          const lat = placement.position.lat + (effectiveRange / 111320) * Math.cos(rad);
          const lon =
            placement.position.lon +
            (effectiveRange / (111320 * Math.cos((placement.position.lat * Math.PI) / 180))) *
              Math.sin(rad);
          circlePositions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0));
        }

        viewer.entities.add({
          name: `cuas_coverage_${placement.id}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(circlePositions),
            material: Cesium.Color.fromCssColorString(placementColor).withAlpha(isJamming ? 0.15 : 0.05),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(placementColor).withAlpha(0.4),
            height: 0,
          },
        });

        // Heading cone (beam direction indicator)
        if (placement.orientation_deg !== undefined && profile?.beam_width_deg) {
          const beamHalf = (profile.beam_width_deg || 60) / 2;
          const headingRad = ((placement.orientation_deg - 90) * Math.PI) / 180;
          const coneRange = effectiveRange * 0.8;

          const conePositions = [
            Cesium.Cartesian3.fromDegrees(placement.position.lon, placement.position.lat, 1),
          ];
          for (let a = -beamHalf; a <= beamHalf; a += 5) {
            const rad = headingRad + (a * Math.PI) / 180;
            const lat = placement.position.lat + (coneRange / 111320) * Math.cos(rad);
            const lon =
              placement.position.lon +
              (coneRange / (111320 * Math.cos((placement.position.lat * Math.PI) / 180))) *
                Math.sin(rad);
            conePositions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 1));
          }

          viewer.entities.add({
            name: `cuas_beam_${placement.id}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(conePositions),
              material: Cesium.Color.fromCssColorString(placementColor).withAlpha(isJamming ? 0.25 : 0.1),
              height: 0,
            },
          });
        }
      }
    }

    // ── Drone Tracks ──
    let colorIndex = 0;
    for (const [trackerId, positions] of droneHistory) {
      const baseColor = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
      colorIndex++;

      const filtered = positions.filter(
        (p) => p.timestamp >= timelineStart && p.timestamp <= currentTime
      );
      const displayPositions = filtered.length >= 2 ? filtered : positions;

      if (displayPositions.length < 2) continue;
      hasPositions = true;

      // Check for enhanced data for quality-colored segments
      const enhancedPoints = enhancedHistory?.get(trackerId);
      const hasEnhanced = enhancedPoints && enhancedPoints.length > 0;

      if (hasEnhanced) {
        // Quality-colored track segments
        const timeFiltered = enhancedPoints.filter(
          (p) => p.timestamp_ms >= timelineStart && p.timestamp_ms <= currentTime
        );
        const display = timeFiltered.length >= 2 ? timeFiltered : enhancedPoints;

        if (display.length >= 2) {
          // Group consecutive points by quality
          let segStart = 0;
          for (let i = 1; i <= display.length; i++) {
            const prevQ = display[i - 1].quality;
            const currQ = i < display.length ? display[i].quality : null;

            if (currQ !== prevQ || i === display.length) {
              const segPoints = display.slice(segStart, i);
              if (segPoints.length >= 2) {
                const qualityColor =
                  QUALITY_COLORS[prevQ as keyof typeof QUALITY_COLORS] || baseColor;
                const cartesians = segPoints.map((p) =>
                  Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.alt_m || 0) + 1)
                );

                viewer.entities.add({
                  name: `drone_${trackerId}_track`,
                  polyline: {
                    positions: cartesians,
                    width: 3,
                    material:
                      prevQ === 'lost'
                        ? new Cesium.PolylineDashMaterialProperty({
                            color: Cesium.Color.fromCssColorString(qualityColor),
                            dashLength: 8.0,
                          })
                        : Cesium.Color.fromCssColorString(qualityColor),
                    clampToGround: false,
                  },
                });
              }
              segStart = i;
            }
          }
        }
      } else {
        // Simple solid-color track
        const cartesians = displayPositions.map((p) =>
          Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.alt_m || 0) + 1)
        );

        viewer.entities.add({
          name: `drone_${trackerId}_track`,
          polyline: {
            positions: cartesians,
            width: 3,
            material: Cesium.Color.fromCssColorString(baseColor),
            clampToGround: false,
          },
        });
      }

      // ── Current position marker with altitude pole ──
      const lastPos = displayPositions[displayPositions.length - 1];
      const altitude = lastPos.alt_m || 0;
      const isSelected = selectedDroneId === trackerId;
      const markerSize = isSelected ? 14 : 10;

      // Altitude pole (vertical line from ground to drone)
      if (altitude > 5) {
        viewer.entities.add({
          name: `drone_${trackerId}_pole`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(lastPos.lon, lastPos.lat, 0),
              Cesium.Cartesian3.fromDegrees(lastPos.lon, lastPos.lat, altitude),
            ],
            width: 1,
            material: Cesium.Color.fromCssColorString(baseColor).withAlpha(0.4),
          },
        });
      }

      // Try to find a matching drone profile for 3D model (use map keyed by tracker_id)
      const droneProfile = droneProfileMap?.get(trackerId) ?? droneProfiles?.find(dp => dp.id === trackerId);
      const droneModelAsset = droneProfile ? getDroneModel(droneProfile) : null;
      const droneGlbExists = droneModelAsset ? isModelCached(droneModelAsset.glbPath) === true : false;
      const droneHeading = currentDroneData?.get(trackerId)?.heading_deg ?? 0;
      const droneColor = Cesium.Color.fromCssColorString(baseColor);

      // Drone marker — 3D model when GLB exists, ellipsoid when not, point as last resort
      const droneMarkerEntity: any = {
        name: `drone_${trackerId}_marker`,
        position: Cesium.Cartesian3.fromDegrees(lastPos.lon, lastPos.lat, altitude + 2),
        label: showLabels ? {
          text: `${trackerId}\n${altitude.toFixed(0)}m`,
          font: isSelected ? 'bold 12px monospace' : '11px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -(markerSize + 4)),
          showBackground: isSelected,
          backgroundColor: droneColor.withAlpha(0.7),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
      };

      if (droneModelAsset && droneGlbExists) {
        // 3D model entity
        droneMarkerEntity.model = new Cesium.ModelGraphics(
          createModelGraphicsOptions(Cesium, droneModelAsset, droneHeading, isSelected)
        );
        droneMarkerEntity.orientation = createModelOrientation(
          Cesium, lastPos.lon, lastPos.lat, altitude + 2, droneHeading
        );
      } else {
        // Primitive ellipsoid fallback (1.5m x 1.5m x 0.5m) in track color
        droneMarkerEntity.ellipsoid = {
          radii: new Cesium.Cartesian3(1.5, 1.5, 0.5),
          material: droneColor.withAlpha(0.9),
          outline: true,
          outlineColor: isSelected ? Cesium.Color.WHITE : droneColor,
          outlineWidth: isSelected ? 2 : 1,
          heightReference: Cesium.HeightReference.NONE,
        };
        // Billboard overlay for visibility at all zoom levels
        droneMarkerEntity.billboard = {
          image: createDroneDataUri(baseColor, isSelected),
          width: markerSize * 2,
          height: markerSize * 2,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        };
      }

      viewer.entities.add(droneMarkerEntity);
    }

    // ── Engagement Visualization (shared geometry module) ──
    if (engagements && cuasPlacements) {
      const geometries = computeEngagementGeometries(
        engagements,
        activeBursts,
        cuasPlacements,
        currentDroneData ?? new Map(),
      );

      for (const g of geometries) {
        const cuasPos = Cesium.Cartesian3.fromDegrees(
          g.emitterLon, g.emitterLat, g.emitterAlt + 2,
        );
        const dronePos = Cesium.Cartesian3.fromDegrees(
          g.droneLon, g.droneLat, g.droneAlt + 2,
        );

        // Per-jam-state color: red when jamming, cyan when active, yellow when complete
        let engColor: any;
        let lineWidth: number;
        let dashLen: number;
        if (g.isJamming) {
          engColor = Cesium.Color.RED.withAlpha(0.9);
          lineWidth = 3;
          dashLen = 8.0;
        } else {
          engColor = Cesium.Color.CYAN.withAlpha(0.8);
          lineWidth = 2;
          dashLen = 16.0;
        }

        viewer.entities.add({
          name: `engagement_${g.engagementId}_${g.trackerId}`,
          polyline: {
            positions: [cuasPos, dronePos],
            width: lineWidth,
            material: new Cesium.PolylineDashMaterialProperty({
              color: engColor,
              dashLength: dashLen,
            }),
          },
        });

        // Distance + bearing label at midpoint
        if (showLabels) {
          const midAlt = (g.emitterAlt + g.droneAlt) / 2;
          viewer.entities.add({
            name: `engagement_dist_${g.engagementId}_${g.trackerId}`,
            position: Cesium.Cartesian3.fromDegrees(
              g.midpoint.lon, g.midpoint.lat, midAlt + 10,
            ),
            label: {
              text: g.distanceLabel,
              font: '10px monospace',
              fillColor: g.isJamming ? Cesium.Color.RED : Cesium.Color.CYAN,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              showBackground: true,
              backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
            },
          });
        }
      }
    }

    // ── Initial Camera Position ──
    if (!initialFlyDone.current) {
      if (hasPositions) {
        viewer.zoomTo(viewer.entities);
        initialFlyDone.current = true;
      } else if (site) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            site.center.lon,
            site.center.lat,
            5000,
          ),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
          },
        });
        initialFlyDone.current = true;
      }
    }
  }, [
    cesiumLoaded, droneHistory, enhancedHistory, currentTime, timelineStart,
    cuasPlacements, cuasProfiles, cuasJamStates, site, engagements,
    currentDroneData, selectedDroneId, showLabels, activeBursts, engagementModeCuasId,
    droneProfiles, droneProfileMap,
  ]);

  // Fly to selected drone
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current || !selectedDroneId) return;

    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Find the drone's position
    const droneData = currentDroneData?.get(selectedDroneId);
    if (droneData?.lat && droneData?.lon) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          droneData.lon,
          droneData.lat,
          (droneData.alt_m || 100) + 500,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.5,
      });
    }
  }, [cesiumLoaded, selectedDroneId]);

  // Camera reset handler
  const handleResetCamera = useCallback(() => {
    if (!viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    if (site) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          site.center.lon,
          site.center.lat,
          5000,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.0,
      });
    } else {
      viewer.zoomTo(viewer.entities);
    }
  }, [site]);

  if (error) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100%', background: '#0a0a0a', color: '#ef4444',
        flexDirection: 'column', gap: 8,
      }}>
        <div>{error}</div>
        <div style={{ color: '#888', fontSize: 12 }}>
          Set VITE_CESIUM_TOKEN environment variable for CesiumJS
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Controls Panel */}
      {cesiumLoaded && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <ControlButton
            label={terrainEnabled ? 'Terrain: ON' : 'Terrain: OFF'}
            active={terrainEnabled}
            onClick={() => setTerrainEnabled((v) => !v)}
          />
          {GOOGLE_MAPS_API_KEY && (
            <ControlButton
              label={google3DEnabled ? '3D Buildings: ON' : '3D Buildings: OFF'}
              active={google3DEnabled}
              onClick={() => setGoogle3DEnabled((v) => !v)}
            />
          )}
          <ControlButton
            label={showLabels ? 'Labels: ON' : 'Labels: OFF'}
            active={showLabels}
            onClick={() => setShowLabels((v) => !v)}
          />
          <ControlButton
            label="Reset Camera"
            active={false}
            onClick={handleResetCamera}
          />
        </div>
      )}

      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.7)', border: '1px solid #444',
            borderRadius: 4, color: '#fff', padding: '4px 12px', cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Exit Globe
        </button>
      )}

      {!cesiumLoaded && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: '#0a0a0a', color: '#888',
        }}>
          Loading CesiumJS Globe...
        </div>
      )}
    </div>
  );
};

/** Control button component */
const ControlButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? 'rgba(59,130,246,0.7)' : 'rgba(0,0,0,0.7)',
      border: `1px solid ${active ? '#3b82f6' : '#444'}`,
      borderRadius: 4,
      color: '#fff',
      padding: '3px 8px',
      cursor: 'pointer',
      fontSize: 11,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </button>
);

/** Create a simple SVG data URI for drone markers (ellipse) */
function createDroneDataUri(color: string, isSelected: boolean): string {
  const strokeColor = isSelected ? '#fff' : '#000';
  const strokeWidth = isSelected ? 3 : 1.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <ellipse cx="12" cy="12" rx="10" ry="6" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.9"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** Create a simple SVG data URI for CUAS markers */
function createCUASDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="12" fill="${color}" stroke="#000" stroke-width="2" opacity="0.9"/>
    <text x="14" y="19" text-anchor="middle" fill="#fff" font-size="14" font-weight="bold">J</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default CesiumMap;
