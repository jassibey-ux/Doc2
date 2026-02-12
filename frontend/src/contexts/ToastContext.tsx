import React, { createContext, useContext, useCallback, useState, ReactNode } from 'react';
import { ToastContainer, ToastData, ToastType, ToastAction } from '../components/ui/Toast';

interface ToastOptions {
  duration?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000; // 5 seconds

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const newToast: ToastData = {
        id,
        type,
        message,
        duration: options?.duration ?? DEFAULT_DURATION,
        action: options?.action,
      };

      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, clearAll }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

/**
 * Hook to access toast functionality
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

/**
 * Convenience functions for common toast types
 */
export function useToastHelpers() {
  const { showToast, dismissToast, clearAll } = useToast();

  return {
    success: (message: string, options?: ToastOptions) => showToast('success', message, options),
    error: (message: string, options?: ToastOptions) => showToast('error', message, options),
    warning: (message: string, options?: ToastOptions) => showToast('warning', message, options),
    info: (message: string, options?: ToastOptions) => showToast('info', message, options),
    dismiss: dismissToast,
    clearAll,
  };
}

export default ToastContext;
