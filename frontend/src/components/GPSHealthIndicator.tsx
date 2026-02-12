/**
 * GPS Health Indicator Component
 * Displays GPS health status with color-coded indicators
 *
 * Two modes:
 * - Compact: Small colored circle for list items
 * - Full: Expanded card with details
 */

import React from 'react';
import { Satellite, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { GPSHealthSummary, GPSHealthStatus } from '../types/drone';

interface GPSHealthIndicatorProps {
  health: GPSHealthSummary;
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
}

// Health status colors
const STATUS_COLORS: Record<GPSHealthStatus, { bg: string; text: string; border: string; glow: string }> = {
  healthy: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    glow: '#22c55e',
  },
  degraded: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    glow: '#eab308',
  },
  lost: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    glow: '#ef4444',
  },
};

// Status labels
const STATUS_LABELS: Record<GPSHealthStatus, string> = {
  healthy: 'GPS OK',
  degraded: 'GPS Weak',
  lost: 'No GPS',
};

// Get status icon component
function getStatusIcon(status: GPSHealthStatus, size: number = 14) {
  switch (status) {
    case 'healthy':
      return <CheckCircle size={size} className="text-green-400" />;
    case 'degraded':
      return <AlertTriangle size={size} className="text-yellow-400" />;
    case 'lost':
      return <XCircle size={size} className="text-red-400" />;
  }
}

// Format duration in human-readable format
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// Get health score color
function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

export function GPSHealthIndicator({ health, compact = false, showLabel = true, className = '' }: GPSHealthIndicatorProps) {
  const colors = STATUS_COLORS[health.health_status];

  // Compact mode - just a small indicator
  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <div
          className={`w-2 h-2 rounded-full ${colors.bg} border ${colors.border}`}
          style={{ boxShadow: `0 0 4px ${colors.glow}40` }}
          title={`GPS: ${STATUS_LABELS[health.health_status]}`}
        />
        {showLabel && (
          <span className={`text-xs ${colors.text}`}>
            {STATUS_LABELS[health.health_status]}
          </span>
        )}
      </div>
    );
  }

  // Full mode - detailed card
  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg p-3 ${className}`}>
      {/* Header with status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Satellite size={16} className={colors.text} />
          <span className={`font-medium ${colors.text}`}>
            {STATUS_LABELS[health.health_status]}
          </span>
        </div>
        {getStatusIcon(health.health_status, 18)}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* HDOP */}
        <div className="flex justify-between">
          <span className="text-white/50">HDOP</span>
          <span className={health.hdop && health.hdop > 5 ? 'text-yellow-400' : 'text-white/80'}>
            {health.hdop?.toFixed(1) ?? 'N/A'}
          </span>
        </div>

        {/* Satellites */}
        <div className="flex justify-between">
          <span className="text-white/50">Sats</span>
          <span className={health.satellites && health.satellites < 4 ? 'text-yellow-400' : 'text-white/80'}>
            {health.satellites ?? 'N/A'}
          </span>
        </div>

        {/* Health Score */}
        <div className="flex justify-between">
          <span className="text-white/50">Score</span>
          <span className={getScoreColor(health.health_score)}>
            {health.health_score}/100
          </span>
        </div>

        {/* Fix Availability */}
        <div className="flex justify-between">
          <span className="text-white/50">Avail</span>
          <span className="text-white/80">
            {health.fix_availability_percent.toFixed(1)}%
          </span>
        </div>

        {/* Fix Loss Events */}
        {health.total_fix_loss_events > 0 && (
          <div className="flex justify-between col-span-2">
            <span className="text-white/50">Loss Events</span>
            <span className="text-yellow-400">
              {health.total_fix_loss_events}
            </span>
          </div>
        )}

        {/* Current Loss Duration (if lost) */}
        {health.current_loss_duration_ms !== null && (
          <div className="flex justify-between col-span-2">
            <span className="text-white/50">Lost For</span>
            <span className="text-red-400 animate-pulse">
              {formatDuration(health.current_loss_duration_ms)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact GPS health badge for list items
 */
export function GPSHealthBadge({ health, className = '' }: { health: GPSHealthSummary; className?: string }) {
  if (health.health_status === 'healthy') {
    return null; // Don't show badge when healthy
  }

  const colors = STATUS_COLORS[health.health_status];

  return (
    <div
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text} ${className}`}
    >
      <Satellite size={10} />
      {health.health_status === 'degraded' ? 'GPS WEAK' : 'NO GPS'}
    </div>
  );
}

/**
 * GPS health ring indicator for map markers
 */
export function getGPSHealthRingStyle(status: GPSHealthStatus): React.CSSProperties {
  const colors = STATUS_COLORS[status];
  return {
    boxShadow: `0 0 0 3px ${colors.glow}, 0 0 8px ${colors.glow}40`,
  };
}

/**
 * Fleet GPS health summary widget
 */
interface FleetGPSHealthProps {
  healthyCounts: number;
  degradedCount: number;
  lostCount: number;
  compact?: boolean;
}

export function FleetGPSHealthWidget({ healthyCounts, degradedCount, lostCount, compact = false }: FleetGPSHealthProps) {
  const total = healthyCounts + degradedCount + lostCount;

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <Satellite size={12} className="text-white/50" />
        <span className="text-green-400">{healthyCounts}</span>
        <span className="text-white/30">/</span>
        <span className="text-yellow-400">{degradedCount}</span>
        <span className="text-white/30">/</span>
        <span className="text-red-400">{lostCount}</span>
      </div>
    );
  }

  // Calculate percentages for progress bar
  const healthyPct = total > 0 ? (healthyCounts / total) * 100 : 0;
  const degradedPct = total > 0 ? (degradedCount / total) * 100 : 0;
  const lostPct = total > 0 ? (lostCount / total) * 100 : 0;

  return (
    <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Satellite size={14} className="text-white/60" />
        <span className="text-sm font-medium text-white/80">Fleet GPS Health</span>
      </div>

      {/* Stacked progress bar */}
      <div className="h-2 rounded-full overflow-hidden flex mb-2">
        {healthyPct > 0 && (
          <div
            className="bg-green-500 h-full"
            style={{ width: `${healthyPct}%` }}
          />
        )}
        {degradedPct > 0 && (
          <div
            className="bg-yellow-500 h-full"
            style={{ width: `${degradedPct}%` }}
          />
        )}
        {lostPct > 0 && (
          <div
            className="bg-red-500 h-full"
            style={{ width: `${lostPct}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex justify-between text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-white/60">OK: {healthyCounts}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-white/60">Weak: {degradedCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-white/60">Lost: {lostCount}</span>
        </div>
      </div>
    </div>
  );
}

export default GPSHealthIndicator;
