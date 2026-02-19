/**
 * OperationsPanel — Tab 1: Trackers + CUAS (collapsible sections)
 *
 * Always used together — you check trackers to decide which CUAS to activate.
 * Compact mode (>5 items): single-line with ID + status dot.
 * Expanded mode (≤5 or on click): full metrics card.
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Radio, Zap, Circle } from 'lucide-react';
import type { DroneSummary } from '../../../types/drone';
import type { CUASPlacement, CUASProfile } from '../../../types/workflow';

interface OperationsPanelProps {
  drones: Map<string, DroneSummary>;
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
  cuasJamStates: Map<string, boolean>;
  selectedDroneId: string | null;
  selectedCuasId: string | null;
  onSelectDrone: (id: string) => void;
  onSelectCuas: (id: string) => void;
  tacticalMode: boolean;
}

const OperationsPanel: React.FC<OperationsPanelProps> = ({
  drones,
  cuasPlacements,
  cuasProfiles,
  cuasJamStates,
  selectedDroneId,
  selectedCuasId,
  onSelectDrone,
  onSelectCuas,
  tacticalMode,
}) => {
  const [trackersExpanded, setTrackersExpanded] = useState(true);
  const [cuasExpanded, setCuasExpanded] = useState(true);

  const droneList = useMemo(() => Array.from(drones.values()), [drones]);
  const profileMap = useMemo(() => {
    const map = new Map<string, CUASProfile>();
    cuasProfiles.forEach(p => map.set(p.id, p));
    return map;
  }, [cuasProfiles]);

  const textColor = tacticalMode ? '#4ade80' : '#e5e7eb';
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  const borderColor = tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)';

  const connectedCount = droneList.filter(d => !d.is_stale).length;

  return (
    <div style={{ fontSize: 12, color: textColor }}>
      {/* Trackers section */}
      <button
        onClick={() => setTrackersExpanded(!trackersExpanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', cursor: 'pointer',
          background: 'none', border: 'none', color: dimColor,
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        {trackersExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Radio size={13} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          Trackers
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace',
          color: connectedCount === droneList.length
            ? (tacticalMode ? '#4ade80' : '#22c55e')
            : '#f59e0b',
        }}>
          {connectedCount}/{droneList.length}
        </span>
      </button>

      {trackersExpanded && (
        <div style={{ padding: '4px 0' }}>
          {droneList.length === 0 ? (
            <div style={{ padding: '12px 14px', color: dimColor, fontSize: 11, fontStyle: 'italic' }}>
              No trackers assigned
            </div>
          ) : (
            droneList.map(drone => {
              const isSelected = selectedDroneId === drone.tracker_id;
              const isCompact = droneList.length > 5;

              return (
                <div
                  key={drone.tracker_id}
                  onClick={() => onSelectDrone(drone.tracker_id)}
                  style={{
                    padding: isCompact ? '5px 14px' : '8px 14px',
                    cursor: 'pointer',
                    background: isSelected
                      ? (tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)')
                      : 'transparent',
                    borderLeft: isSelected ? `2px solid ${tacticalMode ? '#4ade80' : '#3b82f6'}` : '2px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Status dot */}
                    <Circle
                      size={7}
                      fill={drone.is_stale ? '#6b7280' : '#22c55e'}
                      color={drone.is_stale ? '#6b7280' : '#22c55e'}
                    />
                    {/* Tracker ID */}
                    <span style={{
                      fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                      color: isSelected ? (tacticalMode ? '#4ade80' : '#fff') : textColor,
                    }}>
                      {drone.alias ?? drone.tracker_id}
                    </span>
                    {/* Speed */}
                    {!isCompact && drone.speed_mps != null && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: dimColor, fontFamily: 'monospace' }}>
                        {drone.speed_mps.toFixed(1)} m/s
                      </span>
                    )}
                    {/* Alt */}
                    {!isCompact && drone.alt_m != null && (
                      <span style={{ fontSize: 10, color: dimColor, fontFamily: 'monospace' }}>
                        {Math.round(drone.alt_m)}m
                      </span>
                    )}
                    {/* Stale indicator */}
                    {drone.is_stale && (
                      <span style={{
                        marginLeft: 'auto', fontSize: 9, color: '#ef4444',
                        fontWeight: 600, letterSpacing: 0.5,
                      }}>
                        STALE
                      </span>
                    )}
                  </div>

                  {/* Expanded card metrics */}
                  {!isCompact && !drone.is_stale && (
                    <div style={{
                      display: 'flex', gap: 8, marginTop: 4, paddingLeft: 15,
                      fontSize: 10, color: dimColor, fontFamily: 'monospace',
                    }}>
                      {drone.lat != null && (
                        <span>{drone.lat.toFixed(5)}, {drone.lon?.toFixed(5)}</span>
                      )}
                      {drone.rssi_dbm != null && (
                        <span style={{
                          color: drone.rssi_dbm > -80 ? (tacticalMode ? '#4ade80' : '#22c55e') : '#f59e0b',
                        }}>
                          {drone.rssi_dbm} dBm
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* CUAS section */}
      <button
        onClick={() => setCuasExpanded(!cuasExpanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', cursor: 'pointer',
          background: 'none', border: 'none', color: dimColor,
          borderTop: `1px solid ${borderColor}`,
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        {cuasExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Zap size={13} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          CUAS Systems
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace', color: dimColor }}>
          {cuasPlacements.length}
        </span>
      </button>

      {cuasExpanded && (
        <div style={{ padding: '4px 0' }}>
          {cuasPlacements.length === 0 ? (
            <div style={{ padding: '12px 14px', color: dimColor, fontSize: 11, fontStyle: 'italic' }}>
              No CUAS placed
            </div>
          ) : (
            cuasPlacements.map(placement => {
              const profile = profileMap.get(placement.cuas_profile_id);
              const isJamming = cuasJamStates.get(placement.id) ?? false;
              const isSelected = selectedCuasId === placement.id;

              return (
                <div
                  key={placement.id}
                  onClick={() => onSelectCuas(placement.id)}
                  style={{
                    padding: '8px 14px',
                    cursor: 'pointer',
                    background: isSelected
                      ? (tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)')
                      : 'transparent',
                    borderLeft: isSelected
                      ? `2px solid ${tacticalMode ? '#4ade80' : '#3b82f6'}`
                      : '2px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Circle
                      size={7}
                      fill={isJamming ? '#ef4444' : (tacticalMode ? '#4ade80' : '#22c55e')}
                      color={isJamming ? '#ef4444' : (tacticalMode ? '#4ade80' : '#22c55e')}
                    />
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: isSelected ? (tacticalMode ? '#4ade80' : '#fff') : textColor,
                    }}>
                      {profile?.name ?? `CUAS ${placement.id.slice(0, 6)}`}
                    </span>
                    {isJamming && (
                      <span style={{
                        marginLeft: 'auto',
                        fontSize: 9, fontWeight: 700, letterSpacing: 1,
                        color: '#ef4444',
                        animation: 'pulse-live 1.5s ease-in-out infinite',
                      }}>
                        JAMMING
                      </span>
                    )}
                    {!isJamming && (
                      <span style={{
                        marginLeft: 'auto', fontSize: 9,
                        color: dimColor, letterSpacing: 0.5,
                      }}>
                        {profile?.type?.toUpperCase() ?? 'UNKNOWN'}
                      </span>
                    )}
                  </div>

                  <div style={{
                    display: 'flex', gap: 8, marginTop: 4, paddingLeft: 15,
                    fontSize: 10, color: dimColor, fontFamily: 'monospace',
                  }}>
                    <span>{placement.position.lat.toFixed(5)}, {placement.position.lon.toFixed(5)}</span>
                    {profile?.effective_range_m && (
                      <span>{profile.effective_range_m}m range</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default OperationsPanel;
