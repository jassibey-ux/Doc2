/**
 * Alerts Panel
 * Displays auto-detected anomalies and manual event log during test sessions
 */

import { useState, useCallback, useEffect } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  X,
  CheckCircle,
  AlertCircle,
  Info,
  Trash2,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, Badge } from './ui/GlassUI';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { AlertMessage, TestEvent, EVENT_COLORS, AlertLevel } from '../types/workflow';

interface AlertsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALERT_ICONS: Record<AlertLevel, React.ReactNode> = {
  info: <Info size={14} />,
  warning: <AlertCircle size={14} />,
  critical: <AlertTriangle size={14} />,
};

const ALERT_COLORS: Record<AlertLevel, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export default function AlertsPanel({ isOpen, onClose }: AlertsPanelProps) {
  const { activeSession } = useWorkflow();
  const { anomalyAlerts, acknowledgeAnomalyAlert } = useWebSocket();
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [expandedSection, setExpandedSection] = useState<'alerts' | 'events'>('alerts');
  const [alertsMuted, setAlertsMuted] = useState(false);

  // Sync WebSocket anomaly alerts with local state
  useEffect(() => {
    if (anomalyAlerts && anomalyAlerts.length > 0) {
      // Convert anomaly alerts to AlertMessage format and merge with existing
      const newAlerts: AlertMessage[] = anomalyAlerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        level: alert.level,
        message: alert.message,
        timestamp: alert.timestamp,
        tracker_id: alert.tracker_id,
        acknowledged: false,
      }));

      setAlerts(prev => {
        // Merge without duplicates, keeping existing acknowledged state
        const existingIds = new Set(prev.map(a => a.id));

        const merged = [...prev];
        for (const newAlert of newAlerts) {
          if (!existingIds.has(newAlert.id)) {
            merged.push(newAlert);
          } else {
            // Update existing alert but preserve local acknowledged state
            const idx = merged.findIndex(a => a.id === newAlert.id);
            if (idx >= 0 && !merged[idx].acknowledged) {
              merged[idx] = { ...newAlert, acknowledged: merged[idx].acknowledged };
            }
          }
        }
        return merged;
      });
    }
  }, [anomalyAlerts]);

  // Acknowledge an alert
  const handleAcknowledge = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, acknowledged: true } : a
    ));
    // Also acknowledge in WebSocket context
    acknowledgeAnomalyAlert(alertId);
  }, [acknowledgeAnomalyAlert]);

  // Dismiss an alert
  const handleDismiss = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  // Acknowledge all alerts
  const handleAcknowledgeAll = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
  }, []);

  // Clear all acknowledged alerts
  const handleClearAcknowledged = useCallback(() => {
    setAlerts(prev => prev.filter(a => !a.acknowledged));
  }, []);

  if (!isOpen) return null;

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);
  const events = activeSession?.events || [];

  // Format time for display
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Get relative time
  const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return `${Math.floor(diffSec / 3600)}h ago`;
  };

  return (
    <div
      className="alerts-panel"
      style={{
        position: 'absolute',
        right: '20px',
        top: '20px',
        width: '320px',
        maxHeight: 'calc(100vh - 140px)',
        zIndex: 100,
      }}
    >
      <GlassPanel style={{ padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              Alerts & Events
            </span>
            {unacknowledgedAlerts.length > 0 && (
              <Badge color="red" size="sm">
                {unacknowledgedAlerts.length}
              </Badge>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setAlertsMuted(!alertsMuted)}
              style={{
                background: 'none',
                border: 'none',
                color: alertsMuted ? '#ef4444' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: '4px',
              }}
              title={alertsMuted ? 'Unmute alerts' : 'Mute alerts'}
            >
              {alertsMuted ? <BellOff size={16} /> : <Bell size={16} />}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Alerts Section */}
        <div style={{ marginBottom: '12px' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}
            onClick={() => setExpandedSection(expandedSection === 'alerts' ? 'events' : 'alerts')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {expandedSection === 'alerts' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                Active Alerts ({alerts.length})
              </span>
            </div>
            {unacknowledgedAlerts.length > 0 && (
              <GlassButton variant="ghost" size="sm" onClick={() => handleAcknowledgeAll()}>
                <CheckCircle size={12} />
                Ack All
              </GlassButton>
            )}
          </div>

          {expandedSection === 'alerts' && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.4)' }}>
                  <Bell size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <div style={{ fontSize: '12px' }}>No active alerts</div>
                </div>
              ) : (
                alerts.map(alert => (
                  <GlassCard
                    key={alert.id}
                    style={{
                      marginBottom: '6px',
                      padding: '10px',
                      borderLeft: `3px solid ${ALERT_COLORS[alert.level]}`,
                      opacity: alert.acknowledged ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: ALERT_COLORS[alert.level], flexShrink: 0, marginTop: '2px' }}>
                        {ALERT_ICONS[alert.level]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: '#fff', marginBottom: '2px' }}>
                          {alert.message}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                            {formatTime(alert.timestamp)}
                          </span>
                          {alert.tracker_id && (
                            <Badge color="blue" size="sm">{alert.tracker_id}</Badge>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {!alert.acknowledged && (
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', padding: '2px' }}
                            title="Acknowledge"
                          >
                            <CheckCircle size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDismiss(alert.id)}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '2px' }}
                          title="Dismiss"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                ))
              )}
              {alerts.filter(a => a.acknowledged).length > 0 && (
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAcknowledged}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  <Trash2 size={12} />
                  Clear acknowledged
                </GlassButton>
              )}
            </div>
          )}
        </div>

        {/* Events Section */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}
            onClick={() => setExpandedSection(expandedSection === 'events' ? 'alerts' : 'events')}
          >
            {expandedSection === 'events' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginLeft: '6px' }}>
              Event Log ({events.length})
            </span>
          </div>

          {expandedSection === 'events' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.4)' }}>
                  <Info size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <div style={{ fontSize: '12px' }}>No events recorded</div>
                  <div style={{ fontSize: '10px', marginTop: '4px' }}>
                    Use toolbar or shortcuts to mark events
                  </div>
                </div>
              ) : (
                [...events].reverse().map((event: TestEvent) => (
                  <GlassCard
                    key={event.id}
                    style={{
                      marginBottom: '6px',
                      padding: '8px 10px',
                      borderLeft: `3px solid ${EVENT_COLORS[event.type] || '#6b7280'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: EVENT_COLORS[event.type] || '#fff',
                          textTransform: 'uppercase',
                        }}>
                          {event.type.replace('_', ' ')}
                        </span>
                        {event.source === 'auto_detected' && (
                          <Badge color="orange" size="sm">AUTO</Badge>
                        )}
                      </div>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    {event.note && (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                        {event.note}
                      </div>
                    )}
                    {event.tracker_id && (
                      <div style={{ marginTop: '4px' }}>
                        <Badge color="blue" size="sm">{event.tracker_id}</Badge>
                      </div>
                    )}
                  </GlassCard>
                ))
              )}
            </div>
          )}
        </div>

        {/* Session info */}
        {activeSession && (
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            paddingTop: '12px',
            marginTop: '12px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Session:</span>
              <span style={{ color: '#fff' }}>{activeSession.name}</span>
            </div>
            {activeSession.start_time && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span>Started:</span>
                <span>{getRelativeTime(activeSession.start_time)}</span>
              </div>
            )}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
