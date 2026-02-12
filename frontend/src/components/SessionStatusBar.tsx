import { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Square,
  HardDrive,
  BarChart3,
  CheckCircle,
  Radio,
  Activity,
  FolderOpen,
  MapPin,
  X,
} from 'lucide-react';
import { GlassButton } from './ui/GlassUI';
import { useToast } from '../contexts/ToastContext';
import type { SessionExportSummary } from '../contexts/WorkflowContext';
import type { SessionPhase } from '../contexts/TestSessionPhaseContext';

interface SessionStatusBarProps {
  phase: SessionPhase;
  sessionName: string;
  sessionId?: string;
  duration: number;
  trackerCount: number;
  positionCount?: number; // Live position counter
  onStopClick?: () => void;
  onViewDetails?: () => void;
  onDismiss?: () => void;
  exportSummary?: SessionExportSummary | null;
}

// Format duration as MM:SS or HH:MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Phase icons - using direct string identifiers
type PhaseIconName = 'radio' | 'activity' | 'play' | 'hardDrive' | 'barChart3' | 'checkCircle';

// Phase configuration
const PHASE_CONFIG: Record<SessionPhase, {
  label: string;
  iconName: PhaseIconName;
  color: string;
  bgColor: string;
  borderColor: string;
  showPulse: boolean;
  showSpinner: boolean;
}> = {
  idle: {
    label: 'IDLE',
    iconName: 'radio',
    color: 'rgba(255, 255, 255, 0.5)',
    bgColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    showPulse: false,
    showSpinner: false,
  },
  planning: {
    label: 'PLANNING',
    iconName: 'activity',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    showPulse: true,
    showSpinner: false,
  },
  active: {
    label: 'RECORDING',
    iconName: 'play',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    showPulse: true,
    showSpinner: false,
  },
  capturing: {
    label: 'SAVING',
    iconName: 'hardDrive',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    borderColor: 'rgba(249, 115, 22, 0.3)',
    showPulse: false,
    showSpinner: true,
  },
  analyzing: {
    label: 'ANALYZING',
    iconName: 'barChart3',
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.1)',
    borderColor: 'rgba(168, 85, 247, 0.3)',
    showPulse: false,
    showSpinner: true,
  },
  completed: {
    label: 'COMPLETED',
    iconName: 'checkCircle',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    showPulse: false,
    showSpinner: false,
  },
};

// Render the correct icon for the phase
function PhaseIcon({ iconName, color }: { iconName: PhaseIconName; color: string }) {
  const iconStyle = { color };
  switch (iconName) {
    case 'radio': return <Radio size={14} style={iconStyle} />;
    case 'activity': return <Activity size={14} style={iconStyle} />;
    case 'play': return <Play size={14} style={iconStyle} />;
    case 'hardDrive': return <HardDrive size={14} style={iconStyle} />;
    case 'barChart3': return <BarChart3 size={14} style={iconStyle} />;
    case 'checkCircle': return <CheckCircle size={14} style={iconStyle} />;
  }
}

export default function SessionStatusBar({
  phase,
  sessionName,
  sessionId,
  duration,
  trackerCount,
  positionCount,
  onStopClick,
  onViewDetails,
  onDismiss,
  exportSummary,
}: SessionStatusBarProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const config = PHASE_CONFIG[phase];
  const formattedDuration = useMemo(() => formatDuration(duration), [duration]);

  // Show toast when export summary appears (session just stopped)
  useEffect(() => {
    if (exportSummary && phase === 'completed') {
      const fileCount = exportSummary.filesCreated?.length || 0;
      const positions = exportSummary.totalPositions || 0;
      showToast('success', `Session saved: ${fileCount} files, ${positions} positions`, {
        duration: 6000,
        action: {
          label: 'View Session',
          onClick: () => navigate('/monitor'),
        },
      });
    }
  }, [exportSummary, phase, showToast, navigate]);

  // Don't render for idle phase
  if (phase === 'idle') {
    return null;
  }

  const handleViewInBrowser = () => {
    navigate('/monitor');
  };

  const handleViewAnalysis = () => {
    if (sessionId) {
      navigate(`/session/${sessionId}/analysis`);
    }
  };

  return (
    <div
      className="session-status-bar"
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        background: 'rgba(10, 15, 26, 0.95)',
        backdropFilter: 'blur(40px) saturate(180%)',
        border: `1px solid ${config.borderColor}`,
        borderRadius: '12px',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Phase indicator with pulse */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          background: config.bgColor,
          borderRadius: '8px',
          border: `1px solid ${config.borderColor}`,
        }}
      >
        {config.showPulse && (
          <span
            className="recording-dot"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: phase === 'active' ? '#ef4444' : config.color,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        )}
        {config.showSpinner && (
          <span
            style={{
              width: '12px',
              height: '12px',
              border: `2px solid ${config.borderColor}`,
              borderTopColor: config.color,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        )}
        <PhaseIcon iconName={config.iconName} color={config.color} />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: config.color,
            letterSpacing: '0.5px',
          }}
        >
          {config.label}
        </span>
      </div>

      {/* Separator */}
      <div
        style={{
          width: '1px',
          height: '24px',
          background: 'rgba(255, 255, 255, 0.1)',
        }}
      />

      {/* Session name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Session:
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#fff',
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {sessionName}
        </span>
      </div>

      {/* Separator */}
      <div
        style={{
          width: '1px',
          height: '24px',
          background: 'rgba(255, 255, 255, 0.1)',
        }}
      />

      {/* Duration */}
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '14px',
          fontWeight: 600,
          color: '#fff',
          minWidth: '60px',
          textAlign: 'center',
        }}
      >
        {formattedDuration}
      </div>

      {/* Separator */}
      <div
        style={{
          width: '1px',
          height: '24px',
          background: 'rgba(255, 255, 255, 0.1)',
        }}
      />

      {/* Tracker count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Radio size={14} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#fff',
          }}
        >
          {trackerCount}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          trackers
        </span>
      </div>

      {/* Position count (during active recording) */}
      {phase === 'active' && positionCount !== undefined && (
        <>
          <div
            style={{
              width: '1px',
              height: '24px',
              background: 'rgba(255, 255, 255, 0.1)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={14} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#fff',
                fontFamily: 'monospace',
              }}
            >
              {positionCount.toLocaleString()}
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              positions
            </span>
          </div>
        </>
      )}

      {/* Export summary stats (when completed) */}
      {phase === 'completed' && exportSummary && (
        <>
          <div
            style={{
              width: '1px',
              height: '24px',
              background: 'rgba(255, 255, 255, 0.1)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={14} style={{ color: '#22c55e' }} />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#22c55e',
                fontFamily: 'monospace',
              }}
            >
              {exportSummary.totalPositions.toLocaleString()}
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              saved
            </span>
          </div>
        </>
      )}

      {/* Action buttons */}
      <div
        style={{
          width: '1px',
          height: '24px',
          background: 'rgba(255, 255, 255, 0.1)',
        }}
      />

      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Stop button during active recording */}
        {phase === 'active' && onStopClick && (
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={onStopClick}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            <Square size={12} />
            STOP
          </GlassButton>
        )}

        {/* View Report button (legacy, if provided) */}
        {phase === 'completed' && onViewDetails && (
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={onViewDetails}
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              borderColor: 'rgba(34, 197, 94, 0.3)',
              color: '#22c55e',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            View Report
          </GlassButton>
        )}

        {/* Navigation buttons when completed */}
        {phase === 'completed' && (
          <>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleViewInBrowser}
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              <FolderOpen size={12} />
              Sessions
            </GlassButton>

            {sessionId && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={handleViewAnalysis}
                style={{
                  background: 'rgba(168, 85, 247, 0.1)',
                  borderColor: 'rgba(168, 85, 247, 0.3)',
                  color: '#a855f7',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <BarChart3 size={12} />
                Analyze
              </GlassButton>
            )}

            {/* Dismiss button */}
            {onDismiss && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                style={{
                  padding: '6px',
                  color: 'rgba(255, 255, 255, 0.5)',
                }}
              >
                <X size={14} />
              </GlassButton>
            )}
          </>
        )}
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .recording-dot {
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
        }
      `}</style>
    </div>
  );
}
