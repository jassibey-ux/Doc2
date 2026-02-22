import { useState } from 'react';
import {
  MapPin,
  Radio,
  Wifi,
  User,
  Cloud,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  Car,
} from 'lucide-react';
import { GlassCard, GlassInput, GlassTextarea, GlassPanel } from '../ui/GlassUI';
import type { WizardState, WizardAction } from './wizardTypes';
import type { SiteDefinition, DroneProfile, CUASProfile } from '../../types/workflow';

interface WizardStepReviewProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  sites: SiteDefinition[];
  droneProfiles: DroneProfile[];
  cuasProfiles: CUASProfile[];
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  count?: number;
  isValid: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({
  title,
  icon,
  count,
  isValid,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <GlassCard
      style={{
        border: isValid
          ? '1px solid rgba(34, 197, 94, 0.3)'
          : '1px solid rgba(239, 68, 68, 0.3)',
        background: isValid ? 'rgba(34, 197, 94, 0.02)' : 'rgba(239, 68, 68, 0.02)',
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: isValid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isValid ? '#22c55e' : '#ef4444',
            }}
          >
            {icon}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#fff',
              }}
            >
              {title}
            </div>
            {count !== undefined && (
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                {count} item{count !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isValid ? (
            <Check size={16} style={{ color: '#22c55e' }} />
          ) : (
            <AlertCircle size={16} style={{ color: '#ef4444' }} />
          )}
          {isOpen ? (
            <ChevronUp size={16} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
          ) : (
            <ChevronDown size={16} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
          )}
        </div>
      </button>

      {isOpen && (
        <div
          style={{
            padding: '0 16px 14px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          {children}
        </div>
      )}
    </GlassCard>
  );
}

export default function WizardStepReview({
  state,
  dispatch,
  sites,
  droneProfiles,
  cuasProfiles,
}: WizardStepReviewProps) {
  // Find selected site
  const selectedSite = state.selectedSiteId
    ? sites.find(s => s.id === state.selectedSiteId)
    : null;

  // Validation
  const hasSite = !!selectedSite || !!state.newSiteName;
  const hasDrones = state.droneAssignments.length > 0;
  const hasName = state.sessionName.trim().length > 0;

  const handleSessionNameChange = (name: string) => {
    dispatch({ type: 'SET_SESSION_NAME', name });
  };

  const handleOperatorNameChange = (name: string) => {
    dispatch({ type: 'SET_OPERATOR_NAME', name });
  };

  const handleWeatherNotesChange = (notes: string) => {
    dispatch({ type: 'SET_WEATHER_NOTES', notes });
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
          Review & Start
        </h2>
        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.6)',
            margin: 0,
          }}
        >
          Review your session configuration and add any final details.
        </p>
      </div>

      {/* Session Name */}
      <GlassPanel style={{ padding: '16px' }}>
        <label
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.7)',
            marginBottom: '8px',
            display: 'block',
          }}
        >
          Session Name *
        </label>
        <GlassInput
          value={state.sessionName}
          onChange={e => handleSessionNameChange(e.target.value)}
          placeholder="Enter session name..."
          style={{
            fontSize: '15px',
            fontWeight: 500,
            border: hasName ? undefined : '1px solid rgba(239, 68, 68, 0.5)',
          }}
        />
        {!hasName && (
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              color: '#ef4444',
            }}
          >
            Session name is required
          </div>
        )}
      </GlassPanel>

      {/* Configuration Summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Site Section */}
        <CollapsibleSection
          title={selectedSite?.name || state.newSiteName || 'No Site Selected'}
          icon={<MapPin size={16} />}
          isValid={hasSite}
          defaultOpen={!hasSite}
        >
          <div style={{ paddingTop: '12px' }}>
            {selectedSite ? (
              <div
                style={{
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div>
                  <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Type:</strong>{' '}
                  {selectedSite.environment_type || 'Unknown'}
                </div>
                {selectedSite.markers && selectedSite.markers.length > 0 && (
                  <div>
                    <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Markers:</strong>{' '}
                    {selectedSite.markers.length}
                  </div>
                )}
                {selectedSite.zones && selectedSite.zones.length > 0 && (
                  <div>
                    <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Zones:</strong>{' '}
                    {selectedSite.zones.length}
                  </div>
                )}
              </div>
            ) : state.newSiteName ? (
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                New site will be created: <strong>{state.newSiteName}</strong>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#ef4444' }}>
                Please select or create a site
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Drones Section */}
        <CollapsibleSection
          title="Assigned Drones"
          icon={<Radio size={16} />}
          count={state.droneAssignments.length}
          isValid={hasDrones}
          defaultOpen={!hasDrones}
        >
          <div style={{ paddingTop: '12px' }}>
            {state.droneAssignments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {state.droneAssignments.map(assignment => {
                  const profile = droneProfiles.find(
                    p => p.id === assignment.droneProfileId
                  );
                  return (
                    <div
                      key={assignment.trackerId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: '6px',
                        borderLeft: `3px solid ${assignment.color}`,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          color: 'rgba(255, 255, 255, 0.8)',
                        }}
                      >
                        {assignment.trackerId}
                      </span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>→</span>
                      <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                        {profile?.name || 'Unknown Profile'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#ef4444' }}>
                Please assign at least one drone tracker
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* CUAS Section */}
        <CollapsibleSection
          title="CUAS Systems"
          icon={<Wifi size={16} />}
          count={state.cuasPlacements.length}
          isValid={true} // CUAS is optional
        >
          <div style={{ paddingTop: '12px' }}>
            {state.cuasPlacements.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {state.cuasPlacements.map((placement, index) => {
                  const profile = cuasProfiles.find(p => p.id === placement.cuasProfileId);
                  return (
                    <div
                      key={placement.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: '6px',
                        borderLeft: '3px solid #ef4444',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#ef4444',
                          minWidth: '20px',
                        }}
                      >
                        #{index + 1}
                      </span>
                      <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
                        {profile?.name || 'Unknown'}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'rgba(255, 255, 255, 0.4)',
                          marginLeft: 'auto',
                        }}
                      >
                        {placement.position?.lat?.toFixed(5) ?? '?'}, {placement.position?.lon?.toFixed(5) ?? '?'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                No CUAS systems placed (optional)
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Assets Section */}
        {state.assetPlacements.length > 0 && (
          <CollapsibleSection
            title="Vehicles & Equipment"
            icon={<Car size={16} />}
            count={state.assetPlacements.length}
            isValid={true}
          >
            <div style={{ paddingTop: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {state.assetPlacements.map((placement, index) => (
                  <div
                    key={placement.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: '6px',
                      borderLeft: `3px solid ${placement.assetType === 'vehicle' ? '#3b82f6' : '#8b5cf6'}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: placement.assetType === 'vehicle' ? '#3b82f6' : '#8b5cf6',
                        minWidth: '20px',
                      }}
                    >
                      #{index + 1}
                    </span>
                    <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
                      {placement.label}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'rgba(255, 255, 255, 0.4)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {placement.assetType}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'rgba(255, 255, 255, 0.4)',
                        marginLeft: 'auto',
                      }}
                    >
                      {placement.position?.lat?.toFixed(5) ?? '?'}, {placement.position?.lon?.toFixed(5) ?? '?'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Additional Details */}
      <GlassPanel style={{ padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Operator Name */}
          <div>
            <label
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.7)',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <User size={14} />
              Operator Name
            </label>
            <GlassInput
              value={state.operatorName}
              onChange={e => handleOperatorNameChange(e.target.value)}
              placeholder="Enter operator name (optional)"
              style={{ fontSize: '13px' }}
            />
          </div>

          {/* Weather Notes */}
          <div>
            <label
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.7)',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Cloud size={14} />
              Weather / Notes
            </label>
            <GlassTextarea
              value={state.weatherNotes}
              onChange={e => handleWeatherNotesChange(e.target.value)}
              placeholder="Enter weather conditions or session notes (optional)"
              rows={2}
              style={{ fontSize: '13px', resize: 'vertical' }}
            />
          </div>
        </div>
      </GlassPanel>

      {/* Ready Status */}
      {hasSite && hasDrones && hasName && (
        <div
          style={{
            padding: '14px 16px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Check size={18} style={{ color: '#22c55e' }} />
          <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: 500 }}>
            Ready to start test session
          </span>
        </div>
      )}
    </div>
  );
}
