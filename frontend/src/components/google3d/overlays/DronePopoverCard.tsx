/**
 * DronePopoverCard — Floating in-map status card for a selected drone.
 *
 * Anchored near the selected drone's marker element inside the map container.
 * Falls back to top-right corner if the marker DOM element can't be found.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { DroneSummary } from '../../../types/drone';
import type { DroneProfile } from '../../../types/workflow';

interface DronePopoverCardProps {
  droneId: string;
  droneData: DroneSummary;
  droneProfile?: DroneProfile | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  warning: '#eab308',
  emergency: '#ef4444',
  stale: '#6b7280',
  landed: '#6b7280',
};

function getDroneStatus(drone: DroneSummary): { label: string; color: string } {
  if (drone.is_stale) return { label: 'STALE', color: STATUS_COLORS.stale };
  if (drone.battery_critical) return { label: 'CRIT', color: STATUS_COLORS.emergency };
  if (drone.low_battery) return { label: 'LOW BAT', color: STATUS_COLORS.warning };
  if (!drone.fix_valid) return { label: 'NO FIX', color: STATUS_COLORS.stale };
  return { label: 'ACTIVE', color: STATUS_COLORS.active };
}

function formatAlt(alt: number | null | undefined): string {
  if (alt == null) return '--';
  return `${Math.round(alt)}m`;
}

function formatSpeed(speed: number | null | undefined): string {
  if (speed == null) return '--';
  return `${speed.toFixed(1)}`;
}

function formatBattery(mv: number | null | undefined): string {
  if (mv == null) return '--';
  return `${(mv / 1000).toFixed(1)}V`;
}

function formatSignal(rssi: number | null | undefined): string {
  if (rssi == null) return '--';
  return `${rssi}`;
}

const DronePopoverCard: React.FC<DronePopoverCardProps> = ({
  droneId,
  droneData,
  droneProfile,
  containerRef,
  onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const rafRef = useRef<number>(0);

  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    const card = cardRef.current;
    if (!container || !card) {
      // Fallback position
      setPosition({ top: 60, left: container ? container.clientWidth - 236 : 16 });
      return;
    }

    // Try to find the drone marker in the DOM
    const marker = container.querySelector(`[data-drone-id="${droneId}"]`);
    if (marker) {
      const containerRect = container.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();

      let top = markerRect.bottom - containerRect.top + 8;
      let left = markerRect.left - containerRect.left + markerRect.width / 2 - cardRect.width / 2;

      // Flip above if overflowing bottom
      if (top + cardRect.height > container.clientHeight) {
        top = markerRect.top - containerRect.top - cardRect.height - 8;
      }

      // Clamp left
      left = Math.max(8, Math.min(left, container.clientWidth - cardRect.width - 8));

      // Avoid overlap with potential right-side panels (320px)
      if (left + cardRect.width > container.clientWidth - 328) {
        left = Math.min(left, container.clientWidth - 328 - cardRect.width);
        left = Math.max(8, left);
      }

      setPosition({ top, left });
    } else {
      // Fallback: top-right corner
      setPosition({ top: 60, left: Math.max(8, container.clientWidth - 236) });
    }
  }, [droneId, containerRef]);

  // Track marker position with rAF for smooth camera movement
  useEffect(() => {
    const tick = () => {
      updatePosition();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updatePosition]);

  // Dismiss on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const status = getDroneStatus(droneData);
  const displayName = droneData.alias || droneId;
  const profileLabel = droneProfile ? `${droneProfile.make} ${droneProfile.model}` : null;

  return (
    <div
      ref={cardRef}
      style={{
        position: 'absolute',
        top: position?.top ?? 60,
        left: position?.left ?? 16,
        width: 220,
        background: 'rgba(15, 15, 30, 0.95)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        padding: '10px 14px',
        zIndex: 15,
        pointerEvents: 'auto',
        animation: 'scale-in 0.2s ease',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
          {displayName}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '0 2px',
            lineHeight: 1,
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#fff'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
        >
          ✕
        </button>
      </div>

      {/* Data grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
        <DataCell label="ALT" value={formatAlt(droneData.alt_m)} />
        <DataCell label="SPD" value={formatSpeed(droneData.speed_mps)} unit="m/s" />
        <DataCell label="STATUS" value={status.label} valueColor={status.color} />
        <DataCell label="BAT" value={formatBattery(droneData.battery_mv)} />
        <DataCell label="RSSI" value={formatSignal(droneData.rssi_dbm)} unit="dBm" />
        <DataCell label="GPS" value={droneData.fix_valid ? '3D' : 'NONE'} valueColor={droneData.fix_valid ? '#22c55e' : '#ef4444'} />
      </div>

      {/* Profile line */}
      {profileLabel && (
        <div style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {profileLabel}
        </div>
      )}
    </div>
  );
};

/** Small data cell for the 2-column grid */
const DataCell: React.FC<{
  label: string;
  value: string;
  unit?: string;
  valueColor?: string;
}> = ({ label, value, unit, valueColor }) => (
  <div>
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {label}
    </div>
    <div style={{ fontSize: 13, fontFamily: 'monospace', color: valueColor || '#fff', fontWeight: 500 }}>
      {value}
      {unit && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 2 }}>{unit}</span>}
    </div>
  </div>
);

export default DronePopoverCard;
