/**
 * Configuration Workspace Panel
 * Docked right-side panel that consolidates:
 * - Sites (from SiteDefinitionPanel)
 * - Drone Profiles (from DroneProfilePanel)
 * - CUAS Systems (from CUASProfilePanel)
 */

import { useState, useCallback, useEffect } from 'react';
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
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, Badge, GlassDivider } from './ui/GlassUI';
import { useWorkflow } from '../contexts/WorkflowContext';
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

interface ConfigurationWorkspacePanelProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function ConfigurationWorkspacePanel({ isOpen, onClose }: ConfigurationWorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sites');

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

  // ===== SITES LOGIC =====
  useEffect(() => {
    if (!pendingDrawingResult || !siteEditing || !editedSite) return;

    const { type, points } = pendingDrawingResult;

    if (type === 'polygon') {
      const center = calculatePolygonCenter(points);
      setEditedSite(prev => prev ? { ...prev, boundary_polygon: points, center } : null);
    } else if (type === 'marker') {
      const newMarker = {
        id: crypto.randomUUID(),
        name: `Marker ${(editedSite.markers?.length ?? 0) + 1}`,
        type: 'custom' as MarkerType,
        position: points[0],
      };
      setEditedSite(prev => prev ? { ...prev, markers: [...(prev.markers || []), newMarker] } : null);
    } else if (type === 'zone') {
      const newZone = {
        id: crypto.randomUUID(),
        name: `Zone ${(editedSite.zones?.length ?? 0) + 1}`,
        type: 'custom' as ZoneType,
        polygon: points,
        color: '#a855f7',
        opacity: 0.3,
      };
      setEditedSite(prev => prev ? { ...prev, zones: [...(prev.zones || []), newZone] } : null);
    }

    setPendingDrawingResult(null);
  }, [pendingDrawingResult, siteEditing, editedSite, setPendingDrawingResult]);

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
    } catch (err) {
      console.error('Failed to save site:', err);
    }
  }, [editedSite, createSite, updateSite, selectSite, setIsDrawingMode, setDrawingType]);

  const handleSiteCancel = useCallback(() => {
    setSiteEditing(false);
    setEditedSite(null);
    setIsDrawingMode(false);
    setDrawingType(null);
  }, [setIsDrawingMode, setDrawingType]);

  const handleSiteDelete = useCallback(async (site: SiteDefinition) => {
    if (!confirm(`Delete site "${site.name}"?`)) return;
    await deleteSite(site.id);
  }, [deleteSite]);

  const handleDrawBoundary = useCallback(() => {
    setIsDrawingMode(true);
    setDrawingType('polygon');
  }, [setIsDrawingMode, setDrawingType]);

  const handleAddMarker = useCallback(() => {
    setIsDrawingMode(true);
    setDrawingType('marker');
  }, [setIsDrawingMode, setDrawingType]);

  const handleAddZone = useCallback(() => {
    setIsDrawingMode(true);
    setDrawingType('zone');
  }, [setIsDrawingMode, setDrawingType]);

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
    try {
      if (editedDrone.id) {
        await updateDroneProfile(editedDrone.id, profileData);
      } else {
        await createDroneProfile(profileData as Omit<DroneProfile, 'id' | 'created_at' | 'updated_at'>);
      }
      setDroneEditing(false);
      setEditedDrone(null);
    } catch (err) {
      console.error('Failed to save drone profile:', err);
    }
  }, [editedDrone, selectedBands, createDroneProfile, updateDroneProfile]);

  const handleDroneCancel = useCallback(() => {
    setDroneEditing(false);
    setEditedDrone(null);
  }, []);

  const handleDroneDelete = useCallback(async (profile: DroneProfile) => {
    if (!confirm(`Delete profile "${profile.name}"?`)) return;
    await deleteDroneProfile(profile.id);
  }, [deleteDroneProfile]);

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
    try {
      if (editedCuas.id) {
        await updateCUASProfile(editedCuas.id, profileData);
      } else {
        await createCUASProfile(profileData as Omit<CUASProfile, 'id' | 'created_at' | 'updated_at'>);
      }
      setCuasEditing(false);
      setEditedCuas(null);
    } catch (err) {
      console.error('Failed to save CUAS profile:', err);
    }
  }, [editedCuas, selectedCapabilities, createCUASProfile, updateCUASProfile]);

  const handleCuasCancel = useCallback(() => {
    setCuasEditing(false);
    setEditedCuas(null);
  }, []);

  const handleCuasDelete = useCallback(async (profile: CUASProfile) => {
    if (!confirm(`Delete "${profile.name}"?`)) return;
    await deleteCUASProfile(profile.id);
  }, [deleteCUASProfile]);

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

  console.log('[ConfigurationWorkspacePanel] render, isOpen:', isOpen);

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
                      <GlassButton
                        variant={isDrawingMode && drawingType === 'marker' ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={handleAddMarker}
                        style={{ width: '100%' }}
                      >
                        <Plus size={14} />
                        Add Marker
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
                    disabled={!editedSite?.name}
                    style={{ flex: 1 }}
                  >
                    <Save size={14} />
                    Save Site
                  </GlassButton>
                </div>
              </div>
            ) : (
              // Site List
              <div>
                <GlassButton
                  variant="primary"
                  size="md"
                  onClick={handleSiteNew}
                  style={{ width: '100%', marginBottom: '12px' }}
                >
                  <Plus size={16} />
                  New Site
                </GlassButton>

                {sites.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.5)' }}>
                    <MapPin size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <div style={{ fontSize: '13px' }}>No sites defined</div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>Create a site to get started</div>
                  </div>
                ) : (
                  sites.map(site => (
                    <GlassCard
                      key={site.id}
                      selected={selectedSite?.id === site.id}
                      onClick={() => selectSite(site)}
                      style={{ marginBottom: '8px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                            {site.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <Badge color="blue" size="sm">
                              {site.environment_type.replace('_', ' ')}
                            </Badge>
                            {site.markers && site.markers.length > 0 && (
                              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                                {site.markers.length} markers
                              </span>
                            )}
                            {site.zones && site.zones.length > 0 && (
                              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                                {site.zones.length} zones
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSiteEdit(site); }}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px' }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSiteDelete(site); }}
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
                    disabled={!editedDrone?.name || !editedDrone?.make || !editedDrone?.model}
                    style={{ flex: 1 }}
                  >
                    <Save size={14} />
                    Save
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
                    disabled={!editedCuas?.name || !editedCuas?.vendor || !editedCuas?.effective_range_m}
                    style={{ flex: 1 }}
                  >
                    <Save size={14} />
                    Save
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
    </div>
  );
}
