import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertCircle size={18} />,
  info: <Info size={18} />,
};

const colorMap: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.4)',
    icon: '#4ade80',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    icon: '#f87171',
  },
  warning: {
    bg: 'rgba(234, 179, 8, 0.15)',
    border: 'rgba(234, 179, 8, 0.4)',
    icon: '#fbbf24',
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.4)',
    icon: '#60a5fa',
  },
};

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const colors = colorMap[toast.type];

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => onDismiss(toast.id), 200);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: colors.bg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${colors.border}`,
        borderRadius: '10px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
        minWidth: '300px',
        maxWidth: '450px',
        animation: isExiting
          ? 'toast-slide-out 0.2s ease-out forwards'
          : 'toast-slide-in 0.3s ease-out',
      }}
    >
      <span style={{ color: colors.icon, flexShrink: 0 }}>
        {iconMap[toast.type]}
      </span>

      <span
        style={{
          flex: 1,
          color: 'rgba(255, 255, 255, 0.95)',
          fontSize: '13px',
          lineHeight: 1.4,
        }}
      >
        {toast.message}
      </span>

      {toast.action && (
        <button
          onClick={() => {
            toast.action?.onClick();
            handleDismiss();
          }}
          style={{
            padding: '4px 10px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {toast.action.label}
        </button>
      )}

      <button
        onClick={handleDismiss}
        style={{
          padding: '4px',
          background: 'transparent',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.5)',
          cursor: 'pointer',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
};

/**
 * ToastContainer - Renders the toast stack
 */
interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none',
      }}
    >
      <style>
        {`
          @keyframes toast-slide-in {
            from {
              opacity: 0;
              transform: translateX(100%);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          @keyframes toast-slide-out {
            from {
              opacity: 1;
              transform: translateX(0);
            }
            to {
              opacity: 0;
              transform: translateX(100%);
            }
          }
        `}
      </style>
      {toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <Toast toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
};

export default Toast;
