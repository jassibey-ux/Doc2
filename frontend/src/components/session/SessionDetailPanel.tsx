/**
 * SessionDetailPanel — Right 320px contextual detail panel.
 *
 * Not tabbed — shows whichever entity was last selected:
 * 1. Drone detail (tracker clicked) - position, telemetry, GPS, signal, battery
 * 2. Engagement detail (engagement clicked) - expanded metrics, burst timeline
 * 3. CUAS detail (CUAS clicked) - profile specs, jam history
 */

import React, { useState } from 'react';
import { X, Navigation, Crosshair } from 'lucide-react';
import type { DroneSummary } from '../../types/drone';
import type { CUASPlacement, CUASProfile, Engagement } from '../../types/workflow';
import StreamingLogPanel from '../table/StreamingLogPanel';
import type { TelemetryRow } from '../table/types';

export type DetailContext =
  | { type: 'drone'; droneId: string }
  | { type: 'engagement'; engagementId: string }
  | { type: 'cuas'; cuasId: string }
  | { type: 'log' }
  | null;

interface SessionDetailPanelProps {
  context: DetailContext;
  tacticalMode: boolean;
  onClose: () => void;

  // Drone data
  drones: Map<string, DroneSummary>;
  onFlyToDrone: (droneId: string) => void;
  onTrackDrone: (droneId: string) => void;
  trackingDroneId: string | null;

  // Engagement data
  engagements: Engagement[];

  // CUAS data
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
  cuasJamStates: Map<string, boolean>;

  // Streaming log data
  sessionTrackerIds?: Set<string>;
  onLogRowClick?: (row: TelemetryRow) => void;
}

const PANEL_WIDTH = 320;

const SessionDetailPanel: React.FC<SessionDetailPanelProps> = ({
  context,
  tacticalMode,
  onClose,
  drones,
  onFlyToDrone,
  onTrackDrone,
  trackingDroneId,
  engagements,
  cuasPlacements,
  cuasProfiles,
  cuasJamStates,
  sessionTrackerIds,
  onLogRowClick,
}) => {
  if (!context) return null;

  const bgColor = tacticalMode ? 'rgba(0, 0, 0, 0.95)' : 'rgba(10, 10, 20, 0.95)';
  const borderColor = tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)';

  return (
    <div style={{
      width: PANEL_WIDTH,
      flexShrink: 0,
      background: bgColor,
      borderLeft: `1px solid ${borderColor}`,
      backdropFilter: 'blur(16px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: tacticalMode ? '#4ade80' : '#e5e7eb',
    }}>
      {context.type === 'drone' && (
        <DroneDetail
          key={context.droneId}
          drone={drones.get(context.droneId)}
          droneId={context.droneId}
          onClose={onClose}
          onFlyTo={() => onFlyToDrone(context.droneId)}
          onTrack={() => onTrackDrone(context.droneId)}
          isTracking={trackingDroneId === context.droneId}
          tacticalMode={tacticalMode}
          onLogRowClick={onLogRowClick}
        />
      )}
      {context.type === 'engagement' && (
        <EngagementDetail
          engagement={engagements.find(e => e.id === context.engagementId)}
          onClose={onClose}
          tacticalMode={tacticalMode}
        />
      )}
      {context.type === 'cuas' && (
        <CuasDetail
          placement={cuasPlacements.find(p => p.id === context.cuasId)}
          profiles={cuasProfiles}
          isJamming={cuasJamStates.get(context.cuasId) ?? false}
          onClose={onClose}
          tacticalMode={tacticalMode}
        />
      )}
      {context.type === 'log' && (
        <>
          <CloseHeader title="Live Data Log" onClose={onClose} tacticalMode={tacticalMode} />
          <StreamingLogPanel
            trackerFilter={sessionTrackerIds}
            onRowClick={onLogRowClick}
            tacticalMode={tacticalMode}
          />
        </>
      )}
    </div>
  );
};

// ─── Drone Detail ────────────────────────────────────────────────────────────

const DroneDetail: React.FC<{
  drone: DroneSummary | undefined;
  droneId: string;
  onClose: () => void;
  onFlyTo: () => void;
  onTrack: () => void;
  isTracking: boolean;
  tacticalMode: boolean;
  onLogRowClick?: (row: TelemetryRow) => void;
}> = ({ drone, droneId, onClose, onFlyTo, onTrack, isTracking, tacticalMode, onLogRowClick }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'logs'>('details');
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  const accentColor = tacticalMode ? '#4ade80' : '#60a5fa';

  if (!drone) {
    return (
      <div style={{ padding: 16 }}>
        <CloseHeader title={droneId} onClose={onClose} tacticalMode={tacticalMode} />
        <div style={{ color: dimColor, fontSize: 12, marginTop: 12 }}>
          Tracker not connected
        </div>
      </div>
    );
  }

  const displayName = drone.alias ?? drone.tracker_id;

  return (
    <>
      <CloseHeader title={displayName} onClose={onClose} tacticalMode={tacticalMode} />

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)'}`,
        flexShrink: 0,
      }}>
        {(['details', 'logs'] as const).map(tab => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? accentColor : 'transparent'}`,
                color: isActive ? accentColor : dimColor,
                fontSize: 11,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab === 'details' ? 'Details' : 'Logs'}
            </button>
          );
        })}
      </div>

      {activeTab === 'details' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {/* Status badge */}
          <div style={{
            display: 'inline-block',
            padding: '2px 8px', borderRadius: 4,
            background: drone.is_stale ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.15)',
            border: `1px solid ${drone.is_stale ? 'rgba(107,114,128,0.3)' : 'rgba(34,197,94,0.3)'}`,
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            color: drone.is_stale ? '#6b7280' : '#22c55e',
            marginBottom: 12,
          }}>
            {drone.is_stale ? 'STALE' : 'ACTIVE'}
          </div>

          {/* Telemetry grid */}
          <SectionLabel tacticalMode={tacticalMode}>Telemetry</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
            <TelemetryItem label="Altitude" value={drone.alt_m != null ? `${Math.round(drone.alt_m)}m` : '--'} tacticalMode={tacticalMode} />
            <TelemetryItem label="Speed" value={drone.speed_mps != null ? `${drone.speed_mps.toFixed(1)} m/s` : '--'} tacticalMode={tacticalMode} />
            <TelemetryItem label="Signal" value={drone.rssi_dbm != null ? `${drone.rssi_dbm} dBm` : '--'} tacticalMode={tacticalMode} />
            <TelemetryItem label="GPS Fix" value={drone.fix_valid ? 'Valid' : 'No Fix'} color={drone.fix_valid ? '#22c55e' : '#ef4444'} tacticalMode={tacticalMode} />
            <TelemetryItem label="Data Age" value={`${drone.age_seconds}s`} color={drone.is_stale ? '#ef4444' : undefined} tacticalMode={tacticalMode} />
            {drone.battery_mv != null && (
              <TelemetryItem label="Battery" value={`${(drone.battery_mv / 1000).toFixed(1)}V`} color={drone.low_battery ? '#ef4444' : undefined} tacticalMode={tacticalMode} />
            )}
          </div>

          {/* Camera actions */}
          <SectionLabel tacticalMode={tacticalMode}>Camera</SectionLabel>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <ActionButton icon={<Navigation size={13} />} label="Fly To" onClick={onFlyTo} tacticalMode={tacticalMode} />
            <ActionButton icon={<Crosshair size={13} />} label={isTracking ? 'Tracking' : 'Track'} onClick={onTrack} active={isTracking} tacticalMode={tacticalMode} />
          </div>

          {/* Position */}
          {drone.lat != null && drone.lon != null && (
            <>
              <SectionLabel tacticalMode={tacticalMode}>Position</SectionLabel>
              <div style={{ fontSize: 11, color: dimColor, fontFamily: 'monospace' }}>
                {drone.lat.toFixed(6)}, {drone.lon.toFixed(6)}
              </div>
            </>
          )}
        </div>
      ) : (
        <StreamingLogPanel
          trackerFilter={new Set([droneId])}
          onRowClick={onLogRowClick}
          tacticalMode={tacticalMode}
        />
      )}
    </>
  );
};

// ─── Engagement Detail ───────────────────────────────────────────────────────

const EngagementDetail: React.FC<{
  engagement: Engagement | undefined;
  onClose: () => void;
  tacticalMode: boolean;
}> = ({ engagement, onClose, tacticalMode }) => {
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';

  if (!engagement) {
    return (
      <div style={{ padding: 16 }}>
        <CloseHeader title="Engagement" onClose={onClose} tacticalMode={tacticalMode} />
        <div style={{ color: dimColor, fontSize: 12 }}>Engagement not found</div>
      </div>
    );
  }

  const metrics = engagement.metrics;

  return (
    <>
      <CloseHeader
        title={engagement.name || `Engagement #${engagement.run_number ?? '?'}`}
        onClose={onClose}
        tacticalMode={tacticalMode}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {/* Status */}
        <div style={{
          display: 'inline-block',
          padding: '2px 8px', borderRadius: 4,
          background: engagement.status === 'active' ? 'rgba(6,182,212,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${engagement.status === 'active' ? 'rgba(6,182,212,0.3)' : 'rgba(34,197,94,0.3)'}`,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
          color: engagement.status === 'active' ? '#06b6d4' : '#22c55e',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}>
          {engagement.status}
        </div>

        {/* Timing */}
        <SectionLabel tacticalMode={tacticalMode}>Timing</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
          {engagement.engage_timestamp && (
            <TelemetryItem
              label="Engage"
              value={new Date(engagement.engage_timestamp).toLocaleTimeString('en-US', { hour12: false })}
              tacticalMode={tacticalMode}
            />
          )}
          {engagement.disengage_timestamp && (
            <TelemetryItem
              label="Disengage"
              value={new Date(engagement.disengage_timestamp).toLocaleTimeString('en-US', { hour12: false })}
              tacticalMode={tacticalMode}
            />
          )}
        </div>

        {/* Metrics */}
        {metrics && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>Metrics</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
              {metrics.time_to_effect_s != null && (
                <TelemetryItem label="Time to Effect" value={`${metrics.time_to_effect_s.toFixed(1)}s`} tacticalMode={tacticalMode} />
              )}
              {metrics.effective_range_m != null && (
                <TelemetryItem label="Eff. Range" value={`${Math.round(metrics.effective_range_m)}m`} tacticalMode={tacticalMode} />
              )}
              {metrics.denial_duration_s != null && (
                <TelemetryItem label="Denial Duration" value={`${metrics.denial_duration_s.toFixed(1)}s`} tacticalMode={tacticalMode} />
              )}
              {metrics.recovery_time_s != null && (
                <TelemetryItem label="Recovery" value={`${metrics.recovery_time_s.toFixed(1)}s`} tacticalMode={tacticalMode} />
              )}
              {metrics.max_drift_m != null && (
                <TelemetryItem label="Max Drift" value={`${Math.round(metrics.max_drift_m)}m`} tacticalMode={tacticalMode} />
              )}
              <TelemetryItem
                label="Failsafe"
                value={metrics.failsafe_triggered ? (metrics.failsafe_type || 'YES') : 'No'}
                color={metrics.failsafe_triggered ? '#f59e0b' : undefined}
                tacticalMode={tacticalMode}
              />
            </div>
          </>
        )}

        {/* Bursts */}
        {engagement.bursts && engagement.bursts.length > 0 && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>Jam Bursts ({engagement.bursts.length})</SectionLabel>
            <div style={{ marginBottom: 16 }}>
              {engagement.bursts.map((burst) => (
                <div
                  key={burst.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 0', fontSize: 11,
                    borderBottom: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.04)'}`,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', color: dimColor, fontSize: 10 }}>
                    #{burst.burst_seq}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: dimColor, fontSize: 10 }}>
                    {new Date(burst.jam_on_at).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  {burst.duration_s != null && (
                    <span style={{ fontFamily: 'monospace', color: tacticalMode ? '#4ade80' : '#fff' }}>
                      {burst.duration_s.toFixed(1)}s
                    </span>
                  )}
                  {!burst.jam_off_at && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#ef4444',
                      animation: 'pulse-live 1.5s ease-in-out infinite',
                    }}>
                      ACTIVE
                    </span>
                  )}
                  {burst.gps_denial_detected && (
                    <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>
                      GPS DENIED
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Targets */}
        {engagement.targets && engagement.targets.length > 0 && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>Targets</SectionLabel>
            {engagement.targets.map(target => (
              <div key={target.id} style={{
                fontSize: 11, color: dimColor, fontFamily: 'monospace',
                padding: '2px 0',
              }}>
                {target.tracker_id}
                {target.initial_range_m != null && ` — ${Math.round(target.initial_range_m)}m`}
                {target.role === 'observer' && ' (observer)'}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
};

// ─── CUAS Detail ─────────────────────────────────────────────────────────────

const CuasDetail: React.FC<{
  placement: CUASPlacement | undefined;
  profiles: CUASProfile[];
  isJamming: boolean;
  onClose: () => void;
  tacticalMode: boolean;
}> = ({ placement, profiles, isJamming, onClose, tacticalMode }) => {
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';

  if (!placement) {
    return (
      <div style={{ padding: 16 }}>
        <CloseHeader title="CUAS" onClose={onClose} tacticalMode={tacticalMode} />
        <div style={{ color: dimColor, fontSize: 12 }}>CUAS placement not found</div>
      </div>
    );
  }

  const profile = profiles.find(p => p.id === placement.cuas_profile_id);

  return (
    <>
      <CloseHeader
        title={profile?.name ?? `CUAS ${placement.id.slice(0, 8)}`}
        onClose={onClose}
        tacticalMode={tacticalMode}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {/* Status */}
        <div style={{
          display: 'inline-block',
          padding: '2px 8px', borderRadius: 4,
          background: isJamming ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${isJamming ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
          color: isJamming ? '#ef4444' : '#22c55e',
          marginBottom: 12,
          animation: isJamming ? 'pulse-live 1.5s ease-in-out infinite' : undefined,
        }}>
          {isJamming ? 'JAMMING' : 'IDLE'}
        </div>

        {/* Profile specs */}
        {profile && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>Specifications</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
              <TelemetryItem label="Type" value={profile.type.toUpperCase()} tacticalMode={tacticalMode} />
              <TelemetryItem label="Vendor" value={profile.vendor} tacticalMode={tacticalMode} />
              <TelemetryItem label="Eff. Range" value={`${profile.effective_range_m}m`} tacticalMode={tacticalMode} />
              {profile.beam_width_deg != null && (
                <TelemetryItem label="Beam Width" value={`${profile.beam_width_deg}°`} tacticalMode={tacticalMode} />
              )}
              {profile.power_output_w != null && (
                <TelemetryItem label="Power" value={`${profile.power_output_w}W`} tacticalMode={tacticalMode} />
              )}
              {profile.antenna_gain_dbi != null && (
                <TelemetryItem label="Gain" value={`${profile.antenna_gain_dbi} dBi`} tacticalMode={tacticalMode} />
              )}
            </div>
          </>
        )}

        {/* Position */}
        <SectionLabel tacticalMode={tacticalMode}>Position</SectionLabel>
        <div style={{ fontSize: 11, color: dimColor, fontFamily: 'monospace', marginBottom: 8 }}>
          {placement.position?.lat?.toFixed(6) ?? '?'}, {placement.position?.lon?.toFixed(6) ?? '?'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
          <TelemetryItem label="Height AGL" value={`${placement.height_agl_m}m`} tacticalMode={tacticalMode} />
          <TelemetryItem label="Orientation" value={`${placement.orientation_deg}°`} tacticalMode={tacticalMode} />
        </div>
      </div>
    </>
  );
};

// ─── Shared sub-components ───────────────────────────────────────────────────

const CloseHeader: React.FC<{
  title: string;
  onClose: () => void;
  tacticalMode: boolean;
}> = ({ title, onClose, tacticalMode }) => (
  <div style={{
    padding: '14px 16px 10px',
    borderBottom: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)'}`,
    flexShrink: 0,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  }}>
    <div style={{ fontWeight: 700, fontSize: 16, color: tacticalMode ? '#4ade80' : '#fff' }}>
      {title}
    </div>
    <button
      onClick={onClose}
      style={{
        width: 26, height: 26, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#6b7280', cursor: 'pointer',
      }}
    >
      <X size={14} />
    </button>
  </div>
);

const SectionLabel: React.FC<{
  children: React.ReactNode;
  tacticalMode: boolean;
  style?: React.CSSProperties;
}> = ({ children, tacticalMode, style }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, letterSpacing: 1,
    textTransform: 'uppercase',
    color: tacticalMode ? 'rgba(74,222,128,0.5)' : '#4b5563',
    marginBottom: 6, ...style,
  }}>
    {children}
  </div>
);

const TelemetryItem: React.FC<{
  label: string;
  value: string;
  color?: string;
  tacticalMode: boolean;
}> = ({ label, value, color, tacticalMode }) => (
  <div>
    <div style={{
      fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
      color: tacticalMode ? 'rgba(74,222,128,0.4)' : '#4b5563',
    }}>
      {label}
    </div>
    <div style={{
      fontSize: 15, fontWeight: 600, fontFamily: 'monospace',
      color: color ?? (tacticalMode ? '#4ade80' : '#e5e7eb'),
    }}>
      {value}
    </div>
  </div>
);

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  tacticalMode: boolean;
}> = ({ icon, label, onClick, active, tacticalMode }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 6,
      background: active
        ? (tacticalMode ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.25)')
        : (tacticalMode ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.05)'),
      border: `1px solid ${active
        ? (tacticalMode ? 'rgba(34,197,94,0.4)' : 'rgba(59,130,246,0.4)')
        : (tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)')}`,
      color: active
        ? (tacticalMode ? '#4ade80' : '#60a5fa')
        : (tacticalMode ? 'rgba(74,222,128,0.7)' : '#d1d5db'),
      fontSize: 11, fontWeight: 500, cursor: 'pointer',
      transition: 'all 0.15s ease',
    }}
  >
    {icon}
    {label}
  </button>
);

export default SessionDetailPanel;
