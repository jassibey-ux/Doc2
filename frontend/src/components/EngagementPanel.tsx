/**
 * EngagementPanel - Sidebar component for managing engagements
 * Shows active/completed engagement cards with live timer and metrics
 */

import { useState, useEffect, useRef } from 'react';
import { Badge } from './ui/GlassUI';
import { Square, AlertTriangle, Plus, Target } from 'lucide-react';
import type { Engagement, CUASPlacement, CUASProfile } from '../types/workflow';

interface EngagementPanelProps {
  engagements: Engagement[];
  activeEngagements: Map<string, Engagement>;
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
  onDisengage: (engagementId: string) => void;
  onNewEngagement?: () => void;
  isActive: boolean; // session is in active phase
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

  const getCuasName = (cuasPlacementId: string): string => {
    const placement = cuasPlacements.find(p => p.id === cuasPlacementId);
    if (!placement) return 'Unknown CUAS';
    return profilesMap.get(placement.cuas_profile_id)?.name || 'CUAS';
  };

  const getTargetNames = (eng: Engagement): string => {
    return eng.targets.map(t => t.tracker_id).join(', ') || 'No targets';
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

            {/* Complete engagement: compact metrics */}
            {eng.status === 'complete' && eng.metrics && (
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
`;
