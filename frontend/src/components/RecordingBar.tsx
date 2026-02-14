/**
 * Unified Recording Bar
 * Combines session status and event marking into a single bar during active recording
 */

import { useMemo, useCallback, useEffect, useState, useRef } from 'react';
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
  X,
  Plane,
  Home,
  AlertTriangle,
  FileText,
  Zap,
  ChevronDown,
  Check,
} from 'lucide-react';
import { GlassButton, Badge } from './ui/GlassUI';
import { useToast } from '../contexts/ToastContext';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useTestSessionPhase } from '../contexts/TestSessionPhaseContext';
import type { SessionExportSummary } from '../contexts/WorkflowContext';
import type { SessionPhase } from '../contexts/TestSessionPhaseContext';
import { EventType, EVENT_COLORS, CUASPlacement, CUASProfile } from '../types/workflow';

interface RecordingBarProps {
  phase: SessionPhase;
  sessionName: string;
  sessionId?: string;
  duration: number;
  trackerCount: number;
  onStopClick?: () => void;
  onDismiss?: () => void;
  exportSummary?: SessionExportSummary | null;
  onOpenSDCard?: () => void;
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

// Phase configuration
const PHASE_CONFIG: Record<SessionPhase, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  showPulse: boolean;
  showSpinner: boolean;
}> = {
  idle: {
    label: 'IDLE',
    color: 'rgba(255, 255, 255, 0.5)',
    bgColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    showPulse: false,
    showSpinner: false,
  },
  planning: {
    label: 'PLANNING',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    showPulse: true,
    showSpinner: false,
  },
  active: {
    label: 'RECORDING',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    showPulse: true,
    showSpinner: false,
  },
  capturing: {
    label: 'SAVING',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    borderColor: 'rgba(249, 115, 22, 0.3)',
    showPulse: false,
    showSpinner: true,
  },
  analyzing: {
    label: 'ANALYZING',
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.1)',
    borderColor: 'rgba(168, 85, 247, 0.3)',
    showPulse: false,
    showSpinner: true,
  },
  completed: {
    label: 'COMPLETED',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    showPulse: false,
    showSpinner: false,
  },
};

// Event button configuration
interface EventButton {
  type: EventType;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

const EVENT_BUTTONS: EventButton[] = [
  { type: 'jam_on', label: 'JAM', icon: <Radio size={14} />, shortcut: 'J' },
  { type: 'launch', label: 'LAUNCH', icon: <Plane size={14} />, shortcut: 'L' },
  { type: 'recover', label: 'RECOVER', icon: <Home size={14} />, shortcut: 'R' },
  { type: 'failsafe', label: 'FAILSAFE', icon: <AlertTriangle size={14} />, shortcut: 'F' },
  { type: 'note', label: 'NOTE', icon: <FileText size={14} />, shortcut: 'N' },
];

export default function RecordingBar({
  phase,
  sessionName,
  sessionId,
  duration,
  trackerCount,
  onStopClick,
  onDismiss,
  exportSummary,
  onOpenSDCard,
}: RecordingBarProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { activeSession, addEvent, cuasProfiles } = useWorkflow();
  const { cuasJamStates, toggleJamState } = useTestSessionPhase();

  const config = PHASE_CONFIG[phase];
  const formattedDuration = useMemo(() => formatDuration(duration), [duration]);

  // Event state
  const [lastEvent, setLastEvent] = useState<{ type: EventType; cuasName?: string } | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showJammerDropdown, setShowJammerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get CUAS placements from active session
  const cuasPlacements = activeSession?.cuas_placements || [];
  const hasMultipleJammers = cuasPlacements.length > 1;

  // Build profiles map for lookup
  const profilesMap = useMemo(() => {
    const map = new Map<string, CUASProfile>();
    cuasProfiles.forEach(p => map.set(p.id, p));
    return map;
  }, [cuasProfiles]);

  const getProfile = (placement: CUASPlacement): CUASProfile | undefined => {
    return profilesMap.get(placement.cuas_profile_id);
  };

  // Count active jammers
  const activeJammerCount = Array.from(cuasJamStates.values()).filter(v => v).length;

  // Show toast when export summary appears
  useEffect(() => {
    if (exportSummary && phase === 'completed') {
      const fileCount = exportSummary.filesCreated?.length || 0;
      const positions = exportSummary.totalPositions || 0;
      showToast('success', `Session saved: ${fileCount} files, ${positions} positions`, {
        duration: 6000,
        action: {
          label: 'View Session',
          onClick: () => sessionId ? navigate(`/session/${sessionId}/live`) : navigate('/monitor'),
        },
      });

      // Show SD Card merge prompt after a brief delay
      setTimeout(() => {
        showToast('info', 'Merge SD card tracks to enhance session data?', {
          duration: 10000,
          action: {
            label: 'Open SD Card',
            onClick: () => onOpenSDCard?.(),
          },
        });
      }, 1500);
    }
  }, [exportSummary, phase, showToast, navigate, onOpenSDCard]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowJammerDropdown(false);
      }
    };

    if (showJammerDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showJammerDropdown]);

  // Handle event marking
  const handleMarkEvent = useCallback(async (type: EventType, note?: string, cuasId?: string) => {
    if (!activeSession) return;

    // Handle jam events
    if (type === 'jam_on' || type === 'jam_off') {
      if (hasMultipleJammers && !cuasId) {
        setShowJammerDropdown(true);
        return;
      }

      const targetId = cuasId || (cuasPlacements.length === 1 ? cuasPlacements[0].id : null);
      if (targetId) {
        const newState = await toggleJamState(targetId);
        const placement = cuasPlacements.find(p => p.id === targetId);
        const profile = placement ? getProfile(placement) : undefined;

        setLastEvent({
          type: newState ? 'jam_on' : 'jam_off',
          cuasName: profile?.name,
        });
        setTimeout(() => setLastEvent(null), 2000);
        setShowJammerDropdown(false);
        return;
      }
    }

    // Handle note event
    if (type === 'note' && !note) {
      setShowNoteInput(true);
      return;
    }

    // Log other events
    const event = await addEvent(activeSession.id, {
      type,
      timestamp: new Date().toISOString(),
      source: 'manual',
      note,
    });

    if (event) {
      setLastEvent({ type });
      setTimeout(() => setLastEvent(null), 2000);
    }
  }, [activeSession, addEvent, hasMultipleJammers, cuasPlacements, toggleJamState, getProfile]);

  // Handle jammer selection
  const handleJammerSelect = useCallback((placement: CUASPlacement) => {
    const isCurrentlyJamming = cuasJamStates.get(placement.id) || false;
    handleMarkEvent(isCurrentlyJamming ? 'jam_off' : 'jam_on', undefined, placement.id);
  }, [cuasJamStates, handleMarkEvent]);

  // Submit note
  const handleSubmitNote = useCallback(() => {
    if (noteText.trim()) {
      handleMarkEvent('note', noteText.trim());
    }
    setNoteText('');
    setShowNoteInput(false);
  }, [noteText, handleMarkEvent]);

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== 'active' || !activeSession) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'j') {
        e.preventDefault();
        if (hasMultipleJammers) {
          setShowJammerDropdown(prev => !prev);
        } else if (cuasPlacements.length === 1) {
          const isJamming = cuasJamStates.get(cuasPlacements[0].id) || false;
          handleMarkEvent(isJamming ? 'jam_off' : 'jam_on', undefined, cuasPlacements[0].id);
        }
        return;
      }

      if (showJammerDropdown && key >= '1' && key <= '9') {
        const index = parseInt(key) - 1;
        if (index < cuasPlacements.length) {
          e.preventDefault();
          handleJammerSelect(cuasPlacements[index]);
        }
        return;
      }

      const shortcutMap: Record<string, EventType> = {
        'l': 'launch',
        'r': 'recover',
        'f': 'failsafe',
        'n': 'note',
      };

      const eventType = shortcutMap[key];
      if (eventType) {
        e.preventDefault();
        handleMarkEvent(eventType);
      }

      if (key === 'escape') {
        setShowJammerDropdown(false);
        setShowNoteInput(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, activeSession, hasMultipleJammers, cuasPlacements, cuasJamStates, showJammerDropdown, handleMarkEvent, handleJammerSelect]);

  // Don't render for idle phase
  if (phase === 'idle') {
    return null;
  }

  const handleViewSession = () => sessionId ? navigate(`/session/${sessionId}/live`) : navigate('/monitor');
  const handleViewAnalysis = () => sessionId && navigate(`/session/${sessionId}/analysis`);

  return (
    <div
      className="recording-bar"
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
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Phase indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: config.bgColor,
          borderRadius: '6px',
          border: `1px solid ${config.borderColor}`,
        }}
      >
        {config.showPulse && (
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: phase === 'active' ? '#ef4444' : config.color,
              animation: 'pulse 1.5s ease-in-out infinite',
              boxShadow: phase === 'active' ? '0 0 8px rgba(239, 68, 68, 0.6)' : undefined,
            }}
          />
        )}
        {config.showSpinner && (
          <span
            style={{
              width: '10px',
              height: '10px',
              border: `2px solid ${config.borderColor}`,
              borderTopColor: config.color,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        )}
        {phase === 'active' && <Play size={12} style={{ color: config.color }} />}
        {phase === 'planning' && <Activity size={12} style={{ color: config.color }} />}
        {phase === 'capturing' && <HardDrive size={12} style={{ color: config.color }} />}
        {phase === 'analyzing' && <BarChart3 size={12} style={{ color: config.color }} />}
        {phase === 'completed' && <CheckCircle size={12} style={{ color: config.color }} />}
        <span style={{ fontSize: '10px', fontWeight: 600, color: config.color, letterSpacing: '0.5px' }}>
          {config.label}
        </span>
      </div>

      {/* Session name */}
      <span
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: '#fff',
          maxWidth: '150px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {sessionName}
      </span>

      {/* Duration */}
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: '13px',
          fontWeight: 600,
          color: '#fff',
        }}
      >
        {formattedDuration}
      </span>

      {/* Tracker count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Radio size={12} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
        <span style={{ fontSize: '12px', color: '#fff' }}>{trackerCount}</span>
      </div>

      {/* Separator before event buttons */}
      {phase === 'active' && (
        <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.15)' }} />
      )}

      {/* Event buttons - only during active recording */}
      {phase === 'active' && (
        <>
          {EVENT_BUTTONS.map(btn => {
            // JAM button with multi-jammer dropdown
            if (btn.type === 'jam_on') {
              return (
                <div key={btn.type} style={{ position: 'relative' }} ref={dropdownRef}>
                  <button
                    onClick={() => hasMultipleJammers ? setShowJammerDropdown(!showJammerDropdown) : handleMarkEvent('jam_on')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      background: activeJammerCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      border: activeJammerCount > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: activeJammerCount > 0 ? '#ef4444' : EVENT_COLORS[btn.type],
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    title={`${btn.label} (${btn.shortcut})`}
                  >
                    {btn.icon}
                    <span>{btn.label}</span>
                    {activeJammerCount > 0 && (
                      <Badge color="red" size="sm">{activeJammerCount}</Badge>
                    )}
                    {hasMultipleJammers && <ChevronDown size={10} />}
                  </button>

                  {/* Jammer dropdown */}
                  {showJammerDropdown && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginTop: '8px',
                        padding: '8px',
                        background: 'rgba(10, 15, 26, 0.98)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        minWidth: '180px',
                        zIndex: 600,
                      }}
                    >
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px', padding: '0 8px' }}>
                        SELECT JAMMER (1-{cuasPlacements.length})
                      </div>
                      {cuasPlacements.map((placement, index) => {
                        const profile = getProfile(placement);
                        const isJamming = cuasJamStates.get(placement.id) || false;

                        return (
                          <button
                            key={placement.id}
                            onClick={() => handleJammerSelect(placement)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 10px',
                              marginBottom: '2px',
                              background: isJamming ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                              border: isJamming ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent',
                              borderRadius: '4px',
                              color: isJamming ? '#ef4444' : 'rgba(255,255,255,0.8)',
                              fontSize: '11px',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <Badge color="gray" size="sm">{index + 1}</Badge>
                            <span style={{ flex: 1 }}>{profile?.name || `CUAS ${index + 1}`}</span>
                            {isJamming && <Check size={12} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Regular event buttons
            return (
              <button
                key={btn.type}
                onClick={() => handleMarkEvent(btn.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: EVENT_COLORS[btn.type],
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title={`${btn.label} (${btn.shortcut})`}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            );
          })}

          {/* Last event indicator */}
          {lastEvent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
              <Zap size={12} style={{ color: EVENT_COLORS[lastEvent.type] }} />
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
                {lastEvent.type.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          )}
        </>
      )}

      {/* Separator before action buttons */}
      <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.15)' }} />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '6px' }}>
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
              padding: '4px 10px',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            <Square size={10} />
            STOP
          </GlassButton>
        )}

        {/* Completed phase buttons */}
        {phase === 'completed' && (
          <>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleViewSession}
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                padding: '4px 10px',
                fontSize: '10px',
                fontWeight: 600,
              }}
            >
              <FolderOpen size={10} />
              View Session
            </GlassButton>

            {onOpenSDCard && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={onOpenSDCard}
                style={{
                  background: 'rgba(255, 140, 0, 0.1)',
                  borderColor: 'rgba(255, 140, 0, 0.3)',
                  color: '#ff8c00',
                  padding: '4px 10px',
                  fontSize: '10px',
                  fontWeight: 600,
                }}
              >
                <HardDrive size={10} />
                SD Card
              </GlassButton>
            )}

            {sessionId && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={handleViewAnalysis}
                style={{
                  background: 'rgba(168, 85, 247, 0.1)',
                  borderColor: 'rgba(168, 85, 247, 0.3)',
                  color: '#a855f7',
                  padding: '4px 10px',
                  fontSize: '10px',
                  fontWeight: 600,
                }}
              >
                <BarChart3 size={10} />
                Analyze
              </GlassButton>
            )}

            {onDismiss && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                style={{ padding: '4px', color: 'rgba(255, 255, 255, 0.5)' }}
              >
                <X size={12} />
              </GlassButton>
            )}
          </>
        )}
      </div>

      {/* Note input modal */}
      {showNoteInput && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            padding: '12px',
            background: 'rgba(10, 15, 26, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            width: '280px',
            zIndex: 600,
          }}
        >
          <textarea
            autoFocus
            placeholder="Enter note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitNote();
              }
              if (e.key === 'Escape') {
                setShowNoteInput(false);
                setNoteText('');
              }
            }}
            style={{
              width: '100%',
              padding: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '12px',
              outline: 'none',
              minHeight: '50px',
              resize: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => { setShowNoteInput(false); setNoteText(''); }}
              style={{ flex: 1, fontSize: '11px' }}
            >
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              onClick={handleSubmitNote}
              style={{ flex: 1, fontSize: '11px' }}
            >
              Add Note
            </GlassButton>
          </div>
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
