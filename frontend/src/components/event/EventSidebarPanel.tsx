/**
 * EventSidebarPanel — 280px expandable panel between sidebar and map.
 *
 * Fleet tab:  Scrollable drone cards
 * Zones tab:  Geofence zone cards with visibility toggles
 * Alerts tab: Time-filtered alert cards with acknowledge
 */

import React, { useState, useMemo } from 'react';
import { GlassCard, StatusDot, Badge } from '../ui/GlassUI';
import type { EventPanel } from './EventSidebar';
import type { DroneSummary } from '../../types/drone';
import type { DroneProfile } from '../../types/workflow';
import type { GeofenceZone, EventAlert } from '../../types/blueUas';
import { GEOFENCE_COLORS } from '../../types/blueUas';

interface EventSidebarPanelProps {
  activePanel: EventPanel | null;
  // Fleet
  drones: Map<string, DroneSummary>;
  droneProfiles: DroneProfile[];
  selectedDroneId: string | null;
  onSelectDrone: (id: string) => void;
  // Zones
  geofenceZones: GeofenceZone[];
  hiddenZoneIds: Set<string>;
  onToggleZone: (id: string) => void;
  // Alerts
  alerts: EventAlert[];
  onAcknowledgeAlert: (id: string) => void;
  onAcknowledgeAll: () => void;
  onAlertClick: (alert: EventAlert) => void;
}

const PANEL_WIDTH = 280;

const EventSidebarPanel: React.FC<EventSidebarPanelProps> = ({
  activePanel,
  drones,
  droneProfiles,
  selectedDroneId,
  onSelectDrone,
  geofenceZones,
  hiddenZoneIds,
  onToggleZone,
  alerts,
  onAcknowledgeAlert,
  onAcknowledgeAll,
  onAlertClick,
}) => {
  return (
    <div
      className="event-sidebar-panel"
      style={{
        width: activePanel ? PANEL_WIDTH : 0,
        overflow: 'hidden',
        flexShrink: 0,
        background: 'rgba(10, 10, 20, 0.9)',
        borderRight: activePanel ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'width 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        width: PANEL_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Panel header */}
        <div style={{
          padding: '12px 14px 8px',
          fontSize: 12, fontWeight: 700, letterSpacing: 1,
          color: '#9ca3af', textTransform: 'uppercase',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          {activePanel === 'fleet' && 'Fleet'}
          {activePanel === 'zones' && 'Zones'}
          {activePanel === 'alerts' && 'Alerts'}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {activePanel === 'fleet' && (
            <FleetTab
              drones={drones}
              droneProfiles={droneProfiles}
              selectedDroneId={selectedDroneId}
              onSelectDrone={onSelectDrone}
            />
          )}
          {activePanel === 'zones' && (
            <ZonesTab
              zones={geofenceZones}
              hiddenZoneIds={hiddenZoneIds}
              onToggleZone={onToggleZone}
              drones={drones}
            />
          )}
          {activePanel === 'alerts' && (
            <AlertsTab
              alerts={alerts}
              onAcknowledge={onAcknowledgeAlert}
              onAcknowledgeAll={onAcknowledgeAll}
              onAlertClick={onAlertClick}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Fleet Tab
// =============================================================================

const FleetTab: React.FC<{
  drones: Map<string, DroneSummary>;
  droneProfiles: DroneProfile[];
  selectedDroneId: string | null;
  onSelectDrone: (id: string) => void;
}> = ({ drones, droneProfiles, selectedDroneId, onSelectDrone }) => {
  const droneList = useMemo(() => Array.from(drones.values()), [drones]);

  if (droneList.length === 0) {
    return <EmptyState text="No drones connected" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {droneList.map(drone => {
        const name = drone.alias ?? drone.tracker_id;
        const isSelected = drone.tracker_id === selectedDroneId;
        const status: 'online' | 'stale' | 'offline' = drone.is_stale ? 'stale' : 'online';
        const profile = droneProfiles.find(p => p.id === drone.tracker_id);

        return (
          <GlassCard
            key={drone.tracker_id}
            selected={isSelected}
            onClick={() => onSelectDrone(drone.tracker_id)}
            style={{ padding: '10px 12px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <StatusDot status={status} size={7} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>
                {name}
              </span>
              <Badge color={drone.is_stale ? 'red' : 'green'} size="sm">
                {drone.is_stale ? 'STALE' : 'ACTIVE'}
              </Badge>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 12 }}>
              <span>{drone.alt_m != null ? `${Math.round(drone.alt_m)}m` : '--'} alt</span>
              <span>{drone.speed_mps != null ? `${drone.speed_mps.toFixed(1)} m/s` : '--'}</span>
              {drone.battery_mv != null && (
                <span style={{ color: drone.low_battery ? '#ef4444' : '#6b7280' }}>
                  {(drone.battery_mv / 1000).toFixed(1)}V
                </span>
              )}
            </div>
            {profile && (
              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>
                {profile.make} {profile.model}
              </div>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
};

// =============================================================================
// Zones Tab
// =============================================================================

const ZONE_TYPE_LABELS: Record<string, string> = {
  authorized_corridor: 'Authorized',
  restricted_airspace: 'Restricted',
  temporary_flight_restriction: 'TFR',
  emergency_zone: 'Emergency',
  observation_only: 'Observation',
};

const ZonesTab: React.FC<{
  zones: GeofenceZone[];
  hiddenZoneIds: Set<string>;
  onToggleZone: (id: string) => void;
  drones: Map<string, DroneSummary>;
}> = ({ zones, hiddenZoneIds, onToggleZone }) => {
  if (zones.length === 0) {
    return <EmptyState text="No zones defined" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {zones.map(zone => {
        const colors = GEOFENCE_COLORS[zone.type] ?? { fill: 'rgba(107,114,128,0.2)', stroke: '#6b7280' };
        const isHidden = hiddenZoneIds.has(zone.id);
        const typeLabel = ZONE_TYPE_LABELS[zone.type] ?? zone.type;

        return (
          <GlassCard key={zone.id} style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {/* Color indicator */}
              <div style={{
                width: 10, height: 10, borderRadius: 3,
                background: colors.stroke, flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>
                {zone.name}
              </span>
              {/* Toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleZone(zone.id); }}
                style={{
                  width: 34, height: 18, borderRadius: 9,
                  background: isHidden ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.5)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 7,
                  background: '#fff',
                  position: 'absolute', top: 2,
                  left: isHidden ? 2 : 18,
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <Badge color={
                zone.type === 'authorized_corridor' ? 'green'
                : zone.type === 'restricted_airspace' ? 'red'
                : zone.type === 'emergency_zone' ? 'red'
                : zone.type === 'temporary_flight_restriction' ? 'orange'
                : 'blue'
              } size="sm">
                {typeLabel}
              </Badge>
              <span style={{ color: '#6b7280' }}>
                {zone.minAltitudeM}–{zone.maxAltitudeM}m AGL
              </span>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
};

// =============================================================================
// Alerts Tab
// =============================================================================

type AlertFilter = '1h' | '4h' | 'all';

const ALERT_SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning: '#eab308',
  info: '#3b82f6',
};

const AlertsTab: React.FC<{
  alerts: EventAlert[];
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
  onAlertClick: (alert: EventAlert) => void;
}> = ({ alerts, onAcknowledge, onAcknowledgeAll, onAlertClick }) => {
  const [filter, setFilter] = useState<AlertFilter>('all');

  const filteredAlerts = useMemo(() => {
    const now = Date.now();
    const cutoff = filter === '1h' ? now - 3600_000
                 : filter === '4h' ? now - 14400_000
                 : 0;
    return alerts
      .filter(a => a.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [alerts, filter]);

  const unacknowledged = filteredAlerts.filter(a => !a.acknowledged).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Filter + Acknowledge All */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {(['1h', '4h', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: filter === f ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${filter === f ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === f ? '#60a5fa' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {unacknowledged > 0 && (
          <button
            onClick={onAcknowledgeAll}
            style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#9ca3af', cursor: 'pointer',
            }}
          >
            ACK ALL
          </button>
        )}
      </div>

      {/* Alert list */}
      {filteredAlerts.length === 0 ? (
        <EmptyState text="No alerts" />
      ) : (
        filteredAlerts.map(alert => {
          const borderColor = ALERT_SEVERITY_COLORS[alert.severity] ?? '#6b7280';
          return (
            <div
              key={alert.id}
              onClick={() => onAlertClick(alert)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                borderLeft: `3px solid ${borderColor}`,
                background: alert.acknowledged
                  ? 'rgba(255,255,255,0.02)'
                  : 'rgba(255,255,255,0.04)',
                cursor: 'pointer',
                opacity: alert.acknowledged ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <div style={{ fontSize: 12, color: '#e5e7eb', marginBottom: 4, lineHeight: 1.3 }}>
                {alert.message}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>
                  {formatRelativeTime(alert.timestamp)}
                </span>
                {!alert.acknowledged && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAcknowledge(alert.id); }}
                    style={{
                      marginLeft: 'auto',
                      padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#9ca3af', cursor: 'pointer',
                    }}
                  >
                    ACK
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

// =============================================================================
// Shared
// =============================================================================

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div style={{
    textAlign: 'center', padding: '24px 0',
    fontSize: 12, color: '#4b5563',
  }}>
    {text}
  </div>
);

function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3600_000)}h ago`;
}

export default EventSidebarPanel;
