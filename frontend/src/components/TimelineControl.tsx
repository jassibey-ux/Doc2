import { useCallback, useRef, useEffect, useState } from 'react';
import { Play, Pause, SkipBack, Radio } from 'lucide-react';
import { TimeRange } from '../contexts/WebSocketContext';
import type { Engagement } from '../types/workflow';

// Engagement segment for rendering on the timeline
interface EngagementSegment {
  id: string;
  name?: string;
  startMs: number;
  endMs: number;
  type: 'engagement' | 'jam_burst' | 'note';
  color: string;
}

interface TimelineControlProps {
  isLive: boolean;
  setIsLive: (live: boolean) => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  timelineStart: number;
  timelineEnd: number;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  engagements?: Engagement[];
  onMarkerClick?: (engagementId: string) => void;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '24h', label: '24H' },
];

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function TimelineControl({
  isLive,
  setIsLive,
  timeRange,
  setTimeRange,
  currentTime,
  setCurrentTime,
  timelineStart,
  timelineEnd,
  connectionStatus,
  engagements,
  onMarkerClick,
}: TimelineControlProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<number | null>(null);

  // Calculate slider position as percentage
  const duration = timelineEnd - timelineStart;
  const position = duration > 0 ? ((currentTime - timelineStart) / duration) * 100 : 100;

  // Handle click on slider track
  const handleSliderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newTime = timelineStart + (percentage / 100) * duration;

    setCurrentTime(newTime);
    setIsLive(false);
    setIsPlaying(false);
  }, [timelineStart, duration, setCurrentTime, setIsLive]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setIsLive(false);
    setIsPlaying(false);
  }, [setIsLive]);

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const newTime = timelineStart + (percentage / 100) * duration;

      setCurrentTime(newTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, timelineStart, duration, setCurrentTime]);

  // Playback control
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    if (isPlaying && !isLive) {
      playIntervalRef.current = window.setInterval(() => {
        const newTime = currentTimeRef.current + 1000; // Advance 1 second per tick
        if (newTime >= timelineEnd) {
          setIsPlaying(false);
          setCurrentTime(timelineEnd);
        } else {
          setCurrentTime(newTime);
        }
      }, 100); // 10x speed playback
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, isLive, timelineEnd, setCurrentTime]);

  // Go to live
  const handleGoLive = useCallback(() => {
    setIsLive(true);
    setIsPlaying(false);
    setCurrentTime(timelineEnd);
  }, [setIsLive, setCurrentTime, timelineEnd]);

  // Go to start
  const handleGoToStart = useCallback(() => {
    setIsLive(false);
    setIsPlaying(false);
    setCurrentTime(timelineStart);
  }, [setIsLive, setCurrentTime, timelineStart]);

  // Toggle playback
  const handleTogglePlay = useCallback(() => {
    if (isLive) {
      setIsLive(false);
      setCurrentTime(timelineStart);
      setIsPlaying(true);
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [isLive, setIsLive, setCurrentTime, timelineStart]);

  // Build engagement segments for timeline overlay
  const segments: EngagementSegment[] = [];
  if (engagements && duration > 0) {
    for (const eng of engagements) {
      if (!eng.engage_timestamp) continue;
      const startMs = new Date(eng.engage_timestamp).getTime();
      const endMs = eng.disengage_timestamp ? new Date(eng.disengage_timestamp).getTime() : Date.now();

      // Engagement span (green for complete, cyan for active, orange for aborted)
      const color = eng.status === 'complete' ? '#22c55e'
        : eng.status === 'aborted' ? '#f97316'
        : '#06b6d4';
      segments.push({ id: eng.id, name: eng.name, startMs, endMs, type: 'engagement', color });

      // Jam burst sub-segments (yellow/red overlay)
      for (const burst of eng.bursts || []) {
        if (!burst.jam_on_at) continue;
        const burstStart = new Date(burst.jam_on_at).getTime();
        const burstEnd = burst.jam_off_at ? new Date(burst.jam_off_at).getTime() : Date.now();
        const burstColor = burst.gps_denial_detected ? '#ef4444' : '#eab308';
        segments.push({ id: burst.id, name: `Burst ${burst.burst_seq}`, startMs: burstStart, endMs: burstEnd, type: 'jam_burst', color: burstColor });
      }
    }
  }

  // Get connection status styling
  const getConnectionClass = (): string => {
    switch (connectionStatus) {
      case 'connected': return '';
      case 'connecting': return 'ws-connecting';
      case 'disconnected': return 'ws-disconnected';
    }
  };

  const getIndicatorClass = (): string => {
    switch (connectionStatus) {
      case 'connected': return 'connected';
      case 'connecting': return 'connecting';
      case 'disconnected': return 'disconnected';
    }
  };

  return (
    <div className="timeline-control">
      {/* Live Button */}
      <button
        className={`live-btn ${getConnectionClass()} ${isLive ? 'active' : ''}`}
        onClick={handleGoLive}
      >
        <span className={`live-indicator ${getIndicatorClass()}`} />
        {isLive ? 'LIVE' : connectionStatus === 'connected' ? 'GO LIVE' : connectionStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
      </button>

      {/* Time Range Selector */}
      <div className="time-range-selector">
        {TIME_RANGES.map(({ value, label }) => (
          <button
            key={value}
            className={`time-range-btn ${timeRange === value ? 'active' : ''}`}
            onClick={() => setTimeRange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Playback Controls */}
      <div className="playback-controls">
        <button className="playback-btn" onClick={handleGoToStart} title="Go to start" aria-label="Go to start">
          <SkipBack size={14} />
        </button>
        <button className="playback-btn" onClick={handleTogglePlay} title={isPlaying ? 'Pause' : 'Play'} aria-label={isPlaying ? 'Pause playback' : 'Play playback'}>
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>

      {/* Timeline Slider */}
      <div className="timeline-slider-container">
        <span className="timeline-time start">{formatTime(timelineStart)}</span>

        <div
          ref={sliderRef}
          className="timeline-slider"
          onClick={handleSliderClick}
          role="slider"
          aria-label="Timeline position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          tabIndex={0}
        >
          <div className="timeline-track">
            {/* Engagement segments overlay */}
            {segments.map(seg => {
              const leftPct = Math.max(0, ((seg.startMs - timelineStart) / duration) * 100);
              const widthPct = Math.max(0.5, Math.min(100 - leftPct, ((seg.endMs - seg.startMs) / duration) * 100));
              return (
                <div
                  key={seg.id}
                  className={`timeline-segment timeline-segment--${seg.type}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    background: seg.color,
                  }}
                  title={seg.name || seg.type}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (seg.type === 'engagement' && onMarkerClick) {
                      onMarkerClick(seg.id);
                    }
                    // Jump to segment start
                    setCurrentTime(seg.startMs);
                    setIsLive(false);
                    setIsPlaying(false);
                  }}
                />
              );
            })}
            <div
              className="timeline-progress"
              style={{ width: `${position}%` }}
            />
            <div
              className={`timeline-thumb ${isDragging ? 'dragging' : ''}`}
              style={{ left: `${position}%` }}
              onMouseDown={handleMouseDown}
            />
          </div>
        </div>

        <span className="timeline-time end">{formatTime(timelineEnd)}</span>
      </div>

      {/* Current Time Display */}
      <div className="current-time-display">
        <Radio size={12} />
        <span>{formatTime(currentTime)}</span>
        {!isLive && (
          <span className="time-offset">
            -{formatDuration(timelineEnd - currentTime)}
          </span>
        )}
      </div>
    </div>
  );
}
