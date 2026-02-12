/**
 * Event Marking Toolbar
 * Provides buttons and keyboard shortcuts for marking test events during CUAS sessions
 * Enhanced for multi-jammer support
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Radio,
  WifiOff,
  Plane,
  Home,
  AlertTriangle,
  FileText,
  Zap,
  Keyboard,
  ChevronDown,
  Check,
} from 'lucide-react';
import { GlassPanel, GlassButton, Badge } from './ui/GlassUI';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useTestSessionPhase } from '../contexts/TestSessionPhaseContext';
import { EventType, EVENT_COLORS, CUASPlacement, CUASProfile } from '../types/workflow';

interface EventToolbarProps {
  visible: boolean;
}

interface EventButton {
  type: EventType;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  variant: 'jam' | 'action' | 'alert' | 'note';
}

const EVENT_BUTTONS: EventButton[] = [
  { type: 'jam_on', label: 'JAM ON', icon: <Radio size={16} />, shortcut: 'J', variant: 'jam' },
  { type: 'jam_off', label: 'JAM OFF', icon: <WifiOff size={16} />, shortcut: undefined, variant: 'jam' },
  { type: 'launch', label: 'LAUNCH', icon: <Plane size={16} />, shortcut: 'L', variant: 'action' },
  { type: 'recover', label: 'RECOVER', icon: <Home size={16} />, shortcut: 'R', variant: 'action' },
  { type: 'failsafe', label: 'FAILSAFE', icon: <AlertTriangle size={16} />, shortcut: 'F', variant: 'alert' },
  { type: 'note', label: 'NOTE', icon: <FileText size={16} />, shortcut: 'N', variant: 'note' },
];

export default function EventToolbar({ visible }: EventToolbarProps) {
  const { activeSession, addEvent, cuasProfiles } = useWorkflow();
  const { cuasJamStates, toggleJamState } = useTestSessionPhase();

  const [lastEvent, setLastEvent] = useState<{ type: EventType; time: Date; cuasName?: string } | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showJammerDropdown, setShowJammerDropdown] = useState(false);
  const [selectedJammerId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get CUAS placements from active session
  const cuasPlacements = activeSession?.cuas_placements || [];
  const hasMultipleJammers = cuasPlacements.length > 1;

  // Build profiles map for lookup
  const profilesMap = new Map<string, CUASProfile>();
  cuasProfiles.forEach(p => profilesMap.set(p.id, p));

  // Get profile for a placement
  const getProfile = (placement: CUASPlacement): CUASProfile | undefined => {
    return profilesMap.get(placement.cuas_profile_id);
  };

  // Check if any jammer is active
  const anyJammerActive = Array.from(cuasJamStates.values()).some(v => v);

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

    // Handle jam events with multi-jammer support
    if (type === 'jam_on' || type === 'jam_off') {
      // If we have multiple jammers and no specific one selected, show dropdown
      if (hasMultipleJammers && !cuasId && type === 'jam_on') {
        setShowJammerDropdown(true);
        return;
      }

      // If single jammer or jammer selected, toggle it
      // Note: toggleJamState already logs the event, so we don't call addEvent here
      const targetId = cuasId || (cuasPlacements.length === 1 ? cuasPlacements[0].id : selectedJammerId);
      if (targetId) {
        const newState = await toggleJamState(targetId);
        const placement = cuasPlacements.find(p => p.id === targetId);
        const profile = placement ? getProfile(placement) : undefined;

        // Show visual feedback (event already logged by toggleJamState)
        setLastEvent({
          type: newState ? 'jam_on' : 'jam_off',
          time: new Date(),
          cuasName: profile?.name,
        });
        setTimeout(() => setLastEvent(null), 2000);

        setShowJammerDropdown(false);
        return;
      }
    }

    // Handle note event specially
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
      setLastEvent({ type, time: new Date() });
      setTimeout(() => setLastEvent(null), 2000);
    }
  }, [activeSession, addEvent, hasMultipleJammers, cuasPlacements, selectedJammerId, toggleJamState, profilesMap]);

  // Handle clicking a specific jammer in the dropdown
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
    if (!visible || !activeSession) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();

      // Map keys to event types
      if (key === 'j') {
        e.preventDefault();
        // Toggle jam - if multiple jammers, show dropdown; otherwise toggle the single one
        if (hasMultipleJammers) {
          setShowJammerDropdown(prev => !prev);
        } else if (cuasPlacements.length === 1) {
          const isJamming = cuasJamStates.get(cuasPlacements[0].id) || false;
          handleMarkEvent(isJamming ? 'jam_off' : 'jam_on', undefined, cuasPlacements[0].id);
        }
        return;
      }

      // Number keys 1-9 for quick jammer selection when dropdown is open
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

      // Escape to close dropdown
      if (key === 'escape') {
        setShowJammerDropdown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, activeSession, hasMultipleJammers, cuasPlacements, cuasJamStates, showJammerDropdown, handleMarkEvent, handleJammerSelect]);

  if (!visible || !activeSession || activeSession.status !== 'active') {
    return null;
  }

  const getButtonStyle = (btn: EventButton) => {
    const baseStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      padding: '8px 12px',
      minWidth: '70px',
      transition: 'all 0.2s',
    };

    // For jam buttons, show active state based on any jammer being active
    if (btn.type === 'jam_on' && anyJammerActive) {
      return {
        ...baseStyle,
        background: 'rgba(239, 68, 68, 0.3)',
        borderColor: '#ef4444',
      };
    }
    if (btn.type === 'jam_off' && !anyJammerActive) {
      return {
        ...baseStyle,
        background: 'rgba(249, 115, 22, 0.3)',
        borderColor: '#f97316',
      };
    }

    return baseStyle;
  };

  // Count active jammers
  const activeJammerCount = Array.from(cuasJamStates.values()).filter(v => v).length;

  return (
    <div
      className="event-toolbar"
      style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
      }}
    >
      <div role="toolbar" aria-label="Event marking toolbar">
      <GlassPanel
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}
      >
        {/* Session indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px rgba(34, 197, 94, 0.5)',
              animation: 'pulse 2s infinite',
            }}
          />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
            RECORDING
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.1)' }} />

        {/* Event buttons */}
        {EVENT_BUTTONS.map(btn => {
          // Special handling for jam buttons when multiple jammers exist
          if (btn.type === 'jam_on' && hasMultipleJammers) {
            return (
              <div key={btn.type} style={{ position: 'relative' }} ref={dropdownRef}>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowJammerDropdown(!showJammerDropdown)}
                  style={{
                    ...getButtonStyle(btn),
                    minWidth: '85px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: EVENT_COLORS[btn.type] }}>{btn.icon}</span>
                    <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600 }}>JAM</span>
                    {activeJammerCount > 0 && (
                      <Badge color="red" size="sm">
                        {activeJammerCount}
                      </Badge>
                    )}
                  </div>
                  {btn.shortcut && (
                    <Badge color="gray" size="sm">
                      {btn.shortcut}
                    </Badge>
                  )}
                </GlassButton>

                {/* Jammer dropdown */}
                {showJammerDropdown && (
                  <GlassPanel
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginTop: '8px',
                      padding: '8px',
                      minWidth: '200px',
                      zIndex: 200,
                    }}
                  >
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', padding: '0 8px' }}>
                      SELECT JAMMER (1-{cuasPlacements.length})
                    </div>
                    {cuasPlacements.map((placement, index) => {
                      const profile = getProfile(placement);
                      const isJamming = cuasJamStates.get(placement.id) || false;

                      return (
                        <GlassButton
                          key={placement.id}
                          variant="ghost"
                          size="sm"
                          onClick={() => handleJammerSelect(placement)}
                          style={{
                            width: '100%',
                            justifyContent: 'flex-start',
                            gap: '8px',
                            padding: '8px 12px',
                            marginBottom: '4px',
                            background: isJamming ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                            border: isJamming ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent',
                          }}
                        >
                          <Badge color="gray" size="sm">
                            {index + 1}
                          </Badge>
                          <span
                            style={{
                              flex: 1,
                              fontSize: '12px',
                              textAlign: 'left',
                              color: isJamming ? '#ef4444' : 'rgba(255,255,255,0.8)',
                            }}
                          >
                            {profile?.name || `CUAS ${index + 1}`}
                          </span>
                          {isJamming && (
                            <Check size={14} style={{ color: '#ef4444' }} />
                          )}
                        </GlassButton>
                      );
                    })}
                  </GlassPanel>
                )}
              </div>
            );
          }

          // Hide jam_off button when multi-jammer mode (handled in dropdown)
          if (btn.type === 'jam_off' && hasMultipleJammers) {
            return null;
          }

          return (
            <GlassButton
              key={btn.type}
              variant="ghost"
              size="sm"
              onClick={() => handleMarkEvent(btn.type)}
              style={getButtonStyle(btn)}
              aria-label={`${btn.label}${btn.shortcut ? ` (${btn.shortcut})` : ''}`}
              aria-keyshortcuts={btn.shortcut || undefined}
            >
              <span style={{ color: EVENT_COLORS[btn.type] }}>{btn.icon}</span>
              <span style={{ fontSize: '10px', fontWeight: 600 }}>{btn.label}</span>
              {btn.shortcut && (
                <Badge color="gray" size="sm">
                  {btn.shortcut}
                </Badge>
              )}
            </GlassButton>
          );
        })}

        {/* Last event indicator */}
        {lastEvent && (
          <>
            <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={14} style={{ color: EVENT_COLORS[lastEvent.type] }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                  {lastEvent.type.replace('_', ' ').toUpperCase()}
                </span>
                {lastEvent.cuasName && (
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                    {lastEvent.cuasName}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Keyboard hint */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          <Keyboard size={12} />
          <span style={{ fontSize: '10px' }}>Shortcuts enabled</span>
        </div>
      </GlassPanel>
      </div>

      {/* Note input modal */}
      {showNoteInput && (
        <div role="dialog" aria-modal="true" aria-label="Add note">
        <GlassPanel
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            padding: '12px',
            width: '300px',
          }}
        >
          <textarea
            autoFocus
            aria-label="Note text"
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
              padding: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              minHeight: '60px',
              resize: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowNoteInput(false);
                setNoteText('');
              }}
              style={{ flex: 1 }}
            >
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              onClick={handleSubmitNote}
              style={{ flex: 1 }}
            >
              Add Note
            </GlassButton>
          </div>
        </GlassPanel>
        </div>
      )}

      {/* CSS animation for pulse */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
