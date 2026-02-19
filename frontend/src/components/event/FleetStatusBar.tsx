/**
 * FleetStatusBar — Summary bar showing overall fleet status.
 *
 * Displays: N drones active, N alerts, overall status indicator.
 * Sits at the top of the EventDashboard.
 */

import React from 'react';
import type { FleetSummary } from '../../types/blueUas';

interface FleetStatusBarProps {
  summary: FleetSummary;
  siteName?: string;
}

const STATUS_COLORS: Record<FleetSummary['overallStatus'], { bg: string; text: string; label: string }> = {
  nominal: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: 'NOMINAL' },
  warning: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', label: 'WARNING' },
  alert:   { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'ALERT' },
};

const FleetStatusBar: React.FC<FleetStatusBarProps> = ({ summary, siteName }) => {
  const status = STATUS_COLORS[summary.overallStatus];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '8px 16px',
      background: 'rgba(10, 10, 20, 0.9)',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(12px)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 13,
      color: '#e5e7eb',
      minHeight: 40,
    }}>
      {/* Site name */}
      {siteName && (
        <div style={{ fontWeight: 600, color: '#fff', marginRight: 8 }}>
          {siteName}
        </div>
      )}

      {/* Overall status badge */}
      <div style={{
        padding: '2px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        background: status.bg,
        color: status.text,
        border: `1px solid ${status.text}33`,
      }}>
        {status.label}
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />

      {/* Drone counts */}
      <StatItem label="Active" value={summary.activeDrones} color="#22c55e" />
      <StatItem label="Landed" value={summary.landedDrones} color="#6b7280" />
      {summary.emergencyDrones > 0 && (
        <StatItem label="Emergency" value={summary.emergencyDrones} color="#ef4444" />
      )}

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />

      {/* Total fleet */}
      <StatItem label="Fleet" value={summary.totalDrones} color="#3b82f6" />

      {/* Geofence breaches */}
      {summary.geofenceBreaches > 0 && (
        <>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
          <StatItem label="Breaches" value={summary.geofenceBreaches} color="#ef4444" pulse />
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Timestamp */}
      <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
        {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
};

const StatItem: React.FC<{
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
}> = ({ label, value, color, pulse }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <span style={{
      fontSize: 18,
      fontWeight: 700,
      color,
      fontFamily: 'monospace',
      animation: pulse ? 'pulse 1s infinite' : undefined,
    }}>
      {value}
    </span>
    <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </span>
  </div>
);

export default FleetStatusBar;
