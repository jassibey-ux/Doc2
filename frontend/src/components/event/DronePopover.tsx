/**
 * DronePopover — Status card displayed when a drone is selected.
 *
 * Shows battery, altitude, speed, mission status, geofence compliance,
 * operator callsign, and tracker info.
 *
 * Rendered as an absolute-positioned overlay in the EventDashboard.
 */

import React from 'react';
import type { DroneSummary } from '../../types/drone';
import type { DroneProfile } from '../../types/workflow';
import type { BlueUASDroneInfo, MissionStatus } from '../../types/blueUas';

interface DronePopoverProps {
  drone: DroneSummary;
  profile?: DroneProfile | null;
  blueUasInfo?: BlueUASDroneInfo | null;
  onClose: () => void;
}

const MISSION_STATUS_COLORS: Record<MissionStatus, { bg: string; text: string }> = {
  preflight: { bg: 'rgba(107, 114, 128, 0.2)', text: '#9ca3af' },
  active:    { bg: 'rgba(34, 197, 94, 0.2)',   text: '#22c55e' },
  rtb:       { bg: 'rgba(234, 179, 8, 0.2)',   text: '#eab308' },
  landed:    { bg: 'rgba(59, 130, 246, 0.2)',   text: '#3b82f6' },
  emergency: { bg: 'rgba(239, 68, 68, 0.2)',    text: '#ef4444' },
};

const DronePopover: React.FC<DronePopoverProps> = ({
  drone,
  profile,
  blueUasInfo,
  onClose,
}) => {
  const displayName = drone.alias ?? drone.tracker_id;
  const missionStatus = blueUasInfo?.missionStatus ?? 'active';
  const statusColors = MISSION_STATUS_COLORS[missionStatus];

  return (
    <div style={{
      position: 'absolute',
      top: 60,
      right: 12,
      width: 280,
      background: 'rgba(15, 15, 30, 0.95)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 10,
      padding: 16,
      backdropFilter: 'blur(16px)',
      zIndex: 50,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e5e7eb',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>
            {displayName}
          </div>
          {blueUasInfo?.operatorCallsign && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
              Operator: {blueUasInfo.operatorCallsign}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)', border: 'none',
            borderRadius: 4, color: '#888', padding: '2px 8px',
            cursor: 'pointer', fontSize: 14,
          }}
        >
          x
        </button>
      </div>

      {/* Mission Status Badge */}
      <div style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        background: statusColors.bg,
        color: statusColors.text,
        marginBottom: 12,
      }}>
        {missionStatus}
      </div>

      {/* Telemetry Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
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
          label="Age"
          value={drone.is_stale ? `STALE (${drone.age_seconds}s)` : `${drone.age_seconds}s`}
          color={drone.is_stale ? '#ef4444' : undefined}
        />
      </div>

      {/* Geofence Compliance */}
      {blueUasInfo && (
        <div style={{
          marginTop: 12,
          padding: '6px 10px',
          borderRadius: 6,
          background: blueUasInfo.geofenceCompliance === 'compliant'
            ? 'rgba(34, 197, 94, 0.1)'
            : blueUasInfo.geofenceCompliance === 'warning'
              ? 'rgba(234, 179, 8, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${
            blueUasInfo.geofenceCompliance === 'compliant' ? '#22c55e33'
              : blueUasInfo.geofenceCompliance === 'warning' ? '#eab30833'
                : '#ef444433'
          }`,
        }}>
          <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Geofence
          </div>
          <div style={{
            fontSize: 13, fontWeight: 600, marginTop: 2,
            color: blueUasInfo.geofenceCompliance === 'compliant' ? '#22c55e'
              : blueUasInfo.geofenceCompliance === 'warning' ? '#eab308'
                : '#ef4444',
          }}>
            {blueUasInfo.geofenceCompliance.toUpperCase()}
            {blueUasInfo.assignedZoneId && (
              <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: '#9ca3af' }}>
                Zone: {blueUasInfo.assignedZoneId.slice(0, 8)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Profile info */}
      {profile && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#6b7280' }}>
          {profile.make} {profile.model}
          {profile.weight_class && ` · ${profile.weight_class}`}
        </div>
      )}

      {/* Position */}
      {drone.lat != null && drone.lon != null && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#4b5563', fontFamily: 'monospace' }}>
          {drone.lat.toFixed(6)}, {drone.lon.toFixed(6)}
        </div>
      )}
    </div>
  );
};

const TelemetryItem: React.FC<{
  label: string;
  value: string;
  color?: string;
}> = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </div>
    <div style={{ fontSize: 14, fontWeight: 600, color: color ?? '#e5e7eb', fontFamily: 'monospace' }}>
      {value}
    </div>
  </div>
);

export default DronePopover;
