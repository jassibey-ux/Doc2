import { useMemo } from 'react';
import { Radio, Wifi, WifiOff, Battery, Check, Palette } from 'lucide-react';
import { GlassCard, GlassSelect, GlassInput } from '../ui/GlassUI';
import type { WizardState, WizardAction, DroneAssignment } from './wizardTypes';
import { TRACK_COLORS } from './wizardTypes';
import type { DroneProfile } from '../../types/workflow';
import type { DroneSummary } from '../../types/drone';
import ModelThumbnailButton from '../ModelThumbnailButton';

interface WizardStepDronesProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  liveTrackers: Map<string, DroneSummary>;
  droneProfiles: DroneProfile[];
}

function getBatteryColor(mv?: number | null): string {
  if (!mv) return 'rgba(255, 255, 255, 0.3)';
  if (mv >= 3500) return '#22c55e';
  if (mv >= 3300) return '#eab308';
  return '#ef4444';
}

function getRssiIcon(rssi?: number | null) {
  if (!rssi || rssi < -90) {
    return <WifiOff size={14} style={{ color: 'rgba(255, 255, 255, 0.3)' }} />;
  }
  const color = rssi >= -70 ? '#22c55e' : rssi >= -80 ? '#eab308' : '#ef4444';
  return <Wifi size={14} style={{ color }} />;
}

export default function WizardStepDrones({
  state,
  dispatch,
  liveTrackers,
  droneProfiles,
}: WizardStepDronesProps) {
  // Convert Map to array for rendering
  const trackerList = useMemo(() => {
    return Array.from(liveTrackers.entries()).map(([id, tracker]) => ({
      id,
      ...tracker,
    }));
  }, [liveTrackers]);

  // Get assignment for a tracker
  const getAssignment = (trackerId: string): DroneAssignment | undefined => {
    return state.droneAssignments.find(a => a.trackerId === trackerId);
  };

  // Get next available color
  const getNextColor = (): string => {
    const usedColors = new Set(state.droneAssignments.map(a => a.color));
    return TRACK_COLORS.find(c => !usedColors.has(c)) || TRACK_COLORS[0];
  };

  const handleProfileChange = (trackerId: string, profileId: string) => {
    const existing = getAssignment(trackerId);

    if (profileId === '') {
      // Remove assignment
      dispatch({ type: 'REMOVE_DRONE_ASSIGNMENT', trackerId });
    } else if (existing) {
      // Update existing
      dispatch({
        type: 'UPDATE_DRONE_ASSIGNMENT',
        trackerId,
        updates: { droneProfileId: profileId },
      });
    } else {
      // Create new
      dispatch({
        type: 'ADD_DRONE_ASSIGNMENT',
        assignment: {
          trackerId,
          droneProfileId: profileId,
          color: getNextColor(),
        },
      });
    }
  };

  const handleColorChange = (trackerId: string, color: string) => {
    dispatch({
      type: 'UPDATE_DRONE_ASSIGNMENT',
      trackerId,
      updates: { color },
    });
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
          Assign Drone Profiles
        </h2>
        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.6)',
            margin: 0,
          }}
        >
          Link each live tracker to a drone profile. Assigned drones will be tracked during the test.
        </p>
      </div>

      {/* Tracker Grid */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxHeight: '400px',
          overflowY: 'auto',
        }}
      >
        {trackerList.length === 0 ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '13px',
            }}
          >
            <Radio size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <div>No live trackers detected</div>
            <div style={{ marginTop: '4px', fontSize: '12px' }}>
              Connect trackers to proceed
            </div>
          </div>
        ) : (
          trackerList.map(tracker => {
            const assignment = getAssignment(tracker.id);
            const isAssigned = !!assignment;
            const profile = assignment
              ? droneProfiles.find(p => p.id === assignment.droneProfileId)
              : null;

            return (
              <GlassCard
                key={tracker.id}
                style={{
                  padding: '14px 16px',
                  border: isAssigned
                    ? `1px solid ${assignment.color}`
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isAssigned
                    ? `linear-gradient(135deg, ${assignment.color}10, transparent)`
                    : 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                  }}
                >
                  {/* Tracker Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    {/* Color indicator */}
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: isAssigned
                          ? `${assignment.color}20`
                          : 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isAssigned ? assignment.color : 'rgba(255, 255, 255, 0.5)',
                      }}
                    >
                      <Radio size={18} />
                    </div>

                    <div style={{ flex: 1 }}>
                      {/* Tracker ID */}
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#fff',
                          fontFamily: 'monospace',
                        }}
                      >
                        {tracker.id}
                      </div>

                      {/* Status indicators */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          marginTop: '4px',
                        }}
                      >
                        {/* RSSI */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {getRssiIcon(tracker.rssi_dbm)}
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'rgba(255, 255, 255, 0.5)',
                            }}
                          >
                            {tracker.rssi_dbm ? `${tracker.rssi_dbm} dBm` : 'N/A'}
                          </span>
                        </div>

                        {/* Battery */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Battery
                            size={14}
                            style={{ color: getBatteryColor(tracker.battery_mv) }}
                          />
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'rgba(255, 255, 255, 0.5)',
                            }}
                          >
                            {tracker.battery_mv ? `${(tracker.battery_mv / 1000).toFixed(2)}V` : 'N/A'}
                          </span>
                        </div>

                        {/* Altitude */}
                        {tracker.alt_m !== undefined && tracker.alt_m !== null && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'rgba(255, 255, 255, 0.5)',
                            }}
                          >
                            {tracker.alt_m.toFixed(0)}m
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Assignment Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Color picker (only when assigned) */}
                    {isAssigned && (
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => {
                            // Cycle to next color
                            const currentIndex = TRACK_COLORS.indexOf(assignment.color as typeof TRACK_COLORS[number]);
                            const nextIndex = (currentIndex + 1) % TRACK_COLORS.length;
                            handleColorChange(tracker.id, TRACK_COLORS[nextIndex]);
                          }}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '2px solid rgba(255, 255, 255, 0.2)',
                            background: assignment.color,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Click to change color"
                        >
                          <Palette size={12} style={{ color: '#fff', opacity: 0.7 }} />
                        </button>
                      </div>
                    )}

                    {/* Profile selector */}
                    <div style={{ minWidth: '180px' }}>
                      <GlassSelect
                        value={assignment?.droneProfileId || ''}
                        onChange={e => handleProfileChange(tracker.id, e.target.value)}
                        style={{ fontSize: '13px' }}
                      >
                        <option value="">— Select Profile —</option>
                        {droneProfiles.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </GlassSelect>
                    </div>

                    {/* Assigned indicator */}
                    {isAssigned && (
                      <Check
                        size={18}
                        style={{ color: '#22c55e' }}
                      />
                    )}
                  </div>
                </div>

                {/* Expanded details when assigned */}
                {isAssigned && profile && (
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      fontSize: '12px',
                      color: 'rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    {/* 3D Model picker */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ModelThumbnailButton
                        modelCategory="drone"
                        currentModelId={assignment.model3dOverride ?? profile.model_3d}
                        onModelChange={(modelId) => {
                          dispatch({
                            type: 'UPDATE_DRONE_ASSIGNMENT',
                            trackerId: tracker.id,
                            updates: { model3dOverride: modelId },
                          });
                        }}
                        size={36}
                      />
                    </div>
                    <span>
                      <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Model:</strong>{' '}
                      {profile.model || 'N/A'}
                    </span>
                    <span>
                      <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Max Speed:</strong>{' '}
                      {profile.max_speed_mps ? `${profile.max_speed_mps} m/s` : 'N/A'}
                    </span>
                    <span>
                      <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Class:</strong>{' '}
                      {profile.weight_class || 'N/A'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                      <strong style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Target Alt:</strong>
                      <GlassInput
                        type="number"
                        placeholder="m AGL"
                        value={assignment.targetAltitude ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          dispatch({
                            type: 'UPDATE_DRONE_ASSIGNMENT',
                            trackerId: tracker.id,
                            updates: { targetAltitude: val === '' ? undefined : Number(val) },
                          });
                        }}
                        style={{ width: '80px', fontSize: '12px', padding: '4px 8px' }}
                      />
                    </div>
                  </div>
                )}
              </GlassCard>
            );
          })
        )}
      </div>

      {/* Summary */}
      {trackerList.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(255, 140, 0, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 140, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
            {state.droneAssignments.length} of {trackerList.length} trackers assigned
          </span>
          {state.droneAssignments.length === 0 && (
            <span style={{ fontSize: '12px', color: '#ff8c00' }}>
              Assign at least one tracker to continue
            </span>
          )}
        </div>
      )}
    </div>
  );
}
