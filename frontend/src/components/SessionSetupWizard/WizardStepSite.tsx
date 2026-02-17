import { useMemo, useState, useEffect, useCallback } from 'react';
import { MapPin, Plus, Search, Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, GlassInput, Badge } from '../ui/GlassUI';
import type { WizardState, WizardAction, CUASPlacementData } from './wizardTypes';
import { TRACK_COLORS } from './wizardTypes';
import type { SiteDefinition } from '../../types/workflow';

interface SessionTemplate {
  id: string;
  name: string;
  site_id: string | null;
  site?: { id: string; name: string } | null;
  status: string;
  created_at: string | null;
  tracker_assignments?: Array<{
    tracker_id: string;
    drone_profile_id: string;
    session_color: string | null;
    target_altitude_m: number | null;
  }>;
  cuas_placements?: Array<{
    id: string;
    cuas_profile_id: string;
    lat: number;
    lon: number;
    height_agl_m: number;
    orientation_deg: number;
  }>;
  weather_notes?: string | null;
}

interface WizardStepSiteProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  sites: SiteDefinition[];
}

export default function WizardStepSite({ state, dispatch, sites }: WizardStepSiteProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Fetch past sessions when template section is opened
  useEffect(() => {
    if (!showTemplates || templates.length > 0) return;
    setTemplatesLoading(true);
    fetch('/api/v2/sessions?limit=20')
      .then(r => r.json())
      .then((data: SessionTemplate[]) => {
        setTemplates(Array.isArray(data) ? data : []);
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [showTemplates, templates.length]);

  const handleLoadTemplate = useCallback(async (session: SessionTemplate) => {
    // Fetch full session data with relations
    try {
      const resp = await fetch(`/api/v2/sessions/${session.id}`);
      const full: SessionTemplate = await resp.json();

      // Map tracker assignments to wizard format
      const droneAssignments = (full.tracker_assignments || []).map((ta, idx) => ({
        trackerId: ta.tracker_id,
        droneProfileId: ta.drone_profile_id,
        color: ta.session_color || TRACK_COLORS[idx % TRACK_COLORS.length],
        targetAltitude: ta.target_altitude_m ?? undefined,
      }));

      // Map CUAS placements to wizard format
      const cuasPlacements: CUASPlacementData[] = (full.cuas_placements || []).map(cp => ({
        id: `cuas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        cuasProfileId: cp.cuas_profile_id,
        position: { lat: cp.lat, lon: cp.lon },
        heightAgl: cp.height_agl_m || 0,
        orientation: cp.orientation_deg || 0,
      }));

      // Generate a new session name based on the template
      const timestamp = new Date().toISOString().split('T')[0];
      const baseName = full.name.replace(/\s*\(Copy\)\s*$/, '').replace(/^\d{4}-\d{2}-\d{2}_/, '');
      const sessionName = `${timestamp}_${baseName}`;

      dispatch({
        type: 'LOAD_TEMPLATE',
        siteId: full.site_id,
        droneAssignments,
        cuasPlacements,
        sessionName,
        weatherNotes: full.weather_notes || '',
      });

      setShowTemplates(false);
    } catch {
      // Silently fail — user can still set up manually
    }
  }, [dispatch]);

  // Filter sites based on search
  const filteredSites = useMemo(() => {
    if (!searchTerm.trim()) return sites;
    const term = searchTerm.toLowerCase();
    return sites.filter(
      site =>
        site.name.toLowerCase().includes(term) ||
        site.environment_type?.toLowerCase().includes(term)
    );
  }, [sites, searchTerm]);

  const handleSelectSite = (siteId: string) => {
    dispatch({ type: 'SELECT_SITE', siteId });
  };

  const handleStartNewSite = () => {
    dispatch({ type: 'START_NEW_SITE' });
  };

  const handleCancelNewSite = () => {
    dispatch({ type: 'CANCEL_NEW_SITE' });
  };

  const handleNewSiteNameChange = (name: string) => {
    dispatch({ type: 'SET_NEW_SITE_NAME', name });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#fff',
            margin: 0,
            marginBottom: '8px',
          }}
        >
          Select Test Site
        </h2>
        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.6)',
            margin: 0,
          }}
        >
          Choose an existing site or create a new one for this test session.
        </p>
      </div>

      {/* Start from Template */}
      {!state.isCreatingNewSite && (
        <div>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(139, 92, 246, 0.05)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '8px',
              color: '#a78bfa',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Copy size={14} />
              Start from Previous Session
            </span>
            {showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showTemplates && (
            <div
              style={{
                marginTop: '8px',
                maxHeight: '200px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {templatesLoading ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                  Loading sessions...
                </div>
              ) : templates.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                  No previous sessions found
                </div>
              ) : (
                templates.map(session => (
                  <button
                    key={session.id}
                    onClick={() => handleLoadTemplate(session)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: '#fff',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)'; e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{session.name}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                        {session.site?.name && <span>{session.site.name}</span>}
                        {session.created_at && <span>{new Date(session.created_at).toLocaleDateString()}</span>}
                        <span style={{
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: session.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                          color: session.status === 'completed' ? '#22c55e' : 'rgba(255,255,255,0.5)',
                          fontSize: '10px',
                        }}>
                          {session.status}
                        </span>
                      </div>
                    </div>
                    <Copy size={14} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      {!state.isCreatingNewSite && sites.length > 3 && (
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255, 255, 255, 0.4)',
            }}
          />
          <GlassInput
            placeholder="Search sites..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
      )}

      {/* Site List */}
      {!state.isCreatingNewSite && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {filteredSites.map(site => {
            const isSelected = state.selectedSiteId === site.id;
            return (
              <GlassCard
                key={site.id}
                onClick={() => handleSelectSite(site.id)}
                style={{
                  padding: '14px 16px',
                  cursor: 'pointer',
                  border: isSelected
                    ? '1px solid #ff8c00'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isSelected
                    ? 'rgba(255, 140, 0, 0.1)'
                    : 'rgba(255, 255, 255, 0.02)',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: isSelected
                          ? 'rgba(255, 140, 0, 0.2)'
                          : 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? '#ff8c00' : 'rgba(255, 255, 255, 0.5)',
                      }}
                    >
                      <MapPin size={18} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#fff',
                        }}
                      >
                        {site.name}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'rgba(255, 255, 255, 0.5)',
                          display: 'flex',
                          gap: '8px',
                          marginTop: '2px',
                        }}
                      >
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            fontSize: '10px',
                            textTransform: 'capitalize',
                          }}
                        >
                          {site.environment_type || 'Unknown'}
                        </span>
                        {site.enhanced_3d && (
                          <Badge color="green" size="sm">3D</Badge>
                        )}
                        {site.markers && site.markers.length > 0 && (
                          <span>{site.markers.length} markers</span>
                        )}
                        {site.zones && site.zones.length > 0 && (
                          <span>{site.zones.length} zones</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <Check
                      size={20}
                      style={{ color: '#ff8c00' }}
                    />
                  )}
                </div>
              </GlassCard>
            );
          })}

          {filteredSites.length === 0 && searchTerm && (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '13px',
              }}
            >
              No sites match "{searchTerm}"
            </div>
          )}

          {sites.length === 0 && (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '13px',
              }}
            >
              No sites defined yet. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Quick Create New Site */}
      {!state.isCreatingNewSite ? (
        <GlassButton
          variant="ghost"
          size="md"
          onClick={handleStartNewSite}
          style={{ width: '100%' }}
        >
          <Plus size={16} />
          Quick Create New Site
        </GlassButton>
      ) : (
        <GlassPanel
          style={{
            padding: '16px',
            background: 'rgba(255, 140, 0, 0.05)',
            border: '1px solid rgba(255, 140, 0, 0.2)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#ff8c00',
              }}
            >
              New Site
            </div>
            <GlassInput
              placeholder="Site name..."
              value={state.newSiteName}
              onChange={e => handleNewSiteNameChange(e.target.value)}
              autoFocus
            />
            <div
              style={{
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              You can add boundary polygon and markers later in the Sites panel.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={handleCancelNewSite}
              >
                Cancel
              </GlassButton>
            </div>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
