/**
 * Site Definition Panel
 * Allows creating and editing test sites with polygon boundaries, markers, and zones
 */

import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import {
  MapPin,
  Hexagon,
  Plus,
  Trash2,
  Save,
  X,
  Edit3,
  ChevronDown,
  ChevronRight,
  Target,
  Navigation,
  Flag,
  Eye,
  Building2,
  Box,
  Camera,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, GlassInput, Badge, GlassDivider } from './ui/GlassUI';
const CesiumGlobeViewer = lazy(() => import('./cesium/CesiumGlobeViewer'));
import { SiteReconViewer } from './SiteReconViewer';
import { useWorkflow } from '../contexts/WorkflowContext';
import {
  SiteDefinition,
  EnvironmentType,
  MarkerType,
  ZoneType,
} from '../types/workflow';
import { calculatePolygonCenter } from '../utils/siteVisualization';

interface SiteDefinitionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

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

// World Cup 2026 venue presets
const WORLD_CUP_VENUES: {
  name: string;
  city: string;
  center: { lat: number; lon: number };
  elevation_m: number;
  environment_type: EnvironmentType;
  boundary_polygon: { lat: number; lon: number }[];
}[] = [
  {
    name: 'BMO Field',
    city: 'Toronto',
    center: { lat: 43.6332, lon: -79.4186 },
    elevation_m: 76,
    environment_type: 'urban',
    boundary_polygon: [
      { lat: 43.6345, lon: -79.4205 },
      { lat: 43.6345, lon: -79.4167 },
      { lat: 43.6319, lon: -79.4167 },
      { lat: 43.6319, lon: -79.4205 },
    ],
  },
  {
    name: 'BC Place',
    city: 'Vancouver',
    center: { lat: 49.2768, lon: -123.1117 },
    elevation_m: 5,
    environment_type: 'urban',
    boundary_polygon: [
      { lat: 49.2785, lon: -123.1145 },
      { lat: 49.2785, lon: -123.1089 },
      { lat: 49.2751, lon: -123.1089 },
      { lat: 49.2751, lon: -123.1145 },
    ],
  },
];

export default function SiteDefinitionPanel({ isOpen, onClose }: SiteDefinitionPanelProps) {
  const {
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
    siteReconCaptures,
    loadSiteRecon,
    saveSiteReconImage,
  } = useWorkflow();

  // Local editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedSite, setEditedSite] = useState<Partial<SiteDefinition> | null>(null);
  const [expandedSection, setExpandedSection] = useState<'sites' | 'markers' | 'zones'>('sites');
  const [show3DPreview, setShow3DPreview] = useState(false);
  const [showRecon, setShowRecon] = useState(false);

  // Watch for drawing completion and update editedSite
  useEffect(() => {
    if (!pendingDrawingResult || !isEditing || !editedSite) return;

    const { type, points } = pendingDrawingResult;

    if (type === 'polygon') {
      // Update boundary_polygon and calculate center
      const center = calculatePolygonCenter(points);
      setEditedSite(prev => prev ? {
        ...prev,
        boundary_polygon: points,
        center,
      } : null);
    } else if (type === 'marker') {
      // Add new marker with default name and type
      const newMarker = {
        id: crypto.randomUUID(),
        name: `Marker ${(editedSite.markers?.length ?? 0) + 1}`,
        type: 'custom' as MarkerType,
        position: points[0],
      };
      setEditedSite(prev => prev ? {
        ...prev,
        markers: [...(prev.markers || []), newMarker],
      } : null);
    } else if (type === 'zone') {
      // Add new zone with default name, type, and color
      const newZone = {
        id: crypto.randomUUID(),
        name: `Zone ${(editedSite.zones?.length ?? 0) + 1}`,
        type: 'custom' as ZoneType,
        polygon: points,
        color: '#a855f7',
        opacity: 0.3,
      };
      setEditedSite(prev => prev ? {
        ...prev,
        zones: [...(prev.zones || []), newZone],
      } : null);
    }

    // Clear the pending result
    setPendingDrawingResult(null);
  }, [pendingDrawingResult, isEditing, editedSite, setPendingDrawingResult]);

  // Start editing a site
  const handleEdit = useCallback((site: SiteDefinition) => {
    setEditedSite({ ...site });
    setIsEditing(true);
  }, []);

  // Start creating a new site
  const handleNewSite = useCallback(() => {
    setEditedSite({
      name: '',
      environment_type: 'open_field',
      boundary_polygon: [],
      center: { lat: 0, lon: 0 },
      markers: [],
      zones: [],
    });
    setIsEditing(true);
    setIsDrawingMode(true);
    setDrawingType('polygon');
  }, [setIsDrawingMode, setDrawingType]);

  // Save site
  const handleSave = useCallback(async () => {
    if (!editedSite || !editedSite.name) return;

    try {
      if (editedSite.id) {
        // Update existing
        await updateSite(editedSite.id, editedSite);
      } else {
        // Create new
        const newSite = await createSite(editedSite as Omit<SiteDefinition, 'id' | 'created_at' | 'updated_at'>);
        selectSite(newSite);
      }
      setIsEditing(false);
      setEditedSite(null);
      setIsDrawingMode(false);
      setDrawingType(null);
    } catch (err) {
      console.error('Failed to save site:', err);
    }
  }, [editedSite, createSite, updateSite, selectSite, setIsDrawingMode, setDrawingType]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedSite(null);
    setIsDrawingMode(false);
    setDrawingType(null);
  }, [setIsDrawingMode, setDrawingType]);

  // Delete site
  const handleDelete = useCallback(async (site: SiteDefinition) => {
    if (!confirm(`Delete site "${site.name}"?`)) return;
    await deleteSite(site.id);
  }, [deleteSite]);

  // Toggle drawing mode for boundary
  const handleDrawBoundary = useCallback(() => {
    setIsDrawingMode(true);
    setDrawingType('polygon');
  }, [setIsDrawingMode, setDrawingType]);

  // Add marker drawing mode
  const handleAddMarker = useCallback(() => {
    setIsDrawingMode(true);
    setDrawingType('marker');
  }, [setIsDrawingMode, setDrawingType]);

  // Add zone drawing mode
  const handleAddZone = useCallback(() => {
    setIsDrawingMode(true);
    setDrawingType('zone');
  }, [setIsDrawingMode, setDrawingType]);

  // Import a World Cup venue preset as a new site
  const handleImportVenue = useCallback(async (venue: typeof WORLD_CUP_VENUES[number]) => {
    try {
      const newSite = await createSite({
        name: `${venue.name} — ${venue.city}`,
        environment_type: venue.environment_type,
        boundary_polygon: venue.boundary_polygon,
        center: venue.center,
        markers: [],
        zones: [],
        rf_notes: `World Cup 2026 venue. Elevation: ${venue.elevation_m}m ASL.`,
      } as Omit<SiteDefinition, 'id' | 'created_at' | 'updated_at'>);
      selectSite(newSite);
    } catch (err) {
      console.error('Failed to import venue:', err);
    }
  }, [createSite, selectSite]);

  if (!isOpen) return null;

  return (
    <div
      className="side-panel"
      style={{
        position: 'absolute',
        right: '60px',
        top: '20px',
        width: '320px',
        maxHeight: 'calc(100vh - 140px)',
        zIndex: 100,
      }}
    >
      <GlassPanel style={{ padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} style={{ color: '#ff8c00' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              {isEditing ? (editedSite?.id ? 'Edit Site' : 'New Site') : 'Sites'}
            </span>
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
            <X size={16} />
          </button>
        </div>

        {isEditing ? (
          // Edit/Create Form
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Site Name */}
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

            {/* Environment Type */}
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

            {/* Boundary Drawing */}
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
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <GlassButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setShow3DPreview(true)}
                >
                  <Box size={14} style={{ marginRight: '6px' }} />
                  3D Preview
                </GlassButton>
                {editedSite?.recon_status === 'captured' && (
                  <GlassButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (editedSite?.id) loadSiteRecon(editedSite.id);
                      setShowRecon(true);
                    }}
                  >
                    <Camera size={14} style={{ marginRight: '6px' }} />
                    View Recon
                  </GlassButton>
                )}
              </div>

              {/* Enhanced 3D Toggle */}
              <div style={{ marginTop: '8px' }}>
                <button
                  onClick={() => {
                    if ((editedSite?.boundary_polygon?.length ?? 0) < 3) return;
                    setEditedSite(prev => prev ? { ...prev, enhanced_3d: !prev.enhanced_3d } : null);
                  }}
                  disabled={(editedSite?.boundary_polygon?.length ?? 0) < 3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: editedSite?.enhanced_3d
                      ? '1px solid rgba(34, 197, 94, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    background: editedSite?.enhanced_3d
                      ? 'rgba(34, 197, 94, 0.15)'
                      : 'rgba(255, 255, 255, 0.03)',
                    color: editedSite?.enhanced_3d ? '#22c55e' : 'rgba(255, 255, 255, 0.5)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: (editedSite?.boundary_polygon?.length ?? 0) < 3 ? 'not-allowed' : 'pointer',
                    opacity: (editedSite?.boundary_polygon?.length ?? 0) < 3 ? 0.4 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <Box size={14} />
                  {editedSite?.enhanced_3d ? 'Enhanced 3D Enabled' : 'Enable Enhanced 3D'}
                </button>
                {(editedSite?.boundary_polygon?.length ?? 0) < 3 && (
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', textAlign: 'center' }}>
                    Draw a boundary polygon first
                  </div>
                )}
              </div>
            </div>

            <GlassDivider />

            {/* Markers Section */}
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}
                onClick={() => setExpandedSection(expandedSection === 'markers' ? 'sites' : 'markers')}
              >
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                  Markers ({editedSite?.markers?.length || 0})
                </span>
                {expandedSection === 'markers' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>

              {expandedSection === 'markers' && (
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
                onClick={() => setExpandedSection(expandedSection === 'zones' ? 'sites' : 'zones')}
              >
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                  Zones ({editedSite?.zones?.length || 0})
                </span>
                {expandedSection === 'zones' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>

              {expandedSection === 'zones' && (
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

            {/* RF Notes */}
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

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <GlassButton variant="ghost" size="md" onClick={handleCancel} style={{ flex: 1 }}>
                Cancel
              </GlassButton>
              <GlassButton
                variant="primary"
                size="md"
                onClick={handleSave}
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
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* New Site Button */}
            <GlassButton
              variant="primary"
              size="md"
              onClick={handleNewSite}
              style={{ width: '100%', marginBottom: '12px' }}
            >
              <Plus size={16} />
              New Site
            </GlassButton>

            {/* World Cup Venue Quick-Import */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                World Cup 2026 Venues
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {WORLD_CUP_VENUES.map(venue => (
                  <GlassButton
                    key={venue.name}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleImportVenue(venue)}
                    style={{ flex: 1, fontSize: '11px' }}
                  >
                    <Building2 size={12} />
                    {venue.city}
                  </GlassButton>
                ))}
              </div>
            </div>

            {/* Sites List */}
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
                        {site.enhanced_3d && (
                          <Badge color="green" size="sm">3D</Badge>
                        )}
                        {site.markers.length > 0 && (
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                            {site.markers.length} markers
                          </span>
                        )}
                        {site.zones.length > 0 && (
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                            {site.zones.length} zones
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(site); }}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px' }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(site); }}
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
      </GlassPanel>

      {show3DPreview && editedSite && (
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', color: '#fff' }}>Loading 3D...</div>}>
          <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }}>
            <CesiumGlobeViewer
              mode="preview"
              site={editedSite as any}
              tileMode={editedSite?.enhanced_3d ? 'google3d' : 'osm'}
              initialCameraState={editedSite.camera_state_3d}
              onCaptureScreenshots={async (screenshots) => {
                if (editedSite.id) {
                  for (const ss of screenshots) {
                    await saveSiteReconImage(editedSite.id, crypto.randomUUID(), ss.base64, ss.label, ss.cameraState);
                  }
                }
              }}
              onClose={() => setShow3DPreview(false)}
              enableBoundaryClipping
            />
          </div>
        </Suspense>
      )}

      {showRecon && editedSite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SiteReconViewer
            site={editedSite as any}
            captures={siteReconCaptures.get(editedSite.id || '') || []}
            onEnhanceSite={() => {
              setEditedSite(prev => prev ? { ...prev, enhanced_3d: true } : null);
              setShowRecon(false);
              setShow3DPreview(true);
            }}
            onOpenLive3D={() => {
              setShowRecon(false);
              setShow3DPreview(true);
            }}
            onClose={() => setShowRecon(false)}
          />
        </div>
      )}
    </div>
  );
}
