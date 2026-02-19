/**
 * SessionQuickActions — Floating draggable action toolbar.
 *
 * Positioned bottom-center by default. Contains: ENGAGE/DISENGAGE,
 * JAM ON/OFF, LAUNCH, RECOVER, FAILSAFE, NOTE.
 *
 * Auto-hides after 5s inactivity; reveals on mouse proximity or spacebar.
 * Always visible during active engagement.
 * ~48px tall, auto-width based on button count.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Crosshair, X as XIcon, Zap, ZapOff, Plane, Home,
  AlertTriangle, MessageSquare,
} from 'lucide-react';

interface SessionQuickActionsProps {
  tacticalMode: boolean;
  isLive: boolean;
  isCompleted: boolean;
  hasActiveEngagement: boolean;
  isJamming: boolean;
  showToolbar: boolean;
  onToggleToolbar: () => void;

  // Actions
  onEngage: () => void;
  onDisengage: () => void;
  onJamToggle: () => void;
  onLaunch: () => void;
  onRecover: () => void;
  onFailsafe: () => void;
  onNote: () => void;
}

const IDLE_HIDE_MS = 5000;

const SessionQuickActions: React.FC<SessionQuickActionsProps> = ({
  tacticalMode,
  isLive,
  isCompleted,
  hasActiveEngagement,
  isJamming,
  showToolbar,
  onEngage,
  onDisengage,
  onJamToggle,
  onLaunch,
  onRecover,
  onFailsafe,
  onNote,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  // Auto-hide timer
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setIsVisible(true);
    if (!hasActiveEngagement) {
      hideTimerRef.current = window.setTimeout(() => {
        setIsVisible(false);
      }, IDLE_HIDE_MS);
    }
  }, [hasActiveEngagement]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [resetHideTimer]);

  // Always visible during active engagement
  useEffect(() => {
    if (hasActiveEngagement) {
      setIsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
  }, [hasActiveEngagement]);

  // Show on mouse proximity to bottom
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight - 80) {
        resetHideTimer();
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [resetHideTimer]);

  // Force show/hide via external toggle (spacebar)
  useEffect(() => {
    if (showToolbar) {
      setIsVisible(true);
      resetHideTimer();
    }
  }, [showToolbar, resetHideTimer]);

  // Don't show for completed sessions
  if (isCompleted || !isLive) return null;

  const bgColor = tacticalMode
    ? 'rgba(0, 0, 0, 0.9)'
    : 'rgba(10, 10, 20, 0.92)';
  const borderColor = tacticalMode
    ? 'rgba(34,197,94,0.2)'
    : 'rgba(255,255,255,0.1)';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: `translateX(-50%) translateY(${isVisible ? 0 : 70}px)`,
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.3s ease',
        pointerEvents: isVisible ? 'auto' : 'none',
        zIndex: 40,
      }}
      onMouseEnter={resetHideTimer}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          borderRadius: 12,
          background: bgColor,
          border: `1px solid ${borderColor}`,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        <QuickActionButton
          icon={<Crosshair size={14} />}
          label="ENGAGE"
          shortcut="E"
          onClick={onEngage}
          color="#06b6d4"
          tacticalMode={tacticalMode}
          disabled={hasActiveEngagement}
        />

        <QuickActionButton
          icon={<XIcon size={14} />}
          label="DISENGAGE"
          shortcut="D"
          onClick={onDisengage}
          color="#8b5cf6"
          tacticalMode={tacticalMode}
          disabled={!hasActiveEngagement}
        />

        <Divider tacticalMode={tacticalMode} />

        <QuickActionButton
          icon={isJamming ? <ZapOff size={14} /> : <Zap size={14} />}
          label={isJamming ? 'JAM OFF' : 'JAM ON'}
          shortcut="J"
          onClick={onJamToggle}
          color={isJamming ? '#ef4444' : '#f59e0b'}
          active={isJamming}
          tacticalMode={tacticalMode}
        />

        <Divider tacticalMode={tacticalMode} />

        <QuickActionButton
          icon={<Plane size={14} />}
          label="LAUNCH"
          shortcut="L"
          onClick={onLaunch}
          color="#22c55e"
          tacticalMode={tacticalMode}
        />

        <QuickActionButton
          icon={<Home size={14} />}
          label="RECOVER"
          shortcut="R"
          onClick={onRecover}
          color="#3b82f6"
          tacticalMode={tacticalMode}
        />

        <QuickActionButton
          icon={<AlertTriangle size={14} />}
          label="FAILSAFE"
          shortcut="F"
          onClick={onFailsafe}
          color="#eab308"
          tacticalMode={tacticalMode}
        />

        <Divider tacticalMode={tacticalMode} />

        <QuickActionButton
          icon={<MessageSquare size={14} />}
          label="NOTE"
          shortcut="N"
          onClick={onNote}
          color="#a855f7"
          tacticalMode={tacticalMode}
        />
      </div>
    </div>
  );
};

const QuickActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
  color: string;
  active?: boolean;
  disabled?: boolean;
  tacticalMode: boolean;
}> = ({ icon, label, shortcut, onClick, color, active, disabled, tacticalMode }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={`${label} (${shortcut})`}
    style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '6px 10px', borderRadius: 8,
      background: active ? `${color}25` : 'transparent',
      border: active ? `1px solid ${color}40` : '1px solid transparent',
      color: disabled ? (tacticalMode ? 'rgba(74,222,128,0.2)' : '#4b5563') : color,
      cursor: disabled ? 'default' : 'pointer',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
      opacity: disabled ? 0.4 : 1,
      transition: 'all 0.15s ease',
      whiteSpace: 'nowrap',
    }}
  >
    {icon}
    {label}
  </button>
);

const Divider: React.FC<{ tacticalMode: boolean }> = ({ tacticalMode }) => (
  <div style={{
    width: 1, height: 24,
    background: tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  }} />
);

export default SessionQuickActions;
