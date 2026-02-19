/**
 * EngagementPanel — Tab 2: Active engagements with live metrics + completed history.
 *
 * Dense, critical content that auto-opens on engagement start.
 * Enhanced with live drone data: distance, GPS status, altitude delta, freshness.
 */

import React, { useMemo } from 'react';
import { Circle, Clock, Target, Activity, Wifi, WifiOff } from 'lucide-react';
import type { Engagement, CUASPlacement } from '../../../types/workflow';
import type { DroneSummary } from '../../../types/drone';

interface EngagementPanelProps {
  engagements: Engagement[];
  activeEngagements: Map<string, Engagement>;
  onSelectEngagement: (id: string) => void;
  tacticalMode: boolean;
  currentDroneData?: Map<string, DroneSummary>;
  cuasPlacements?: CUASPlacement[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  active:   { bg: 'rgba(6,182,212,0.12)', text: '#06b6d4', dot: '#06b6d4' },
  planned:  { bg: 'rgba(107,114,128,0.12)', text: '#6b7280', dot: '#6b7280' },
  complete: { bg: 'rgba(34,197,94,0.12)', text: '#22c55e', dot: '#22c55e' },
  aborted:  { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', dot: '#ef4444' },
};

/** Compute 3D distance in meters between two geo positions. */
function computeDistance(
  lat1: number, lon1: number, alt1: number,
  lat2: number, lon2: number, alt2: number,
): number {
  const dLat = (lat2 - lat1) * 111320;
  const dLon = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
  const dAlt = alt2 - alt1;
  return Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt);
}

const EngagementPanel: React.FC<EngagementPanelProps> = ({
  engagements,
  onSelectEngagement,
  tacticalMode,
  currentDroneData,
  cuasPlacements,
}) => {
  const textColor = tacticalMode ? '#4ade80' : '#e5e7eb';
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';

  // Build placement lookup
  const placementMap = useMemo(() => {
    const map = new Map<string, CUASPlacement>();
    cuasPlacements?.forEach(p => map.set(p.id, p));
    return map;
  }, [cuasPlacements]);

  const { active, completed } = useMemo(() => {
    const active: Engagement[] = [];
    const completed: Engagement[] = [];
    for (const eng of engagements) {
      if (eng.status === 'active' || eng.status === 'planned') {
        active.push(eng);
      } else {
        completed.push(eng);
      }
    }
    return { active, completed };
  }, [engagements]);

  if (engagements.length === 0) {
    return (
      <div style={{
        padding: '24px 14px', textAlign: 'center',
        color: dimColor, fontSize: 12,
      }}>
        <Target size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
        <div>No engagements yet</div>
        <div style={{ fontSize: 10, marginTop: 4 }}>
          Use E key or the quick action bar to engage
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontSize: 12, color: textColor }}>
      {/* Active engagements */}
      {active.length > 0 && (
        <div>
          <div style={{
            padding: '6px 14px',
            fontSize: 9, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', color: '#06b6d4',
          }}>
            Active ({active.length})
          </div>
          {active.map(eng => (
            <EngagementCard
              key={eng.id}
              engagement={eng}
              onClick={() => onSelectEngagement(eng.id)}
              tacticalMode={tacticalMode}
              currentDroneData={currentDroneData}
              placementMap={placementMap}
            />
          ))}
        </div>
      )}

      {/* Completed engagements */}
      {completed.length > 0 && (
        <div>
          <div style={{
            padding: '6px 14px', marginTop: active.length > 0 ? 8 : 0,
            fontSize: 9, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', color: dimColor,
          }}>
            History ({completed.length})
          </div>
          {completed.map(eng => (
            <EngagementCard
              key={eng.id}
              engagement={eng}
              onClick={() => onSelectEngagement(eng.id)}
              tacticalMode={tacticalMode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const EngagementCard: React.FC<{
  engagement: Engagement;
  onClick: () => void;
  tacticalMode: boolean;
  currentDroneData?: Map<string, DroneSummary>;
  placementMap?: Map<string, CUASPlacement>;
}> = ({ engagement, onClick, tacticalMode, currentDroneData, placementMap }) => {
  const status = STATUS_COLORS[engagement.status] || STATUS_COLORS.planned;
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  const isActive = engagement.status === 'active';

  const timeStr = engagement.engage_timestamp
    ? new Date(engagement.engage_timestamp).toLocaleTimeString('en-US', { hour12: false })
    : '--:--:--';

  const tte = engagement.metrics?.time_to_effect_s;
  const range = engagement.metrics?.effective_range_m;

  // Compute live data for active engagements
  const liveData = useMemo(() => {
    if (!isActive || !currentDroneData || engagement.targets.length === 0) return null;

    const target = engagement.targets[0];
    const drone = currentDroneData.get(target.tracker_id);
    if (!drone?.lat || !drone?.lon) return null;

    // Find CUAS position
    let cuasLat: number | undefined;
    let cuasLon: number | undefined;
    let cuasAlt = 5;
    if (engagement.cuas_lat != null && engagement.cuas_lon != null) {
      cuasLat = engagement.cuas_lat;
      cuasLon = engagement.cuas_lon;
      cuasAlt = engagement.cuas_alt_m ?? 5;
    } else if (engagement.cuas_placement_id && placementMap) {
      const placement = placementMap.get(engagement.cuas_placement_id);
      if (placement?.position) {
        cuasLat = placement.position.lat;
        cuasLon = placement.position.lon;
        cuasAlt = placement.height_agl_m ?? 5;
      }
    }

    const distance = cuasLat != null && cuasLon != null
      ? Math.round(computeDistance(cuasLat, cuasLon, cuasAlt, drone.lat, drone.lon, drone.alt_m ?? 50))
      : null;

    const altDelta = target.initial_altitude_m != null && drone.alt_m != null
      ? drone.alt_m - target.initial_altitude_m
      : null;

    return {
      distance,
      fixValid: drone.fix_valid,
      altDelta,
      ageSeconds: drone.age_seconds ?? 0,
      isStale: drone.is_stale ?? false,
    };
  }, [isActive, currentDroneData, engagement, placementMap]);

  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 14px',
        cursor: 'pointer',
        borderLeft: `2px solid ${status.dot}`,
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = tacticalMode
          ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Circle size={6} fill={status.dot} color={status.dot} />
        <span style={{ fontWeight: 600, fontSize: 12, color: tacticalMode ? '#4ade80' : '#fff' }}>
          {engagement.name || `Engagement #${engagement.run_number ?? '?'}`}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 9, fontWeight: 600,
          letterSpacing: 0.5, color: status.text,
          textTransform: 'uppercase',
        }}>
          {engagement.status}
        </span>
      </div>

      {/* Metrics row */}
      <div style={{
        display: 'flex', gap: 10, marginTop: 4, paddingLeft: 12,
        fontSize: 10, color: dimColor, fontFamily: 'monospace',
      }}>
        <span>
          <Clock size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />
          {timeStr}
        </span>
        {tte != null && (
          <span>TTE: {tte.toFixed(1)}s</span>
        )}
        {range != null && (
          <span>Range: {Math.round(range)}m</span>
        )}
        {engagement.targets?.length > 0 && (
          <span>{engagement.targets.length} target{engagement.targets.length > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Live data row — only for active engagements with drone data */}
      {liveData && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 4, paddingLeft: 12,
          fontSize: 10, fontFamily: 'monospace', alignItems: 'center',
        }}>
          {/* Live distance */}
          {liveData.distance != null && (
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>
              {liveData.distance}m
            </span>
          )}
          {/* GPS indicator */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            color: liveData.fixValid ? '#22c55e' : '#ef4444',
          }}>
            {liveData.fixValid
              ? <Wifi size={9} />
              : <WifiOff size={9} />
            }
            {liveData.fixValid ? 'GPS' : 'GPS LOST'}
          </span>
          {/* Altitude delta */}
          {liveData.altDelta != null && (
            <span style={{ color: Math.abs(liveData.altDelta) > 20 ? '#eab308' : dimColor }}>
              Alt:{liveData.altDelta >= 0 ? '+' : ''}{Math.round(liveData.altDelta)}m
            </span>
          )}
          {/* Data freshness */}
          <span style={{
            color: liveData.isStale ? '#ef4444' : dimColor,
            fontWeight: liveData.isStale ? 600 : 400,
          }}>
            {liveData.isStale ? 'STALE' : `${Math.round(liveData.ageSeconds)}s`}
          </span>
        </div>
      )}

      {/* Active burst indicator */}
      {engagement.status === 'active' && engagement.bursts?.some(b => !b.jam_off_at) && (
        <div style={{
          marginTop: 4, paddingLeft: 12,
          fontSize: 9, fontWeight: 700, color: '#ef4444',
          letterSpacing: 0.5,
          animation: 'pulse-live 1.5s ease-in-out infinite',
        }}>
          <Activity size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />
          JAM ACTIVE
        </div>
      )}
    </div>
  );
};

export default EngagementPanel;
