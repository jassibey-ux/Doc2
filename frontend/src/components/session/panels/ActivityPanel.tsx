/**
 * ActivityPanel — Tab 3: Alerts (severity, ack) + Event log (timestamped)
 *
 * Both are chronological log entries; natural grouping.
 * Alerts appear first (critical > warning > info), then full event timeline.
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, FileText, Check, Bell } from 'lucide-react';
import type { TestEvent } from '../../../types/workflow';
import { EVENT_COLORS } from '../../../types/workflow';
import type { SessionAlert } from '../hooks/useSessionAlerts';

interface ActivityPanelProps {
  alerts: SessionAlert[];
  events: TestEvent[];
  onAcknowledgeAlert: (id: string) => void;
  onAcknowledgeAll: () => void;
  onAlertClick: (alert: SessionAlert) => void;
  tacticalMode: boolean;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  warning:  { bg: 'rgba(234,179,8,0.1)', text: '#eab308', border: 'rgba(234,179,8,0.3)' },
  info:     { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
};

function formatEventTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
}

const ActivityPanel: React.FC<ActivityPanelProps> = ({
  alerts,
  events,
  onAcknowledgeAlert,
  onAcknowledgeAll,
  onAlertClick,
  tacticalMode,
}) => {
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [eventsExpanded, setEventsExpanded] = useState(true);

  const textColor = tacticalMode ? '#4ade80' : '#e5e7eb';
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  const borderColor = tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)';

  const unackedAlerts = useMemo(
    () => alerts.filter(a => !a.acknowledged).sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2)
    ),
    [alerts],
  );

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ),
    [events],
  );

  return (
    <div style={{ fontSize: 12, color: textColor }}>
      {/* Alerts section */}
      <button
        onClick={() => setAlertsExpanded(!alertsExpanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', cursor: 'pointer',
          background: 'none', border: 'none', color: dimColor,
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        {alertsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Bell size={13} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          Alerts
        </span>
        {unackedAlerts.length > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700,
            color: '#ef4444',
          }}>
            {unackedAlerts.length}
          </span>
        )}
      </button>

      {alertsExpanded && (
        <div>
          {unackedAlerts.length > 0 && (
            <div style={{ padding: '4px 14px', textAlign: 'right' }}>
              <button
                onClick={onAcknowledgeAll}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 10, color: dimColor, textDecoration: 'underline',
                }}
              >
                Acknowledge all
              </button>
            </div>
          )}

          {unackedAlerts.length === 0 ? (
            <div style={{
              padding: '12px 14px', color: dimColor, fontSize: 11, fontStyle: 'italic',
            }}>
              No unacknowledged alerts
            </div>
          ) : (
            unackedAlerts.slice(0, 20).map(alert => {
              const sev = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
              return (
                <div
                  key={alert.id}
                  onClick={() => onAlertClick(alert)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 14px',
                    cursor: 'pointer',
                    borderLeft: `2px solid ${sev.text}`,
                  }}
                >
                  <AlertTriangle size={12} color={sev.text} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 11, color: textColor,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {alert.message}
                    </div>
                    <div style={{ fontSize: 9, color: dimColor, marginTop: 2 }}>
                      {new Date(alert.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAcknowledgeAlert(alert.id); }}
                    style={{
                      flexShrink: 0, width: 20, height: 20, borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: dimColor, cursor: 'pointer',
                    }}
                    title="Acknowledge"
                  >
                    <Check size={10} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Event log section */}
      <button
        onClick={() => setEventsExpanded(!eventsExpanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', cursor: 'pointer',
          background: 'none', border: 'none', color: dimColor,
          borderTop: `1px solid ${borderColor}`,
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        {eventsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FileText size={13} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          Event Log
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace', color: dimColor }}>
          {events.length}
        </span>
      </button>

      {eventsExpanded && (
        <div style={{ padding: '4px 0' }}>
          {sortedEvents.length === 0 ? (
            <div style={{
              padding: '12px 14px', color: dimColor, fontSize: 11, fontStyle: 'italic',
            }}>
              No events recorded
            </div>
          ) : (
            sortedEvents.slice(0, 50).map((event, i) => {
              const color = EVENT_COLORS[event.type] || '#6b7280';
              return (
                <div
                  key={event.id || i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 14px',
                    borderLeft: `2px solid ${color}`,
                  }}
                >
                  <span style={{
                    fontSize: 10, fontFamily: 'monospace', color: dimColor,
                    flexShrink: 0, width: 60,
                  }}>
                    {formatEventTime(event.timestamp)}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    flexShrink: 0,
                  }}>
                    {event.type.replace(/_/g, ' ')}
                  </span>
                  {event.note && (
                    <span style={{
                      fontSize: 10, color: dimColor,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {event.note}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityPanel;
