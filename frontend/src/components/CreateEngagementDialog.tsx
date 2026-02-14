/**
 * CreateEngagementDialog - Modal dialog for creating a new engagement
 * Links a CUAS system or mobile actor to one or more target drones
 */

import React, { useState } from 'react';
import type {
  CUASPlacement,
  CUASProfile,
  SessionActor,
  TrackerAssignment,
  EmitterType,
  EngagementTargetRole,
} from '../types/workflow';

export interface CreateEngagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    emitter_type: EmitterType;
    emitter_id: string;
    cuas_placement_id?: string;
    targets: Array<{
      tracker_id: string;
      drone_profile_id?: string;
      role: string;
    }>;
    name?: string;
    engagement_type?: string;
    notes?: string;
  }) => void;
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
  sessionActors: SessionActor[];
  trackerAssignments: TrackerAssignment[];
}

interface TargetEntry {
  tracker_id: string;
  drone_profile_id?: string;
  role: EngagementTargetRole;
  selected: boolean;
}

export default function CreateEngagementDialog({
  isOpen,
  onClose,
  onSubmit,
  cuasPlacements,
  cuasProfiles,
  sessionActors,
  trackerAssignments,
}: CreateEngagementDialogProps) {
  const [emitterType, setEmitterType] = useState<EmitterType>('cuas_system');
  const [selectedEmitterId, setSelectedEmitterId] = useState('');
  const [targets, setTargets] = useState<TargetEntry[]>(() =>
    trackerAssignments.map((ta) => ({
      tracker_id: ta.tracker_id,
      drone_profile_id: ta.drone_profile_id,
      role: 'primary_target' as EngagementTargetRole,
      selected: false,
    }))
  );
  const [name, setName] = useState('');
  const [useAutoName, setUseAutoName] = useState(true);
  const [engagementType, setEngagementType] = useState<string>('test');
  const [notes, setNotes] = useState('');

  // Reset state when trackerAssignments change (dialog reopens)
  React.useEffect(() => {
    if (isOpen) {
      setTargets(
        trackerAssignments.map((ta) => ({
          tracker_id: ta.tracker_id,
          drone_profile_id: ta.drone_profile_id,
          role: 'primary_target' as EngagementTargetRole,
          selected: false,
        }))
      );
      setSelectedEmitterId('');
      setName('');
      setUseAutoName(true);
      setEngagementType('test');
      setNotes('');
      setEmitterType('cuas_system');
    }
  }, [isOpen, trackerAssignments]);

  if (!isOpen) return null;

  const profilesMap = new Map<string, CUASProfile>();
  cuasProfiles.forEach((p) => profilesMap.set(p.id, p));

  const getCuasLabel = (placement: CUASPlacement): string => {
    const profile = profilesMap.get(placement.cuas_profile_id);
    return profile ? `${profile.name} (${profile.vendor})` : `Placement ${placement.id.slice(0, 8)}`;
  };

  const selectedTargets = targets.filter((t) => t.selected);
  const hasEmitter = selectedEmitterId !== '';
  const hasTargets = selectedTargets.length > 0;
  const canSubmit = hasEmitter && hasTargets;

  const handleToggleTarget = (trackerId: string) => {
    setTargets((prev) =>
      prev.map((t) =>
        t.tracker_id === trackerId ? { ...t, selected: !t.selected } : t
      )
    );
  };

  const handleRoleChange = (trackerId: string, role: EngagementTargetRole) => {
    setTargets((prev) =>
      prev.map((t) =>
        t.tracker_id === trackerId ? { ...t, role } : t
      )
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;

    const submitTargets = selectedTargets.map((t) => ({
      tracker_id: t.tracker_id,
      drone_profile_id: t.drone_profile_id,
      role: t.role,
    }));

    const resolvedName = useAutoName ? undefined : name || undefined;

    // For cuas_system, also pass the cuas_placement_id
    const cuasPlacementId =
      emitterType === 'cuas_system' ? selectedEmitterId : undefined;

    onSubmit({
      emitter_type: emitterType,
      emitter_id: selectedEmitterId,
      cuas_placement_id: cuasPlacementId,
      targets: submitTargets,
      name: resolvedName,
      engagement_type: engagementType,
      notes: notes || undefined,
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // --- Styles ---

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(4px)',
  };

  const panelStyle: React.CSSProperties = {
    background: '#1a1a2e',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    width: 520,
    maxHeight: '85vh',
    overflowY: 'auto',
    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const headerStyle: React.CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    margin: 0,
  };

  const closeBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 4,
    lineHeight: 1,
  };

  const bodyStyle: React.CSSProperties = {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'rgba(255, 255, 255, 0.45)',
    marginBottom: 6,
  };

  const radioGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 6,
    padding: 3,
  };

  const radioButtonStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'all 0.15s',
    background: active ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
    color: active ? '#06b6d4' : 'rgba(255, 255, 255, 0.5)',
    outline: active ? '1px solid rgba(6, 182, 212, 0.3)' : 'none',
  });

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 12,
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    outline: 'none',
    appearance: 'auto' as React.CSSProperties['appearance'],
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 12,
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 60,
    resize: 'vertical',
    fontFamily: 'inherit',
  };

  const targetListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: 180,
    overflowY: 'auto',
  };

  const targetRowStyle = (selected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: selected
      ? 'rgba(6, 182, 212, 0.08)'
      : 'rgba(255, 255, 255, 0.02)',
    border: `1px solid ${selected ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  const checkboxStyle = (checked: boolean): React.CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: 3,
    border: `1.5px solid ${checked ? '#06b6d4' : 'rgba(255, 255, 255, 0.25)'}`,
    background: checked ? 'rgba(6, 182, 212, 0.3)' : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 10,
    color: '#fff',
    fontWeight: 700,
  });

  const roleSelectStyle: React.CSSProperties = {
    padding: '3px 6px',
    fontSize: 10,
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    color: 'rgba(255, 255, 255, 0.7)',
    outline: 'none',
    marginLeft: 'auto',
    appearance: 'auto' as React.CSSProperties['appearance'],
  };

  const footerStyle: React.CSSProperties = {
    padding: '12px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  };

  const cancelBtnStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 6,
    border: '1px solid rgba(255, 255, 255, 0.12)',
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const submitBtnStyle: React.CSSProperties = {
    padding: '8px 20px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: 'none',
    background: canSubmit ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.04)',
    color: canSubmit ? '#06b6d4' : 'rgba(255, 255, 255, 0.2)',
    cursor: canSubmit ? 'pointer' : 'not-allowed',
    transition: 'all 0.15s',
  };

  const autoNameRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  };

  const autoNameLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };

  return (
    <div style={overlayStyle} onClick={handleBackdropClick}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={titleStyle}>New Engagement</h3>
          <button
            style={closeBtnStyle}
            onClick={onClose}
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Emitter Type Toggle */}
          <div>
            <div style={sectionLabelStyle}>Emitter Source</div>
            <div style={radioGroupStyle}>
              <button
                style={radioButtonStyle(emitterType === 'cuas_system')}
                onClick={() => {
                  setEmitterType('cuas_system');
                  setSelectedEmitterId('');
                }}
              >
                CUAS System
              </button>
              <button
                style={radioButtonStyle(emitterType === 'actor')}
                onClick={() => {
                  setEmitterType('actor');
                  setSelectedEmitterId('');
                }}
              >
                Mobile Actor
              </button>
            </div>
          </div>

          {/* Emitter Selection */}
          <div>
            <div style={sectionLabelStyle}>
              {emitterType === 'cuas_system' ? 'CUAS Placement' : 'Actor'}
            </div>
            <select
              style={selectStyle}
              value={selectedEmitterId}
              onChange={(e) => setSelectedEmitterId(e.target.value)}
            >
              <option value="">
                -- Select {emitterType === 'cuas_system' ? 'a CUAS placement' : 'an actor'} --
              </option>
              {emitterType === 'cuas_system'
                ? cuasPlacements
                    .filter((p) => p.active)
                    .map((placement) => (
                      <option key={placement.id} value={placement.id}>
                        {getCuasLabel(placement)}
                      </option>
                    ))
                : sessionActors
                    .filter((a) => a.is_active)
                    .map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.name}
                        {actor.callsign ? ` (${actor.callsign})` : ''}
                      </option>
                    ))}
            </select>
          </div>

          {/* Target Trackers */}
          <div>
            <div style={sectionLabelStyle}>
              Target Drones ({selectedTargets.length} selected)
            </div>
            {targets.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255, 255, 255, 0.3)',
                  padding: '12px 10px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 6,
                }}
              >
                No tracker assignments in this session
              </div>
            ) : (
              <div style={targetListStyle}>
                {targets.map((target) => (
                  <div
                    key={target.tracker_id}
                    style={targetRowStyle(target.selected)}
                    onClick={() => handleToggleTarget(target.tracker_id)}
                  >
                    <div style={checkboxStyle(target.selected)}>
                      {target.selected ? '\u2713' : ''}
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: target.selected
                          ? 'rgba(255, 255, 255, 0.9)'
                          : 'rgba(255, 255, 255, 0.6)',
                        flex: 1,
                      }}
                    >
                      Tracker {target.tracker_id}
                    </span>
                    {target.selected && (
                      <select
                        style={roleSelectStyle}
                        value={target.role}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleRoleChange(
                            target.tracker_id,
                            e.target.value as EngagementTargetRole
                          )
                        }
                      >
                        <option value="primary_target">Primary Target</option>
                        <option value="observer">Observer</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <div style={sectionLabelStyle}>Engagement Name</div>
            <div style={autoNameRowStyle}>
              <label style={autoNameLabelStyle}>
                <input
                  type="checkbox"
                  checked={useAutoName}
                  onChange={(e) => setUseAutoName(e.target.checked)}
                  style={{ accentColor: '#06b6d4' }}
                />
                Auto-generate name (Run N)
              </label>
            </div>
            {!useAutoName && (
              <input
                type="text"
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Run 1 - GPS denial at 200m"
              />
            )}
          </div>

          {/* Engagement Type */}
          <div>
            <div style={sectionLabelStyle}>Engagement Type</div>
            <select
              style={selectStyle}
              value={engagementType}
              onChange={(e) => setEngagementType(e.target.value)}
            >
              <option value="test">Test</option>
              <option value="control">Control</option>
              <option value="operational">Operational</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <div style={sectionLabelStyle}>Notes (optional)</div>
            <textarea
              style={textareaStyle as React.CSSProperties}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Test conditions, objectives, expected outcomes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button style={cancelBtnStyle} onClick={onClose}>
            Cancel
          </button>
          <button
            style={submitBtnStyle}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Create Engagement
          </button>
        </div>
      </div>
    </div>
  );
}
