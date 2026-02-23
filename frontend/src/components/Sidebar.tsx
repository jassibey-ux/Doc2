import { useNavigate } from 'react-router-dom';
import { Settings, MonitorDot, MapPin, Zap, PlayCircle, HardDrive, BarChart3, Square, Activity, History, BookOpen, Shield, FolderSearch } from 'lucide-react';
import type { SessionPhase } from '../contexts/TestSessionPhaseContext';

interface SidebarProps {
  activePanel: string | null;
  onPanelChange: (panel: string | null) => void;
  hasActiveSession?: boolean;
  unreadAlerts?: number;
  liveTrackerCount?: number;
  sessionPhase?: SessionPhase;
  onStartSession?: () => void;
  onStopSession?: () => void;
}

interface ControlButton {
  id: string;
  icon: React.ReactNode;
  tooltip: string;
}

// Workflow buttons (top section)
// Note: 'drone-profiles' and 'cuas-profiles' removed - now in Configuration Workspace Panel triggered by 'sites'
const workflowButtons: ControlButton[] = [
  { id: 'sites', icon: <MapPin size={20} />, tooltip: 'Configuration' },
];

// Tool buttons (bottom section)
// Note: 'alerts', 'report', and 'sd-card' removed - now in Unified Workspace Panel triggered by 'settings'
// Note: 'layers', 'analysis' removed for cleaner UI - accessible via other means
const toolButtons: ControlButton[] = [
  { id: 'drones', icon: <Zap size={20} />, tooltip: 'Active Drones' },
  { id: 'settings', icon: <Settings size={20} />, tooltip: 'Workspace' },
];

export default function Sidebar({
  activePanel,
  onPanelChange,
  // hasActiveSession is now derived from sessionPhase
  // unreadAlerts - now shown in Unified Workspace Panel
  sessionPhase = 'idle',
  onStartSession,
  onStopSession,
}: SidebarProps) {
  const navigate = useNavigate();

  const handleButtonClick = (buttonId: string) => {
    console.log('[Sidebar] handleButtonClick:', buttonId, 'current activePanel:', activePanel);
    // Toggle panel if clicking the same button
    if (activePanel === buttonId) {
      onPanelChange(null);
    } else {
      onPanelChange(buttonId);
    }
  };

  // Determine if we should show the start session button
  const showStartSession = sessionPhase === 'idle';
  const showActiveSession = sessionPhase === 'active';
  const showSessionInProgress = sessionPhase !== 'idle' && sessionPhase !== 'active';

  // Handle start session click — allow wizard even without trackers
  const handleStartSessionClick = () => {
    onStartSession?.();
  };

  return (
    <div className="left-controls">
      {/* Start Session Button (always shown when idle, styled differently if no trackers) */}
      {showStartSession && onStartSession && (
        <button
          className="control-btn tooltip-btn start-session-btn"
          data-tooltip="Start Session"
          aria-label="Start Test Session"
          onClick={handleStartSessionClick}
          style={{
            background: 'rgba(10, 15, 26, 0.85)',
            borderColor: '#ff8c00',
          }}
        >
          <PlayCircle size={20} style={{ color: '#ff8c00' }} />
        </button>
      )}

      {/* Stop Session Button (when test is running) */}
      {showActiveSession && onStopSession && (
        <button
          className="control-btn tooltip-btn stop-session-btn"
          data-tooltip="Stop Recording"
          aria-label="Stop Recording"
          onClick={onStopSession}
          style={{
            background: 'rgba(239, 68, 68, 0.2)',
            borderColor: '#ef4444',
            position: 'relative',
          }}
        >
          <Square size={20} style={{ color: '#ef4444' }} />
          <span
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#ef4444',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        </button>
      )}

      {/* Session In Progress Indicator (capturing, analyzing, completed) */}
      {showSessionInProgress && (
        <button
          className="control-btn tooltip-btn session-progress"
          data-tooltip={`Session: ${sessionPhase}`}
          aria-label={`Session ${sessionPhase}`}
          style={{
            background: sessionPhase === 'capturing'
              ? 'rgba(249, 115, 22, 0.2)'
              : sessionPhase === 'analyzing'
              ? 'rgba(168, 85, 247, 0.2)'
              : 'rgba(34, 197, 94, 0.2)',
            borderColor: sessionPhase === 'capturing'
              ? '#f97316'
              : sessionPhase === 'analyzing'
              ? '#a855f7'
              : '#22c55e',
          }}
        >
          {sessionPhase === 'capturing' && <HardDrive size={20} style={{ color: '#f97316' }} />}
          {sessionPhase === 'analyzing' && <BarChart3 size={20} style={{ color: '#a855f7' }} />}
          {sessionPhase === 'completed' && <PlayCircle size={20} style={{ color: '#22c55e' }} />}
          {sessionPhase === 'planning' && <Activity size={20} style={{ color: '#3b82f6' }} />}
        </button>
      )}

      {/* Divider after session controls if any are shown */}
      {(showStartSession || showActiveSession || showSessionInProgress) && (
        <div style={{
          width: '24px',
          height: '1px',
          background: 'rgba(255,255,255,0.1)',
          margin: '8px 0',
        }} />
      )}

      {/* Workflow Buttons */}
      {workflowButtons.map(button => (
        <button
          key={button.id}
          className={`control-btn tooltip-btn ${activePanel === button.id ? 'active' : ''}`}
          data-tooltip={button.tooltip}
          aria-label={button.tooltip}
          onClick={() => handleButtonClick(button.id)}
        >
          {button.icon}
        </button>
      ))}

      {/* Divider */}
      <div style={{
        width: '24px',
        height: '1px',
        background: 'rgba(255,255,255,0.1)',
        margin: '8px 0',
      }} />

      {/* Tool Buttons */}
      {toolButtons.map(button => (
        <button
          key={button.id}
          className={`control-btn tooltip-btn ${activePanel === button.id ? 'active' : ''}`}
          data-tooltip={button.tooltip}
          aria-label={button.tooltip}
          onClick={() => handleButtonClick(button.id)}
        >
          {button.icon}
        </button>
      ))}

      {/* Session History Button */}
      <button
        className={`control-btn tooltip-btn ${activePanel === 'session-history' ? 'active' : ''}`}
        data-tooltip="Session History"
        aria-label="Session History"
        onClick={() => handleButtonClick('session-history')}
        style={{
          background: activePanel === 'session-history' ? 'rgba(255, 140, 0, 0.2)' : undefined,
          borderColor: activePanel === 'session-history' ? '#ff8c00' : undefined,
        }}
      >
        <History size={20} style={{ color: activePanel === 'session-history' ? '#ff8c00' : undefined }} />
      </button>

      {/* Replay Session Button */}
      <button
        className={`control-btn tooltip-btn replay-btn ${activePanel === 'replay' ? 'active' : ''}`}
        data-tooltip="Replay Session"
        aria-label="Replay Session"
        onClick={() => handleButtonClick('replay')}
        style={{
          background: activePanel === 'replay' ? 'rgba(59, 130, 246, 0.2)' : undefined,
          borderColor: activePanel === 'replay' ? '#3b82f6' : undefined,
        }}
      >
        <History size={20} style={{ color: activePanel === 'replay' ? '#3b82f6' : undefined }} />
      </button>

      {/* Session Browser Button */}
      <button
        className="control-btn tooltip-btn"
        data-tooltip="Session Browser"
        aria-label="Session Browser"
        onClick={() => navigate('/sessions')}
        style={{
          background: 'rgba(10, 15, 26, 0.85)',
          borderColor: 'rgba(0, 150, 136, 0.4)',
        }}
      >
        <FolderSearch size={20} style={{ color: '#009688' }} />
      </button>

      {/* Session Library Button - navigates to CRM dashboard */}
      <button
        className="control-btn tooltip-btn crm-btn"
        data-tooltip="Session Library"
        aria-label="Session Library"
        onClick={() => navigate('/crm')}
        style={{
          // Dark background for visibility on satellite view
          background: 'rgba(10, 15, 26, 0.85)',
          borderColor: 'rgba(255, 140, 0, 0.4)',
        }}
      >
        <BookOpen size={20} style={{ color: '#ff8c00' }} />
      </button>

      {/* Event Dashboard Button - navigates to event dashboard */}
      <button
        className="control-btn tooltip-btn"
        data-tooltip="Event Dashboard"
        aria-label="Event Dashboard"
        onClick={() => navigate('/event')}
        style={{
          background: 'rgba(10, 15, 26, 0.85)',
          borderColor: 'rgba(59, 130, 246, 0.4)',
        }}
      >
        <Shield size={20} style={{ color: '#3b82f6' }} />
      </button>

      {/* Console Button - navigates to monitoring console */}
      <button
        className="control-btn tooltip-btn console-btn"
        data-tooltip="Monitoring Console"
        aria-label="Monitoring Console"
        onClick={() => navigate('/monitor')}
      >
        <MonitorDot size={20} />
      </button>
    </div>
  );
}
