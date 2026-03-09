/**
 * SessionDetailPanel — Right 320px contextual detail panel.
 *
 * Not tabbed — shows whichever entity was last selected:
 * 1. Drone detail (tracker clicked) - position, telemetry, GPS, signal, battery
 * 2. Engagement detail (engagement clicked) - expanded metrics, burst timeline
 * 3. CUAS detail (CUAS clicked) - profile specs, jam history
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { X, Navigation, Crosshair, Zap, ZapOff, XCircle, Brain, Loader2 } from 'lucide-react';
import type { DroneSummary } from '../../types/drone';
import type { DroneProfile, CUASPlacement, CUASProfile, Engagement, JamBurst, TrackerAssignment } from '../../types/workflow';
import type { JamOnParams } from '../../contexts/TestSessionPhaseContext';
import StreamingLogPanel from '../table/StreamingLogPanel';
import type { TelemetryRow } from '../table/types';
import ModelThumbnailButton from '../ModelThumbnailButton';
import { DRONE_MODELS as DRONE_MODELS_IMPORT, CUAS_MODELS as CUAS_MODELS_IMPORT } from '../../utils/modelRegistry';

export type DetailContext =
  | { type: 'drone'; droneId: string }
  | { type: 'engagement'; engagementId: string }
  | { type: 'cuas'; cuasId: string }
  | { type: 'log' }
  | null;

interface SessionDetailPanelProps {
  context: DetailContext;
  tacticalMode: boolean;
  onClose: () => void;
  sessionId?: string;

  // Drone data
  drones: Map<string, DroneSummary>;
  onFlyToDrone: (droneId: string) => void;
  onTrackDrone: (droneId: string) => void;
  trackingDroneId: string | null;

  // Engagement data
  engagements: Engagement[];

  // CUAS data
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
  cuasJamStates: Map<string, boolean>;

  // Streaming log data
  sessionTrackerIds?: Set<string>;
  onLogRowClick?: (row: TelemetryRow) => void;

  // Engagement data for streaming log
  activeEngagements?: Map<string, Engagement>;

  // CUAS engagement/jam controls
  activeBursts?: Map<string, JamBurst>;
  isLive?: boolean;
  trackerAssignments?: TrackerAssignment[];
  onCuasEngage?: (cuasPlacementId: string, trackerIds: string[]) => void;
  onCuasJamOn?: (engagementId: string, params?: JamOnParams) => void;
  onCuasJamOff?: (engagementId: string) => void;
  onCuasDisengage?: (engagementId: string) => void;

  // Model override
  droneProfileMap?: Map<string, DroneProfile>;
  onDroneModelOverride?: (trackerId: string, modelId: string | undefined) => void;
  onCuasModelOverride?: (cuasPlacementId: string, modelId: string | undefined) => void;
}

const PANEL_WIDTH = 320;

const SessionDetailPanel: React.FC<SessionDetailPanelProps> = ({
  context,
  tacticalMode,
  onClose,
  sessionId,
  drones,
  onFlyToDrone,
  onTrackDrone,
  trackingDroneId,
  engagements,
  cuasPlacements,
  cuasProfiles,
  cuasJamStates,
  sessionTrackerIds,
  onLogRowClick,
  activeEngagements,
  activeBursts,
  isLive,
  trackerAssignments,
  onCuasEngage,
  onCuasJamOn,
  onCuasJamOff,
  onCuasDisengage,
  droneProfileMap,
  onDroneModelOverride,
  onCuasModelOverride,
}) => {
  if (!context) return null;

  const bgColor = tacticalMode ? 'rgba(0, 0, 0, 0.95)' : 'rgba(10, 10, 20, 0.95)';
  const borderColor = tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)';

  return (
    <div style={{
      width: PANEL_WIDTH,
      flexShrink: 0,
      background: bgColor,
      borderLeft: `1px solid ${borderColor}`,
      backdropFilter: 'blur(16px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: tacticalMode ? '#4ade80' : '#e5e7eb',
    }}>
      {context.type === 'drone' && (
        <DroneDetail
          key={context.droneId}
          drone={drones.get(context.droneId)}
          droneId={context.droneId}
          onClose={onClose}
          onFlyTo={() => onFlyToDrone(context.droneId)}
          onTrack={() => onTrackDrone(context.droneId)}
          isTracking={trackingDroneId === context.droneId}
          tacticalMode={tacticalMode}
          onLogRowClick={onLogRowClick}
          droneProfile={droneProfileMap?.get(context.droneId)}
          onModelOverride={onDroneModelOverride ? (modelId) => onDroneModelOverride(context.droneId, modelId) : undefined}
        />
      )}
      {context.type === 'engagement' && (
        <EngagementDetail
          engagement={engagements.find(e => e.id === context.engagementId)}
          onClose={onClose}
          tacticalMode={tacticalMode}
          sessionId={sessionId}
        />
      )}
      {context.type === 'cuas' && (
        <CuasDetail
          placement={cuasPlacements.find(p => p.id === context.cuasId)}
          profiles={cuasProfiles}
          isJamming={cuasJamStates.get(context.cuasId) ?? false}
          onClose={onClose}
          tacticalMode={tacticalMode}
          activeEngagements={activeEngagements}
          activeBursts={activeBursts}
          isLive={isLive}
          trackerAssignments={trackerAssignments}
          onCuasEngage={onCuasEngage}
          onCuasJamOn={onCuasJamOn}
          onCuasJamOff={onCuasJamOff}
          onCuasDisengage={onCuasDisengage}
          onModelOverride={onCuasModelOverride ? (modelId) => onCuasModelOverride(context.cuasId, modelId) : undefined}
        />
      )}
      {context.type === 'log' && (
        <>
          <CloseHeader title="Live Data Log" onClose={onClose} tacticalMode={tacticalMode} />
          <StreamingLogPanel
            trackerFilter={sessionTrackerIds}
            onRowClick={onLogRowClick}
            tacticalMode={tacticalMode}
            activeEngagements={activeEngagements}
          />
        </>
      )}
    </div>
  );
};

// ─── Drone Detail ────────────────────────────────────────────────────────────

const DroneDetail: React.FC<{
  drone: DroneSummary | undefined;
  droneId: string;
  onClose: () => void;
  onFlyTo: () => void;
  onTrack: () => void;
  isTracking: boolean;
  tacticalMode: boolean;
  onLogRowClick?: (row: TelemetryRow) => void;
  droneProfile?: DroneProfile;
  onModelOverride?: (modelId: string | undefined) => void;
}> = ({ drone, droneId, onClose, onFlyTo, onTrack, isTracking, tacticalMode, onLogRowClick, droneProfile, onModelOverride }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'logs'>('details');
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  const accentColor = tacticalMode ? '#4ade80' : '#60a5fa';

  if (!drone) {
    return (
      <div style={{ padding: 16 }}>
        <CloseHeader title={droneId} onClose={onClose} tacticalMode={tacticalMode} />
        <div style={{ color: dimColor, fontSize: 12, marginTop: 12 }}>
          Tracker not connected
        </div>
      </div>
    );
  }

  const displayName = drone.alias ?? drone.tracker_id;

  return (
    <>
      <CloseHeader title={displayName} onClose={onClose} tacticalMode={tacticalMode} />

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)'}`,
        flexShrink: 0,
      }}>
        {(['details', 'logs'] as const).map(tab => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? accentColor : 'transparent'}`,
                color: isActive ? accentColor : dimColor,
                fontSize: 11,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab === 'details' ? 'Details' : 'Logs'}
            </button>
          );
        })}
      </div>

      {activeTab === 'details' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {/* Status badge */}
          <div style={{
            display: 'inline-block',
            padding: '2px 8px', borderRadius: 4,
            background: drone.is_stale ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.15)',
            border: `1px solid ${drone.is_stale ? 'rgba(107,114,128,0.3)' : 'rgba(34,197,94,0.3)'}`,
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            color: drone.is_stale ? '#6b7280' : '#22c55e',
            marginBottom: 12,
          }}>
            {drone.is_stale ? 'STALE' : 'ACTIVE'}
          </div>

          {/* Telemetry grid */}
          <SectionLabel tacticalMode={tacticalMode}>Telemetry</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
            <TelemetryItem label="Altitude" value={drone.alt_m != null ? `${Math.round(drone.alt_m)}m` : '--'} tacticalMode={tacticalMode} />
            <TelemetryItem label="Speed" value={drone.speed_mps != null ? `${drone.speed_mps.toFixed(1)} m/s` : '--'} tacticalMode={tacticalMode} />
            <TelemetryItem label="Signal" value={drone.rssi_dbm != null ? `${drone.rssi_dbm} dBm` : '--'} tacticalMode={tacticalMode} />
            <TelemetryItem label="GPS Fix" value={drone.fix_valid ? 'Valid' : 'No Fix'} color={drone.fix_valid ? '#22c55e' : '#ef4444'} tacticalMode={tacticalMode} />
            <TelemetryItem label="Data Age" value={`${drone.age_seconds}s`} color={drone.is_stale ? '#ef4444' : undefined} tacticalMode={tacticalMode} />
            {drone.battery_mv != null && (
              <TelemetryItem label="Battery" value={`${(drone.battery_mv / 1000).toFixed(1)}V`} color={drone.low_battery ? '#ef4444' : undefined} tacticalMode={tacticalMode} />
            )}
          </div>

          {/* Camera actions */}
          <SectionLabel tacticalMode={tacticalMode}>Camera</SectionLabel>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <ActionButton icon={<Navigation size={13} />} label="Fly To" onClick={onFlyTo} tacticalMode={tacticalMode} />
            <ActionButton icon={<Crosshair size={13} />} label={isTracking ? 'Tracking' : 'Track'} onClick={onTrack} active={isTracking} tacticalMode={tacticalMode} />
          </div>

          {/* 3D Model */}
          {onModelOverride && (
            <>
              <SectionLabel tacticalMode={tacticalMode}>3D Model</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <ModelThumbnailButton
                  modelCategory="drone"
                  currentModelId={droneProfile?.model_3d}
                  onModelChange={onModelOverride}
                  size={36}
                />
                <span style={{ fontSize: 11, color: dimColor }}>
                  {droneProfile?.model_3d
                    ? (DRONE_MODELS_IMPORT[droneProfile.model_3d]?.label ?? droneProfile.model_3d)
                    : 'Auto'}
                </span>
              </div>
            </>
          )}

          {/* Position */}
          {drone.lat != null && drone.lon != null && (
            <>
              <SectionLabel tacticalMode={tacticalMode}>Position</SectionLabel>
              <div style={{ fontSize: 11, color: dimColor, fontFamily: 'monospace' }}>
                {drone.lat.toFixed(6)}, {drone.lon.toFixed(6)}
              </div>
            </>
          )}
        </div>
      ) : (
        <StreamingLogPanel
          trackerFilter={new Set([droneId])}
          onRowClick={onLogRowClick}
          tacticalMode={tacticalMode}
        />
      )}
    </>
  );
};

// ─── Engagement Detail ───────────────────────────────────────────────────────

const EngagementDetail: React.FC<{
  engagement: Engagement | undefined;
  onClose: () => void;
  tacticalMode: boolean;
  sessionId?: string;
}> = ({ engagement, onClose, tacticalMode, sessionId }) => {
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Load existing AI insight when engagement changes
  useEffect(() => {
    setAiInsight(engagement?.ai_insight ?? null);
    setAiError(null);
  }, [engagement?.id, engagement?.ai_insight]);

  const handleRequestAiInsight = useCallback(async () => {
    if (!sessionId || !engagement?.id) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/engagements/${sessionId}/${engagement.id}/ai-insight`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAiInsight(data.insight);
    } catch (err: any) {
      setAiError(err.message || 'Failed to get AI insight');
    } finally {
      setAiLoading(false);
    }
  }, [sessionId, engagement?.id]);
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';

  if (!engagement) {
    return (
      <div style={{ padding: 16 }}>
        <CloseHeader title="Engagement" onClose={onClose} tacticalMode={tacticalMode} />
        <div style={{ color: dimColor, fontSize: 12 }}>Engagement not found</div>
      </div>
    );
  }

  const metrics = engagement.metrics;

  return (
    <>
      <CloseHeader
        title={engagement.name || `Engagement #${engagement.run_number ?? '?'}`}
        onClose={onClose}
        tacticalMode={tacticalMode}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {/* Status */}
        <div style={{
          display: 'inline-block',
          padding: '2px 8px', borderRadius: 4,
          background: engagement.status === 'active' ? 'rgba(6,182,212,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${engagement.status === 'active' ? 'rgba(6,182,212,0.3)' : 'rgba(34,197,94,0.3)'}`,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
          color: engagement.status === 'active' ? '#06b6d4' : '#22c55e',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}>
          {engagement.status}
        </div>

        {/* Timing */}
        <SectionLabel tacticalMode={tacticalMode}>Timing</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
          {engagement.engage_timestamp && (
            <TelemetryItem
              label="Engage"
              value={new Date(engagement.engage_timestamp).toLocaleTimeString('en-US', { hour12: false })}
              tacticalMode={tacticalMode}
            />
          )}
          {engagement.disengage_timestamp && (
            <TelemetryItem
              label="Disengage"
              value={new Date(engagement.disengage_timestamp).toLocaleTimeString('en-US', { hour12: false })}
              tacticalMode={tacticalMode}
            />
          )}
        </div>

        {/* Metrics */}
        {metrics && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>Metrics</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
              {metrics.time_to_effect_s != null && (
                <TelemetryItem label="Time to Effect" value={`${metrics.time_to_effect_s.toFixed(1)}s`} tacticalMode={tacticalMode} />
              )}
              {metrics.effective_range_m != null && (
                <TelemetryItem label="Eff. Range" value={`${Math.round(metrics.effective_range_m)}m`} tacticalMode={tacticalMode} />
              )}
              {metrics.denial_duration_s != null && (
                <TelemetryItem label="Denial Duration" value={`${metrics.denial_duration_s.toFixed(1)}s`} tacticalMode={tacticalMode} />
              )}
              {metrics.recovery_time_s != null && (
                <TelemetryItem label="Recovery" value={`${metrics.recovery_time_s.toFixed(1)}s`} tacticalMode={tacticalMode} />
              )}
              {metrics.max_drift_m != null && (
                <TelemetryItem label="Max Drift" value={`${Math.round(metrics.max_drift_m)}m`} tacticalMode={tacticalMode} />
              )}
              <TelemetryItem
                label="Failsafe"
                value={metrics.failsafe_triggered ? (metrics.failsafe_type || 'YES') : 'No'}
                color={metrics.failsafe_triggered ? '#f59e0b' : undefined}
                tacticalMode={tacticalMode}
              />
            </div>
          </>
        )}

        {/* Bursts */}
        {engagement.bursts && engagement.bursts.length > 0 && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>Jam Bursts ({engagement.bursts.length})</SectionLabel>
            <div style={{ marginBottom: 16 }}>
              {engagement.bursts.map((burst) => (
                <div
                  key={burst.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 0', fontSize: 11,
                    borderBottom: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.04)'}`,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', color: dimColor, fontSize: 10 }}>
                    #{burst.burst_seq}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: dimColor, fontSize: 10 }}>
                    {new Date(burst.jam_on_at).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  {burst.duration_s != null && (
                    <span style={{ fontFamily: 'monospace', color: tacticalMode ? '#4ade80' : '#fff' }}>
                      {burst.duration_s.toFixed(1)}s
                    </span>
                  )}
                  {!burst.jam_off_at && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#ef4444',
                      animation: 'pulse-live 1.5s ease-in-out infinite',
                    }}>
                      ACTIVE
                    </span>
                  )}
                  {burst.gps_denial_detected && (
                    <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>
                      GPS DENIED
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Targets */}
        {engagement.targets && engagement.targets.length > 0 && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>Targets</SectionLabel>
            {engagement.targets.map(target => (
              <div key={target.id} style={{
                fontSize: 11, color: dimColor, fontFamily: 'monospace',
                padding: '2px 0',
              }}>
                {target.tracker_id}
                {target.initial_range_m != null && ` — ${Math.round(target.initial_range_m)}m`}
                {target.role === 'observer' && ' (observer)'}
              </div>
            ))}
          </>
        )}

        {/* AI Assessment */}
        {engagement.status === 'complete' && sessionId && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Brain size={11} style={{ color: '#06b6d4' }} />
                AI Assessment
              </span>
            </SectionLabel>
            {aiInsight ? (
              <div style={{
                fontSize: 11, lineHeight: 1.6, color: tacticalMode ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.7)',
                fontStyle: 'italic',
                padding: '8px 10px',
                borderLeft: '2px solid #06b6d4',
                background: 'rgba(6,182,212,0.06)',
                borderRadius: '0 4px 4px 0',
                marginBottom: 16,
              }}>
                {aiInsight}
              </div>
            ) : aiLoading ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: '#06b6d4', padding: '8px 0', marginBottom: 16,
              }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                Analyzing engagement...
              </div>
            ) : aiError ? (
              <div style={{ fontSize: 11, color: '#ef4444', padding: '4px 0', marginBottom: 8 }}>
                {aiError}
                <button
                  onClick={handleRequestAiInsight}
                  style={{
                    marginLeft: 8, fontSize: 10, color: '#06b6d4',
                    background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <button
                onClick={handleRequestAiInsight}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', marginBottom: 16,
                  fontSize: 10, fontWeight: 600,
                  color: '#06b6d4', background: 'rgba(6,182,212,0.1)',
                  border: '1px solid rgba(6,182,212,0.2)',
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                <Brain size={11} />
                Get AI Insight
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
};

// ─── CUAS Detail ─────────────────────────────────────────────────────────────

const CuasDetail: React.FC<{
  placement: CUASPlacement | undefined;
  profiles: CUASProfile[];
  isJamming: boolean;
  onClose: () => void;
  tacticalMode: boolean;
  activeEngagements?: Map<string, Engagement>;
  activeBursts?: Map<string, JamBurst>;
  isLive?: boolean;
  trackerAssignments?: TrackerAssignment[];
  onCuasEngage?: (cuasPlacementId: string, trackerIds: string[]) => void;
  onCuasJamOn?: (engagementId: string, params?: JamOnParams) => void;
  onCuasJamOff?: (engagementId: string) => void;
  onCuasDisengage?: (engagementId: string) => void;
  onModelOverride?: (modelId: string | undefined) => void;
}> = ({
  placement, profiles, isJamming, onClose, tacticalMode,
  activeEngagements, activeBursts, isLive,
  trackerAssignments, onCuasEngage, onCuasJamOn, onCuasJamOff, onCuasDisengage,
  onModelOverride,
}) => {
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';

  // Local UI state
  const [showTrackerPicker, setShowTrackerPicker] = useState(false);
  const [selectedTrackerIds, setSelectedTrackerIds] = useState<string[]>([]);
  const [showJamForm, setShowJamForm] = useState(false);
  const [jamParams, setJamParams] = useState<JamOnParams>({});
  const [engageLoading, setEngageLoading] = useState(false);
  const [jamLoading, setJamLoading] = useState(false);

  // Elapsed timer for active burst
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Find engagement for this CUAS placement
  const cuasEngagement = useMemo(() => {
    if (!activeEngagements || !placement) return undefined;
    for (const eng of activeEngagements.values()) {
      if (eng.cuas_placement_id === placement.id) return eng;
    }
    return undefined;
  }, [activeEngagements, placement]);

  // Find active burst for engagement
  const activeBurst = useMemo(() => {
    if (!cuasEngagement || !activeBursts) return undefined;
    return activeBursts.get(cuasEngagement.id);
  }, [cuasEngagement, activeBursts]);

  const hasActiveBurst = !!activeBurst;

  // Elapsed timer for active burst
  useEffect(() => {
    if (activeBurst?.jam_on_at) {
      const start = new Date(activeBurst.jam_on_at).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      timerRef.current = setInterval(tick, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [activeBurst?.jam_on_at]);

  // Reset UI state when engagement changes
  useEffect(() => {
    setShowTrackerPicker(false);
    setSelectedTrackerIds([]);
    setShowJamForm(false);
    setJamParams({});
  }, [cuasEngagement?.id]);

  const handleToggleTracker = useCallback((trackerId: string) => {
    setSelectedTrackerIds(prev =>
      prev.includes(trackerId)
        ? prev.filter(id => id !== trackerId)
        : [...prev, trackerId]
    );
  }, []);

  const handleConfirmEngage = useCallback(async () => {
    if (!placement || selectedTrackerIds.length === 0 || !onCuasEngage) return;
    setEngageLoading(true);
    try {
      await onCuasEngage(placement.id, selectedTrackerIds);
      setShowTrackerPicker(false);
      setSelectedTrackerIds([]);
    } finally {
      setEngageLoading(false);
    }
  }, [placement, selectedTrackerIds, onCuasEngage]);

  const handleConfirmJam = useCallback(async () => {
    if (!cuasEngagement || !onCuasJamOn) return;
    setJamLoading(true);
    try {
      await onCuasJamOn(cuasEngagement.id, jamParams);
      setShowJamForm(false);
      setJamParams({});
    } finally {
      setJamLoading(false);
    }
  }, [cuasEngagement, jamParams, onCuasJamOn]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!placement) {
    return (
      <div style={{ padding: 16 }}>
        <CloseHeader title="CUAS" onClose={onClose} tacticalMode={tacticalMode} />
        <div style={{ color: dimColor, fontSize: 12 }}>CUAS placement not found</div>
      </div>
    );
  }

  const profile = profiles.find(p => p.id === placement.cuas_profile_id);

  return (
    <>
      <CloseHeader
        title={profile?.name ?? `CUAS ${placement.id.slice(0, 8)}`}
        onClose={onClose}
        tacticalMode={tacticalMode}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {/* Status */}
        <div style={{
          display: 'inline-block',
          padding: '2px 8px', borderRadius: 4,
          background: isJamming ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${isJamming ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
          color: isJamming ? '#ef4444' : '#22c55e',
          marginBottom: 12,
          animation: isJamming ? 'pulse-live 1.5s ease-in-out infinite' : undefined,
        }}>
          {isJamming ? 'JAMMING' : 'IDLE'}
        </div>

        {/* Profile specs */}
        {profile && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>Specifications</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
              <TelemetryItem label="Type" value={profile.type.toUpperCase()} tacticalMode={tacticalMode} />
              <TelemetryItem label="Vendor" value={profile.vendor} tacticalMode={tacticalMode} />
              <TelemetryItem label="Eff. Range" value={`${profile.effective_range_m}m`} tacticalMode={tacticalMode} />
              {profile.beam_width_deg != null && (
                <TelemetryItem label="Beam Width" value={`${profile.beam_width_deg}°`} tacticalMode={tacticalMode} />
              )}
              {profile.power_output_w != null && (
                <TelemetryItem label="Power" value={`${profile.power_output_w}W`} tacticalMode={tacticalMode} />
              )}
              {profile.antenna_gain_dbi != null && (
                <TelemetryItem label="Gain" value={`${profile.antenna_gain_dbi} dBi`} tacticalMode={tacticalMode} />
              )}
            </div>
          </>
        )}

        {/* 3D Model */}
        {onModelOverride && (
          <>
            <SectionLabel tacticalMode={tacticalMode}>3D Model</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <ModelThumbnailButton
                modelCategory="cuas"
                currentModelId={placement.model_3d_override ?? profile?.type}
                onModelChange={onModelOverride}
                size={36}
                showAuto={false}
              />
              <span style={{ fontSize: 11, color: dimColor }}>
                {placement.model_3d_override
                  ? (CUAS_MODELS_IMPORT[placement.model_3d_override]?.label ?? placement.model_3d_override)
                  : (profile?.type?.toUpperCase() ?? 'Default')}
              </span>
            </div>
          </>
        )}

        {/* Position */}
        <SectionLabel tacticalMode={tacticalMode}>Position</SectionLabel>
        <div style={{ fontSize: 11, color: dimColor, fontFamily: 'monospace', marginBottom: 8 }}>
          {placement.position?.lat?.toFixed(6) ?? '?'}, {placement.position?.lon?.toFixed(6) ?? '?'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
          <TelemetryItem label="Height AGL" value={`${placement.height_agl_m}m`} tacticalMode={tacticalMode} />
          <TelemetryItem label="Orientation" value={`${placement.orientation_deg}°`} tacticalMode={tacticalMode} />
        </div>

        {/* ─── Actions ─────────────────────────────────────────────────── */}
        {isLive && (
          <>
            <SectionLabel tacticalMode={tacticalMode} style={{ marginTop: 8 }}>Actions</SectionLabel>

            {/* State A: No active engagement */}
            {!cuasEngagement && (
              <>
                {!showTrackerPicker ? (
                  <button
                    onClick={() => setShowTrackerPicker(true)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                      color: '#22c55e', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Crosshair size={14} /> Engage
                  </button>
                ) : (
                  <div style={{
                    border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 6, padding: 10, marginBottom: 8,
                    background: tacticalMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.03)',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: dimColor, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Select Targets
                    </div>
                    {(!trackerAssignments || trackerAssignments.length === 0) ? (
                      <div style={{ fontSize: 11, color: dimColor, fontStyle: 'italic' }}>No trackers assigned</div>
                    ) : (
                      trackerAssignments.map(ta => (
                        <label
                          key={ta.tracker_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                            cursor: 'pointer', fontSize: 12, color: tacticalMode ? '#4ade80' : '#d1d5db',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedTrackerIds.includes(ta.tracker_id)}
                            onChange={() => handleToggleTracker(ta.tracker_id)}
                            style={{ accentColor: '#22c55e' }}
                          />
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: ta.session_color || '#666', flexShrink: 0,
                          }} />
                          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {ta.tracker_id}
                          </span>
                        </label>
                      ))
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={handleConfirmEngage}
                        disabled={selectedTrackerIds.length === 0 || engageLoading}
                        style={{
                          flex: 1, padding: '6px 10px', borderRadius: 5,
                          background: selectedTrackerIds.length > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${selectedTrackerIds.length > 0 ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)'}`,
                          color: selectedTrackerIds.length > 0 ? '#22c55e' : '#555',
                          fontSize: 11, fontWeight: 600, cursor: selectedTrackerIds.length > 0 ? 'pointer' : 'not-allowed',
                          opacity: engageLoading ? 0.6 : 1,
                        }}
                      >
                        {engageLoading ? 'Engaging...' : `Confirm Engage (${selectedTrackerIds.length})`}
                      </button>
                      <button
                        onClick={() => { setShowTrackerPicker(false); setSelectedTrackerIds([]); }}
                        style={{
                          padding: '6px 10px', borderRadius: 5,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#888', fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* State B: Active engagement, no jam burst */}
            {cuasEngagement && !hasActiveBurst && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Engagement info badge */}
                <div style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)',
                  fontSize: 11, color: '#22d3ee', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Crosshair size={12} />
                  Engaged: {cuasEngagement.targets?.length ?? 0} target(s)
                </div>

                {/* Jam On button / form */}
                {!showJamForm ? (
                  <button
                    onClick={() => setShowJamForm(true)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                      color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Zap size={14} /> Jam On
                  </button>
                ) : (
                  <div style={{
                    border: `1px solid ${tacticalMode ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)'}`,
                    borderRadius: 6, padding: 10,
                    background: tacticalMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.03)',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: dimColor, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Jam Parameters
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <JamParamInput
                        label="Frequency (MHz)"
                        placeholder="e.g. 2400"
                        value={jamParams.frequency_mhz}
                        onChange={v => setJamParams(p => ({ ...p, frequency_mhz: v }))}
                        tacticalMode={tacticalMode}
                      />
                      <JamParamInput
                        label="Power (dBm)"
                        placeholder="e.g. 30"
                        value={jamParams.power_dbm}
                        onChange={v => setJamParams(p => ({ ...p, power_dbm: v }))}
                        tacticalMode={tacticalMode}
                      />
                      <JamParamInput
                        label="Bandwidth (MHz)"
                        placeholder="e.g. 20"
                        value={jamParams.bandwidth_mhz}
                        onChange={v => setJamParams(p => ({ ...p, bandwidth_mhz: v }))}
                        tacticalMode={tacticalMode}
                      />
                      <div>
                        <div style={{ fontSize: 10, color: dimColor, marginBottom: 2 }}>Notes</div>
                        <input
                          type="text"
                          placeholder="Optional notes..."
                          value={jamParams.notes ?? ''}
                          onChange={e => setJamParams(p => ({ ...p, notes: e.target.value || undefined }))}
                          style={{
                            width: '100%', padding: '5px 8px', borderRadius: 4,
                            background: tacticalMode ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.3)',
                            border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)'}`,
                            color: tacticalMode ? '#4ade80' : '#e5e7eb',
                            fontSize: 11, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={handleConfirmJam}
                        disabled={jamLoading}
                        style={{
                          flex: 1, padding: '6px 10px', borderRadius: 5,
                          background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)',
                          color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          opacity: jamLoading ? 0.6 : 1,
                        }}
                      >
                        {jamLoading ? 'Starting...' : 'Confirm Jam'}
                      </button>
                      <button
                        onClick={() => { setShowJamForm(false); setJamParams({}); }}
                        style={{
                          padding: '6px 10px', borderRadius: 5,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#888', fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Disengage button */}
                <button
                  onClick={() => cuasEngagement && onCuasDisengage?.(cuasEngagement.id)}
                  style={{
                    width: '100%', padding: '6px 12px', borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'transparent', border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)'}`,
                    color: dimColor, fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <XCircle size={13} /> Disengage
                </button>
              </div>
            )}

            {/* State C: Active engagement + active burst */}
            {cuasEngagement && hasActiveBurst && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* JAM ACTIVE indicator */}
                <div style={{
                  padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                  animation: 'pulse-live 1.5s ease-in-out infinite',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', letterSpacing: 0.5 }}>
                      JAM ACTIVE
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', fontFamily: 'monospace' }}>
                      {formatElapsed(elapsed)}
                    </span>
                  </div>
                  {/* Show burst params if set */}
                  {(activeBurst!.frequency_mhz || activeBurst!.power_dbm || activeBurst!.bandwidth_mhz) && (
                    <div style={{
                      fontSize: 10, color: 'rgba(239,68,68,0.7)', fontFamily: 'monospace', marginTop: 4,
                    }}>
                      {[
                        activeBurst!.frequency_mhz && `${activeBurst!.frequency_mhz} MHz`,
                        activeBurst!.power_dbm && `${activeBurst!.power_dbm} dBm`,
                        activeBurst!.bandwidth_mhz && `${activeBurst!.bandwidth_mhz} MHz BW`,
                      ].filter(Boolean).join(' / ')}
                    </div>
                  )}
                </div>

                {/* Jam Off button */}
                <button
                  onClick={() => cuasEngagement && onCuasJamOff?.(cuasEngagement.id)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                    color: '#f59e0b', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <ZapOff size={14} /> Jam Off
                </button>

                {/* Disengage button */}
                <button
                  onClick={() => cuasEngagement && onCuasDisengage?.(cuasEngagement.id)}
                  style={{
                    width: '100%', padding: '6px 12px', borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'transparent', border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)'}`,
                    color: dimColor, fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <XCircle size={13} /> Disengage
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

// ─── Jam Parameter Input ──────────────────────────────────────────────────────

const JamParamInput: React.FC<{
  label: string;
  placeholder: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  tacticalMode: boolean;
}> = ({ label, placeholder, value, onChange, tacticalMode }) => {
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  return (
    <div>
      <div style={{ fontSize: 10, color: dimColor, marginBottom: 2 }}>{label}</div>
      <input
        type="number"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={e => {
          const v = e.target.value;
          onChange(v === '' ? undefined : parseFloat(v));
        }}
        style={{
          width: '100%', padding: '5px 8px', borderRadius: 4,
          background: tacticalMode ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.3)',
          border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)'}`,
          color: tacticalMode ? '#4ade80' : '#e5e7eb',
          fontSize: 11, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
};

// ─── Shared sub-components ───────────────────────────────────────────────────

const CloseHeader: React.FC<{
  title: string;
  onClose: () => void;
  tacticalMode: boolean;
}> = ({ title, onClose, tacticalMode }) => (
  <div style={{
    padding: '14px 16px 10px',
    borderBottom: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)'}`,
    flexShrink: 0,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  }}>
    <div style={{ fontWeight: 700, fontSize: 16, color: tacticalMode ? '#4ade80' : '#fff' }}>
      {title}
    </div>
    <button
      onClick={onClose}
      style={{
        width: 26, height: 26, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#6b7280', cursor: 'pointer',
      }}
    >
      <X size={14} />
    </button>
  </div>
);

const SectionLabel: React.FC<{
  children: React.ReactNode;
  tacticalMode: boolean;
  style?: React.CSSProperties;
}> = ({ children, tacticalMode, style }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, letterSpacing: 1,
    textTransform: 'uppercase',
    color: tacticalMode ? 'rgba(74,222,128,0.5)' : '#4b5563',
    marginBottom: 6, ...style,
  }}>
    {children}
  </div>
);

const TelemetryItem: React.FC<{
  label: string;
  value: string;
  color?: string;
  tacticalMode: boolean;
}> = ({ label, value, color, tacticalMode }) => (
  <div>
    <div style={{
      fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
      color: tacticalMode ? 'rgba(74,222,128,0.4)' : '#4b5563',
    }}>
      {label}
    </div>
    <div style={{
      fontSize: 15, fontWeight: 600, fontFamily: 'monospace',
      color: color ?? (tacticalMode ? '#4ade80' : '#e5e7eb'),
    }}>
      {value}
    </div>
  </div>
);

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  tacticalMode: boolean;
}> = ({ icon, label, onClick, active, tacticalMode }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 6,
      background: active
        ? (tacticalMode ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.25)')
        : (tacticalMode ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.05)'),
      border: `1px solid ${active
        ? (tacticalMode ? 'rgba(34,197,94,0.4)' : 'rgba(59,130,246,0.4)')
        : (tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)')}`,
      color: active
        ? (tacticalMode ? '#4ade80' : '#60a5fa')
        : (tacticalMode ? 'rgba(74,222,128,0.7)' : '#d1d5db'),
      fontSize: 11, fontWeight: 500, cursor: 'pointer',
      transition: 'all 0.15s ease',
    }}
  >
    {icon}
    {label}
  </button>
);

export default SessionDetailPanel;
