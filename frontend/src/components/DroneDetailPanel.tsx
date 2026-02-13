import { useEffect, useState, useRef, useCallback } from 'react';
import { X, Video, Navigation, Satellite, Radio, Battery, Thermometer, MapPin, AlertTriangle, ChevronLeft, HardDrive, Upload, Eye, EyeOff, Trash2, FileText, Check, Radar, Activity } from 'lucide-react';
import { GlassButton, Badge, StatusDot, DataRow } from './ui/GlassUI';
import { GPSHealthIndicator } from './GPSHealthIndicator';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useWorkflow } from '../contexts/WorkflowContext';
import type { DroneState, DroneSummary } from '../types/drone';

interface DroneDetailPanelProps {
  drone: DroneSummary | null;
  onClose: () => void;
  onOpenCamera?: () => void;
  onBackToList?: () => void;
}

export default function DroneDetailPanel({ drone, onClose, onOpenCamera, onBackToList }: DroneDetailPanelProps) {
  const [fullState, setFullState] = useState<DroneState | null>(null);
  const [loading, setLoading] = useState(true);

  // SD Card state
  const { sdCardTracks, setSDCardTrack, clearSDCardTrack, showSDCardTracks, setShowSDCardTracks } = useWebSocket();
  const { activeSession } = useWorkflow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingSD, setIsUploadingSD] = useState(false);
  const [sdFileInfo, setSDFileInfo] = useState<{ filename: string; points: number; duration_s: number } | null>(null);
  const [sdError, setSDError] = useState<string | null>(null);

  // Handle SD card upload
  const handleSDCardUpload = useCallback(async (file: File) => {
    if (!drone || !activeSession) return;

    setIsUploadingSD(true);
    setSDError(null);

    try {
      // 1. Upload file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tracker_id', drone.tracker_id);
      formData.append('session_id', activeSession.id);

      const uploadRes = await fetch('/api/sd-merge/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || 'Upload failed');
      }

      const uploadData = await uploadRes.json();
      setSDFileInfo({
        filename: uploadData.filename,
        points: uploadData.metadata.total_points,
        duration_s: uploadData.metadata.duration_s,
      });

      // 2. Auto-preview
      const previewRes = await fetch('/api/sd-merge/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSession.id,
          tracker_id: drone.tracker_id,
        }),
      });

      if (!previewRes.ok) {
        const err = await previewRes.json();
        throw new Error(err.error || 'Preview failed');
      }

      const previewData = await previewRes.json();
      setSDCardTrack(drone.tracker_id, previewData.sd_card_track);
      setShowSDCardTracks(true);

    } catch (err: any) {
      setSDError(err.message || 'Failed to upload SD card');
    } finally {
      setIsUploadingSD(false);
    }
  }, [drone, activeSession, setSDCardTrack, setShowSDCardTracks]);

  const handleSDFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleSDCardUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleSDCardUpload]);

  const handleRemoveSD = useCallback(() => {
    if (!drone) return;
    clearSDCardTrack(drone.tracker_id);
    setSDFileInfo(null);
    setSDError(null);
  }, [drone, clearSDCardTrack]);

  // Fetch full drone details
  useEffect(() => {
    if (!drone) {
      setFullState(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchDetails() {
      setLoading(true);
      try {
        const response = await fetch(`/api/trackers/${drone!.tracker_id}`);
        if (response.ok && !cancelled) {
          const data = await response.json();
          setFullState(data);
        }
      } catch (error) {
        // ignore fetch errors
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDetails();

    // Poll for updates every 2 seconds
    const interval = setInterval(fetchDetails, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [drone?.tracker_id]);

  if (!drone) {
    return <div className="drone-detail-panel hidden" />;
  }

  const data = fullState || drone;
  const isStale = 'is_stale' in data ? data.is_stale : false;
  const fixValid = 'fix_valid' in data ? data.fix_valid : false;

  // Format age for display
  const formatAge = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    return `${Math.round(seconds / 3600)}h ago`;
  };

  // Format GPS loss duration
  const formatLossDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  };

  // Format time since a datetime string
  const formatTimeSince = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  // Format coordinates
  const formatCoord = (value: number | null | undefined, isLat: boolean): string => {
    if (value === null || value === undefined) return '--';
    const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    return `${Math.abs(value).toFixed(6)}° ${dir}`;
  };

  // SD Card - check if data exists for this tracker
  const hasSDCardData = sdCardTracks.has(drone.tracker_id);
  const sdCardPoints = sdCardTracks.get(drone.tracker_id);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`drone-detail-panel ${false ? 'hidden' : ''}`}>
      {/* Header */}
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Radar size={18} style={{ color: '#ff8c00' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>UAS Tracking</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onBackToList && (
            <GlassButton onClick={onBackToList} variant="ghost" size="sm">
              <ChevronLeft size={16} />
            </GlassButton>
          )}
          {onOpenCamera && (
            <GlassButton onClick={onOpenCamera} variant="secondary" size="sm">
              <Video size={16} />
            </GlassButton>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tracker ID Sub-header */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Tracker:</span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
          <span style={{ color: '#818cf8' }}>#</span>{drone.tracker_id}
        </span>
      </div>

      {/* Content */}
      <div className="workspace-content">
        {/* Status Row */}
        <div className="status-row">
          <StatusDot status={isStale ? 'offline' : 'online'} />
          <span className="status-text">
            {isStale ? 'Stale' : 'Active'}
          </span>
          <Badge color={fixValid ? 'green' : 'yellow'}>
            {fixValid ? 'GPS Fix' : 'No Fix'}
          </Badge>
          {data.age_seconds !== undefined && (
            <span className="ml-auto text-xs text-white/40">
              {formatAge(data.age_seconds)}
            </span>
          )}
        </div>

        {/* Last Known Location Card - shown when stale */}
        {isStale && (fullState?.last_known_lat || drone.last_known_lat) && (
          <div className="data-card last-known-card">
            <h3>
              <MapPin size={14} className="inline mr-2 text-rose-400" />
              Last Known Location
            </h3>
            <div className="last-known-warning">
              <AlertTriangle size={14} className="text-amber-400" />
              <span>
                Communication lost {fullState?.stale_since || drone.stale_since
                  ? formatTimeSince(fullState?.stale_since || drone.stale_since!)
                  : formatAge(data.age_seconds)}
              </span>
            </div>
            <DataRow
              label="Last Position"
              value={`${formatCoord(fullState?.last_known_lat ?? drone.last_known_lat, true)}`}
            />
            <DataRow
              label=""
              value={`${formatCoord(fullState?.last_known_lon ?? drone.last_known_lon, false)}`}
            />
            <DataRow
              label="Altitude"
              value={(fullState?.last_known_alt_m ?? drone.last_known_alt_m)?.toFixed(1)}
              unit="m"
            />
            {(fullState?.last_known_time || drone.last_known_time) && (
              <DataRow
                label="Last Contact"
                value={new Date(fullState?.last_known_time || drone.last_known_time!).toLocaleTimeString()}
              />
            )}
          </div>
        )}

        {/* Battery Warning Card - shown when battery is low */}
        {(fullState?.low_battery || drone.low_battery) && (
          <div className={`data-card battery-warning-card ${fullState?.battery_critical || drone.battery_critical ? 'critical' : ''}`}>
            <h3>
              <Battery size={14} className={`inline mr-2 ${fullState?.battery_critical || drone.battery_critical ? 'text-rose-400' : 'text-amber-400'}`} />
              {fullState?.battery_critical || drone.battery_critical ? 'Critical Battery' : 'Low Battery'}
            </h3>
            <p className="battery-warning-text">
              {fullState?.battery_critical || drone.battery_critical
                ? 'Battery critically low - immediate recovery recommended!'
                : 'Battery running low - consider recovery.'}
            </p>
            {(fullState?.battery_mv || drone.battery_mv) && (
              <DataRow
                label="Voltage"
                value={((fullState?.battery_mv ?? drone.battery_mv ?? 0) / 1000).toFixed(2)}
                unit="V"
              />
            )}
          </div>
        )}

        {/* Position Card */}
        <div className="data-card">
          <h3>
            <Navigation size={14} className="inline mr-2 opacity-60" />
            Position
          </h3>
          <DataRow
            label="Latitude"
            value={formatCoord(data.lat, true)}
          />
          <DataRow
            label="Longitude"
            value={formatCoord(data.lon, false)}
          />
          <DataRow
            label="Altitude"
            value={data.alt_m?.toFixed(1)}
            unit="m"
          />
        </div>

        {/* Telemetry Card */}
        {fullState && (
          <div className="data-card">
            <h3>
              <Navigation size={14} className="inline mr-2 opacity-60" />
              Telemetry
            </h3>
            <DataRow
              label="Speed"
              value={fullState.speed_mps?.toFixed(1)}
              unit="m/s"
            />
            <DataRow
              label="Heading"
              value={fullState.course_deg?.toFixed(0)}
              unit="°"
            />
            <DataRow
              label="HDOP"
              value={fullState.hdop?.toFixed(1)}
            />
          </div>
        )}

        {/* GPS Quality Card */}
        {fullState && (
          <div className="data-card">
            <h3>
              <Satellite size={14} className="inline mr-2 opacity-60" />
              GPS Quality
            </h3>
            <DataRow
              label="Satellites"
              value={fullState.satellites}
            />
            <DataRow
              label="Fix Valid"
              value={fullState.fix_valid ? 'Yes' : 'No'}
            />
            {fullState.time_gps && (
              <DataRow
                label="GPS Time"
                value={new Date(fullState.time_gps).toLocaleTimeString()}
              />
            )}
          </div>
        )}

        {/* GPS Health Metrics Card */}
        {fullState?.gps_health && (
          <div className="data-card">
            <h3>
              <Activity size={14} className="inline mr-2 opacity-60" />
              GPS Health Metrics
            </h3>

            {/* Health Status Indicator */}
            <GPSHealthIndicator health={fullState.gps_health} />

            {/* Additional metrics */}
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
              <DataRow
                label="Health Score"
                value={`${fullState.gps_health.health_score}/100`}
              />
              <DataRow
                label="Fix Availability"
                value={`${fullState.gps_health.fix_availability_percent.toFixed(1)}%`}
              />
              <DataRow
                label="Fix Loss Events"
                value={fullState.gps_health.total_fix_loss_events.toString()}
              />
              {fullState.gps_health.current_loss_duration_ms !== null && (
                <DataRow
                  label="Lost For"
                  value={
                    <span className="text-red-400 animate-pulse">
                      {formatLossDuration(fullState.gps_health.current_loss_duration_ms)}
                    </span>
                  }
                />
              )}
            </div>
          </div>
        )}

        {/* Signal Card */}
        {fullState && fullState.rssi_dbm !== null && (
          <div className="data-card">
            <h3>
              <Radio size={14} className="inline mr-2 opacity-60" />
              Signal
            </h3>
            <DataRow
              label="RSSI"
              value={fullState.rssi_dbm?.toFixed(0)}
              unit="dBm"
            />
            {fullState.latency_ms !== null && (
              <DataRow
                label="Latency"
                value={fullState.latency_ms?.toFixed(0)}
                unit="ms"
              />
            )}
          </div>
        )}

        {/* Barometric Card */}
        {fullState && (fullState.baro_alt_m !== null || fullState.baro_temp_c !== null || fullState.baro_press_hpa !== null) && (
          <div className="data-card">
            <h3>
              <Thermometer size={14} className="inline mr-2 opacity-60" />
              Barometric
            </h3>
            {fullState.baro_alt_m !== null && (
              <DataRow
                label="Baro Alt"
                value={fullState.baro_alt_m?.toFixed(1)}
                unit="m"
              />
            )}
            {fullState.baro_temp_c !== null && (
              <DataRow
                label="Temperature"
                value={fullState.baro_temp_c?.toFixed(1)}
                unit="°C"
              />
            )}
            {fullState.baro_press_hpa !== null && (
              <DataRow
                label="Pressure"
                value={fullState.baro_press_hpa?.toFixed(1)}
                unit="hPa"
              />
            )}
          </div>
        )}

        {/* Battery Card */}
        {fullState && fullState.battery_mv !== null && (
          <div className="data-card">
            <h3>
              <Battery size={14} className="inline mr-2 opacity-60" />
              Battery
            </h3>
            <DataRow
              label="Voltage"
              value={(fullState.battery_mv / 1000).toFixed(2)}
              unit="V"
            />
            {/* Battery percentage estimation (assuming 3.7V nominal, 3.0V min, 4.2V max) */}
            <div className="mt-3">
              <BatteryBar voltage={fullState.battery_mv} />
            </div>
          </div>
        )}

        {/* SD Card Data Section */}
        {activeSession && (
          <div className={`data-card ${hasSDCardData ? 'sd-loaded' : ''}`} style={{
            borderLeft: hasSDCardData ? '3px solid #f97316' : undefined,
          }}>
            <h3>
              <HardDrive size={14} className="inline mr-2 opacity-60" style={{ color: hasSDCardData ? '#f97316' : undefined }} />
              SD Card Data
              {hasSDCardData && (
                <span style={{ marginLeft: '8px' }}>
                  <Badge color="orange" size="sm">
                    {sdCardPoints?.length.toLocaleString()} pts
                  </Badge>
                </span>
              )}
            </h3>

            {/* Error display */}
            {sdError && (
              <div style={{
                padding: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '4px',
                marginBottom: '8px',
                fontSize: '11px',
                color: '#ef4444',
              }}>
                {sdError}
              </div>
            )}

            {/* Upload zone when no data */}
            {!hasSDCardData && !isUploadingSD && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '12px',
                  border: '2px dashed rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#f97316';
                  e.currentTarget.style.background = 'rgba(249, 115, 22, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Upload size={18} style={{ color: 'rgba(255, 255, 255, 0.4)', marginBottom: '4px' }} />
                <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  Click to upload SD card file
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.log,.txt,.bin"
                  onChange={handleSDFileSelect}
                  style={{ display: 'none' }}
                />
              </div>
            )}

            {/* Uploading state */}
            {isUploadingSD && (
              <div style={{ textAlign: 'center', padding: '12px' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>Uploading...</div>
              </div>
            )}

            {/* Data loaded */}
            {hasSDCardData && sdFileInfo && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <FileText size={12} style={{ color: '#f97316' }} />
                  <span style={{ fontSize: '11px', color: '#fff' }}>{sdFileInfo.filename}</span>
                </div>
                <DataRow label="Points" value={sdFileInfo.points.toLocaleString()} />
                <DataRow label="Duration" value={formatDuration(sdFileInfo.duration_s)} />

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <GlassButton
                    variant={showSDCardTracks ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setShowSDCardTracks(!showSDCardTracks)}
                    style={{ flex: 1 }}
                  >
                    {showSDCardTracks ? <Eye size={14} /> : <EyeOff size={14} />}
                    {showSDCardTracks ? 'Showing' : 'Hidden'}
                  </GlassButton>
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveSD}
                  >
                    <Trash2 size={14} />
                  </GlassButton>
                </div>

                {showSDCardTracks && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '10px',
                    color: '#f97316',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <Check size={12} />
                    Orange track visible on map
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Loading indicator */}
        {loading && !fullState && (
          <div className="flex items-center justify-center py-8">
            <div className="loading-spinner" />
          </div>
        )}
      </div>
    </div>
  );
}

// Battery bar component
function BatteryBar({ voltage }: { voltage: number }) {
  // Voltage thresholds assume LiPo battery chemistry (typical for drones):
  // - 3.0V per cell = empty (risk of damage below this)
  // - 4.2V per cell = fully charged
  // Values are in millivolts. Adjust if using different battery chemistry.
  const minV = 3000;
  const maxV = 4200;
  const percentage = Math.min(100, Math.max(0, ((voltage - minV) / (maxV - minV)) * 100));

  const getColor = (pct: number): string => {
    if (pct > 50) return 'bg-emerald-400';
    if (pct > 20) return 'bg-amber-400';
    return 'bg-rose-400';
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(percentage)} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-medium text-white/80">
        {percentage.toFixed(0)}%
      </span>
    </div>
  );
}
