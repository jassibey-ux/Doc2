/**
 * SessionStatusBar — Always-visible 44px top bar for live sessions.
 *
 * Contains: REC indicator, session name, duration timer, tracker count,
 * active engagement badge, alert bell, connection status, mode toggle.
 */

import React from 'react';
import {
  ArrowLeft, Bell, Moon, Sun, Circle,
} from 'lucide-react';

interface SessionStatusBarProps {
  sessionName: string;
  duration: number;
  isRecording: boolean;
  isCompleted: boolean;
  trackerCount: number;
  connectedTrackerCount: number;
  activeEngagementCount: number;
  isJamming: boolean;
  alertCount: number;
  connectionStatus: string;
  tacticalMode: boolean;
  onNavigateBack: () => void;
  onAlertClick: () => void;
  onToggleTacticalMode: () => void;
  onStopSession: () => void;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const SessionStatusBar: React.FC<SessionStatusBarProps> = ({
  sessionName,
  duration,
  isRecording,
  isCompleted,
  trackerCount,
  connectedTrackerCount,
  activeEngagementCount,
  isJamming,
  alertCount,
  connectionStatus,
  tacticalMode,
  onNavigateBack,
  onAlertClick,
  onToggleTacticalMode,
  onStopSession,
}) => {
  const isConnected = connectionStatus === 'connected';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 12px',
      background: tacticalMode ? '#000000' : 'rgba(10, 10, 20, 0.95)',
      borderBottom: `1px solid ${tacticalMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.08)'}`,
      backdropFilter: 'blur(16px)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 13,
      color: tacticalMode ? '#4ade80' : '#e5e7eb',
      height: 44,
      flexShrink: 0,
      zIndex: 50,
    }}>
      {/* Back button */}
      <button
        onClick={onNavigateBack}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          color: tacticalMode ? '#4ade80' : '#9ca3af', cursor: 'pointer',
        }}
        title="Back to home"
      >
        <ArrowLeft size={16} />
      </button>

      {/* REC indicator */}
      {isRecording && !isCompleted && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '2px 8px', borderRadius: 4,
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        }}>
          <Circle
            size={8}
            fill="#ef4444"
            color="#ef4444"
            style={{ animation: 'pulse-live 1.5s ease-in-out infinite' }}
          />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            color: '#ef4444',
          }}>
            REC
          </span>
        </div>
      )}

      {isCompleted && (
        <div style={{
          padding: '2px 8px', borderRadius: 4,
          background: 'rgba(107, 114, 128, 0.15)',
          border: '1px solid rgba(107, 114, 128, 0.3)',
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          color: '#6b7280',
        }}>
          COMPLETED
        </div>
      )}

      {/* Session name */}
      <span style={{
        fontWeight: 600, fontSize: 13,
        color: tacticalMode ? '#4ade80' : '#fff',
        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {sessionName}
      </span>

      <Separator tacticalMode={tacticalMode} />

      {/* Duration timer */}
      <span style={{
        fontFamily: 'monospace', fontSize: 14, fontWeight: 700,
        letterSpacing: 1.5,
        color: tacticalMode ? '#4ade80' : '#ff6b00',
        minWidth: 70,
      }}>
        {formatDuration(duration)}
      </span>

      <Separator tacticalMode={tacticalMode} />

      {/* Tracker count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          fontSize: 14, fontWeight: 700,
          color: connectedTrackerCount === trackerCount
            ? (tacticalMode ? '#4ade80' : '#22c55e')
            : '#f59e0b',
          fontFamily: 'monospace',
        }}>
          {connectedTrackerCount}/{trackerCount}
        </span>
        <span style={{
          fontSize: 9, color: tacticalMode ? 'rgba(74,222,128,0.6)' : '#6b7280',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          connected
        </span>
      </div>

      {/* Active engagement badge */}
      {activeEngagementCount > 0 && (
        <>
          <Separator tacticalMode={tacticalMode} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4,
            background: 'rgba(6, 182, 212, 0.15)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            animation: 'pulse-live 1.5s ease-in-out infinite',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
              color: '#06b6d4',
            }}>
              {activeEngagementCount} ENGAGED
            </span>
          </div>
        </>
      )}

      {/* Jam status */}
      {isJamming && (
        <div style={{
          padding: '2px 8px', borderRadius: 4,
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          color: '#ef4444',
          animation: 'pulse-live 1.5s ease-in-out infinite',
        }}>
          JAM ON
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Alert bell */}
      <button
        onClick={onAlertClick}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: alertCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${alertCount > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
          color: alertCount > 0 ? '#ef4444' : (tacticalMode ? '#4ade80' : '#9ca3af'),
          cursor: 'pointer',
        }}
        title={`${alertCount} unacknowledged alerts`}
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

      {/* Connection status */}
      <div
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isConnected ? '#22c55e' : '#ef4444',
          boxShadow: isConnected ? '0 0 6px rgba(34,197,94,0.5)' : '0 0 6px rgba(239,68,68,0.5)',
          animation: isConnected ? undefined : 'pulse-live 1.5s ease-in-out infinite',
        }}
        title={isConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
      />

      {/* Tactical mode toggle */}
      <button
        onClick={onToggleTacticalMode}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: tacticalMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
          color: tacticalMode ? '#4ade80' : '#9ca3af',
          cursor: 'pointer',
        }}
        title={tacticalMode ? 'Switch to standard mode' : 'Switch to tactical mode'}
      >
        {tacticalMode ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      {/* Stop button (only for live sessions) */}
      {isRecording && !isCompleted && (
        <button
          onClick={onStopSession}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 12px', borderRadius: 6,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
          }}
          title="Stop session"
        >
          <div style={{
            width: 8, height: 8, borderRadius: 2,
            background: '#ef4444',
          }} />
          STOP
        </button>
      )}
    </div>
  );
};

const Separator: React.FC<{ tacticalMode?: boolean }> = ({ tacticalMode }) => (
  <div style={{
    width: 1, height: 18,
    background: tacticalMode ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.12)',
  }} />
);

export default SessionStatusBar;
