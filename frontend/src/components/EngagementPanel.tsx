/**
 * EngagementPanel - Sidebar component for managing engagements
 * Shows active/completed engagement cards with live timer and metrics
 */

import { useState, useEffect, useRef } from 'react';
import { Badge } from './ui/GlassUI';
import { Square, AlertTriangle, Plus, Target, User, Radio, Zap } from 'lucide-react';
import type { Engagement, CUASPlacement, CUASProfile, JamBurst, EmitterType } from '../types/workflow';

interface EngagementPanelProps {
  engagements: Engagement[];
  activeEngagements: Map<string, Engagement>;
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
  onDisengage: (engagementId: string) => void;
  onNewEngagement?: () => void;
  isActive: boolean; // session is in active phase
  activeBursts?: Map<string, JamBurst>; // active burst state keyed by engagement_id
  sessionActors?: Array<{ id: string; name: string; callsign?: string }>;
}

function formatElapsed(startIso: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatMetricValue(val: number | undefined, unit: string): string {
  if (val === undefined || val === null) return '--';
  if (unit === 's') return `${val.toFixed(1)}s`;
  if (unit === 'm') return `${Math.round(val)}m`;
  if (unit === '%') return `${Math.round(val)}%`;
  return String(val);
}

export default function EngagementPanel({
  engagements,
  activeEngagements,
  cuasPlacements,
  cuasProfiles,
  onDisengage,
  onNewEngagement,
  isActive,
  activeBursts,
  sessionActors,
}: EngagementPanelProps) {
  // Tick for live elapsed timers
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeEngagements.size > 0) {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeEngagements.size]);

  // Build profiles map for lookup
  const profilesMap = new Map<string, CUASProfile>();
  cuasProfiles.forEach(p => profilesMap.set(p.id, p));

  const getCuasName = (cuasPlacementId: string | undefined): string => {
    if (!cuasPlacementId) return 'Unknown CUAS';
    const placement = cuasPlacements.find(p => p.id === cuasPlacementId);
    if (!placement) return 'Unknown CUAS';
    return profilesMap.get(placement.cuas_profile_id)?.name || 'CUAS';
  };

  const getTargetNames = (eng: Engagement): string => {
    return eng.targets.map(t => t.tracker_id).join(', ') || 'No targets';
  };

  const getEmitterLabel = (eng: Engagement): string => {
    if (eng.emitter_type === 'actor') {
      const actor = sessionActors?.find(a => a.id === eng.emitter_id);
      return actor?.callsign || actor?.name || 'Actor';
    }
    // CUAS system - prefer backend-resolved name, fall back to local lookup
    if (eng.cuas_name) return eng.cuas_name;
    if (eng.cuas_placement_id) return getCuasName(eng.cuas_placement_id);
    return 'CUAS';
  };

  // Sort: active first, then by created_at descending
  const sorted = [...engagements].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="sc-section">
      <div className="sc-section-header">
        <Target size={14} />
        <span>Engagements</span>
        <Badge color="blue" size="sm">{engagements.length}</Badge>
      </div>
      <div className="eng-list">
        {sorted.map(eng => (
          <div
            key={eng.id}
            className={`eng-card eng-card--${eng.status}`}
          >
            {/* Card header: name + status */}
            <div className="eng-card-header">
              <span className="eng-card-name">
                {eng.name || `${getCuasName(eng.cuas_placement_id)} → ${getTargetNames(eng)}`}
              </span>
              <EmitterBadge emitterType={eng.emitter_type} label={getEmitterLabel(eng)} />
              <EngagementStatusBadge status={eng.status} />
            </div>

            {/* Active engagement: timer + live range */}
            {eng.status === 'active' && eng.engage_timestamp && (
              <div className="eng-card-active">
                <div className="eng-card-timer">
                  <span className="eng-timer-dot" />
                  <span className="eng-timer-value">{formatElapsed(eng.engage_timestamp)}</span>
                </div>
                {eng.targets[0]?.initial_range_m && (
                  <span className="eng-card-range">
                    {Math.round(eng.targets[0].initial_range_m)}m
                  </span>
                )}
                {isActive && (
                  <button
                    className="eng-disengage-btn"
                    onClick={(e) => { e.stopPropagation(); onDisengage(eng.id); }}
                    title="Disengage"
                  >
                    <Square size={10} />
                    STOP
                  </button>
                )}
              </div>
            )}

            {/* Complete engagement: compact metrics or burst summary */}
            {eng.status === 'complete' && eng.metrics && (eng.metrics.time_to_effect_s != null || eng.metrics.effective_range_m != null) && (
              <div className="eng-card-metrics">
                <span className="eng-metric">
                  {formatMetricValue(eng.metrics.time_to_effect_s, 's')}
                </span>
                <span className="eng-metric-sep">|</span>
                <span className="eng-metric">
                  {formatMetricValue(eng.metrics.effective_range_m, 'm')}
                </span>
                <span className="eng-metric-sep">|</span>
                {eng.metrics.pass_fail && (
                  <Badge
                    color={eng.metrics.pass_fail === 'pass' ? 'green' : eng.metrics.pass_fail === 'fail' ? 'red' : 'yellow'}
                    size="sm"
                  >
                    {eng.metrics.pass_fail.toUpperCase()}
                  </Badge>
                )}
              </div>
            )}
            {/* Burst summary fallback when telemetry metrics are null */}
            {eng.status === 'complete' && (!eng.metrics || (eng.metrics.time_to_effect_s == null && eng.metrics.effective_range_m == null)) && (
              <div className="eng-card-metrics">
                {eng.bursts && eng.bursts.length > 0 ? (
                  <>
                    <span className="eng-metric">
                      {eng.bursts.length} burst{eng.bursts.length !== 1 ? 's' : ''}
                    </span>
                    <span className="eng-metric-sep">|</span>
                    <span className="eng-metric">
                      {eng.bursts.reduce((sum, b) => sum + (b.duration_s || 0), 0).toFixed(1)}s jam
                    </span>
                    {eng.engage_timestamp && eng.disengage_timestamp && (
                      <>
                        <span className="eng-metric-sep">|</span>
                        <span className="eng-metric">
                          {((new Date(eng.disengage_timestamp).getTime() - new Date(eng.engage_timestamp).getTime()) / 1000).toFixed(0)}s total
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="eng-metric">No burst data</span>
                )}
              </div>
            )}

            {/* Active burst: pulsing timer for current burst */}
            {eng.status === 'active' && activeBursts?.has(eng.id) && (
              <ActiveBurstIndicator burst={activeBursts.get(eng.id)!} />
            )}

            {/* Completed engagement: burst timeline + per-burst metrics */}
            {eng.status === 'complete' && eng.bursts && eng.bursts.length > 0 && (
              <BurstTimeline bursts={eng.bursts} engageTimestamp={eng.engage_timestamp} disengageTimestamp={eng.disengage_timestamp} />
            )}

            {/* Aborted */}
            {eng.status === 'aborted' && (
              <div className="eng-card-aborted">
                <AlertTriangle size={10} />
                <span>Aborted</span>
              </div>
            )}
          </div>
        ))}

        {engagements.length === 0 && (
          <div className="sc-empty">No engagements yet</div>
        )}

        {/* New Engagement button */}
        {isActive && onNewEngagement && (
          <button className="eng-new-btn" onClick={onNewEngagement}>
            <Plus size={12} />
            New Engagement
          </button>
        )}
      </div>

      <style>{engagementStyles}</style>
    </div>
  );
}

function EngagementStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return <Badge color="blue" size="sm">ACTIVE</Badge>;
    case 'complete':
      return <Badge color="green" size="sm">COMPLETE</Badge>;
    case 'aborted':
      return <Badge color="orange" size="sm">ABORTED</Badge>;
    case 'planned':
      return <Badge color="gray" size="sm">PLANNED</Badge>;
    default:
      return <Badge color="gray" size="sm">{status.toUpperCase()}</Badge>;
  }
}

function EmitterBadge({ emitterType, label }: { emitterType: EmitterType; label: string }) {
  const isActor = emitterType === 'actor';
  return (
    <span className={`eng-emitter-badge ${isActor ? 'eng-emitter-badge--actor' : 'eng-emitter-badge--cuas'}`}>
      {isActor ? <User size={9} /> : <Radio size={9} />}
      <span>{label}</span>
    </span>
  );
}

function ActiveBurstIndicator({ burst }: { burst: JamBurst }) {
  return (
    <div className="eng-burst-active">
      <span className="eng-burst-pulse" />
      <Zap size={9} style={{ color: '#f59e0b' }} />
      <span className="eng-burst-seq">#{burst.burst_seq}</span>
      <span className="eng-burst-timer">{formatElapsed(burst.jam_on_at)}</span>
      {burst.gps_denial_detected && (
        <span className="eng-burst-denial">GPS</span>
      )}
    </div>
  );
}

function BurstTimeline({
  bursts,
  engageTimestamp,
  disengageTimestamp,
}: {
  bursts: JamBurst[];
  engageTimestamp?: string;
  disengageTimestamp?: string;
}) {
  if (!bursts.length) return null;

  // Compute total engagement span for the timeline bar
  const engStart = engageTimestamp ? new Date(engageTimestamp).getTime() : new Date(bursts[0].jam_on_at).getTime();
  const engEnd = disengageTimestamp
    ? new Date(disengageTimestamp).getTime()
    : Math.max(...bursts.map(b => b.jam_off_at ? new Date(b.jam_off_at).getTime() : Date.now()));
  const totalMs = Math.max(engEnd - engStart, 1);

  return (
    <div className="eng-burst-section">
      <div className="eng-burst-label">
        <Zap size={9} />
        <span>{bursts.length} burst{bursts.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Compact horizontal timeline bar */}
      <div className="eng-burst-timeline">
        {bursts.map(b => {
          const onMs = new Date(b.jam_on_at).getTime();
          const offMs = b.jam_off_at ? new Date(b.jam_off_at).getTime() : engEnd;
          const left = ((onMs - engStart) / totalMs) * 100;
          const width = Math.max(((offMs - onMs) / totalMs) * 100, 2); // min 2% for visibility
          return (
            <span
              key={b.id}
              className={`eng-burst-bar ${b.gps_denial_detected ? 'eng-burst-bar--denial' : ''}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`#${b.burst_seq} ${b.duration_s != null ? b.duration_s.toFixed(1) + 's' : '?'}${b.gps_denial_detected ? ' GPS denial' : ''}`}
            />
          );
        })}
      </div>

      {/* Per-burst compact metrics */}
      <div className="eng-burst-metrics-list">
        {bursts.map(b => (
          <div key={b.id} className="eng-burst-metric-row">
            <span className="eng-burst-seq-label">#{b.burst_seq}</span>
            <span className="eng-burst-dur">
              {b.duration_s != null ? `${b.duration_s.toFixed(1)}s` : '--'}
            </span>
            {b.time_to_effect_s != null && (
              <span className="eng-burst-tte">TTE {b.time_to_effect_s.toFixed(1)}s</span>
            )}
            {b.gps_denial_detected && (
              <span className="eng-burst-denial-dot" title="GPS denial detected" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const engagementStyles = `
  .eng-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
  }

  .eng-card {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    border-left: 3px solid transparent;
  }

  .eng-card--active {
    border-left-color: #06b6d4;
    background: rgba(6, 182, 212, 0.05);
  }

  .eng-card--complete {
    border-left-color: #22c55e;
  }

  .eng-card--aborted {
    border-left-color: #f97316;
    opacity: 0.7;
  }

  .eng-card--planned {
    border-left-color: #6b7280;
  }

  .eng-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .eng-card-name {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .eng-card-active {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }

  .eng-card-timer {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .eng-timer-dot {
    width: 6px;
    height: 6px;
    background: #06b6d4;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
    box-shadow: 0 0 6px rgba(6, 182, 212, 0.5);
  }

  .eng-timer-value {
    font-size: 12px;
    font-family: monospace;
    font-weight: 600;
    color: #06b6d4;
  }

  .eng-card-range {
    font-size: 11px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.5);
  }

  .eng-disengage-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 9px;
    font-weight: 600;
    border-radius: 3px;
    border: 1px solid rgba(139, 92, 246, 0.4);
    background: rgba(139, 92, 246, 0.15);
    color: #8b5cf6;
    cursor: pointer;
    transition: all 0.15s;
  }

  .eng-disengage-btn:hover {
    background: rgba(139, 92, 246, 0.3);
  }

  .eng-card-metrics {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }

  .eng-metric {
    font-size: 11px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.6);
  }

  .eng-metric-sep {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.2);
  }

  .eng-card-aborted {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 10px;
    color: #f97316;
  }

  .eng-new-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px;
    margin-top: 4px;
    font-size: 10px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .eng-new-btn:hover {
    color: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.03);
  }

  /* Emitter badge */
  .eng-emitter-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 500;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .eng-emitter-badge--actor {
    background: rgba(168, 85, 247, 0.15);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .eng-emitter-badge--cuas {
    background: rgba(6, 182, 212, 0.12);
    color: #06b6d4;
    border: 1px solid rgba(6, 182, 212, 0.25);
  }

  /* Active burst indicator */
  .eng-burst-active {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 5px;
    padding: 3px 6px;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 4px;
  }

  .eng-burst-pulse {
    width: 5px;
    height: 5px;
    background: #f59e0b;
    border-radius: 50%;
    animation: pulse 1s ease-in-out infinite;
    box-shadow: 0 0 5px rgba(245, 158, 11, 0.6);
  }

  .eng-burst-seq {
    font-size: 10px;
    font-family: monospace;
    font-weight: 600;
    color: #f59e0b;
  }

  .eng-burst-timer {
    font-size: 10px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.6);
  }

  .eng-burst-denial {
    font-size: 8px;
    font-weight: 700;
    padding: 0 3px;
    border-radius: 2px;
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  /* Burst section for completed engagements */
  .eng-burst-section {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }

  .eng-burst-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 4px;
  }

  /* Timeline bar container */
  .eng-burst-timeline {
    position: relative;
    height: 6px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .eng-burst-bar {
    position: absolute;
    top: 0;
    height: 100%;
    background: rgba(6, 182, 212, 0.5);
    border-radius: 1px;
    min-width: 2px;
  }

  .eng-burst-bar--denial {
    background: rgba(239, 68, 68, 0.55);
  }

  /* Per-burst metric rows */
  .eng-burst-metrics-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .eng-burst-metric-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 1px 0;
  }

  .eng-burst-seq-label {
    font-size: 9px;
    font-family: monospace;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.35);
    width: 18px;
    flex-shrink: 0;
  }

  .eng-burst-dur {
    font-size: 9px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.5);
  }

  .eng-burst-tte {
    font-size: 9px;
    font-family: monospace;
    color: rgba(6, 182, 212, 0.7);
  }

  .eng-burst-denial-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 4px rgba(239, 68, 68, 0.5);
    flex-shrink: 0;
  }
`;
