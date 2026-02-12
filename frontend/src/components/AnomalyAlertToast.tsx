/**
 * AnomalyAlertToast Component
 * Displays toast notifications for anomaly alerts (GPS loss, position jump, etc.)
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  SignalZero,
  Signal,
  Zap,
  MapPin,
  Wifi,
  WifiOff,
  Battery,
  BatteryWarning,
  X,
} from 'lucide-react';
import type { AnomalyAlert } from '../contexts/WebSocketContext';

interface AnomalyAlertToastProps {
  alert: AnomalyAlert | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}

// Icon mapping for alert types
const ALERT_ICONS: Record<string, React.ReactNode> = {
  gps_lost: <SignalZero size={20} />,
  gps_acquired: <Signal size={20} />,
  altitude_anomaly: <Zap size={20} />,
  position_jump: <MapPin size={20} />,
  link_lost: <WifiOff size={20} />,
  link_restored: <Wifi size={20} />,
  low_battery: <Battery size={20} />,
  battery_critical: <BatteryWarning size={20} />,
};

// Colors by alert level
const LEVEL_COLORS = {
  info: {
    bg: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.4)',
    icon: '#22c55e',
    text: '#22c55e',
  },
  warning: {
    bg: 'rgba(234, 179, 8, 0.15)',
    border: 'rgba(234, 179, 8, 0.4)',
    icon: '#eab308',
    text: '#eab308',
  },
  critical: {
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    icon: '#ef4444',
    text: '#ef4444',
  },
};

export default function AnomalyAlertToast({
  alert,
  onDismiss,
  autoDismissMs = 5000,
}: AnomalyAlertToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (alert) {
      setIsVisible(true);
      setIsExiting(false);

      // Auto-dismiss timer
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoDismissMs);

      return () => clearTimeout(timer);
    }
  }, [alert, autoDismissMs]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      onDismiss();
    }, 300);
  };

  if (!alert || !isVisible) return null;

  const colors = LEVEL_COLORS[alert.level] || LEVEL_COLORS.warning;
  const icon = ALERT_ICONS[alert.type] || <AlertTriangle size={20} />;

  return (
    <div
      style={{
        position: 'fixed',
        top: '80px',
        right: '20px',
        zIndex: 9999,
        minWidth: '320px',
        maxWidth: '400px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        transform: isExiting ? 'translateX(120%)' : 'translateX(0)',
        opacity: isExiting ? 0 : 1,
        transition: 'all 0.3s ease',
        animation: !isExiting ? 'slideInRight 0.3s ease' : undefined,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: `${colors.icon}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.icon,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: colors.text,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {alert.level === 'critical' ? 'Critical Alert' : alert.level === 'warning' ? 'Warning' : 'Info'}
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.5)',
              fontFamily: 'monospace',
            }}
          >
            {alert.tracker_id}
          </span>
        </div>

        <div
          style={{
            fontSize: '14px',
            color: '#fff',
            lineHeight: 1.4,
          }}
        >
          {alert.message}
        </div>

        <div
          style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.5)',
            marginTop: '6px',
          }}
        >
          {new Date(alert.timestamp).toLocaleTimeString()}
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '4px',
          cursor: 'pointer',
          color: 'rgba(255, 255, 255, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)')}
      >
        <X size={16} />
      </button>

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
