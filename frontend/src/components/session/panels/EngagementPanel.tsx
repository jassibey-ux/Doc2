/**
 * EngagementPanel — Sidebar panel showing active engagement + history.
 *
 * Two zones:
 * 1. Active zone (top): Current engagement status or "Select CUAS + drone to engage"
 * 2. History zone (bottom): Compact cards with summary stats
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Circle, Target, Wifi, WifiOff, Activity } from 'lucide-react';
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
  activeEngagements: _activeEngagements,
  onSelectEngagement,
  tacticalMode,
  currentDroneData,
  cuasPlacements,
}) => {
  const textColor = tacticalMode ? '#4ade80' : '#e5e7eb';
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';

  const placementMap = useMemo(() => {
    const map = new Map<string, CUASPlacement>();
    cuasPlacements?.forEach(p => map.set(p.id, p));
    return map;
  }, [cuasPlacements]);

  const { active, completed } = useMemo(() => {
    const active: Engagement[] = [];
    const completed: Engagement[] = [];
    for (const eng of engagements) {
      if (eng.status === 'active') {
        active.push(eng);
      } else if (eng.status === 'complete' || eng.status === 'aborted') {
        completed.push(eng);
      }
    }
    // Sort completed by run_number descending (most recent first)
    completed.sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0));
    return { active, completed };
  }, [engagements]);

  // Session summary stats
  const summaryStats = useMemo(() => {
    if (completed.length < 3) return null;
    const ttes = completed
      .map(e => e.metrics?.time_to_effect_s ?? e.time_to_effect_s)
      .filter((v): v is number => v != null);
    const passes = completed.filter(e => e.metrics?.pass_fail === 'pass').length;
    const fails = completed.filter(e => e.metrics?.pass_fail === 'fail').length;
    const avgTte = ttes.length > 0 ? ttes.reduce((a, b) => a + b, 0) / ttes.length : null;
    return { total: completed.length, avgTte, passes, fails };
  }, [completed]);

  if (engagements.length === 0) {
    return (
      <div style={{
        padding: '24px 14px', textAlign: 'center',
        color: dimColor, fontSize: 12,
      }}>
        <Target size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
        <div>Select CUAS + drone to engage</div>
        <div style={{ fontSize: 10, marginTop: 4 }}>
          Use E key or toolbar ENGAGE button
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontSize: 12, color: textColor }}>
      {/* Active engagement zone */}
      {active.length > 0 && (
        <div>
          <div style={{
            padding: '6px 14px',
            fontSize: 9, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', color: '#06b6d4',
          }}>
            Active
          </div>
          {active.map(eng => (
            <ActiveEngagementCard
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

      {/* Idle state when no active engagement */}
      {active.length === 0 && completed.length > 0 && (
        <div style={{
          padding: '12px 14px', textAlign: 'center',
          color: dimColor, fontSize: 11,
        }}>
          Ready for next engagement
        </div>
      )}

      {/* Summary stats */}
      {summaryStats && (
        <div style={{
          margin: '4px 14px 8px', padding: '6px 10px',
          borderRadius: 6,
          background: tacticalMode ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
          fontSize: 10, color: dimColor, fontFamily: 'monospace',
          display: 'flex', gap: 8, justifyContent: 'center',
        }}>
          <span>{summaryStats.total} runs</span>
          {summaryStats.avgTte != null && <span>avg TTE {summaryStats.avgTte.toFixed(1)}s</span>}
          <span style={{ color: '#22c55e' }}>{summaryStats.passes} PASS</span>
          {summaryStats.fails > 0 && <span style={{ color: '#ef4444' }}>{summaryStats.fails} FAIL</span>}
        </div>
      )}

      {/* History zone */}
      {completed.length > 0 && (
        <div>
          <div style={{
            padding: '6px 14px', marginTop: active.length > 0 ? 4 : 0,
            fontSize: 9, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', color: dimColor,
          }}>
            History ({completed.length})
          </div>
          {completed.map(eng => (
            <CompactHistoryCard
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

/** Active engagement card with live data */
const ActiveEngagementCard: React.FC<{
  engagement: Engagement;
  onClick: () => void;
  tacticalMode: boolean;
  currentDroneData?: Map<string, DroneSummary>;
  placementMap?: Map<string, CUASPlacement>;
}> = ({ engagement, onClick, tacticalMode, currentDroneData, placementMap }) => {
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  const [elapsed, setElapsed] = useState(0);

  // Elapsed timer
  useEffect(() => {
    if (!engagement.engage_timestamp) return;
    const startMs = new Date(engagement.engage_timestamp).getTime();
    const update = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    update();
    const interval = window.setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [engagement.engage_timestamp]);

  // Live data
  const liveData = useMemo(() => {
    if (!currentDroneData || !engagement.targets || engagement.targets.length === 0) return null;
    const target = engagement.targets[0];
    const drone = currentDroneData.get(target.tracker_id);
    if (!drone?.lat || !drone?.lon) return null;

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

    return {
      droneName: drone.alias ?? target.tracker_id,
      distance,
      fixValid: drone.fix_valid,
      altDelta: target.initial_altitude_m != null && drone.alt_m != null
        ? drone.alt_m - target.initial_altitude_m : null,
    };
  }, [currentDroneData, engagement, placementMap]);

  const elapsedStr = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px', cursor: 'pointer',
        borderLeft: '2px solid #06b6d4',
        background: 'rgba(6,182,212,0.05)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: tacticalMode ? '#4ade80' : '#fff' }}>
          {engagement.cuas_name ?? 'CUAS'} → {liveData?.droneName ?? engagement.targets[0]?.tracker_id ?? 'Drone'}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 700,
          fontFamily: 'monospace', color: '#fff',
        }}>
          {elapsedStr}
        </span>
      </div>

      {/* Live metrics */}
      {liveData && (
        <div style={{
          display: 'flex', gap: 10, marginTop: 6,
          fontSize: 10, fontFamily: 'monospace', alignItems: 'center',
        }}>
          {liveData.distance != null && (
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>
              {liveData.distance}m
            </span>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            color: liveData.fixValid ? '#22c55e' : '#ef4444',
          }}>
            {liveData.fixValid ? <Wifi size={9} /> : <WifiOff size={9} />}
            {liveData.fixValid ? 'GPS' : 'GPS DENIED'}
          </span>
          {liveData.altDelta != null && (
            <span style={{ color: Math.abs(liveData.altDelta) > 20 ? '#eab308' : dimColor }}>
              Alt:{liveData.altDelta >= 0 ? '+' : ''}{Math.round(liveData.altDelta)}m
            </span>
          )}
        </div>
      )}

      {/* Jam active indicator */}
      {(engagement.jam_on_at && !engagement.jam_off_at) && (
        <div style={{
          marginTop: 4,
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

/** Compact history card */
const CompactHistoryCard: React.FC<{
  engagement: Engagement;
  onClick: () => void;
  tacticalMode: boolean;
}> = ({ engagement, onClick, tacticalMode }) => {
  const status = STATUS_COLORS[engagement.status] || STATUS_COLORS.complete;
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';

  const tte = engagement.metrics?.time_to_effect_s ?? engagement.time_to_effect_s;
  const range = engagement.metrics?.effective_range_m;
  const passFail = engagement.metrics?.pass_fail;
  const targetName = engagement.targets?.[0]?.tracker_id;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 14px', cursor: 'pointer',
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontFamily: 'monospace', color: dimColor,
      }}>
        <Circle size={5} fill={status.dot} color={status.dot} />
        <span style={{ color: tacticalMode ? '#4ade80' : '#d1d5db', fontWeight: 600 }}>
          #{engagement.run_number}
        </span>
        <span>{engagement.cuas_name ?? 'CUAS'} → {targetName ?? '?'}</span>
        {tte != null && <span>TTE {tte.toFixed(1)}s</span>}
        {range != null && <span>{Math.round(range)}m</span>}
        {passFail && (
          <span style={{
            marginLeft: 'auto', fontWeight: 700,
            color: passFail === 'pass' ? '#22c55e' : passFail === 'fail' ? '#ef4444' : '#eab308',
          }}>
            {passFail.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
};

export default EngagementPanel;
