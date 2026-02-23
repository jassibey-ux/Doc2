/**
 * SessionQuickActions — Floating action toolbar.
 *
 * IDLE:   [CUAS ▼]  [Drone ▼]  [ENGAGE]  |  LAUNCH  RECOVER  FAILSAFE  |  NOTE
 * ACTIVE: [CUAS→Drone  00:42  GPS:OK  234m]  [DISENGAGE]  |  LAUNCH  RECOVER  FAILSAFE  |  NOTE
 *
 * Jam is automatic: starts with ENGAGE, stops with DISENGAGE.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Crosshair, X as XIcon, Plane, Home,
  AlertTriangle, MessageSquare, ChevronUp,
  Wifi, WifiOff,
} from 'lucide-react';
import type { CUASPlacement, CUASProfile } from '../../types/workflow';
import type { DroneSummary } from '../../types/drone';

interface SessionQuickActionsProps {
  tacticalMode: boolean;
  isLive: boolean;
  isCompleted: boolean;
  hasActiveEngagement: boolean;
  showToolbar: boolean;

  // Selectors
  cuasPlacements: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  sessionDrones: Map<string, DroneSummary>;
  selectedCuasId: string | null;
  selectedDroneId: string | null;
  onSelectCuas: (id: string) => void;
  onSelectDrone: (id: string) => void;

  // Active engagement info
  activeCuasName?: string;
  activeDroneName?: string;
  activeElapsedSeconds?: number;
  activeDistanceM?: number;
  activeGpsOk?: boolean;

  // Actions
  onEngage: () => void;
  onDisengage: () => void;
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
  showToolbar,
  cuasPlacements,
  cuasProfiles,
  sessionDrones,
  selectedCuasId,
  selectedDroneId,
  onSelectCuas,
  onSelectDrone,
  activeCuasName,
  activeDroneName,
  activeElapsedSeconds,
  activeDistanceM,
  activeGpsOk,
  onEngage,
  onDisengage,
  onLaunch,
  onRecover,
  onFailsafe,
  onNote,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [cuasDropdownOpen, setCuasDropdownOpen] = useState(false);
  const [droneDropdownOpen, setDroneDropdownOpen] = useState(false);
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

  useEffect(() => {
    if (showToolbar) {
      setIsVisible(true);
      resetHideTimer();
    }
  }, [showToolbar, resetHideTimer]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!cuasDropdownOpen && !droneDropdownOpen) return;
    const handleClick = () => {
      setCuasDropdownOpen(false);
      setDroneDropdownOpen(false);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [cuasDropdownOpen, droneDropdownOpen]);

  // Auto-select CUAS if only 1
  useEffect(() => {
    if (!selectedCuasId && cuasPlacements.length === 1) {
      onSelectCuas(cuasPlacements[0].id);
    }
  }, [selectedCuasId, cuasPlacements, onSelectCuas]);

  // Auto-select drone if only 1
  useEffect(() => {
    if (!selectedDroneId && sessionDrones.size === 1) {
      const firstId = Array.from(sessionDrones.keys())[0];
      onSelectDrone(firstId);
    }
  }, [selectedDroneId, sessionDrones, onSelectDrone]);

  // Resolve names
  const selectedCuasName = useMemo(() => {
    if (!selectedCuasId) return null;
    const placement = cuasPlacements.find(p => p.id === selectedCuasId);
    if (!placement) return null;
    const profile = cuasProfiles?.find(p => p.id === placement.cuas_profile_id);
    return profile?.name ?? 'CUAS';
  }, [selectedCuasId, cuasPlacements, cuasProfiles]);

  const selectedDroneName = useMemo(() => {
    if (!selectedDroneId) return null;
    const drone = sessionDrones.get(selectedDroneId);
    return drone?.alias ?? selectedDroneId;
  }, [selectedDroneId, sessionDrones]);

  const canEngage = selectedCuasId && selectedDroneId && !hasActiveEngagement;

  // Format elapsed
  const elapsedStr = useMemo(() => {
    if (activeElapsedSeconds == null) return '';
    const m = Math.floor(activeElapsedSeconds / 60);
    const s = activeElapsedSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [activeElapsedSeconds]);

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
        {hasActiveEngagement ? (
          <>
            {/* Active engagement status strip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 10px', borderRadius: 8,
              background: 'rgba(6,182,212,0.1)',
              border: '1px solid rgba(6,182,212,0.2)',
              fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
              color: '#06b6d4',
            }}>
              <span>{activeCuasName ?? 'CUAS'} → {activeDroneName ?? 'Drone'}</span>
              {elapsedStr && <span style={{ color: '#fff' }}>{elapsedStr}</span>}
              {activeGpsOk != null && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  color: activeGpsOk ? '#22c55e' : '#ef4444',
                }}>
                  {activeGpsOk ? <Wifi size={9} /> : <WifiOff size={9} />}
                  {activeGpsOk ? 'GPS' : 'DENIED'}
                </span>
              )}
              {activeDistanceM != null && (
                <span style={{ color: '#94a3b8' }}>{Math.round(activeDistanceM)}m</span>
              )}
            </div>

            <QuickActionButton
              icon={<XIcon size={14} />}
              label="DISENGAGE"
              shortcut="D"
              onClick={onDisengage}
              color="#8b5cf6"
              tacticalMode={tacticalMode}
              pulsing
            />
          </>
        ) : (
          <>
            {/* CUAS selector */}
            <div style={{ position: 'relative' }}>
              <SelectorButton
                label={selectedCuasName ?? 'CUAS'}
                placeholder={!selectedCuasId}
                tacticalMode={tacticalMode}
                onClick={(e) => {
                  e.stopPropagation();
                  setCuasDropdownOpen(!cuasDropdownOpen);
                  setDroneDropdownOpen(false);
                }}
              />
              {cuasDropdownOpen && cuasPlacements.length > 1 && (
                <DropdownMenu tacticalMode={tacticalMode}>
                  {cuasPlacements.map(p => {
                    const profile = cuasProfiles?.find(pr => pr.id === p.cuas_profile_id);
                    return (
                      <DropdownItem
                        key={p.id}
                        label={profile?.name ?? 'CUAS'}
                        selected={p.id === selectedCuasId}
                        tacticalMode={tacticalMode}
                        onClick={() => {
                          onSelectCuas(p.id);
                          setCuasDropdownOpen(false);
                        }}
                      />
                    );
                  })}
                </DropdownMenu>
              )}
            </div>

            {/* Drone selector */}
            <div style={{ position: 'relative' }}>
              <SelectorButton
                label={selectedDroneName ?? 'Drone'}
                placeholder={!selectedDroneId}
                tacticalMode={tacticalMode}
                onClick={(e) => {
                  e.stopPropagation();
                  setDroneDropdownOpen(!droneDropdownOpen);
                  setCuasDropdownOpen(false);
                }}
              />
              {droneDropdownOpen && sessionDrones.size > 1 && (
                <DropdownMenu tacticalMode={tacticalMode}>
                  {Array.from(sessionDrones.entries()).map(([id, drone]) => (
                    <DropdownItem
                      key={id}
                      label={drone.alias ?? id}
                      selected={id === selectedDroneId}
                      tacticalMode={tacticalMode}
                      onClick={() => {
                        onSelectDrone(id);
                        setDroneDropdownOpen(false);
                      }}
                    />
                  ))}
                </DropdownMenu>
              )}
            </div>

            <QuickActionButton
              icon={<Crosshair size={14} />}
              label={canEngage ? `ENGAGE` : 'ENGAGE'}
              shortcut="E"
              onClick={onEngage}
              color="#06b6d4"
              tacticalMode={tacticalMode}
              disabled={!canEngage}
            />
          </>
        )}

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

const SelectorButton: React.FC<{
  label: string;
  placeholder: boolean;
  tacticalMode: boolean;
  onClick: (e: React.MouseEvent) => void;
}> = ({ label, placeholder, tacticalMode, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '5px 8px', borderRadius: 6,
      background: tacticalMode ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.06)',
      border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)'}`,
      color: placeholder
        ? (tacticalMode ? 'rgba(74,222,128,0.4)' : '#6b7280')
        : (tacticalMode ? '#4ade80' : '#e5e7eb'),
      cursor: 'pointer',
      fontSize: 10, fontWeight: 600,
      whiteSpace: 'nowrap',
      minWidth: 60,
    }}
  >
    {label}
    <ChevronUp size={10} style={{ opacity: 0.5 }} />
  </button>
);

const DropdownMenu: React.FC<{
  tacticalMode: boolean;
  children: React.ReactNode;
}> = ({ tacticalMode, children }) => (
  <div
    style={{
      position: 'absolute', bottom: '100%', left: 0,
      marginBottom: 4, minWidth: 120,
      background: tacticalMode ? 'rgba(0,0,0,0.95)' : 'rgba(15,15,25,0.95)',
      border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 8, padding: 4,
      backdropFilter: 'blur(16px)',
      boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {children}
  </div>
);

const DropdownItem: React.FC<{
  label: string;
  selected: boolean;
  tacticalMode: boolean;
  onClick: () => void;
}> = ({ label, selected, tacticalMode, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '6px 10px', borderRadius: 4,
      background: selected
        ? (tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(6,182,212,0.15)')
        : 'transparent',
      border: 'none',
      color: selected
        ? (tacticalMode ? '#4ade80' : '#06b6d4')
        : (tacticalMode ? 'rgba(74,222,128,0.7)' : '#9ca3af'),
      cursor: 'pointer',
      fontSize: 10, fontWeight: selected ? 700 : 500,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </button>
);

const QuickActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
  color: string;
  active?: boolean;
  disabled?: boolean;
  pulsing?: boolean;
  tacticalMode: boolean;
}> = ({ icon, label, shortcut, onClick, color, active, disabled, pulsing, tacticalMode }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={`${label} (${shortcut})`}
    style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '6px 10px', borderRadius: 8,
      background: active ? `${color}25` : 'transparent',
      border: pulsing ? `1px solid ${color}` : active ? `1px solid ${color}40` : '1px solid transparent',
      color: disabled ? (tacticalMode ? 'rgba(74,222,128,0.2)' : '#4b5563') : color,
      cursor: disabled ? 'default' : 'pointer',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
      opacity: disabled ? 0.4 : 1,
      transition: 'all 0.15s ease',
      whiteSpace: 'nowrap',
      animation: pulsing ? 'pulse-border 1.5s ease-in-out infinite' : undefined,
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
