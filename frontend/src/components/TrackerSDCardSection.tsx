/**
 * TrackerSDCardSection
 * Inline SD card upload/preview section for a specific tracker
 * Integrates directly into tracker cards in SessionConsole
 */

import { useState, useCallback, useRef } from 'react';
import {
  HardDrive,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  FileText,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { GlassCard, Badge } from './ui/GlassUI';
import { useWebSocket } from '../contexts/WebSocketContext';

interface SDCardFileInfo {
  filename: string;
  points: number;
  duration_s: number;
  start_time: string;
  end_time: string;
}

interface TrackerSDCardSectionProps {
  trackerId: string;
  sessionId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  livePointCount?: number;
}

export default function TrackerSDCardSection({
  trackerId,
  sessionId,
  isExpanded,
  onToggleExpand,
  livePointCount: _livePointCount = 0,
}: TrackerSDCardSectionProps) {
  const {
    sdCardTracks,
    setSDCardTrack,
    clearSDCardTrack,
    showSDCardTracks,
    setShowSDCardTracks,
  } = useWebSocket();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<SDCardFileInfo | null>(null);
  const [gapAnalysis, setGapAnalysis] = useState<{
    sdPoints: number;
    livePoints: number;
    gapsCount: number;
    coveragePercent: number;
  } | null>(null);

  // Check if this tracker has SD card data loaded
  const hasSDCardData = sdCardTracks.has(trackerId);
  const sdCardPoints = sdCardTracks.get(trackerId);

  // Handle file upload
  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      // 1. Upload file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tracker_id', trackerId);
      formData.append('session_id', sessionId);

      const uploadRes = await fetch('/api/sd-merge/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || 'Upload failed');
      }

      const uploadData = await uploadRes.json();
      setFileInfo({
        filename: uploadData.filename,
        points: uploadData.metadata.total_points,
        duration_s: uploadData.metadata.duration_s,
        start_time: uploadData.start_time,
        end_time: uploadData.end_time,
      });

      // 2. Auto-preview after upload
      const previewRes = await fetch('/api/sd-merge/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          tracker_id: trackerId,
        }),
      });

      if (!previewRes.ok) {
        const err = await previewRes.json();
        throw new Error(err.error || 'Preview failed');
      }

      const previewData = await previewRes.json();

      // Store track in context
      setSDCardTrack(trackerId, previewData.sd_card_track);
      setShowSDCardTracks(true);

      // Set gap analysis
      setGapAnalysis({
        sdPoints: previewData.sd_points_count,
        livePoints: previewData.live_points_count,
        gapsCount: previewData.connection_gaps?.length || 0,
        coveragePercent: Math.round(
          ((previewData.live_points_count + previewData.sd_points_count) /
            Math.max(previewData.sd_points_count, 1)) *
            100
        ),
      });

      console.log('[TrackerSDCardSection] SD card loaded for', trackerId, {
        points: previewData.sd_points_count,
        gaps: previewData.connection_gaps?.length || 0,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to upload SD card file');
      console.error('[TrackerSDCardSection] Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  }, [trackerId, sessionId, setSDCardTrack, setShowSDCardTracks]);

  // Handle file input change
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleUpload]);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['csv', 'log', 'txt', 'bin'].includes(ext || '')) {
        handleUpload(file);
      } else {
        setError('Please drop a CSV, LOG, TXT, or BIN file');
      }
    }
  }, [handleUpload]);

  // Handle remove
  const handleRemove = useCallback(() => {
    clearSDCardTrack(trackerId);
    setFileInfo(null);
    setGapAnalysis(null);
    setError(null);
  }, [trackerId, clearSDCardTrack]);

  // Toggle visibility
  const toggleVisibility = useCallback(() => {
    setShowSDCardTracks(!showSDCardTracks);
  }, [showSDCardTracks, setShowSDCardTracks]);

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
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hrs}h ${remainMins}m`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ marginTop: '8px' }}>
      {/* Expandable Header */}
      <div
        onClick={onToggleExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          background: hasSDCardData ? 'rgba(249, 115, 22, 0.1)' : 'rgba(255, 255, 255, 0.03)',
          borderRadius: '6px',
          cursor: 'pointer',
          border: hasSDCardData ? '1px solid rgba(249, 115, 22, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <HardDrive
            size={14}
            style={{ color: hasSDCardData ? '#f97316' : 'rgba(255, 255, 255, 0.5)' }}
          />
          <span style={{ fontSize: '11px', color: hasSDCardData ? '#f97316' : 'rgba(255, 255, 255, 0.6)' }}>
            SD Card
          </span>
          {hasSDCardData && (
            <Badge color="orange" size="sm">
              {sdCardPoints?.length.toLocaleString()} pts
            </Badge>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {hasSDCardData && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleVisibility();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: showSDCardTracks ? '#f97316' : 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
              title={showSDCardTracks ? 'Hide SD track' : 'Show SD track'}
            >
              {showSDCardTracks ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          )}
          {isExpanded ? (
            <ChevronUp size={14} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
          ) : (
            <ChevronDown size={14} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div
          style={{
            marginTop: '8px',
            padding: '10px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Error Display */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '4px',
                marginBottom: '8px',
              }}
            >
              <AlertCircle size={14} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: '11px', color: '#ef4444' }}>{error}</span>
            </div>
          )}

          {/* Upload Zone - Show when no data */}
          {!hasSDCardData && !isUploading && (
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '16px',
                border: `2px dashed ${isDragging ? '#f97316' : 'rgba(255, 255, 255, 0.2)'}`,
                borderRadius: '8px',
                background: isDragging ? 'rgba(249, 115, 22, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <Upload
                size={20}
                style={{
                  color: isDragging ? '#f97316' : 'rgba(255, 255, 255, 0.4)',
                  marginBottom: '6px',
                }}
              />
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
                Drop SD file or click to upload
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.3)', marginTop: '4px' }}>
                CSV, LOG, TXT, BIN
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.log,.txt,.bin"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* Uploading State */}
          {isUploading && (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
                Uploading...
              </div>
            </div>
          )}

          {/* File Info - Show when data loaded */}
          {hasSDCardData && fileInfo && (
            <>
              <GlassCard
                style={{
                  padding: '10px',
                  marginBottom: '8px',
                  borderLeft: '3px solid #f97316',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <FileText size={12} style={{ color: '#f97316' }} />
                      <span style={{ fontSize: '11px', color: '#fff', fontWeight: 500 }}>
                        {fileInfo.filename}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        {fileInfo.points.toLocaleString()} pts
                      </span>
                      <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        {formatDuration(fileInfo.duration_s)}
                      </span>
                      <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>
                        {formatTime(fileInfo.start_time)} - {formatTime(fileInfo.end_time)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleRemove}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.4)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Remove SD card data"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </GlassCard>

              {/* Gap Analysis */}
              {gapAnalysis && (
                <div
                  style={{
                    padding: '8px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: '4px',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                  }}
                >
                  <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>
                    GAP ANALYSIS
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#3b82f6' }}>
                      Live: {gapAnalysis.livePoints.toLocaleString()}
                    </span>
                    <span style={{ fontSize: '11px', color: '#f97316' }}>
                      SD: {gapAnalysis.sdPoints.toLocaleString()}
                    </span>
                    {gapAnalysis.gapsCount > 0 && (
                      <span style={{ fontSize: '11px', color: '#22c55e' }}>
                        <Check size={12} style={{ display: 'inline', marginRight: '2px' }} />
                        {gapAnalysis.gapsCount} gap{gapAnalysis.gapsCount !== 1 ? 's' : ''} filled
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Visibility indicator */}
              {showSDCardTracks && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '10px',
                    color: '#f97316',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Eye size={12} />
                  Showing on map
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
