/**
 * Configuration Workspace Panel
 * Docked right-side panel that consolidates:
 * - Sites (gallery with 3D thumbnails)
 * - Drone Profiles (from DroneProfilePanel)
 * - CUAS Systems (from CUASProfilePanel)
 */

import { useState, useCallback, useEffect, useRef, lazy, Suspense, type RefObject } from 'react';
import type { Google3DViewerHandle } from './google3d/Google3DViewer';
import { useRecordFlythrough } from './google3d/hooks/useRecordFlythrough';
import {
  MapPin,
  Plane,
  Radio,
  Plus,
  Trash2,
  Save,
  X,
  Edit3,
  ChevronDown,
  ChevronRight,
  Hexagon,
  Target,
  Navigation,
  Flag,
  Eye,
  Zap,
  Radar,
  Volume2,
  Camera,
  Layers,
  Settings,
  Film,
  Download,
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, Badge, GlassDivider } from './ui/GlassUI';
const Google3DViewer = lazy(() => import('./google3d/Google3DViewer'));
import { APIProvider } from '@vis.gl/react-google-maps';
import { SiteReconViewer } from './SiteReconViewer';
import SiteGallery from './site/SiteGallery';
import SiteDetailPanel from './site/SiteDetailPanel';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useToastHelpers } from '../contexts/ToastContext';
import {
  SiteDefinition,
  DroneProfile,
  CUASProfile,
  EnvironmentType,
  MarkerType,
  ZoneType,
  WeightClass,
  FailsafeType,
  CUASType,
  AntennaPattern,
} from '../types/workflow';
import { calculatePolygonCenter } from '../utils/siteVisualization';
import { DRONE_MODELS } from '../utils/modelRegistry';

interface ConfigurationWorkspacePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onFlyToSite?: (center: { lat: number; lon: number }) => void;
}

type TabId = 'sites' | 'drones' | 'cuas';

// ===== SITE CONSTANTS =====
const ENVIRONMENT_OPTIONS: { value: EnvironmentType; label: string }[] = [
  { value: 'open_field', label: 'Open Field' },
  { value: 'urban', label: 'Urban' },
  { value: 'suburban', label: 'Suburban' },
  { value: 'wooded', label: 'Wooded' },
  { value: 'coastal', label: 'Coastal' },
  { value: 'mountain', label: 'Mountain' },
];

const MARKER_TYPES: { value: MarkerType; label: string; icon: React.ReactNode }[] = [
  { value: 'command_post', label: 'Command Post', icon: <Target size={14} /> },
  { value: 'launch_point', label: 'Launch Point', icon: <Navigation size={14} /> },
  { value: 'recovery_zone', label: 'Recovery Zone', icon: <Flag size={14} /> },
  { value: 'observation', label: 'Observation', icon: <Eye size={14} /> },
  { value: 'custom', label: 'Custom', icon: <MapPin size={14} /> },
];

// ===== DRONE CONSTANTS =====
const WEIGHT_CLASSES: { value: WeightClass; label: string; desc: string }[] = [
  { value: 'micro', label: 'Micro', desc: '< 250g' },
  { value: 'mini', label: 'Mini', desc: '250g - 2kg' },
  { value: 'small', label: 'Small', desc: '2 - 25kg' },
  { value: 'medium', label: 'Medium', desc: '> 25kg' },
];

const FAILSAFE_TYPES: { value: FailsafeType; label: string }[] = [
  { value: 'rth', label: 'Return to Home' },
  { value: 'land', label: 'Land in Place' },
  { value: 'hover', label: 'Hover' },
  { value: 'atti_mode', label: 'ATTI Mode' },
  { value: 'fly_away', label: 'Fly Away' },
  { value: 'unknown', label: 'Unknown' },
];

const FREQUENCY_BANDS = [
  '2.4GHz RC', '5.8GHz Video', '900MHz', 'GPS L1', 'GPS L2', 'GLONASS', 'Galileo',
];

// ===== CUAS CONSTANTS =====
const CUAS_TYPES: { value: CUASType; label: string; icon: React.ReactNode }[] = [
  { value: 'jammer', label: 'RF Jammer', icon: <Zap size={14} /> },
  { value: 'rf_sensor', label: 'RF Sensor', icon: <Radio size={14} /> },
  { value: 'radar', label: 'Radar', icon: <Radar size={14} /> },
  { value: 'eo_ir_camera', label: 'EO/IR Camera', icon: <Camera size={14} /> },
  { value: 'acoustic', label: 'Acoustic', icon: <Volume2 size={14} /> },
  { value: 'combined', label: 'Combined System', icon: <Layers size={14} /> },
];

const ANTENNA_PATTERNS: { value: AntennaPattern; label: string }[] = [
  { value: 'omni', label: 'Omnidirectional' },
  { value: 'directional', label: 'Directional' },
  { value: 'sector', label: 'Sector' },
];

const CAPABILITY_OPTIONS = [
  'GPS L1', 'GPS L2', 'GLONASS', 'Galileo', 'WiFi 2.4GHz', 'WiFi 5.8GHz',
  'RC 2.4GHz', 'RC 900MHz', 'LTE/4G', '5G', 'ISM Band',
];

export default function ConfigurationWorkspacePanel({ isOpen, onClose, onFlyToSite }: ConfigurationWorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sites');

  // ===== TOAST & SAVING STATE =====
  const toast = useToastHelpers();
  const [saving, setSaving] = useState(false);

  // ===== WORKFLOW CONTEXT =====
  const {
    // Sites
    sites,
    selectedSite,
    selectSite,
    createSite,
    updateSite,
    deleteSite,
    isDrawingMode,
    setIsDrawingMode,
    drawingType,
    setDrawingType,
    pendingDrawingResult,
    setPendingDrawingResult,
    // Drone Profiles
    droneProfiles,
    createDroneProfile,
    updateDroneProfile,
    deleteDroneProfile,
    // CUAS Profiles
    cuasProfiles,
    createCUASProfile,
    updateCUASProfile,
    deleteCUASProfile,
    // Site Recon
    siteReconCaptures,
    saveSiteReconImage,
  } = useWorkflow();

  // ===== SITES STATE =====
  const [siteEditing, setSiteEditing] = useState(false);
  const [editedSite, setEditedSite] = useState<Partial<SiteDefinition> | null>(null);
  const [siteExpandedSection, setSiteExpandedSection] = useState<'sites' | 'markers' | 'zones'>('sites');

  // ===== DRONE PROFILES STATE =====
  const [droneEditing, setDroneEditing] = useState(false);
  const [editedDrone, setEditedDrone] = useState<Partial<DroneProfile> | null>(null);
  const [selectedBands, setSelectedBands] = useState<string[]>([]);

  // ===== CUAS STATE =====
  const [cuasEditing, setCuasEditing] = useState(false);
  const [editedCuas, setEditedCuas] = useState<Partial<CUASProfile> | null>(null);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);

  // ===== 3D / RECON STATE =====
  const [viewing3DSiteId, setViewing3DSiteId] = useState<string | null>(null);
  const [showReconViewer, setShowReconViewer] = useState<string | null>(null);
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null);
  // Marker/Zone type picker state (Fixes 4.1, 4.2)
  const [pendingMarkerType, setPendingMarkerType] = useState<MarkerType>('custom');
  const [pendingZoneType, setPendingZoneType] = useState<ZoneType>('custom');
  // KML/GeoJSON import ref (Fix 4.6)
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 3D viewer ref for flythrough recording and auto-thumbnail (Fixes 2.2, 5.1)
  const viewerRef = useRef<Google3DViewerHandle>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const [flythroughSiteId, setFlythroughSiteId] = useState<string | null>(null);
  const flythrough = useRecordFlythrough();

  // ===== UNSAVED CHANGES WARNING (Fix 4.5) =====
  useEffect(() => {
    if (!siteEditing) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [siteEditing]);

  // Auto-start flythrough recording when 3D viewer is ready (Fix 5.1)
  useEffect(() => {
    if (!flythroughSiteId || !viewing3DSiteId) return;
    const site = sites.find(s => s.id === flythroughSiteId);
    if (!site || !site.boundary_polygon || site.boundary_polygon.length < 3) return;
    // Delay to allow the viewer to fully initialize
    const timer = setTimeout(() => {
      if (viewerRef.current) {
        flythrough.recordFlythrough(
          viewerRef as RefObject<Google3DViewerHandle | null>,
          viewerContainerRef as RefObject<HTMLDivElement | null>,
          site.boundary_polygon,
          { durationMs: 20000, altitudeM: 300 },
        );
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [flythroughSiteId, viewing3DSiteId, sites]);

  // ===== SITES LOGIC =====
  useEffect(() => {
    if (!pendingDrawingResult || !siteEditing || !editedSite) return;

    const { type, points } = pendingDrawingResult;

    if (type === 'polygon') {
      const center = calculatePolygonCenter(points);
      setEditedSite(prev => prev ? { ...prev, boundary_polygon: points, center } : null);
    } else if (type === 'marker') {
      const MARKER_TYPE_NAMES: Record<MarkerType, string> = {
        command_post: 'Command Post', launch_point: 'Launch Point',
        recovery_zone: 'Recovery Zone', observation: 'Observation', custom: 'Marker',
      };
      const newMarker = {
        id: crypto.randomUUID(),
        name: `${MARKER_TYPE_NAMES[pendingMarkerType]} ${(editedSite.markers?.length ?? 0) + 1}`,
        type: pendingMarkerType,
        position: points[0],
      };
      setEditedSite(prev => prev ? { ...prev, markers: [...(prev.markers || []), newMarker] } : null);
    } else if (type === 'zone') {
      const ZONE_TYPE_COLORS: Record<ZoneType, string> = {
        jammer_zone: '#ef4444', approach_corridor: '#3b82f6',
        exclusion: '#f97316', test_area: '#22c55e', custom: '#a855f7',
      };
      const ZONE_TYPE_NAMES: Record<ZoneType, string> = {
        jammer_zone: 'Jammer Zone', approach_corridor: 'Approach Corridor',
        exclusion: 'Exclusion Zone', test_area: 'Test Area', custom: 'Zone',
      };
      const newZone = {
        id: crypto.randomUUID(),
        name: `${ZONE_TYPE_NAMES[pendingZoneType]} ${(editedSite.zones?.length ?? 0) + 1}`,
        type: pendingZoneType,
        polygon: points,
        color: ZONE_TYPE_COLORS[pendingZoneType],
        opacity: 0.3,
      };
      setEditedSite(prev => prev ? { ...prev, zones: [...(prev.zones || []), newZone] } : null);
    }

    setPendingDrawingResult(null);
  }, [pendingDrawingResult, siteEditing, editedSite, setPendingDrawingResult, pendingMarkerType, pendingZoneType]);

  const handleSiteEdit = useCallback((site: SiteDefinition) => {
    setEditedSite({ ...site });
    setSiteEditing(true);
  }, []);

  const handleSiteNew = useCallback(() => {
    setEditedSite({
      name: '',
      environment_type: 'open_field',
      boundary_polygon: [],
      center: { lat: 0, lon: 0 },
      markers: [],
      zones: [],
    });
    setSiteEditing(true);
    setIsDrawingMode(true);
    setDrawingType('polygon');
  }, [setIsDrawingMode, setDrawingType]);

  const handleSiteSave = useCallback(async () => {
    if (!editedSite || !editedSite.name) return;

    // Validate center != {0,0}
    if (editedSite.center && editedSite.center.lat === 0 && editedSite.center.lon === 0) {
      toast.warning('Site center is at (0, 0). Draw a boundary or set a valid location.');
    }

    // Validation: warn if no boundary but don't block save
    const hasBoundary = editedSite.boundary_polygon && editedSite.boundary_polygon.length >= 3;
    if (!hasBoundary) {
      if (!confirm('Site has no boundary polygon. Save anyway?')) return;
    }

    setSaving(true);
    try {
      if (editedSite.id) {
        await updateSite(editedSite.id, editedSite);
      } else {
        const newSite = await createSite(editedSite as Omit<SiteDefinition, 'id' | 'created_at' | 'updated_at'>);
        selectSite(newSite);
      }
      setSiteEditing(false);
      setEditedSite(null);
      setIsDrawingMode(false);
      setDrawingType(null);
      toast.success('Site saved');
    } catch (err) {
      console.error('Failed to save site:', err);
      setIsDrawingMode(false);
      setDrawingType(null);
      toast.error(`Failed to save site: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [editedSite, createSite, updateSite, selectSite, setIsDrawingMode, setDrawingType, toast]);

  const handleSiteCancel = useCallback(() => {
    setSiteEditing(false);
    setEditedSite(null);
    setIsDrawingMode(false);
    setDrawingType(null);
  }, [setIsDrawingMode, setDrawingType]);

  const handleSiteDelete = useCallback(async (site: SiteDefinition) => {
    if (!confirm(`Delete site "${site.name}"?`)) return;
    try {
      await deleteSite(site.id);
      toast.success('Site deleted');
    } catch (err) {
      toast.error(`Failed to delete site: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [deleteSite, toast]);

  const handleDrawBoundary = useCallback(() => {
    // Confirm before redraw if existing boundary (Fix 2.8)
    if (editedSite?.boundary_polygon && editedSite.boundary_polygon.length > 0) {
      if (!confirm('This will replace the existing boundary. Continue?')) return;
    }
    setIsDrawingMode(true);
    setDrawingType('polygon');
  }, [editedSite, setIsDrawingMode, setDrawingType]);

  const handleAddMarker = useCallback(() => {
    setIsDrawingMode(true);
    setDrawingType('marker');
  }, [setIsDrawingMode, setDrawingType]);

  const handleAddZone = useCallback(() => {
    setIsDrawingMode(true);
    setDrawingType('zone');
  }, [setIsDrawingMode, setDrawingType]);

  // KML/GeoJSON boundary import (Fix 4.6)
  const handleImportBoundary = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        let points: { lat: number; lon: number }[] = [];
        if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
          const geo = JSON.parse(text);
          const coords = geo.type === 'Feature'
            ? geo.geometry.coordinates[0]
            : geo.type === 'Polygon'
              ? geo.coordinates[0]
              : geo.features?.[0]?.geometry?.coordinates?.[0];
          if (coords) {
            points = coords.map(([lon, lat]: number[]) => ({ lat, lon }));
            // Remove closing point if it duplicates first
            if (points.length > 1) {
              const first = points[0];
              const last = points[points.length - 1];
              if (first.lat === last.lat && first.lon === last.lon) points.pop();
            }
          }
        } else if (file.name.endsWith('.kml')) {
          // Simple KML coordinate extraction
          const coordMatch = text.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
          if (coordMatch) {
            const coordStr = coordMatch[1].trim();
            points = coordStr.split(/\s+/).map(pair => {
              const [lon, lat] = pair.split(',').map(Number);
              return { lat, lon };
            }).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            // Remove closing point
            if (points.length > 1) {
              const first = points[0];
              const last = points[points.length - 1];
              if (first.lat === last.lat && first.lon === last.lon) points.pop();
            }
          }
        }
        if (points.length >= 3) {
          const center = calculatePolygonCenter(points);
          setEditedSite(prev => prev ? { ...prev, boundary_polygon: points, center } : null);
        }
      } catch (err) {
        console.error('Failed to parse imported file:', err);
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ===== DRONE PROFILES LOGIC =====
  const handleDroneEdit = useCallback((profile: DroneProfile) => {
    setEditedDrone({ ...profile });
    setSelectedBands(profile.frequency_bands || []);
    setDroneEditing(true);
  }, []);

  const handleDroneNew = useCallback(() => {
    setEditedDrone({
      name: '',
      make: '',
      model: '',
      weight_class: 'mini',
      frequency_bands: [],
      expected_failsafe: 'rth',
    });
    setSelectedBands([]);
    setDroneEditing(true);
  }, []);

  const handleDroneSave = useCallback(async () => {
    if (!editedDrone || !editedDrone.name || !editedDrone.make || !editedDrone.model) return;
    const profileData = { ...editedDrone, frequency_bands: selectedBands };
    setSaving(true);
    try {
      if (editedDrone.id) {
        await updateDroneProfile(editedDrone.id, profileData);
      } else {
        await createDroneProfile(profileData as Omit<DroneProfile, 'id' | 'created_at' | 'updated_at'>);
      }
      setDroneEditing(false);
      setEditedDrone(null);
      toast.success('Drone profile saved');
    } catch (err) {
      console.error('Failed to save drone profile:', err);
      toast.error(`Failed to save drone profile: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [editedDrone, selectedBands, createDroneProfile, updateDroneProfile, toast]);

  const handleDroneCancel = useCallback(() => {
    setDroneEditing(false);
    setEditedDrone(null);
  }, []);

  const handleDroneDelete = useCallback(async (profile: DroneProfile) => {
    if (!confirm(`Delete profile "${profile.name}"?`)) return;
    try {
      await deleteDroneProfile(profile.id);
      toast.success('Drone profile deleted');
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [deleteDroneProfile, toast]);

  const toggleBand = useCallback((band: string) => {
    setSelectedBands(prev => prev.includes(band) ? prev.filter(b => b !== band) : [...prev, band]);
  }, []);

  // ===== CUAS LOGIC =====
  const handleCuasEdit = useCallback((profile: CUASProfile) => {
    setEditedCuas({ ...profile });
    setSelectedCapabilities(profile.capabilities || []);
    setCuasEditing(true);
  }, []);

  const handleCuasNew = useCallback(() => {
    setEditedCuas({
      name: '',
      vendor: '',
      type: 'jammer',
      capabilities: [],
      effective_range_m: 500,
      antenna_pattern: 'omni',
    });
    setSelectedCapabilities([]);
    setCuasEditing(true);
  }, []);

  const handleCuasSave = useCallback(async () => {
    if (!editedCuas || !editedCuas.name || !editedCuas.vendor) return;
    const profileData = { ...editedCuas, capabilities: selectedCapabilities };
    setSaving(true);
    try {
      if (editedCuas.id) {
        await updateCUASProfile(editedCuas.id, profileData);
      } else {
        await createCUASProfile(profileData as Omit<CUASProfile, 'id' | 'created_at' | 'updated_at'>);
      }
      setCuasEditing(false);
      setEditedCuas(null);
      toast.success('CUAS profile saved');
    } catch (err) {
      console.error('Failed to save CUAS profile:', err);
      toast.error(`Failed to save CUAS profile: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [editedCuas, selectedCapabilities, createCUASProfile, updateCUASProfile, toast]);

  const handleCuasCancel = useCallback(() => {
    setCuasEditing(false);
    setEditedCuas(null);
  }, []);

  const handleCuasDelete = useCallback(async (profile: CUASProfile) => {
    if (!confirm(`Delete "${profile.name}"?`)) return;
    try {
      await deleteCUASProfile(profile.id);
      toast.success('CUAS profile deleted');
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [deleteCUASProfile, toast]);

  const toggleCapability = useCallback((cap: string) => {
    setSelectedCapabilities(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]);
  }, []);

  const getTypeIcon = (type: CUASType) => {
    const found = CUAS_TYPES.find(t => t.value === type);
    return found?.icon || <Radio size={14} />;
  };

  const getTypeColor = (type: CUASType): 'red' | 'blue' | 'green' | 'orange' | 'gray' => {
    switch (type) {
      case 'jammer': return 'red';
      case 'rf_sensor': return 'blue';
      case 'radar': return 'green';
      case 'eo_ir_camera': return 'orange';
      case 'acoustic': return 'gray';
      case 'combined': return 'orange';
      default: return 'gray';
    }
  };

  // Tab definitions
  const tabs = [
    { id: 'sites' as TabId, label: 'Sites', icon: <MapPin size={14} />, count: sites.length },
    { id: 'drones' as TabId, label: 'Drones', icon: <Plane size={14} />, count: droneProfiles.length },
    { id: 'cuas' as TabId, label: 'CUAS', icon: <Radio size={14} />, count: cuasProfiles.length },
  ];

  if (!isOpen) {
    return <div className="config-workspace-panel hidden" />;
  }

  return (
    <div className="config-workspace-panel">
      {/* Header */}
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={18} style={{ color: '#ff8c00' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Configuration</h2>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="workspace-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`workspace-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className="tab-badge" style={{ background: 'rgba(255,140,0,0.8)' }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="workspace-content">
        {/* ===== SITES TAB ===== */}
        {activeTab === 'sites' && (
          <div>
            {siteEditing ? (
              // Site Edit Form
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Site Name *
                  </label>
                  <GlassInput
                    placeholder="e.g., CFB Suffield Range 3"
                    value={editedSite?.name || ''}
                    onChange={(e) => setEditedSite(prev => prev ? { ...prev, name: e.target.value } : null)}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Environment
                  </label>
                  <select
                    value={editedSite?.environment_type || 'open_field'}
                    onChange={(e) => setEditedSite(prev => prev ? { ...prev, environment_type: e.target.value as EnvironmentType } : null)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    {ENVIRONMENT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value} style={{ background: '#1a1a2e' }}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Site Boundary
                  </label>
                  <GlassButton
                    variant={isDrawingMode && drawingType === 'polygon' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={handleDrawBoundary}
                    style={{ width: '100%' }}
                  >
                    <Hexagon size={14} />
                    {editedSite?.boundary_polygon?.length ? 'Redraw Boundary' : 'Draw Boundary'}
                  </GlassButton>
                  {/* Import boundary from KML/GeoJSON (Fix 4.6) */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".kml,.geojson,.json"
                    style={{ display: 'none' }}
                    onChange={handleImportBoundary}
                  />
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ width: '100%', marginTop: '6px' }}
                  >
                    Import Boundary (KML/GeoJSON)
                  </GlassButton>
                  {editedSite?.boundary_polygon && editedSite.boundary_polygon.length > 0 && (
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
                      {editedSite.boundary_polygon.length} vertices
                    </div>
                  )}
                </div>

                <GlassDivider />

                {/* Markers Section */}
                <div style={{ marginBottom: '12px' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}
                    onClick={() => setSiteExpandedSection(siteExpandedSection === 'markers' ? 'sites' : 'markers')}
                  >
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                      Markers ({editedSite?.markers?.length || 0})
                    </span>
                    {siteExpandedSection === 'markers' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>

                  {siteExpandedSection === 'markers' && (
                    <>
                      {editedSite?.markers?.map((marker, idx) => (
                        <GlassCard key={marker.id || idx} style={{ marginBottom: '6px', padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {MARKER_TYPES.find(m => m.value === marker.type)?.icon}
                              <span style={{ fontSize: '12px', color: '#fff' }}>{marker.name}</span>
                            </div>
                            <button
                              onClick={() => {
                                setEditedSite(prev => prev ? {
                                  ...prev,
                                  markers: prev.markers?.filter((_, i) => i !== idx) || [],
                                } : null);
                              }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </GlassCard>
                      ))}
                      {/* Marker type selector (Fix 4.1) */}
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        {MARKER_TYPES.map(mt => (
                          <button
                            key={mt.value}
                            onClick={() => setPendingMarkerType(mt.value)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              border: pendingMarkerType === mt.value ? '1px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
                              background: pendingMarkerType === mt.value ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.05)',
                              color: '#fff',
                              fontSize: '10px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {mt.icon} {mt.label}
                          </button>
                        ))}
                      </div>
                      <GlassButton
                        variant={isDrawingMode && drawingType === 'marker' ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={handleAddMarker}
                        style={{ width: '100%' }}
                      >
                        <Plus size={14} />
                        Add {MARKER_TYPES.find(m => m.value === pendingMarkerType)?.label || 'Marker'}
                      </GlassButton>
                    </>
                  )}
                </div>

                {/* Zones Section */}
                <div style={{ marginBottom: '12px' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}
                    onClick={() => setSiteExpandedSection(siteExpandedSection === 'zones' ? 'sites' : 'zones')}
                  >
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                      Zones ({editedSite?.zones?.length || 0})
                    </span>
                    {siteExpandedSection === 'zones' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>

                  {siteExpandedSection === 'zones' && (
                    <>
                      {editedSite?.zones?.map((zone, idx) => (
                        <GlassCard key={zone.id || idx} style={{ marginBottom: '6px', padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: zone.color }} />
                              <span style={{ fontSize: '12px', color: '#fff' }}>{zone.name}</span>
                            </div>
                            <button
                              onClick={() => {
                                setEditedSite(prev => prev ? {
                                  ...prev,
                                  zones: prev.zones?.filter((_, i) => i !== idx) || [],
                                } : null);
                              }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </GlassCard>
                      ))}
                      {/* Zone type picker (Fix 4.2) */}
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        {([
                          { value: 'jammer_zone' as ZoneType, label: 'Jammer', color: '#ef4444' },
                          { value: 'approach_corridor' as ZoneType, label: 'Approach', color: '#3b82f6' },
                          { value: 'exclusion' as ZoneType, label: 'Exclusion', color: '#f97316' },
                          { value: 'test_area' as ZoneType, label: 'Test Area', color: '#22c55e' },
                          { value: 'custom' as ZoneType, label: 'Custom', color: '#a855f7' },
                        ]).map(zt => (
                          <button
                            key={zt.value}
                            onClick={() => setPendingZoneType(zt.value)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              border: pendingZoneType === zt.value ? `1px solid ${zt.color}` : '1px solid rgba(255,255,255,0.1)',
                              background: pendingZoneType === zt.value ? `${zt.color}33` : 'rgba(255,255,255,0.05)',
                              color: '#fff',
                              fontSize: '10px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: zt.color }} />
                            {zt.label}
                          </button>
                        ))}
                      </div>
                      <GlassButton
                        variant={isDrawingMode && drawingType === 'zone' ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={handleAddZone}
                        style={{ width: '100%' }}
                      >
                        <Plus size={14} />
                        Add Zone
                      </GlassButton>
                    </>
                  )}
                </div>

                <GlassDivider />

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    RF Environment Notes
                  </label>
                  <textarea
                    placeholder="Known interference, cell towers, etc."
                    value={editedSite?.rf_notes || ''}
                    onChange={(e) => setEditedSite(prev => prev ? { ...prev, rf_notes: e.target.value } : null)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                      minHeight: '60px',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <GlassButton variant="ghost" size="md" onClick={handleSiteCancel} style={{ flex: 1 }}>
                    Cancel
                  </GlassButton>
                  <GlassButton
                    variant="primary"
                    size="md"
                    onClick={handleSiteSave}
                    disabled={!editedSite?.name || saving}
                    style={{ flex: 1 }}
                  >
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save Site'}
                  </GlassButton>
                </div>
              </div>
            ) : detailSiteId ? (
              // Site Detail Panel
              (() => {
                const detailSite = sites.find(s => s.id === detailSiteId);
                return detailSite ? (
                  <SiteDetailPanel
                    site={detailSite}
                    onClose={() => setDetailSiteId(null)}
                    onEdit={() => {
                      handleSiteEdit(detailSite);
                      setDetailSiteId(null);
                    }}
                    onDelete={() => {
                      handleSiteDelete(detailSite);
                      setDetailSiteId(null);
                    }}
                    onView3D={() => {
                      setViewing3DSiteId(detailSite.id);
                      setDetailSiteId(null);
                    }}
                    onDuplicate={async () => {
                      // Duplicate site (Fix 4.3)
                      const { id, created_at, updated_at, ...rest } = detailSite as any;
                      try {
                        await createSite({ ...rest, name: `${detailSite.name} (Copy)` });
                      } catch (err) {
                        console.error('Failed to duplicate site:', err);
                      }
                    }}
                    onRecordFlythrough={() => {
                      // Open 3D viewer and start flythrough recording (Fix 5.1)
                      setFlythroughSiteId(detailSite.id);
                      setViewing3DSiteId(detailSite.id);
                      setDetailSiteId(null);
                    }}
                  />
                ) : null;
              })()
            ) : (
              // Site Gallery
              <SiteGallery
                sites={sites}
                selectedSiteId={selectedSite?.id}
                onSiteSelect={(site) => {
                  selectSite(site);
                  setDetailSiteId(site.id);
                  if (site.center && onFlyToSite) {
                    onFlyToSite(site.center);
                  }
                }}
                onNewSite={handleSiteNew}
              />
            )}
          </div>
        )}

        {/* ===== DRONES TAB ===== */}
        {activeTab === 'drones' && (
          <div>
            {droneEditing ? (
              // Drone Edit Form
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Profile Name *
                  </label>
                  <GlassInput
                    placeholder="e.g., DJI Mavic 3"
                    value={editedDrone?.name || ''}
                    onChange={(e) => setEditedDrone(prev => prev ? { ...prev, name: e.target.value } : null)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Make *
                    </label>
                    <GlassInput
                      placeholder="DJI"
                      value={editedDrone?.make || ''}
                      onChange={(e) => setEditedDrone(prev => prev ? { ...prev, make: e.target.value } : null)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Model *
                    </label>
                    <GlassInput
                      placeholder="Mavic 3"
                      value={editedDrone?.model || ''}
                      onChange={(e) => setEditedDrone(prev => prev ? { ...prev, model: e.target.value } : null)}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Weight Class
                  </label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {WEIGHT_CLASSES.map(wc => (
                      <button
                        key={wc.value}
                        onClick={() => setEditedDrone(prev => prev ? { ...prev, weight_class: wc.value } : null)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: editedDrone?.weight_class === wc.value ? '1px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
                          background: editedDrone?.weight_class === wc.value ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.05)',
                          color: '#fff',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        {wc.label}
                        <span style={{ display: 'block', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>{wc.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    3D Model
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {/* Auto-detect option */}
                    <button
                      onClick={() => setEditedDrone(prev => prev ? { ...prev, model_3d: undefined } : null)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
                        border: !editedDrone?.model_3d ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
                        background: !editedDrone?.model_3d ? 'rgba(255,140,0,0.15)' : 'rgba(255,255,255,0.05)',
                        color: '#fff', fontSize: '10px',
                      }}
                    >
                      <div style={{
                        width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '24px', opacity: 0.7,
                      }}>
                        {'\u2728'}
                      </div>
                      <span>Auto</span>
                    </button>
                    {Object.values(DRONE_MODELS).map(m => {
                      const isSel = editedDrone?.model_3d === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setEditedDrone(prev => prev ? { ...prev, model_3d: m.id } : null)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                            padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
                            border: isSel ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
                            background: isSel ? 'rgba(255,140,0,0.15)' : 'rgba(255,255,255,0.05)',
                            color: '#fff', fontSize: '10px',
                          }}
                        >
                          <img
                            src={`${import.meta.env.BASE_URL ?? '/'}${m.thumbnailProfilePath.replace(/^\//, '')}`}
                            alt={m.label}
                            style={{ width: 48, height: 48, objectFit: 'contain' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <span style={{ textAlign: 'center', lineHeight: '1.2' }}>{m.label.replace(/ *\(.*\)/, '')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Expected Failsafe
                  </label>
                  <select
                    value={editedDrone?.expected_failsafe || 'rth'}
                    onChange={(e) => setEditedDrone(prev => prev ? { ...prev, expected_failsafe: e.target.value as FailsafeType } : null)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    {FAILSAFE_TYPES.map(fs => (
                      <option key={fs.value} value={fs.value} style={{ background: '#1a1a2e' }}>
                        {fs.label}
                      </option>
                    ))}
                  </select>
                </div>

                <GlassDivider />

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Frequency Bands
                  </label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {FREQUENCY_BANDS.map(band => (
                      <button
                        key={band}
                        onClick={() => toggleBand(band)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: selectedBands.includes(band) ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                          background: selectedBands.includes(band) ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                          color: '#fff',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        {band}
                      </button>
                    ))}
                  </div>
                </div>

                <GlassDivider />

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Max Speed (m/s)
                    </label>
                    <GlassInput
                      type="number"
                      placeholder="20"
                      value={editedDrone?.max_speed_mps?.toString() || ''}
                      onChange={(e) => setEditedDrone(prev => prev ? { ...prev, max_speed_mps: parseFloat(e.target.value) || undefined } : null)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Max Alt (m)
                    </label>
                    <GlassInput
                      type="number"
                      placeholder="500"
                      value={editedDrone?.max_altitude_m?.toString() || ''}
                      onChange={(e) => setEditedDrone(prev => prev ? { ...prev, max_altitude_m: parseFloat(e.target.value) || undefined } : null)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <GlassButton variant="ghost" size="md" onClick={handleDroneCancel} style={{ flex: 1 }}>
                    Cancel
                  </GlassButton>
                  <GlassButton
                    variant="primary"
                    size="md"
                    onClick={handleDroneSave}
                    disabled={!editedDrone?.name || !editedDrone?.make || !editedDrone?.model || saving}
                    style={{ flex: 1 }}
                  >
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save'}
                  </GlassButton>
                </div>
              </div>
            ) : (
              // Drone List
              <div>
                <GlassButton variant="primary" size="md" onClick={handleDroneNew} style={{ width: '100%', marginBottom: '12px' }}>
                  <Plus size={16} />
                  New Profile
                </GlassButton>

                {droneProfiles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.5)' }}>
                    <Plane size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <div style={{ fontSize: '13px' }}>No drone profiles</div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>Create a profile to get started</div>
                  </div>
                ) : (
                  droneProfiles.map(profile => (
                    <GlassCard key={profile.id} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff', marginBottom: '2px' }}>
                            {profile.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                            {profile.make} {profile.model}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <Badge color="blue" size="sm">{profile.weight_class}</Badge>
                            <Badge color="orange" size="sm">{profile.expected_failsafe.toUpperCase()}</Badge>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => handleDroneEdit(profile)}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px' }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDroneDelete(profile)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== CUAS TAB ===== */}
        {activeTab === 'cuas' && (
          <div>
            {cuasEditing ? (
              // CUAS Edit Form
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    System Name *
                  </label>
                  <GlassInput
                    placeholder="e.g., DroneShield DroneGun"
                    value={editedCuas?.name || ''}
                    onChange={(e) => setEditedCuas(prev => prev ? { ...prev, name: e.target.value } : null)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Vendor *
                    </label>
                    <GlassInput
                      placeholder="DroneShield"
                      value={editedCuas?.vendor || ''}
                      onChange={(e) => setEditedCuas(prev => prev ? { ...prev, vendor: e.target.value } : null)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Model
                    </label>
                    <GlassInput
                      placeholder="MK3"
                      value={editedCuas?.model || ''}
                      onChange={(e) => setEditedCuas(prev => prev ? { ...prev, model: e.target.value } : null)}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    System Type
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                    {CUAS_TYPES.map(ct => (
                      <button
                        key={ct.value}
                        onClick={() => setEditedCuas(prev => prev ? { ...prev, type: ct.value } : null)}
                        style={{
                          padding: '8px',
                          borderRadius: '6px',
                          border: editedCuas?.type === ct.value ? '1px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
                          background: editedCuas?.type === ct.value ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.05)',
                          color: '#fff',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {ct.icon}
                        {ct.label}
                      </button>
                    ))}
                  </div>
                </div>

                <GlassDivider />

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Effective Range (m) *
                    </label>
                    <GlassInput
                      type="number"
                      placeholder="500"
                      value={editedCuas?.effective_range_m?.toString() || ''}
                      onChange={(e) => setEditedCuas(prev => prev ? { ...prev, effective_range_m: parseFloat(e.target.value) || 0 } : null)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Beam Width (deg)
                    </label>
                    <GlassInput
                      type="number"
                      placeholder="60"
                      value={editedCuas?.beam_width_deg?.toString() || ''}
                      onChange={(e) => setEditedCuas(prev => prev ? { ...prev, beam_width_deg: parseFloat(e.target.value) || undefined } : null)}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Antenna Pattern
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {ANTENNA_PATTERNS.map(ap => (
                      <button
                        key={ap.value}
                        onClick={() => setEditedCuas(prev => prev ? { ...prev, antenna_pattern: ap.value } : null)}
                        style={{
                          flex: 1,
                          padding: '6px',
                          borderRadius: '6px',
                          border: editedCuas?.antenna_pattern === ap.value ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                          background: editedCuas?.antenna_pattern === ap.value ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                          color: '#fff',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        {ap.label}
                      </button>
                    ))}
                  </div>
                </div>

                <GlassDivider />

                {(editedCuas?.type === 'jammer' || editedCuas?.type === 'combined') && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                      Jamming Capabilities
                    </label>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {CAPABILITY_OPTIONS.map(cap => (
                        <button
                          key={cap}
                          onClick={() => toggleCapability(cap)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: selectedCapabilities.includes(cap) ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                            background: selectedCapabilities.includes(cap) ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                            color: '#fff',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          {cap}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <GlassButton variant="ghost" size="md" onClick={handleCuasCancel} style={{ flex: 1 }}>
                    Cancel
                  </GlassButton>
                  <GlassButton
                    variant="primary"
                    size="md"
                    onClick={handleCuasSave}
                    disabled={!editedCuas?.name || !editedCuas?.vendor || !editedCuas?.effective_range_m || saving}
                    style={{ flex: 1 }}
                  >
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save'}
                  </GlassButton>
                </div>
              </div>
            ) : (
              // CUAS List
              <div>
                <GlassButton variant="primary" size="md" onClick={handleCuasNew} style={{ width: '100%', marginBottom: '12px' }}>
                  <Plus size={16} />
                  New CUAS System
                </GlassButton>

                {cuasProfiles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.5)' }}>
                    <Radio size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <div style={{ fontSize: '13px' }}>No CUAS systems</div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>Add jammers, sensors, radar, etc.</div>
                  </div>
                ) : (
                  cuasProfiles.map(profile => (
                    <GlassCard key={profile.id} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            {getTypeIcon(profile.type)}
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
                              {profile.name}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                            {profile.vendor} {profile.model && `/ ${profile.model}`}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <Badge color={getTypeColor(profile.type)} size="sm">
                              {profile.type.replace('_', ' ')}
                            </Badge>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                              {profile.effective_range_m}m range
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => handleCuasEdit(profile)}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px' }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleCuasDelete(profile)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3D Site Viewer overlay */}
      {viewing3DSiteId && (() => {
        const site3d = sites.find(s => s.id === viewing3DSiteId);
        return site3d ? (
          <Suspense fallback={<div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', color: '#fff' }}>Loading 3D Viewer...</div>}>
            <div ref={viewerContainerRef} style={{ position: 'fixed', inset: 0, zIndex: 3000 }}>
              <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''} version="alpha">
                <Google3DViewer
                  ref={viewerRef}
                  mode="preview"
                  site={site3d}
                  initialCameraState={site3d.camera_state_3d}
                  onCaptureScreenshots={async (screenshots) => {
                    for (const ss of screenshots) {
                      await saveSiteReconImage(site3d.id, crypto.randomUUID(), ss.base64, ss.label, ss.cameraState);
                    }
                    // Auto-thumbnail: save first screenshot as site thumbnail (Fix 2.2)
                    if (screenshots.length > 0 && !site3d.thumbnail_base64) {
                      try {
                        await updateSite(site3d.id, { thumbnail_base64: screenshots[0].base64 });
                      } catch { /* thumbnail save is best-effort */ }
                    }
                  }}
                  onClose={() => {
                    setViewing3DSiteId(null);
                    setFlythroughSiteId(null);
                    flythrough.reset();
                  }}
                />
              </APIProvider>

              {/* Flythrough recording controls (Fix 5.1) */}
              {flythroughSiteId === viewing3DSiteId && (
                <div style={{
                  position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
                  padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
                  zIndex: 10, background: 'rgba(15, 15, 30, 0.9)', borderRadius: 14,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(16px)',
                }}>
                  <Film size={16} style={{ color: flythrough.isRecording ? '#ef4444' : '#fff' }} />
                  {flythrough.isRecording ? (
                    <>
                      <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                        Recording... {Math.round(flythrough.progress * 100)}%
                      </span>
                      <div style={{
                        width: 120, height: 4, borderRadius: 2,
                        background: 'rgba(255,255,255,0.1)',
                      }}>
                        <div style={{
                          width: `${flythrough.progress * 100}%`, height: '100%',
                          borderRadius: 2, background: '#ef4444',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </>
                  ) : flythrough.frames.length > 0 ? (
                    <>
                      <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 500 }}>
                        {flythrough.frames.length} frames captured
                      </span>
                      <GlassButton variant="primary" size="sm" onClick={flythrough.downloadFrames}>
                        <Download size={13} />
                        Download Frames
                      </GlassButton>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      Preparing flythrough...
                    </span>
                  )}
                </div>
              )}
            </div>
          </Suspense>
        ) : null;
      })()}

      {/* Recon Viewer overlay */}
      {showReconViewer && (() => {
        const siteRecon = sites.find(s => s.id === showReconViewer);
        const captures = siteReconCaptures.get(showReconViewer) || [];
        return siteRecon ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SiteReconViewer
              site={siteRecon}
              captures={captures}
              onEnhanceSite={() => {
                setShowReconViewer(null);
                setViewing3DSiteId(showReconViewer);
              }}
              onOpenLive3D={() => {
                setShowReconViewer(null);
                setViewing3DSiteId(showReconViewer);
              }}
              onClose={() => setShowReconViewer(null)}
            />
          </div>
        ) : null;
      })()}
    </div>
  );
}
