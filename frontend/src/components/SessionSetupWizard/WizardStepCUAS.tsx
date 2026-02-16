import { lazy, Suspense, useState } from 'react';
import { Radio, Trash2, RotateCw, Move, ChevronDown, ChevronUp, Box } from 'lucide-react';
import { GlassCard, GlassButton, GlassSelect, GlassInput } from '../ui/GlassUI';
import type { WizardState, WizardAction, CUASPlacementData } from './wizardTypes';
import type { SiteDefinition, CUASProfile } from '../../types/workflow';

const Site3DViewer = lazy(() => import('../Site3DViewer'));

interface WizardStepCUASProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  cuasProfiles: CUASProfile[];
  onPlaceOnMap?: (placementId: string) => void;
  mapCenter?: { lat: number; lon: number };
  selectedSite?: SiteDefinition;
  cuasProfilesList?: CUASProfile[];
}

export default function WizardStepCUAS({
  state,
  dispatch,
  cuasProfiles,
  onPlaceOnMap,
  mapCenter = { lat: 0, lon: 0 },
  selectedSite,
  cuasProfilesList,
}: WizardStepCUASProps) {
  const [expandedPlacement, setExpandedPlacement] = useState<string | null>(null);
  const [show3DPlacement, setShow3DPlacement] = useState(false);
  const [tileMode, _setTileMode] = useState<'osm' | 'google3d'>('osm');

  // Generate unique ID for new placement
  const generatePlacementId = () => `cuas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleAddCUAS = (profileId: string) => {
    const profile = cuasProfiles.find(p => p.id === profileId);
    if (!profile) return;

    const newPlacement: CUASPlacementData = {
      id: generatePlacementId(),
      cuasProfileId: profileId,
      position: { ...mapCenter },
      heightAgl: 0,
      orientation: 0,
    };

    dispatch({ type: 'ADD_CUAS_PLACEMENT', placement: newPlacement });
    setExpandedPlacement(newPlacement.id);
  };

  const handleRemoveCUAS = (placementId: string) => {
    dispatch({ type: 'REMOVE_CUAS_PLACEMENT', placementId });
    if (expandedPlacement === placementId) {
      setExpandedPlacement(null);
    }
  };

  const handleUpdatePlacement = (placementId: string, updates: Partial<CUASPlacementData>) => {
    dispatch({ type: 'UPDATE_CUAS_PLACEMENT', placementId, updates });
  };

  const getProfileForPlacement = (placement: CUASPlacementData): CUASProfile | undefined => {
    return cuasProfiles.find(p => p.id === placement.cuasProfileId);
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
          Place CUAS Systems
        </h2>
        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.6)',
            margin: 0,
          }}
        >
          Add counter-UAS systems and configure their positions. You can drag them on the map after adding.
        </p>
      </div>

      {/* Add CUAS Dropdown */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <GlassSelect
          id="add-cuas-select"
          style={{ flex: 1, fontSize: '13px' }}
          defaultValue=""
          onChange={e => {
            if (e.target.value) {
              handleAddCUAS(e.target.value);
              e.target.value = '';
            }
          }}
        >
          <option value="">+ Add CUAS System...</option>
          {cuasProfiles.map(profile => (
            <option key={profile.id} value={profile.id}>
              {profile.name} ({profile.antenna_pattern || 'omni'})
            </option>
          ))}
        </GlassSelect>
      </div>

      {/* Placements List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxHeight: '350px',
          overflowY: 'auto',
        }}
      >
        {state.cuasPlacements.length === 0 ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '13px',
              border: '2px dashed rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
            }}
          >
            <Radio size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <div>No CUAS systems placed</div>
            <div style={{ marginTop: '4px', fontSize: '12px' }}>
              CUAS placement is optional but recommended for testing jamming scenarios
            </div>
          </div>
        ) : (
          state.cuasPlacements.map((placement, index) => {
            const profile = getProfileForPlacement(placement);
            const isExpanded = expandedPlacement === placement.id;

            return (
              <GlassCard
                key={placement.id}
                style={{
                  padding: '14px 16px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  background: 'rgba(239, 68, 68, 0.05)',
                }}
              >
                {/* Header Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Index badge */}
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#ef4444',
                      }}
                    >
                      {index + 1}
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#fff',
                        }}
                      >
                        {profile?.name || 'Unknown CUAS'}
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
                          {profile?.antenna_pattern || 'omni'}
                        </span>
                        {profile?.effective_range_m && (
                          <span>{profile.effective_range_m}m range</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Place on Map button */}
                    {onPlaceOnMap && (
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => onPlaceOnMap(placement.id)}
                      >
                        <Move size={14} />
                      </GlassButton>
                    )}

                    {/* Place in 3D button */}
                    {selectedSite && (
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setShow3DPlacement(true)}
                      >
                        <Box size={14} />
                      </GlassButton>
                    )}

                    {/* Expand/Collapse */}
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedPlacement(isExpanded ? null : placement.id)}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </GlassButton>

                    {/* Remove */}
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveCUAS(placement.id)}
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </GlassButton>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '14px',
                      paddingTop: '14px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {/* Position */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <label
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '4px',
                            display: 'block',
                          }}
                        >
                          Latitude
                        </label>
                        <GlassInput
                          type="number"
                          step="0.000001"
                          value={placement.position.lat}
                          onChange={e =>
                            handleUpdatePlacement(placement.id, {
                              position: {
                                ...placement.position,
                                lat: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          style={{ fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '4px',
                            display: 'block',
                          }}
                        >
                          Longitude
                        </label>
                        <GlassInput
                          type="number"
                          step="0.000001"
                          value={placement.position.lon}
                          onChange={e =>
                            handleUpdatePlacement(placement.id, {
                              position: {
                                ...placement.position,
                                lon: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          style={{ fontSize: '12px' }}
                        />
                      </div>
                    </div>

                    {/* Height and Orientation */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <label
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '4px',
                            display: 'block',
                          }}
                        >
                          Height AGL (m)
                        </label>
                        <GlassInput
                          type="number"
                          min="0"
                          max="100"
                          value={placement.heightAgl}
                          onChange={e =>
                            handleUpdatePlacement(placement.id, {
                              heightAgl: parseFloat(e.target.value) || 0,
                            })
                          }
                          style={{ fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '4px',
                            display: 'block',
                          }}
                        >
                          Orientation (°)
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <GlassInput
                            type="number"
                            min="0"
                            max="360"
                            value={placement.orientation}
                            onChange={e =>
                              handleUpdatePlacement(placement.id, {
                                orientation: parseFloat(e.target.value) || 0,
                              })
                            }
                            style={{ fontSize: '12px', flex: 1 }}
                          />
                          <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleUpdatePlacement(placement.id, {
                                orientation: (placement.orientation + 45) % 360,
                              })
                            }
                          >
                            <RotateCw size={14} />
                          </GlassButton>
                        </div>
                      </div>
                    </div>

                    {/* Profile details */}
                    {profile && (
                      <div
                        style={{
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          color: 'rgba(255, 255, 255, 0.6)',
                          display: 'flex',
                          gap: '16px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {profile.beam_width_deg && (
                          <span>
                            <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                              Beam Width:
                            </strong>{' '}
                            {profile.beam_width_deg}°
                          </span>
                        )}
                        {profile.frequency_ranges && profile.frequency_ranges.length > 0 && (
                          <span>
                            <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                              Frequencies:
                            </strong>{' '}
                            {profile.frequency_ranges.join(', ')}
                          </span>
                        )}
                        {profile.power_output_w && (
                          <span>
                            <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Power:</strong>{' '}
                            {profile.power_output_w}W
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </GlassCard>
            );
          })
        )}
      </div>

      {/* Summary */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(239, 68, 68, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.7)',
        }}
      >
        {state.cuasPlacements.length === 0 ? (
          <span>No CUAS systems placed • This step is optional</span>
        ) : (
          <span>
            {state.cuasPlacements.length} CUAS system
            {state.cuasPlacements.length !== 1 ? 's' : ''} configured
          </span>
        )}
      </div>

      {/* 3D Placement Viewer Overlay */}
      {show3DPlacement && selectedSite && (
        <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>Loading 3D viewer...</div>}>
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
          }}>
            <Site3DViewer
              site={selectedSite}
              cuasPlacements={state.cuasPlacements.map(p => ({
                id: p.id,
                cuas_profile_id: p.cuasProfileId,
                position: { lat: p.position.lat, lon: p.position.lon },
                height_agl_m: p.heightAgl,
                orientation_deg: p.orientation,
                active: true,
              }))}
              cuasProfiles={cuasProfilesList}
              mode="interactive"
              tileMode={tileMode}
              initialCameraState={selectedSite.camera_state_3d}
              onCuasPlaced={(position) => {
                // Find the first placement without a real position, or create a new one
                const unplacedId = state.cuasPlacements.find(
                  p => p.position.lat === 0 && p.position.lon === 0
                )?.id;
                if (unplacedId) {
                  dispatch({
                    type: 'UPDATE_CUAS_PLACEMENT',
                    placementId: unplacedId,
                    updates: { position: { lat: position.lat, lon: position.lon } },
                  });
                }
              }}
              onClose={() => setShow3DPlacement(false)}
            />
          </div>
        </Suspense>
      )}
    </div>
  );
}
