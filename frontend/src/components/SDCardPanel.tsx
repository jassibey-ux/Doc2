/**
 * SD Card Panel
 * Upload and merge SD card GPS logs with live track data
 */

import { useState, useCallback, useRef } from 'react';
import {
  HardDrive,
  Upload,
  FileText,
  Check,
  AlertCircle,
  Merge,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, Badge, GlassDivider } from './ui/GlassUI';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useWebSocket } from '../contexts/WebSocketContext';

interface SDCardPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UploadedFile {
  id: string;
  filename: string;
  tracker_id: string;
  start_time: string;
  end_time: string;
  points: number;
  duration_s: number;
  merged: boolean;
}

interface MergeResult {
  tracker_id: string;
  total_points: number;
  live_points: number;
  sd_points: number;
  coverage_percent: number;
  gaps: { start_ms: number; end_ms: number; duration_s: number }[];
}

export default function SDCardPanel({ isOpen, onClose }: SDCardPanelProps) {
  const { activeSession } = useWorkflow();
  const {
    sdCardTracks,
    setSDCardTrack,
    clearSDCardTrack,
    showSDCardTracks,
    setShowSDCardTracks,
  } = useWebSocket();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResults, setMergeResults] = useState<MergeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<'files' | 'results'>('files');
  const [selectedTrackerId, setSelectedTrackerId] = useState<string>('');

  // Get available tracker IDs from active session
  const trackerIds = activeSession?.tracker_assignments.map(t => t.tracker_id) || [];

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tracker_id', selectedTrackerId || 'unknown');
        if (activeSession) {
          formData.append('session_id', activeSession.id);
        }

        const res = await fetch('/api/sd-merge/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Upload failed');
        }

        const data = await res.json();
        setUploadedFiles(prev => [...prev, {
          id: `${Date.now()}-${i}`,
          filename: data.filename,
          tracker_id: data.tracker_id,
          start_time: data.start_time,
          end_time: data.end_time,
          points: data.metadata.total_points,
          duration_s: data.metadata.duration_s,
          merged: false,
        }]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [activeSession, selectedTrackerId]);

  // Handle merge
  const handleMerge = useCallback(async () => {
    if (!activeSession) return;

    setIsMerging(true);
    setError(null);
    const results: MergeResult[] = [];

    try {
      // Merge for each tracker
      for (const file of uploadedFiles.filter(f => !f.merged)) {
        const res = await fetch('/api/sd-merge/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: activeSession.id,
            tracker_id: file.tracker_id,
            live_points: [], // Would come from actual live data
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Merge failed');
        }

        const data = await res.json();
        results.push(data.merged);

        // Mark file as merged
        setUploadedFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, merged: true } : f
        ));
      }

      setMergeResults(results);
      setExpandedSection('results');
    } catch (err: any) {
      setError(err.message || 'Failed to merge data');
    } finally {
      setIsMerging(false);
    }
  }, [activeSession, uploadedFiles]);

  // Handle preview - display SD card track as separate layer on map
  const handlePreviewTrack = useCallback(async (file: UploadedFile) => {
    if (!activeSession) return;

    setIsPreviewing(true);
    setError(null);

    try {
      const res = await fetch('/api/sd-merge/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSession.id,
          tracker_id: file.tracker_id,
          time_offset: 0, // No offset for now
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Preview failed');
      }

      const data = await res.json();

      // Store SD card track in context for map visualization
      setSDCardTrack(file.tracker_id, data.sd_card_track);

      // Ensure SD card tracks are visible
      setShowSDCardTracks(true);

      console.log('[SDCardPanel] SD card track preview loaded:', {
        trackerId: file.tracker_id,
        pointCount: data.sd_points_count,
        gapsDetected: data.connection_gaps?.length || 0,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to preview track');
    } finally {
      setIsPreviewing(false);
    }
  }, [activeSession, setSDCardTrack, setShowSDCardTracks]);

  // Handle remove preview - clear SD card track from map
  const handleRemovePreview = useCallback((trackerId: string) => {
    clearSDCardTrack(trackerId);
  }, [clearSDCardTrack]);

  // Remove file
  const handleRemoveFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  // Format time
  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="sd-card-panel"
      style={{
        position: 'absolute',
        left: '60px',
        top: '20px',
        width: '340px',
        maxHeight: 'calc(100vh - 140px)',
        zIndex: 100,
      }}
    >
      <GlassPanel style={{ padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={18} style={{ color: '#3b82f6' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              SD Card Merge
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Toggle SD Card Tracks Visibility */}
            {sdCardTracks.size > 0 && (
              <button
                onClick={() => setShowSDCardTracks(!showSDCardTracks)}
                title={showSDCardTracks ? 'Hide all SD card tracks' : 'Show all SD card tracks'}
                style={{
                  background: showSDCardTracks ? 'rgba(249, 115, 22, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${showSDCardTracks ? '#f97316' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '6px',
                  color: showSDCardTracks ? '#f97316' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                }}
              >
                {showSDCardTracks ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
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
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Session check */}
        {!activeSession ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.5)' }}>
            <HardDrive size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <div style={{ fontSize: '13px' }}>No active session</div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>
              Start a test session to merge SD card data
            </div>
          </div>
        ) : (
          <>
            {/* Tracker Selection */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                Target Tracker
              </label>
              <select
                value={selectedTrackerId}
                onChange={(e) => setSelectedTrackerId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              >
                <option value="" style={{ background: '#1a1a2e' }}>Select tracker...</option>
                {trackerIds.map(id => (
                  <option key={id} value={id} style={{ background: '#1a1a2e' }}>{id}</option>
                ))}
                <option value="custom" style={{ background: '#1a1a2e' }}>Custom ID...</option>
              </select>
            </div>

            {/* Upload Button */}
            <div style={{ marginBottom: '16px' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.log,.txt,.bin"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <GlassButton
                variant="primary"
                size="md"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || !selectedTrackerId}
                style={{ width: '100%' }}
              >
                <Upload size={16} />
                {isUploading ? 'Uploading...' : 'Upload SD Card File'}
              </GlassButton>
            </div>

            {/* Error Display */}
            {error && (
              <div style={{
                padding: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <AlertCircle size={14} style={{ color: '#ef4444' }} />
                <span style={{ fontSize: '12px', color: '#ef4444' }}>{error}</span>
              </div>
            )}

            <GlassDivider />

            {/* Uploaded Files Section */}
            <div style={{ marginBottom: '12px', marginTop: '12px' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}
                onClick={() => setExpandedSection(expandedSection === 'files' ? 'results' : 'files')}
              >
                {expandedSection === 'files' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginLeft: '6px' }}>
                  Uploaded Files ({uploadedFiles.length})
                </span>
              </div>

              {expandedSection === 'files' && (
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {uploadedFiles.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px', color: 'rgba(255,255,255,0.4)' }}>
                      <FileText size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <div style={{ fontSize: '12px' }}>No files uploaded</div>
                    </div>
                  ) : (
                    uploadedFiles.map(file => {
                      const isPreviewActive = sdCardTracks.has(file.tracker_id);
                      return (
                        <GlassCard
                          key={file.id}
                          style={{
                            marginBottom: '6px',
                            padding: '10px',
                            borderLeft: file.merged ? '3px solid #22c55e' : isPreviewActive ? '3px solid #f97316' : '3px solid #3b82f6',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', color: '#fff', fontWeight: 500, marginBottom: '4px' }}>
                                {file.filename}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <Badge color="blue" size="sm">{file.tracker_id}</Badge>
                                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                                  {file.points.toLocaleString()} pts
                                </span>
                                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                                  {formatDuration(file.duration_s)}
                                </span>
                                {isPreviewActive && (
                                  <span style={{ fontSize: '10px', color: '#f97316', fontWeight: 500 }}>
                                    Showing on map
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                                {formatTime(file.start_time)} - {formatTime(file.end_time)}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {/* Preview/Hide Track Button */}
                              {!file.merged && (
                                <button
                                  onClick={() => isPreviewActive ? handleRemovePreview(file.tracker_id) : handlePreviewTrack(file)}
                                  disabled={isPreviewing}
                                  title={isPreviewActive ? 'Hide SD card track from map' : 'Show SD card track on map'}
                                  style={{
                                    background: isPreviewActive ? 'rgba(249, 115, 22, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                    border: `1px solid ${isPreviewActive ? '#f97316' : 'rgba(255,255,255,0.1)'}`,
                                    borderRadius: '4px',
                                    color: isPreviewActive ? '#f97316' : 'rgba(255,255,255,0.6)',
                                    cursor: 'pointer',
                                    padding: '4px 6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '10px',
                                  }}
                                >
                                  {isPreviewActive ? <EyeOff size={12} /> : <Eye size={12} />}
                                  {isPreviewActive ? 'Hide' : 'Preview'}
                                </button>
                              )}
                              {file.merged ? (
                                <Check size={14} style={{ color: '#22c55e' }} />
                              ) : (
                                <button
                                  onClick={() => handleRemoveFile(file.id)}
                                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '2px' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </GlassCard>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Merge Button */}
            {uploadedFiles.some(f => !f.merged) && (
              <GlassButton
                variant="primary"
                size="md"
                onClick={handleMerge}
                disabled={isMerging}
                style={{ width: '100%', marginBottom: '12px' }}
              >
                <Merge size={16} />
                {isMerging ? 'Merging...' : 'Merge with Live Data'}
              </GlassButton>
            )}

            {/* Results Section */}
            {mergeResults.length > 0 && (
              <>
                <GlassDivider />
                <div style={{ marginTop: '12px' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}
                    onClick={() => setExpandedSection(expandedSection === 'results' ? 'files' : 'results')}
                  >
                    {expandedSection === 'results' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginLeft: '6px' }}>
                      Merge Results
                    </span>
                  </div>

                  {expandedSection === 'results' && (
                    <div>
                      {mergeResults.map((result, idx) => (
                        <GlassCard key={idx} style={{ marginBottom: '8px', padding: '12px' }}>
                          <div style={{ marginBottom: '8px' }}>
                            <Badge color="green" size="sm">{result.tracker_id}</Badge>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                            <div>
                              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Total Points</span>
                              <div style={{ color: '#fff', fontWeight: 500 }}>{result.total_points.toLocaleString()}</div>
                            </div>
                            <div>
                              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Coverage</span>
                              <div style={{ color: result.coverage_percent >= 90 ? '#22c55e' : result.coverage_percent >= 70 ? '#f59e0b' : '#ef4444', fontWeight: 500 }}>
                                {result.coverage_percent}%
                              </div>
                            </div>
                            <div>
                              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Live</span>
                              <div style={{ color: '#3b82f6' }}>{result.live_points.toLocaleString()}</div>
                            </div>
                            <div>
                              <span style={{ color: 'rgba(255,255,255,0.5)' }}>SD Card</span>
                              <div style={{ color: '#f97316' }}>{result.sd_points.toLocaleString()}</div>
                            </div>
                          </div>
                          {result.gaps.length > 0 && (
                            <div style={{ marginTop: '8px', fontSize: '10px', color: '#f59e0b' }}>
                              {result.gaps.length} gap{result.gaps.length !== 1 ? 's' : ''} detected
                            </div>
                          )}
                        </GlassCard>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </GlassPanel>
    </div>
  );
}
