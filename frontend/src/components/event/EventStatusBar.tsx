/**
 * EventStatusBar — Enhanced top bar for event dashboard.
 *
 * Left:   Back arrow, SCENSUS branding, site name
 * Center: Status badge, drone counts, geofence breaches
 * Right:  Alert bell with count, live clock, connection indicator
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Bell } from 'lucide-react';
import { StatusDot } from '../ui/GlassUI';
import type { FleetSummary } from '../../types/blueUas';
import { useApiUsageSafe } from '../../contexts/ApiUsageContext';

interface EventStatusBarProps {
  summary: FleetSummary;
  siteName?: string;
  alertCount: number;
  onNavigateBack: () => void;
  onAlertClick: () => void;
}

const STATUS_CONFIG: Record<FleetSummary['overallStatus'], { bg: string; text: string; label: string }> = {
  nominal: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: 'NOMINAL' },
  warning: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', label: 'WARNING' },
  alert:   { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'ALERT' },
};

const EventStatusBar: React.FC<EventStatusBarProps> = ({
  summary,
  siteName,
  alertCount,
  onNavigateBack,
  onAlertClick,
}) => {
  const status = STATUS_CONFIG[summary.overallStatus];
  const apiUsage = useApiUsageSafe();
  const [clock, setClock] = useState(() => formatTime());

  useEffect(() => {
    const interval = setInterval(() => setClock(formatTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '6px 16px',
      background: 'rgba(10, 10, 20, 0.95)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(16px)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 13,
      color: '#e5e7eb',
      height: 44,
      flexShrink: 0,
      zIndex: 10,
    }}>
      {/* Left: Back + Branding */}
      <button
        onClick={onNavigateBack}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          color: '#9ca3af', cursor: 'pointer',
        }}
        title="Back to main view"
      >
        <ArrowLeft size={16} />
      </button>

      <span style={{
        fontWeight: 700, fontSize: 15, letterSpacing: 2,
        color: '#ff6b00', marginRight: 4,
      }}>
        SCENSUS
      </span>

      {siteName && (
        <>
          <Separator />
          <span style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{siteName}</span>
        </>
      )}

      <Separator />

      {/* Center: Status + Counts */}
      <div style={{
        padding: '2px 10px', borderRadius: 4,
        fontSize: 11, fontWeight: 700, letterSpacing: 1,
        background: status.bg, color: status.text,
        border: `1px solid ${status.text}33`,
      }}>
        {status.label}
      </div>

      <CountChip label="Active" value={summary.activeDrones} color="#22c55e" />
      <CountChip label="Landed" value={summary.landedDrones} color="#6b7280" />
      {summary.emergencyDrones > 0 && (
        <CountChip label="Emergency" value={summary.emergencyDrones} color="#ef4444" pulse />
      )}
      <CountChip label="Fleet" value={summary.totalDrones} color="#3b82f6" />
      {summary.geofenceBreaches > 0 && (
        <>
          <Separator />
          <CountChip label="Breaches" value={summary.geofenceBreaches} color="#ef4444" pulse />
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right: API usage indicator, alert bell, clock, connection */}
      {apiUsage && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 10, fontFamily: 'monospace', color: '#9ca3af',
          }}
          title={`Session: ${apiUsage.sessionTileLoads} tiles, ${apiUsage.sessionMapInits} map inits | Est. $${apiUsage.sessionCost.toFixed(2)}`}
          >
            <span style={{ color: '#3b82f6' }}>Tiles: {apiUsage.sessionTileLoads}</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
            <span style={{ color: apiUsage.sessionCost > 1 ? '#ef4444' : apiUsage.sessionCost > 0.1 ? '#f59e0b' : '#22c55e' }}>
              ~${apiUsage.sessionCost.toFixed(2)}
            </span>
          </div>
          <Separator />
        </>
      )}

      <button
        onClick={onAlertClick}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: alertCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${alertCount > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
          color: alertCount > 0 ? '#ef4444' : '#9ca3af',
          cursor: 'pointer',
        }}
        title="Alerts"
      >
        <Bell size={15} />
        {alertCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            {alertCount > 99 ? '99+' : alertCount}
          </span>
        )}
      </button>

      <span style={{
        fontSize: 12, color: '#9ca3af', fontFamily: 'monospace',
        letterSpacing: 0.5, minWidth: 64, textAlign: 'right',
      }}>
        {clock}
      </span>

      <StatusDot status="online" pulse size={8} />
    </div>
  );
};

const Separator: React.FC = () => (
  <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)' }} />
);

const CountChip: React.FC<{
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
}> = ({ label, value, color, pulse }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
    <span style={{
      fontSize: 16, fontWeight: 700, color, fontFamily: 'monospace',
      animation: pulse ? 'pulse-live 1.5s ease-in-out infinite' : undefined,
    }}>
      {value}
    </span>
    <span style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </span>
  </div>
);

function formatTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export default EventStatusBar;
