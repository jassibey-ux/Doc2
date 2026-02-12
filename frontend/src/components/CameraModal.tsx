import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X } from 'lucide-react';

interface CameraModalProps {
  droneId: string;
  streamUrl?: string;
  streamType?: 'hls' | 'youtube' | 'direct';
  onClose: () => void;
}

export default function CameraModal({ droneId, streamUrl, streamType = 'direct', onClose }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState('');

  // Update current time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toISOString().split('T')[1].split('.')[0] + ' UTC');
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize video stream
  useEffect(() => {
    if (!streamUrl) {
      setIsLoading(false);
      setError('No camera stream available for this drone');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Check if it's a YouTube URL
    if (streamType === 'youtube' || streamUrl.includes('youtube.com') || streamUrl.includes('youtu.be')) {
      setIsLoading(false);
      return;
    }

    // HLS stream
    if (streamType === 'hls' || streamUrl.endsWith('.m3u8')) {
      if (videoRef.current && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => void 0);
          setIsLoading(false);
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setError('Failed to load HLS stream');
            setIsLoading(false);
          }
        });
      } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        videoRef.current.src = streamUrl;
        videoRef.current.play().catch(() => void 0);
        setIsLoading(false);
      }
      return;
    }

    // Direct video stream
    if (videoRef.current) {
      videoRef.current.src = streamUrl;
      videoRef.current.play().catch(() => void 0);
      setIsLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, streamType]);

  // Get YouTube embed URL if applicable
  const getYouTubeEmbedUrl = (): string | null => {
    if (!streamUrl) return null;

    let videoId = '';
    if (streamUrl.includes('youtube.com/watch?v=')) {
      videoId = streamUrl.split('v=')[1]?.split('&')[0];
    } else if (streamUrl.includes('youtu.be/')) {
      videoId = streamUrl.split('youtu.be/')[1]?.split('?')[0];
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : null;
  };

  const isYouTube = streamType === 'youtube' || streamUrl?.includes('youtube.com') || streamUrl?.includes('youtu.be');
  const youtubeEmbedUrl = isYouTube ? getYouTubeEmbedUrl() : null;

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="camera-modal-overlay" onClick={handleBackdropClick}>
      <div className="camera-modal-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="camera-modal-header">
          <h3 className="camera-modal-title">Drone #{droneId} - Live Feed</h3>
          <span className="camera-modal-time">{currentTime}</span>
          <button className="camera-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Video Container */}
        <div className="camera-modal-video-container">
          <div className="camera-video-wrapper">
            <span className="camera-video-live-badge">LIVE</span>

            {/* Loading State */}
            {isLoading && (
              <div className="camera-modal-loading">
                <div className="loading-spinner" />
                <p>Loading stream...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="camera-modal-error">
                <p>{error}</p>
                <p className="text-sm text-white/40 mt-2">
                  Camera streaming will be available when drones are equipped with cameras.
                </p>
              </div>
            )}

            {/* YouTube Embed */}
            {isYouTube && youtubeEmbedUrl && (
              <iframe
                src={youtubeEmbedUrl}
                className="camera-modal-iframe"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}

            {/* Direct/HLS Video */}
            {!isYouTube && !error && (
              <video
                ref={videoRef}
                controls
                className="camera-modal-video"
                playsInline
                muted
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
