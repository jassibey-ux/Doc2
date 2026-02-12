import { useMemo, useState } from 'react';
import { MapPin, Plus, Search, Check } from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, GlassInput } from '../ui/GlassUI';
import type { WizardState, WizardAction } from './wizardTypes';
import type { SiteDefinition } from '../../types/workflow';

interface WizardStepSiteProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  sites: SiteDefinition[];
}

export default function WizardStepSite({ state, dispatch, sites }: WizardStepSiteProps) {
  const [searchTerm, setSearchTerm] = useState('');

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
