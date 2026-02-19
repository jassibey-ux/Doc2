/**
 * SessionMapArea — Map container with Google 3D viewer + overlays.
 *
 * Wraps Google3DViewer in "live" mode with session-specific configuration.
 * Also handles camera preset overlay and note input.
 */

import React, { useRef } from 'react';
import Google3DViewer from '../google3d/Google3DViewer';
import type { Google3DViewerHandle } from '../google3d/Google3DViewer';
import type { DroneSummary, PositionPoint } from '../../types/drone';
import type {
  CUASPlacement, CUASProfile, SiteDefinition,
  Engagement, JamBurst, DroneProfile,
} from '../../types/workflow';

interface SessionMapAreaProps {
  site: SiteDefinition | null;
  droneHistory: Map<string, PositionPoint[]>;
  currentTime: number;
  timelineStart: number;
  currentDroneData: Map<string, DroneSummary>;
  selectedDroneId: string | null;
  onDroneClick: (droneId: string) => void;
  droneProfiles: DroneProfile[];
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
  cuasJamStates: Map<string, boolean>;
  onCuasClick: (cuasPlacementId: string) => void;
  engagementModeCuasId: string | null;
  engagements: Engagement[];
  activeBursts: Map<string, JamBurst>;
  tacticalMode: boolean;

  // Note input
  showNoteInput: boolean;
  noteText: string;
  onNoteTextChange: (text: string) => void;
  onSubmitNote: () => void;
  onCancelNote: () => void;
}

export interface SessionMapAreaHandle {
  flyTo: (lat: number, lng: number, alt: number, range?: number) => void;
  resetCamera: () => void;
}

const SessionMapArea = React.forwardRef<SessionMapAreaHandle, SessionMapAreaProps>(({
  site,
  droneHistory,
  currentTime,
  timelineStart,
  currentDroneData,
  selectedDroneId,
  onDroneClick,
  droneProfiles,
  cuasPlacements,
  cuasProfiles,
  cuasJamStates,
  onCuasClick,
  engagementModeCuasId,
  engagements,
  activeBursts,
  tacticalMode,
  showNoteInput,
  noteText,
  onNoteTextChange,
  onSubmitNote,
  onCancelNote,
}, ref) => {
  const viewerRef = useRef<Google3DViewerHandle>(null);

  React.useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, alt, range) => viewerRef.current?.flyTo(lat, lng, alt, range),
    resetCamera: () => viewerRef.current?.resetCamera(),
  }));

  return (
    <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
      <Google3DViewer
        ref={viewerRef}
        mode="live"
        site={site}
        initialCameraState={site?.camera_state_3d}
        droneHistory={droneHistory}
        currentTime={currentTime}
        timelineStart={timelineStart}
        currentDroneData={currentDroneData}
        selectedDroneId={selectedDroneId}
        onDroneClick={onDroneClick}
        droneProfiles={droneProfiles}
        cuasPlacements={cuasPlacements}
        cuasProfiles={cuasProfiles}
        cuasJamStates={cuasJamStates}
        onCuasClick={onCuasClick}
        engagementModeCuasId={engagementModeCuasId}
        engagements={engagements}
        activeBursts={activeBursts}
      />

      {/* Engagement mode indicator */}
      {engagementModeCuasId && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', borderRadius: 8,
          background: 'rgba(234,179,8,0.15)',
          border: '1px solid rgba(234,179,8,0.4)',
          color: '#fbbf24', fontSize: 12, fontWeight: 600,
          backdropFilter: 'blur(8px)',
          zIndex: 20,
        }}>
          Click a drone to create engagement
        </div>
      )}

      {/* Note input overlay */}
      {showNoteInput && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6,
          padding: 8, borderRadius: 12,
          background: tacticalMode ? 'rgba(0,0,0,0.9)' : 'rgba(10,10,20,0.92)',
          border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)'}`,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          zIndex: 30,
        }}>
          <input
            autoFocus
            type="text"
            value={noteText}
            onChange={(e) => onNoteTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmitNote();
              if (e.key === 'Escape') onCancelNote();
            }}
            placeholder="Type a note..."
            style={{
              width: 260, padding: '6px 10px', borderRadius: 6,
              background: tacticalMode ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)'}`,
              color: tacticalMode ? '#4ade80' : '#fff',
              fontSize: 12, outline: 'none',
            }}
          />
          <button
            onClick={onSubmitNote}
            style={{
              padding: '6px 12px', borderRadius: 6,
              background: 'rgba(168,85,247,0.2)',
              border: '1px solid rgba(168,85,247,0.4)',
              color: '#a855f7', fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save
          </button>
          <button
            onClick={onCancelNote}
            style={{
              padding: '6px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#6b7280', fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
});

SessionMapArea.displayName = 'SessionMapArea';

export default SessionMapArea;
