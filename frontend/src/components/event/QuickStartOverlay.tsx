/**
 * QuickStartOverlay — Centered overlay rendered on top of the map area
 * when no drones are detected. Glass morphism styling matching the dark theme.
 *
 * Two variants:
 * 1. Backend available: scenario radio cards + "Launch Demo" button
 * 2. Backend unavailable: "Start Client Demo" button for frontend-only preview
 */

import React, { useState } from 'react';
import type { DemoScenario } from './hooks/useBackendStatus';

interface QuickStartOverlayProps {
  scenarios: DemoScenario[];
  backendAvailable: boolean;
  isLoading: boolean;
  onLaunchDemo: (scenarioId: string) => void;
  onStartClientDemo: () => void;
  onDismiss: () => void;
}

const QuickStartOverlay: React.FC<QuickStartOverlayProps> = ({
  scenarios,
  backendAvailable,
  isLoading,
  onLaunchDemo,
  onStartClientDemo,
  onDismiss,
}) => {
  const [selectedScenario, setSelectedScenario] = useState<string>(
    scenarios[0]?.id ?? 'default',
  );

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      background: 'rgba(0, 0, 0, 0.4)',
    }}>
      <div style={{
        width: 420,
        maxWidth: 'calc(100% - 32px)',
        background: 'rgba(15, 15, 20, 0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '28px 28px 24px',
        color: '#e5e5e5',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 600,
            color: '#fff',
            letterSpacing: '-0.01em',
          }}>
            Event Dashboard Quick Start
          </h2>
          <p style={{
            margin: '8px 0 0',
            fontSize: 13,
            color: '#888',
            lineHeight: 1.5,
          }}>
            {backendAvailable
              ? 'No drone data detected. Select a demo scenario to populate the dashboard.'
              : 'Backend not connected \u2014 preview mode. Launch a client-side demo to explore the dashboard with simulated data.'}
          </p>
        </div>

        {/* Scenario cards (only when backend is available and has scenarios) */}
        {backendAvailable && scenarios.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {scenarios.map(s => (
              <label
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${selectedScenario === s.id ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255, 255, 255, 0.06)'}`,
                  background: selectedScenario === s.id ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
                onClick={() => setSelectedScenario(s.id)}
              >
                <input
                  type="radio"
                  name="scenario"
                  value={s.id}
                  checked={selectedScenario === s.id}
                  onChange={() => setSelectedScenario(s.id)}
                  style={{ marginTop: 2, accentColor: '#3b82f6' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e5e5' }}>
                    {s.name}
                    {s.droneCount != null && (
                      <span style={{ color: '#888', fontWeight: 400 }}> — {s.droneCount} drones</span>
                    )}
                  </div>
                  {s.description && (
                    <div style={{ fontSize: 12, color: '#777', marginTop: 2, lineHeight: 1.4 }}>
                      {s.description}
                      {s.location && <> ({s.location})</>}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Backend available but no scenarios returned */}
        {backendAvailable && scenarios.length === 0 && (
          <div style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(255, 255, 255, 0.02)',
            marginBottom: 20,
            fontSize: 13,
            color: '#888',
          }}>
            Backend connected but no scenarios found. You can still launch the default demo.
          </div>
        )}

        {/* Client demo fallback card (when backend is unavailable) */}
        {!backendAvailable && (
          <div style={{
            padding: '14px 14px',
            borderRadius: 10,
            border: '1px solid rgba(249, 115, 22, 0.25)',
            background: 'rgba(249, 115, 22, 0.05)',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#f97316',
              flexShrink: 0,
            }} />
            <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
              4 simulated drones with patrol patterns, battery drain, and geofence zones.
              Real backend data will seamlessly replace the simulation when available.
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
        }}>
          <button
            onClick={onDismiss}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'transparent',
              color: '#999',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = '#ccc';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#999';
            }}
          >
            Dismiss
          </button>

          {backendAvailable ? (
            <button
              onClick={() => onLaunchDemo(selectedScenario)}
              disabled={isLoading}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: isLoading
                  ? 'rgba(59, 130, 246, 0.3)'
                  : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: isLoading ? 'wait' : 'pointer',
                transition: 'all 150ms ease',
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? 'Launching…' : 'Launch Demo'}
            </button>
          ) : (
            <button
              onClick={onStartClientDemo}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              Start Client Demo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickStartOverlay;
