/**
 * DroneDetailPanel — 320px right-docked detail panel for event mode.
 *
 * Header, telemetry grid, geofence section, camera actions, profile footer.
 * Replaces DronePopover for the event dashboard.
 */

import React from 'react';
import { X, Navigation, Crosshair, RotateCw } from 'lucide-react';
import { Badge } from '../ui/GlassUI';
import type { DroneSummary } from '../../types/drone';
import type { DroneProfile } from '../../types/workflow';
import type { BlueUASDroneInfo, MissionStatus } from '../../types/blueUas';

interface DroneDetailPanelProps {
  drone: DroneSummary;
  profile?: DroneProfile | null;
  blueUasInfo?: BlueUASDroneInfo | null;
  onClose: () => void;
  onFlyTo: () => void;
  onTrackDrone: () => void;
  onOrbitDrone: () => void;
  isTracking: boolean;
}

const MISSION_BADGE_COLOR: Record<MissionStatus, 'green' | 'orange' | 'yellow' | 'red' | 'blue' | 'gray'> = {
  preflight: 'gray',
  active: 'green',
  rtb: 'yellow',
  landed: 'blue',
  emergency: 'red',
};

const PANEL_WIDTH = 320;

const DroneDetailPanel: React.FC<DroneDetailPanelProps> = ({
  drone,
  profile,
  blueUasInfo,
  onClose,
  onFlyTo,
  onTrackDrone,
  onOrbitDrone,
  isTracking,
}) => {
  const displayName = drone.alias ?? drone.tracker_id;
  const missionStatus = blueUasInfo?.missionStatus ?? (drone.is_stale ? 'landed' : 'active');

  return (
    <div
      className="event-detail-panel"
      style={{
        width: PANEL_WIDTH,
        flexShrink: 0,
        background: 'rgba(10, 10, 20, 0.95)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#e5e7eb',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>{displayName}</div>
            {blueUasInfo?.operatorCallsign && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                Operator: {blueUasInfo.operatorCallsign}
              </div>
            )}
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
        <div style={{ marginTop: 8 }}>
          <Badge color={MISSION_BADGE_COLOR[missionStatus]} size="md">
            {missionStatus}
          </Badge>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {/* Telemetry grid */}
        <SectionLabel>Telemetry</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
          <TelemetryItem
            label="Altitude"
            value={drone.alt_m != null ? `${Math.round(drone.alt_m)}m` : '--'}
          />
          <TelemetryItem
            label="Speed"
            value={drone.speed_mps != null ? `${drone.speed_mps.toFixed(1)} m/s` : '--'}
          />
          <TelemetryItem
            label="Battery"
            value={drone.battery_mv != null ? `${(drone.battery_mv / 1000).toFixed(1)}V` : '--'}
            color={drone.low_battery ? '#ef4444' : undefined}
          />
          <TelemetryItem
            label="Signal"
            value={drone.rssi_dbm != null ? `${drone.rssi_dbm} dBm` : '--'}
          />
          <TelemetryItem
            label="GPS Fix"
            value={drone.fix_valid ? 'Valid' : 'No Fix'}
            color={drone.fix_valid ? '#22c55e' : '#ef4444'}
          />
          <TelemetryItem
            label="Data Age"
            value={drone.is_stale ? `STALE (${drone.age_seconds}s)` : `${drone.age_seconds}s`}
            color={drone.is_stale ? '#ef4444' : undefined}
          />
        </div>

        {/* Geofence section */}
        {blueUasInfo && (
          <>
            <SectionLabel>Geofence</SectionLabel>
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 16,
              background: complianceBg(blueUasInfo.geofenceCompliance),
              border: `1px solid ${complianceColor(blueUasInfo.geofenceCompliance)}33`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge color={
                  blueUasInfo.geofenceCompliance === 'compliant' ? 'green'
                  : blueUasInfo.geofenceCompliance === 'warning' ? 'yellow' : 'red'
                } size="md">
                  {blueUasInfo.geofenceCompliance}
                </Badge>
                {blueUasInfo.assignedZoneId && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    Zone: {blueUasInfo.assignedZoneId.slice(0, 12)}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <SectionLabel>Camera</SectionLabel>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <ActionButton icon={<Navigation size={13} />} label="Fly To" onClick={onFlyTo} />
          <ActionButton
            icon={<Crosshair size={13} />}
            label={isTracking ? 'Tracking' : 'Track'}
            onClick={onTrackDrone}
            active={isTracking}
          />
          <ActionButton icon={<RotateCw size={13} />} label="Orbit" onClick={onOrbitDrone} />
        </div>

        {/* Profile info */}
        {profile && (
          <>
            <SectionLabel>Aircraft</SectionLabel>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
              {profile.make} {profile.model}
              {profile.weight_class && ` — ${profile.weight_class}`}
            </div>
          </>
        )}

        {/* Coordinates */}
        {drone.lat != null && drone.lon != null && (
          <>
            <SectionLabel>Position</SectionLabel>
            <div style={{ fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>
              {drone.lat.toFixed(6)}, {drone.lon.toFixed(6)}
            </div>
          </>
        )}

        {/* Remote ID */}
        {blueUasInfo?.remoteId?.serialNumber && (
          <>
            <SectionLabel style={{ marginTop: 12 }}>Remote ID</SectionLabel>
            <div style={{ fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>
              {blueUasInfo.remoteId.serialNumber}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Sub-components
// =============================================================================

const SectionLabel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, letterSpacing: 1,
    textTransform: 'uppercase', color: '#4b5563',
    marginBottom: 6, ...style,
  }}>
    {children}
  </div>
);

const TelemetryItem: React.FC<{
  label: string;
  value: string;
  color?: string;
}> = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </div>
    <div style={{ fontSize: 15, fontWeight: 600, color: color ?? '#e5e7eb', fontFamily: 'monospace' }}>
      {value}
    </div>
  </div>
);

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}> = ({ icon, label, onClick, active }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 6,
      background: active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${active ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
      color: active ? '#60a5fa' : '#d1d5db',
      fontSize: 11, fontWeight: 500, cursor: 'pointer',
      transition: 'all 0.15s ease',
    }}
  >
    {icon}
    {label}
  </button>
);

function complianceColor(c: string): string {
  if (c === 'compliant') return '#22c55e';
  if (c === 'warning') return '#eab308';
  return '#ef4444';
}

function complianceBg(c: string): string {
  if (c === 'compliant') return 'rgba(34,197,94,0.08)';
  if (c === 'warning') return 'rgba(234,179,8,0.08)';
  return 'rgba(239,68,68,0.08)';
}

export default DroneDetailPanel;
