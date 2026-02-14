import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useTestSessionPhase } from '../contexts/TestSessionPhaseContext';
import MapComponent from './Map';
import Sidebar from './Sidebar';
import LayersPanel, { useDefaultLayers } from './LayersPanel';
import DroneDetailPanel from './DroneDetailPanel';
import TrackerWorkspacePanel from './TrackerWorkspacePanel';
import CameraModal from './CameraModal';
import FileUploadPanel from './FileUploadPanel';
import WelcomeOverlay from './WelcomeOverlay';
import TimelineControl from './TimelineControl';
import SDCardPanel from './SDCardPanel';
import AnalysisPanel from './AnalysisPanel';
import UnifiedWorkspacePanel from './UnifiedWorkspacePanel';
import ConfigurationWorkspacePanel from './ConfigurationWorkspacePanel';
import SessionHistoryPanel from './SessionHistoryPanel';
import RecordingBar from './RecordingBar';
import { SessionSetupWizard } from './SessionSetupWizard';
import CUASControlPanel from './CUASControlPanel';
import TrackLegend from './TrackLegend';
import AnomalyAlertToast from './AnomalyAlertToast';
import Map3DViewer from './Map3DViewer';
import CesiumMap from './CesiumMap';
import TerrainProfileChart from './TerrainProfileChart';
import LinkBudgetPanel from './LinkBudgetPanel';
import CoordinateBar from './CoordinateBar';
import MapFileDropHandler from './MapFileDropHandler';
import type { ImportedLayer } from './MapFileDropHandler';
import { FileText, X, Globe, Map as MapIcon, Signal, Box, Target, MapPin, Globe2, Mountain, AlertTriangle, Radio, Ruler } from 'lucide-react';
import type { GeoPoint } from '../types/workflow';

export default function MapView() {
  const navigate = useNavigate();
  const {
    drones,
    droneHistory,
    connectionStatus,
    activeEvent,
    timeRange,
    setTimeRange,
    currentTime,
    setCurrentTime,
    isLive,
    setIsLive,
    timelineStart,
    timelineEnd,
    newFileAlert,
    clearNewFileAlert,
    latestAnomalyAlert,
    clearLatestAnomalyAlert,
    sdCardTracks,
    showSDCardTracks,
    setShowSDCardTracks,
  } = useWebSocket();

  const {
    activeSession,
    sites,
    selectedSite,
    selectSite,
    droneProfiles,
    cuasProfiles,
    createSite,
    createTestSession,
    lastExportSummary,
    clearExportSummary,
    isDrawingMode,
    setIsDrawingMode,
    setDrawingType,
    setPendingDrawingResult,
  } = useWorkflow();
  const {
    currentPhase,
    activeSessionId,
    activeSession: phaseActiveSession,
    phaseDuration,
    wizardOpen,
    openWizard,
    closeWizard,
    startTest,
    stopTest,
    cuasJamStates,
    toggleJamState,
    setJamState,
    clearActiveSession,
  } = useTestSessionPhase();

  // Panel state
  const [activePanel, setActivePanel] = useState<string | null>(null);
  console.log('[MapView] activePanel:', activePanel);
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  // Map style state
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite' | 'street'>('satellite');

  // Track quality visualization toggle
  const [showQualityColors, setShowQualityColors] = useState(false);

  // 3D view toggle: 'none' | 'maplibre3d' | 'cesium'
  const [show3DView, setShow3DView] = useState(false);
  const [showCesiumGlobe, setShowCesiumGlobe] = useState(false);

  // Terrain/RF tools (use selected drone + first CUAS placement as endpoints)
  const [showTerrainProfile, setShowTerrainProfile] = useState(false);
  const [showLinkBudget, setShowLinkBudget] = useState(false);

  // Cursor position for CoordinateBar
  const [cursorPos, setCursorPos] = useState<{ lat: number; lon: number } | null>(null);

  // Measurement tool state
  const [measureMode, setMeasureMode] = useState(false);
  const [measurements, setMeasurements] = useState<Array<{ id: string; startLat: number; startLon: number; endLat: number; endLon: number; distanceM: number; bearingDeg: number }>>([]);

  // Imported GeoJSON/KML layers
  const [importedLayers, setImportedLayers] = useState<ImportedLayer[]>([]);

  // Backend health status
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);

  // Poll backend health every 30 seconds
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const resp = await fetch('/api/health/backend');
        const data = await resp.json();
        if (!cancelled) setBackendReachable(data.python_backend?.reachable ?? false);
      } catch {
        if (!cancelled) setBackendReachable(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // CUAS placement mode state
  const [placingCuasId, setPlacingCuasId] = useState<string | null>(null);
  const [pendingCuasPlacement, setPendingCuasPlacement] = useState<{ placementId: string; lat: number; lon: number } | null>(null);
  // Wizard CUAS placements for map preview (draggable markers)
  const [wizardCuasPlacements, setWizardCuasPlacements] = useState<Array<{ id: string; cuasProfileId: string; position: { lat: number; lon: number }; orientation: number }>>([]);

  // Fly to center state (triggered after session starts)
  const [flyToCenter, setFlyToCenter] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);

  // Layers state
  const [layers, setLayers] = useState(useDefaultLayers(drones.size));

  // Update drone count in layers
  const layersWithCount = layers.map(layer =>
    layer.id === 'drones' ? { ...layer, count: drones.size } : layer
  );

  // Handle layer toggle
  const handleToggleLayer = useCallback((layerId: string) => {
    setLayers(prev =>
      prev.map(layer =>
        layer.id === layerId ? { ...layer, enabled: !layer.enabled } : layer
      )
    );
  }, []);

  // Handle drone selection from map or list
  const handleDroneClick = useCallback((droneId: string) => {
    setSelectedDroneId(droneId);
    // Open TrackerWorkspacePanel to show detail view for this tracker
    setActivePanel('drones');
  }, []);

  // Drawing mode handlers - simplified for mapbox-gl-draw
  const handleDrawingComplete = useCallback((points: GeoPoint[]) => {
    // Store the result for SiteDefinitionPanel to consume
    setPendingDrawingResult({ type: 'polygon', points });
    setIsDrawingMode(false);
    setDrawingType(null);
  }, [setPendingDrawingResult, setIsDrawingMode, setDrawingType]);

  // CUAS placement handlers
  const handleRequestCuasPlacement = useCallback((placementId: string) => {
    setPlacingCuasId(placementId);
  }, []);

  const handleCuasPlaced = useCallback((placementId: string, lat: number, lon: number) => {
    // Set the pending placement for the wizard to consume
    setPendingCuasPlacement({ placementId, lat, lon });
    setPlacingCuasId(null);
  }, []);

  const handleCuasPlacementHandled = useCallback(() => {
    setPendingCuasPlacement(null);
  }, []);

  const handleWizardCuasMoved = useCallback((placementId: string, lat: number, lon: number) => {
    setPendingCuasPlacement({ placementId, lat, lon });
  }, []);

  // Cursor move handler for CoordinateBar
  const handleCursorMove = useCallback((lat: number, lon: number) => {
    setCursorPos({ lat, lon });
  }, []);

  // Measurement handlers
  const handleMeasurementAdded = useCallback((m: { id: string; startLat: number; startLon: number; endLat: number; endLon: number; distanceM: number; bearingDeg: number }) => {
    setMeasurements(prev => [...prev, m]);
  }, []);

  // Imported layer handlers
  const handleLayerImported = useCallback((layer: ImportedLayer) => {
    setImportedLayers(prev => [...prev, layer]);
  }, []);

  const handleToggleImportedLayer = useCallback((layerId: string) => {
    setImportedLayers(prev =>
      prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l)
    );
  }, []);

  const handleRemoveImportedLayer = useCallback((layerId: string) => {
    setImportedLayers(prev => prev.filter(l => l.id !== layerId));
  }, []);

  // Handle panel close
  const handleCloseDetail = useCallback(() => {
    setSelectedDroneId(null);
  }, []);

  // Get selected drone
  const selectedDrone = selectedDroneId ? (drones.get(selectedDroneId) ?? null) : null;

  // Calculate map center from live drones for CUAS placement
  const mapCenter = useMemo(() => {
    if (drones.size === 0) {
      return { lat: 0, lon: 0 };
    }
    let sumLat = 0;
    let sumLon = 0;
    let validCount = 0;
    drones.forEach(drone => {
      if (drone.lat != null && drone.lon != null) {
        sumLat += drone.lat;
        sumLon += drone.lon;
        validCount++;
      }
    });
    if (validCount === 0) {
      return { lat: 0, lon: 0 };
    }
    return {
      lat: sumLat / validCount,
      lon: sumLon / validCount,
    };
  }, [drones]);

  // Handle starting a new session from the wizard
  const handleStartSession = useCallback(async (sessionData: {
    name: string;
    siteId: string | null;
    newSiteName: string | null;
    droneAssignments: Array<{
      trackerId: string;
      droneProfileId: string;
      color: string;
      targetAltitude?: number;
    }>;
    cuasPlacements: Array<{
      id: string;
      cuasProfileId: string;
      position: { lat: number; lon: number };
      heightAgl: number;
      orientation: number;
    }>;
    operatorName: string;
    weatherNotes: string;
  }) => {
    try {
      // Create new site if needed
      let siteId = sessionData.siteId;
      if (!siteId && sessionData.newSiteName) {
        // v2 SiteCreateRequest expects flat center_lat/center_lon
        const newSite = await createSite({
          name: sessionData.newSiteName,
          environment_type: 'open_field',
          boundary_polygon: [],
          center_lat: mapCenter.lat,
          center_lon: mapCenter.lon,
          markers: [],
          zones: [],
        } as any);
        siteId = newSite.id;
      }

      // Build tracker assignments for v2 API (flat format)
      const trackerAssignments = sessionData.droneAssignments.map(a => ({
        tracker_id: a.trackerId,
        drone_profile_id: a.droneProfileId,
        session_color: a.color,
        target_altitude_m: a.targetAltitude,
      }));

      // Build CUAS placements for v2 API (flat lat/lon)
      const cuasPlacements = sessionData.cuasPlacements.map(p => ({
        cuas_profile_id: p.cuasProfileId,
        lat: p.position.lat,
        lon: p.position.lon,
        height_agl_m: p.heightAgl,
        orientation_deg: p.orientation,
        active: false,
      }));

      // Create the test session via v2 API with inline relations
      const testSession = await createTestSession({
        name: sessionData.name,
        site_id: siteId || null,
        status: 'planning',
        tracker_assignments: trackerAssignments,
        cuas_placements: cuasPlacements,
        operator_name: sessionData.operatorName,
        weather_notes: sessionData.weatherNotes,
      } as any);

      // Start the test session
      await startTest(testSession.id);

      // Navigate to Session Console for focused recording view
      navigate(`/session/${testSession.id}/live`);
    } catch (error) {
      console.error('Failed to start session:', error);
      throw error;
    }
  }, [createSite, createTestSession, startTest, navigate]);

  // Auto-dismiss new file alert after 5 seconds
  useEffect(() => {
    if (newFileAlert) {
      const timer = setTimeout(() => {
        clearNewFileAlert();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newFileAlert, clearNewFileAlert]);

  // Track if we've already auto-cleared a completed session on mount
  const hasAutoClearedRef = useRef(false);

  // Auto-clear completed session when returning to MapView
  // This prevents the "session still running" indicator from persisting after stopping a session
  useEffect(() => {
    if (currentPhase === 'completed') {
      // If this is the initial mount with a stale 'completed' phase from localStorage,
      // clear it immediately without delay
      if (!hasAutoClearedRef.current) {
        hasAutoClearedRef.current = true;
        // Clear immediately on mount to prevent stale UI
        clearActiveSession();
        clearExportSummary();
        selectSite(null);
        return;
      }

      // For normal session completion (not from localStorage), show briefly then clear
      const timer = setTimeout(() => {
        clearActiveSession();
        clearExportSummary();
        selectSite(null); // Clear site boundaries from map
      }, 3000); // 3 seconds

      return () => clearTimeout(timer);
    }
  }, [currentPhase, clearActiveSession, clearExportSummary, selectSite]); // React to phase changes

  return (
    <div className="app-container">
      {/* Map area + overlays */}
      <div className="map-area">
        {/* Branding */}
        <div className="branding-container">
          <span className="branding">SCENSUS</span>
        </div>

        {/* Backend status warning banner */}
        {backendReachable === false && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 600,
              background: 'linear-gradient(90deg, rgba(249, 115, 22, 0.95), rgba(239, 68, 68, 0.95))',
              color: '#fff',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={16} />
            Python backend not connected — sessions will not save.
          </div>
        )}

        {/* Active session return banner */}
        {currentPhase === 'active' && activeSessionId && (
          <div
            onClick={() => navigate(`/session/${activeSessionId}/live`)}
            style={{
              position: 'absolute',
              top: backendReachable === false ? 36 : 0,
              left: 0,
              right: 0,
              zIndex: 599,
              background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))',
              color: '#fff',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'filter 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            <Radio size={16} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            Session recording in progress — Return to Session Console →
          </div>
        )}

        {/* Unified Recording Bar (status + events) */}
        {currentPhase !== 'idle' && phaseActiveSession && (
          <RecordingBar
            phase={currentPhase}
            sessionName={phaseActiveSession.name}
            sessionId={activeSessionId || undefined}
            duration={phaseDuration}
            trackerCount={drones.size}
            onStopClick={currentPhase === 'active' ? stopTest : undefined}
            onDismiss={currentPhase === 'completed' ? () => {
              clearActiveSession();
              clearExportSummary();
            } : undefined}
            exportSummary={lastExportSummary}
            onOpenSDCard={() => setActivePanel('sd-card')}
          />
        )}

        {/* Left Control Buttons */}
        <Sidebar
          activePanel={activePanel}
          onPanelChange={(panel) => {
            if (panel === 'replay') {
              navigate('/replay');
              return;
            }
            setActivePanel(panel);
          }}
          hasActiveSession={activeSession?.status === 'active'}
          liveTrackerCount={drones.size}
          sessionPhase={currentPhase}
          onStartSession={openWizard}
          onStopSession={stopTest}
        />

        {/* CUAS Control Panel (shown during active sessions with CUAS placements) */}
        <CUASControlPanel
          visible={currentPhase === 'active' && (phaseActiveSession?.cuas_placements?.length ?? 0) > 0}
          placements={phaseActiveSession?.cuas_placements ?? []}
          profiles={cuasProfiles}
          jamStates={cuasJamStates}
          onToggleJam={toggleJamState}
          onSetJamState={setJamState}
        />

        {/* Main Map (wrapped in file drop handler) */}
        <MapFileDropHandler onLayerImported={handleLayerImported}>
          <MapComponent
            drones={drones}
            droneHistory={droneHistory}
            selectedDroneId={selectedDroneId}
            onDroneClick={handleDroneClick}
            currentTime={currentTime}
            timelineStart={timelineStart}
            mapStyle={mapStyle}
            showQualityColors={showQualityColors}
            cuasPlacements={phaseActiveSession?.cuas_placements}
            cuasProfiles={cuasProfiles}
            cuasJamStates={cuasJamStates}
            showCuasCoverage={currentPhase === 'active' || currentPhase === 'planning'}
            selectedSite={selectedSite}
            isDrawingMode={isDrawingMode}
            onDrawingComplete={handleDrawingComplete}
            placingCuasId={placingCuasId}
            onCuasPlaced={handleCuasPlaced}
            wizardCuasPlacements={wizardCuasPlacements}
            wizardCuasProfiles={cuasProfiles}
            onWizardCuasMoved={handleWizardCuasMoved}
            flyToCenter={flyToCenter}
            onFlyToComplete={() => setFlyToCenter(null)}
            sdCardTracks={sdCardTracks}
            showSDCardTracks={showSDCardTracks}
            onCursorMove={handleCursorMove}
            measureMode={measureMode}
            onMeasurementAdded={handleMeasurementAdded}
            importedLayers={importedLayers}
          />
        </MapFileDropHandler>

        {/* 3D View Overlay (MapLibre-based) */}
        {show3DView && !showCesiumGlobe && (
          <Map3DViewer
            droneHistory={droneHistory}
            currentTime={currentTime}
            timelineStart={timelineStart}
            onClose={() => setShow3DView(false)}
            showQualityColors={showQualityColors}
            mapStyle={mapStyle}
            site={selectedSite}
            cuasPlacements={phaseActiveSession?.cuas_placements || []}
            cuasProfiles={cuasProfiles}
            sdCardTracks={sdCardTracks}
            showSDCardTracks={showSDCardTracks}
          />
        )}

        {/* CesiumJS Globe Overlay */}
        {showCesiumGlobe && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
            <CesiumMap
              droneHistory={droneHistory}
              currentTime={currentTime}
              timelineStart={timelineStart}
              site={selectedSite}
              cuasPlacements={phaseActiveSession?.cuas_placements || []}
              cuasProfiles={cuasProfiles}
              onClose={() => setShowCesiumGlobe(false)}
            />
          </div>
        )}

        {/* Track Quality Legend (shown when quality colors enabled or SD card tracks present) */}
        {(showQualityColors || sdCardTracks.size > 0) && (
          <div
            style={{
              position: 'absolute',
              bottom: '100px',
              left: '70px',
              zIndex: 10,
            }}
          >
            <TrackLegend
              visible={true}
              compact={false}
              showSDOnly={currentPhase === 'analyzing' || currentPhase === 'completed'}
              showSDCardTrack={sdCardTracks.size > 0}
              sdCardTrackVisible={showSDCardTracks}
              onSDCardTrackToggle={setShowSDCardTracks}
            />
          </div>
        )}

        {/* Map Controls Group - Bottom Right */}
        <div className="map-controls-group">
          {/* Map Style Toggle */}
          <button
            className={`map-control-btn ${mapStyle !== 'dark' ? 'active' : ''}`}
            onClick={() => setMapStyle(prev => prev === 'dark' ? 'satellite' : prev === 'satellite' ? 'street' : 'dark')}
            title={mapStyle === 'dark' ? 'Switch to Satellite' : mapStyle === 'satellite' ? 'Switch to Street' : 'Switch to Dark Map'}
          >
            {mapStyle === 'dark' ? <Globe size={18} /> : <MapIcon size={18} />}
          </button>

          {/* 3D View Toggle (MapLibre) */}
          <button
            className={`map-control-btn ${show3DView && !showCesiumGlobe ? 'active' : ''}`}
            onClick={() => { setShow3DView(prev => !prev); setShowCesiumGlobe(false); }}
            title={show3DView ? 'Switch to 2D Map' : 'Switch to 3D View'}
          >
            <Box size={18} />
          </button>

          {/* CesiumJS Globe Toggle */}
          <button
            className={`map-control-btn ${showCesiumGlobe ? 'active' : ''}`}
            onClick={() => { setShowCesiumGlobe(prev => !prev); setShow3DView(false); }}
            title={showCesiumGlobe ? 'Exit Globe View' : 'CesiumJS Globe (3D Tiles)'}
          >
            <Globe2 size={18} />
          </button>

          {/* Sites / Places Button */}
          <button
            className={`map-control-btn ${activePanel === 'sites' ? 'active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'sites' ? null : 'sites')}
            title="Sites & Configuration"
          >
            <MapPin size={18} />
          </button>

          {/* Track Quality Toggle */}
          <button
            className={`map-control-btn ${showQualityColors ? 'active green' : ''}`}
            onClick={() => setShowQualityColors(prev => !prev)}
            title={showQualityColors ? 'Hide GPS quality colors' : 'Show GPS quality colors'}
          >
            <Signal size={18} />
          </button>

          {/* Terrain Profile / Link Budget Tool */}
          <button
            className={`map-control-btn ${showTerrainProfile || showLinkBudget ? 'active' : ''}`}
            onClick={() => {
              if (showTerrainProfile) {
                setShowTerrainProfile(false);
                setShowLinkBudget(false);
              } else {
                setShowTerrainProfile(true);
                setShowLinkBudget(true);
              }
            }}
            title="Terrain Profile & Link Budget"
          >
            <Mountain size={18} />
          </button>

          {/* Measurement Tool */}
          <button
            className={`map-control-btn ${measureMode ? 'active' : ''}`}
            onClick={() => setMeasureMode(prev => !prev)}
            title={measureMode ? 'Disable Ruler' : 'Measure Distance & Bearing'}
            style={{ position: 'relative' }}
          >
            <Ruler size={18} />
            {measurements.length > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: '#f59e0b', color: '#000',
                fontSize: '9px', fontWeight: 700,
                borderRadius: '50%', width: '16px', height: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {measurements.length}
              </span>
            )}
          </button>
        </div>

        {/* SD Card Panel */}
        <SDCardPanel
          isOpen={activePanel === 'sd-card'}
          onClose={() => setActivePanel(null)}
        />

        {/* Analysis Panel */}
        <AnalysisPanel
          isOpen={activePanel === 'analysis'}
          onClose={() => setActivePanel(null)}
        />

        {/* Terrain Profile & Link Budget Panels */}
        {showTerrainProfile && (() => {
          // Use first CUAS placement and selected drone (or site center) as endpoints
          const placements = phaseActiveSession?.cuas_placements ?? [];
          const drone = selectedDrone;
          const cuas = placements[0];
          if (!cuas) return null;
          const pt2Lat = drone?.lat ?? selectedSite?.center.lat ?? cuas.position.lat + 0.005;
          const pt2Lon = drone?.lon ?? selectedSite?.center.lon ?? cuas.position.lon + 0.005;
          return (
            <div style={{
              position: 'absolute', bottom: '80px', left: '280px', right: '20px',
              zIndex: 100, display: 'flex', gap: '8px',
            }}>
              <div style={{ flex: 2 }}>
                <TerrainProfileChart
                  lat1={cuas.position.lat} lon1={cuas.position.lon} height1_m={cuas.height_agl_m ?? 5}
                  lat2={pt2Lat} lon2={pt2Lon} height2_m={drone?.alt_m ?? 50}
                  onClose={() => setShowTerrainProfile(false)}
                />
              </div>
              {showLinkBudget && (
                <div style={{ flex: 1 }}>
                  <LinkBudgetPanel
                    cuasLat={cuas.position.lat} cuasLon={cuas.position.lon}
                    cuasHeightM={cuas.height_agl_m ?? 5}
                    targetLat={pt2Lat} targetLon={pt2Lon}
                    targetHeightM={drone?.alt_m ?? 50}
                    onClose={() => setShowLinkBudget(false)}
                  />
                </div>
              )}
            </div>
          );
        })()}

        {/* Layers Panel */}
        <LayersPanel
          isOpen={activePanel === 'layers'}
          layers={layersWithCount}
          onToggleLayer={handleToggleLayer}
          importedLayers={importedLayers}
          onToggleImportedLayer={handleToggleImportedLayer}
          onRemoveImportedLayer={handleRemoveImportedLayer}
        />

        {/* Tracker Workspace Panel (replaces old DroneListPanel) */}
        {/* Rendered outside map-area so it's right-docked like other workspace panels */}

        {/* File Upload Panel */}
        <FileUploadPanel
          visible={activePanel === 'upload'}
          onClose={() => setActivePanel(null)}
        />

        {/* Welcome Overlay */}
        <WelcomeOverlay
          droneCount={drones.size}
          connectionStatus={connectionStatus}
          onOpenSettings={() => setActivePanel('settings')}
          onOpenUpload={() => setActivePanel('upload')}
        />

        {/* Camera Modal */}
        {showCamera && selectedDrone && (
          <CameraModal
            droneId={selectedDrone.tracker_id}
            onClose={() => setShowCamera(false)}
          />
        )}

        {/* CUAS Placement Hint - shown when wizard is hidden for placement */}
        {placingCuasId && (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1500,
              background: 'rgba(239, 68, 68, 0.95)',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <Target size={20} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            <span style={{ fontWeight: 500, fontSize: '14px' }}>
              Click on the map to place CUAS system
            </span>
            <button
              onClick={() => {
                // Cancel placement mode
                setPlacingCuasId(null);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '4px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                marginLeft: '8px',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Session Setup Wizard - hidden when placing CUAS on map */}
        <SessionSetupWizard
          isOpen={wizardOpen}
          onClose={closeWizard}
          onStartSession={handleStartSession}
          sites={sites}
          droneProfiles={droneProfiles}
          cuasProfiles={cuasProfiles}
          liveTrackers={drones}
          mapCenter={mapCenter}
          onRequestCuasPlacement={handleRequestCuasPlacement}
          pendingCuasPlacement={pendingCuasPlacement}
          onCuasPlacementHandled={handleCuasPlacementHandled}
          isMinimizedForPlacement={placingCuasId !== null}
          onWizardPlacementsChanged={setWizardCuasPlacements}
        />

        {/* New File Notification Toast */}
        {newFileAlert && (
          <div className="new-file-toast">
            <div className="toast-icon">
              <FileText size={18} />
            </div>
            <div className="toast-content">
              <div className="toast-title">Logging Started</div>
              <div className="toast-filename">{newFileAlert.filename}</div>
            </div>
            <button className="toast-close" onClick={clearNewFileAlert}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Anomaly Alert Toast */}
        <AnomalyAlertToast
          alert={latestAnomalyAlert}
          onDismiss={clearLatestAnomalyAlert}
          autoDismissMs={6000}
        />


        {/* Bottom Controls with Timeline */}
        <div className="bottom-controls">
          <CoordinateBar lat={cursorPos?.lat ?? null} lon={cursorPos?.lon ?? null} />
          <TimelineControl
            isLive={isLive}
            setIsLive={setIsLive}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
            connectionStatus={connectionStatus}
          />

          {/* Active Event Display */}
          {activeEvent && (
            <div className="event-display">
              <span className="event-label">Monitoring:</span>
              <span className="event-name">{activeEvent}</span>
            </div>
          )}

          {/* Drone Count */}
          <div className="drone-count">
            {drones.size} drone{drones.size !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Tracker Workspace Panel (Right-docked) - replaces DroneListPanel and DroneDetailPanel when active */}
      <TrackerWorkspacePanel
        isOpen={activePanel === 'drones'}
        onClose={() => setActivePanel(null)}
        selectedTrackerId={selectedDroneId}
        onSelectTracker={setSelectedDroneId}
      />

      {/* Right Detail Panel - only shown when TrackerWorkspacePanel is NOT open */}
      {activePanel !== 'drones' && (
        <DroneDetailPanel
          drone={selectedDrone}
          onClose={handleCloseDetail}
          onOpenCamera={() => setShowCamera(true)}
          onBackToList={() => {
            setSelectedDroneId(null);
            setActivePanel('drones');
          }}
        />
      )}

      {/* Unified Workspace Panel (Right-docked) */}
      <UnifiedWorkspacePanel
        isOpen={activePanel === 'settings'}
        onClose={() => setActivePanel(null)}
      />

      {/* Configuration Workspace Panel (Right-docked) - Sites, Drones, CUAS */}
      <ConfigurationWorkspacePanel
        isOpen={activePanel === 'sites' || activePanel === 'drone-profiles' || activePanel === 'cuas-profiles'}
        onClose={() => setActivePanel(null)}
      />

      {/* Session History Panel (Right-docked) */}
      <SessionHistoryPanel
        isOpen={activePanel === 'session-history'}
        onClose={() => setActivePanel(null)}
      />
    </div>
  );
}
