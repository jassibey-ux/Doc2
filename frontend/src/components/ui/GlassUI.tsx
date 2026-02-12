import React from 'react';

interface GlassProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

/**
 * GlassPanel - Primary glass container with backdrop blur
 */
export const GlassPanel: React.FC<GlassProps> = ({ children, className = '', style, onClick }) => (
  <div
    onClick={onClick}
    className={`glass-panel ${className}`}
    style={{
      background: 'rgba(20, 20, 35, 0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * GlassCard - Subtle glass card for list items
 */
export const GlassCard: React.FC<GlassProps & { selected?: boolean }> = ({
  children,
  className = '',
  style,
  onClick,
  selected = false
}) => (
  <div
    onClick={onClick}
    className={`glass-card ${selected ? 'selected' : ''} ${className}`}
    style={{
      background: selected ? 'rgba(255, 140, 0, 0.15)' : 'rgba(255, 255, 255, 0.03)',
      border: selected ? '1px solid rgba(255, 140, 0, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
      borderRadius: '10px',
      padding: '12px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * GlassButton - Glass-styled button
 */
interface GlassButtonProps extends GlassProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  className = '',
  style,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled = false
}) => {
  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: 'rgba(255, 140, 0, 0.8)',
      border: '1px solid rgba(255, 140, 0, 0.4)',
      color: '#fff',
    },
    secondary: {
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      color: 'rgba(255, 255, 255, 0.9)',
    },
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: 'rgba(255, 255, 255, 0.7)',
    },
  };

  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: '6px 10px', fontSize: '12px', borderRadius: '6px' },
    md: { padding: '8px 16px', fontSize: '13px', borderRadius: '8px' },
    lg: { padding: '12px 24px', fontSize: '14px', borderRadius: '10px' },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`glass-button ${className}`}
      style={{
        ...variants[variant],
        ...sizes[size],
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        ...style,
      }}
    >
      {children}
    </button>
  );
};

/**
 * Badge - Status and label badges
 */
interface BadgeProps {
  children: React.ReactNode;
  color?: 'green' | 'orange' | 'yellow' | 'red' | 'blue' | 'gray';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ children, color = 'gray', size = 'sm' }) => {
  const colors: Record<string, React.CSSProperties> = {
    green: { background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' },
    orange: { background: 'rgba(255, 140, 0, 0.2)', color: '#ff8c00', border: '1px solid rgba(255, 140, 0, 0.3)' },
    yellow: { background: 'rgba(234, 179, 8, 0.2)', color: '#fbbf24', border: '1px solid rgba(234, 179, 8, 0.3)' },
    red: { background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' },
    blue: { background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' },
    gray: { background: 'rgba(107, 114, 128, 0.2)', color: '#9ca3af', border: '1px solid rgba(107, 114, 128, 0.3)' },
  };

  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: '2px 8px', fontSize: '10px' },
    md: { padding: '4px 10px', fontSize: '11px' },
  };

  return (
    <span
      style={{
        ...colors[color],
        ...sizes[size],
        borderRadius: '6px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {children}
    </span>
  );
};

/**
 * StatusDot - Animated status indicator
 */
interface StatusDotProps {
  status: 'online' | 'offline' | 'stale' | 'warning';
  pulse?: boolean;
  size?: number;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, pulse = true, size = 8 }) => {
  const colors: Record<string, string> = {
    online: '#22c55e',
    offline: '#6b7280',
    stale: '#ef4444',
    warning: '#eab308',
  };

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
      }}
    >
      {pulse && status === 'online' && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: colors[status],
            animation: 'pulse-ring 2s infinite',
            opacity: 0.75,
          }}
        />
      )}
      <span
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '50%',
          background: colors[status],
        }}
      />
    </span>
  );
};

/**
 * ResizeHandle - Drag handle for resizable panels
 */
interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  direction?: 'vertical' | 'horizontal';
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  onMouseDown,
  direction = 'vertical'
}) => (
  <div
    className="resize-handle"
    onMouseDown={onMouseDown}
    style={{
      position: 'relative',
      cursor: direction === 'vertical' ? 'col-resize' : 'row-resize',
      width: direction === 'vertical' ? '6px' : '100%',
      height: direction === 'vertical' ? '100%' : '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    }}
  >
    <div
      style={{
        width: direction === 'vertical' ? '2px' : '40px',
        height: direction === 'vertical' ? '40px' : '2px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '2px',
        transition: 'background 0.2s',
      }}
    />
  </div>
);

/**
 * SignalBars - Visual signal strength indicator
 */
interface SignalBarsProps {
  rssiDbm: number;
  showValue?: boolean;
}

export const SignalBars: React.FC<SignalBarsProps> = ({ rssiDbm, showValue = true }) => {
  const getSignalLevel = (rssi: number): { bars: number; color: string; label: string } => {
    if (rssi >= -50) return { bars: 5, color: '#22c55e', label: 'Excellent' };
    if (rssi >= -60) return { bars: 4, color: '#22c55e', label: 'Good' };
    if (rssi >= -70) return { bars: 3, color: '#eab308', label: 'Fair' };
    if (rssi >= -80) return { bars: 2, color: '#f97316', label: 'Poor' };
    if (rssi >= -90) return { bars: 1, color: '#ef4444', label: 'Weak' };
    return { bars: 0, color: '#ef4444', label: 'Critical' };
  };

  const { bars, color } = getSignalLevel(rssiDbm);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map((bar) => (
        <div
          key={bar}
          style={{
            width: '4px',
            height: `${bar * 4}px`,
            borderRadius: '1px',
            background: bar <= bars ? color : 'rgba(255, 255, 255, 0.1)',
            transition: 'background 0.2s',
          }}
        />
      ))}
      {showValue && (
        <span style={{ marginLeft: '6px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
          {rssiDbm} dBm
        </span>
      )}
    </div>
  );
};

/**
 * ProgressBar - Battery or progress indicator
 */
interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'auto' | 'green' | 'orange' | 'red';
  showLabel?: boolean;
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  color = 'auto',
  showLabel = true,
  label,
}) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  const getColor = () => {
    if (color !== 'auto') {
      const colorMap: Record<string, string> = {
        green: '#22c55e',
        orange: '#ff8c00',
        red: '#ef4444',
      };
      return colorMap[color];
    }
    if (percent > 50) return '#22c55e';
    if (percent > 20) return '#eab308';
    return '#ef4444';
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
      <div
        style={{
          flex: 1,
          height: '6px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: getColor(),
            borderRadius: '3px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {showLabel && (
        <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', minWidth: '40px' }}>
          {label || `${Math.round(percent)}%`}
        </span>
      )}
    </div>
  );
};

/**
 * GlassInput - Glass-styled input field
 */
interface GlassInputProps {
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  type?: string;
  style?: React.CSSProperties;
  className?: string;
  autoFocus?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  disabled?: boolean;
}

export const GlassInput: React.FC<GlassInputProps> = ({
  placeholder,
  value,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  type = 'text',
  style,
  className = '',
  autoFocus,
  min,
  max,
  step,
  disabled,
}) => (
  <input
    type={type}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    onKeyDown={onKeyDown}
    onFocus={onFocus}
    onBlur={onBlur}
    className={className}
    autoFocus={autoFocus}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    style={{
      width: '100%',
      padding: '10px 14px',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      color: '#fff',
      fontSize: '13px',
      outline: 'none',
      transition: 'all 0.2s',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'text',
      ...style,
    }}
  />
);

/**
 * GlassSelect - Glass-styled select dropdown
 */
interface GlassSelectProps {
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export const GlassSelect: React.FC<GlassSelectProps> = ({
  value,
  defaultValue,
  onChange,
  children,
  style,
  className = '',
  disabled,
  id,
}) => (
  <select
    id={id}
    value={value}
    defaultValue={defaultValue}
    onChange={onChange}
    className={className}
    disabled={disabled}
    style={{
      width: '100%',
      padding: '10px 14px',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      color: '#fff',
      fontSize: '13px',
      outline: 'none',
      transition: 'all 0.2s',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      paddingRight: '36px',
      ...style,
    }}
  >
    {children}
  </select>
);

/**
 * GlassTextarea - Glass-styled textarea
 */
interface GlassTextareaProps {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  style?: React.CSSProperties;
  className?: string;
  rows?: number;
  disabled?: boolean;
}

export const GlassTextarea: React.FC<GlassTextareaProps> = ({
  placeholder,
  value,
  onChange,
  style,
  className = '',
  rows = 3,
  disabled,
}) => (
  <textarea
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    className={className}
    rows={rows}
    disabled={disabled}
    style={{
      width: '100%',
      padding: '10px 14px',
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      color: '#fff',
      fontSize: '13px',
      outline: 'none',
      transition: 'all 0.2s',
      fontFamily: 'inherit',
      resize: 'vertical',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'text',
      ...style,
    }}
  />
);

/**
 * GlassDivider - Subtle divider line
 */
export const GlassDivider: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      height: '1px',
      background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
      margin: '12px 0',
      ...style,
    }}
  />
);

/**
 * DataRow - Label/value row for data display
 */
interface DataRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  style?: React.CSSProperties;
}

export const DataRow: React.FC<DataRowProps> = ({ label, value, unit, style }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 0',
      ...style,
    }}
  >
    <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>{label}</span>
    <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.9)', fontFamily: 'monospace' }}>
      {value}{unit && <span style={{ marginLeft: '4px', color: 'rgba(255, 255, 255, 0.5)' }}>{unit}</span>}
    </span>
  </div>
);
