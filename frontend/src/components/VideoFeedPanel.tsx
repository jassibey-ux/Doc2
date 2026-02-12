import { useState } from 'react';
import { DroneState, DroneSummary } from '../types/drone';
import { GlassButton, Badge, StatusDot } from './ui/GlassUI';
import { Video, Camera, Maximize2, Volume2, VolumeX, Play, Pause, Settings } from 'lucide-react';

interface VideoFeedPanelProps {
  drone: DroneState | DroneSummary | null;
  onClose?: () => void;
}

// Type guard to check if drone has camera properties
function hasCameraUrl(drone: DroneState | DroneSummary): drone is DroneState {
  return 'camera_url' in drone;
}

export default function VideoFeedPanel({ drone }: VideoFeedPanelProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Get video URL from drone config
  const getVideoUrl = (): string | null => {
    if (!drone || !hasCameraUrl(drone) || !drone.camera_url) return null;
    return drone.camera_url;
  };

  // Extract YouTube video ID if it's a YouTube URL
  const getYouTubeEmbedUrl = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (match) {
      return `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=1`;
    }
    return null;
  };

  const videoUrl = getVideoUrl();
  const youtubeEmbed = videoUrl ? getYouTubeEmbedUrl(videoUrl) : null;
  const isYoutube = !!youtubeEmbed;

  // Fallback video for demo
  const fallbackVideo = "https://cdn.pixabay.com/video/2016/03/01/2352-157270014_large.mp4";

  return (
    <div className="video-feed-panel">
      {/* Header */}
      <div className="video-header">
        <div className="video-title">
          <Video size={16} />
          <span>{drone ? `Feed: ${drone.tracker_id}` : 'Video Feed'}</span>
        </div>
        <div className="video-status">
          {drone ? (
            <>
              <StatusDot status={drone.is_stale ? 'stale' : 'online'} size={6} />
              <Badge color={drone.is_stale ? 'red' : 'green'} size="sm">
                {drone.is_stale ? 'OFFLINE' : 'LIVE'}
              </Badge>
            </>
          ) : (
            <Badge color="gray" size="sm">NO FEED</Badge>
          )}
        </div>
      </div>

      {/* Video Container */}
      <div className="video-container">
        {drone ? (
          isYoutube ? (
            <iframe
              src={youtubeEmbed!}
              className="video-iframe"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              className="video-player"
              src={videoUrl || fallbackVideo}
              autoPlay={isPlaying}
              muted={isMuted}
              loop
              playsInline
            />
          )
        ) : (
          <div className="video-placeholder">
            <Camera size={48} />
            <p>Select a drone to view feed</p>
            <span>No active video stream</span>
          </div>
        )}

        {/* Video Overlay Controls */}
        {drone && (
          <div className="video-overlay">
            <div className="overlay-top">
              <div className="stream-info">
                <span className="stream-type">
                  {(hasCameraUrl(drone) && drone.camera_type?.toUpperCase()) || 'STREAM'}
                </span>
              </div>
            </div>
            <div className="overlay-bottom">
              <div className="controls-left">
                <button
                  className="control-btn"
                  onClick={() => setIsPlaying(!isPlaying)}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  className="control-btn"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              </div>
              <div className="controls-right">
                <button
                  className="control-btn"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  title="Fullscreen"
                >
                  <Maximize2 size={16} />
                </button>
                <button className="control-btn" title="Settings">
                  <Settings size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="video-actions">
        <GlassButton size="sm" disabled={!drone}>
          <Camera size={14} />
          Capture
        </GlassButton>
        <GlassButton size="sm" disabled={!drone}>
          Record
        </GlassButton>
        <GlassButton size="sm" disabled={!drone}>
          PTZ
        </GlassButton>
      </div>

      {/* Drone Info */}
      {drone && (
        <div className="drone-quick-info">
          <div className="info-row">
            <span className="info-label">Tracker</span>
            <span className="info-value">{drone.tracker_id}</span>
          </div>
          {drone.lat && drone.lon && (
            <div className="info-row">
              <span className="info-label">Position</span>
              <span className="info-value">
                {drone.lat.toFixed(5)}, {drone.lon.toFixed(5)}
              </span>
            </div>
          )}
          {drone.alt_m && (
            <div className="info-row">
              <span className="info-label">Altitude</span>
              <span className="info-value">{drone.alt_m.toFixed(1)} m</span>
            </div>
          )}
        </div>
      )}

      <style>{`
        .video-feed-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .video-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .video-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 13px;
          color: #fff;
        }

        .video-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .video-container {
          flex: 1;
          position: relative;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 8px;
          margin: 12px;
          overflow: hidden;
          min-height: 200px;
        }

        .video-player,
        .video-iframe {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border: none;
        }

        .video-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: rgba(255, 255, 255, 0.4);
          text-align: center;
          padding: 20px;
        }

        .video-placeholder p {
          margin: 12px 0 4px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
        }

        .video-placeholder span {
          font-size: 12px;
        }

        .video-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .video-container:hover .video-overlay {
          opacity: 1;
        }

        .overlay-top {
          padding: 12px;
          background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
        }

        .stream-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .stream-type {
          padding: 2px 8px;
          background: rgba(255, 140, 0, 0.8);
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          color: #fff;
        }

        .overlay-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
        }

        .controls-left,
        .controls-right {
          display: flex;
          gap: 8px;
          pointer-events: auto;
        }

        .control-btn {
          background: rgba(0, 0, 0, 0.5);
          border: none;
          border-radius: 6px;
          padding: 8px;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }

        .control-btn:hover {
          background: rgba(255, 140, 0, 0.8);
        }

        .video-actions {
          display: flex;
          gap: 8px;
          padding: 0 12px 12px;
        }

        .video-actions button {
          flex: 1;
        }

        .drone-quick-info {
          padding: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
        }

        .info-label {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
        }

        .info-value {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.9);
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}
