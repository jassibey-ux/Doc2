import React, { useState } from 'react';
import type { SiteDefinition, SiteReconCapture } from '../types/workflow';
import { GlassPanel, GlassCard, GlassButton, Badge } from './ui/GlassUI';

interface SiteReconViewerProps {
  site: SiteDefinition;
  captures: SiteReconCapture[];
  onEnhanceSite?: () => void;       // Trigger fresh 3D capture
  onRefresh3D?: () => void;          // Refresh existing captures
  onOpenLive3D?: () => void;         // Open Site3DViewer
  onSelectCapture?: (capture: SiteReconCapture) => void;
  onClose?: () => void;
}

export const SiteReconViewer: React.FC<SiteReconViewerProps> = ({
  site,
  captures,
  onEnhanceSite,
  onRefresh3D,
  onOpenLive3D,
  onSelectCapture,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedCapture = captures[selectedIndex] || null;

  // Check staleness (>30 days)
  const isStale = site.recon_captured_at
    ? (Date.now() - new Date(site.recon_captured_at).getTime()) > 30 * 24 * 60 * 60 * 1000
    : false;

  const handleThumbnailClick = (index: number) => {
    setSelectedIndex(index);
    if (onSelectCapture && captures[index]) {
      onSelectCapture(captures[index]);
    }
  };

  // Format the capture date for display
  const capturedDateStr = site.recon_captured_at
    ? new Date(site.recon_captured_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  // Empty state
  if (captures.length === 0) {
    return (
      <GlassPanel
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          height: '100%',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>
              Site Recon — {site.name}
            </span>
            <Badge color="gray">No Captures</Badge>
          </div>
          {onClose && (
            <GlassButton variant="ghost" size="sm" onClick={onClose}>
              Close
            </GlassButton>
          )}
        </div>

        {/* Empty state content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            color: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
            }}
          >
            {/* Camera icon via Unicode */}
            &#x1F4F7;
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '14px', marginBottom: '6px', color: 'rgba(255, 255, 255, 0.7)' }}>
              No site recon captures yet.
            </div>
            <div style={{ fontSize: '12px' }}>
              Use Enhance Site to generate 3D screenshots.
            </div>
          </div>
          {onEnhanceSite && (
            <GlassButton variant="primary" size="md" onClick={onEnhanceSite}>
              Enhance Site
            </GlassButton>
          )}
        </div>
      </GlassPanel>
    );
  }

  // Main view with captures
  return (
    <GlassPanel
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>
            Site Recon — {site.name}
          </span>
          <Badge color={isStale ? 'yellow' : 'green'}>
            {captures.length} Capture{captures.length !== 1 ? 's' : ''}
          </Badge>
          {isStale && (
            <Badge color="yellow">Stale</Badge>
          )}
          {capturedDateStr && (
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>
              Captured {capturedDateStr}
            </span>
          )}
        </div>
        {onClose && (
          <GlassButton variant="ghost" size="sm" onClick={onClose}>
            Close
          </GlassButton>
        )}
      </div>

      {/* Staleness warning banner */}
      {isStale && (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#fbbf24',
          }}
        >
          <span>
            Recon captures are over 30 days old and may not reflect current site conditions.
          </span>
          {onRefresh3D && (
            <GlassButton variant="ghost" size="sm" onClick={onRefresh3D} style={{ color: '#fbbf24' }}>
              Refresh
            </GlassButton>
          )}
        </div>
      )}

      {/* Main image area */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {selectedCapture ? (
          <>
            <img
              src={`/api/site-recon/${site.id}/images/${selectedCapture.id}`}
              alt={selectedCapture.label}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            {/* Label overlay */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                background: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderRadius: '6px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                {selectedCapture.label}
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                {selectedIndex + 1} / {captures.length}
              </span>
            </div>
            {/* Camera state overlay (bottom-right) */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '10px',
                fontFamily: 'monospace',
                color: 'rgba(255, 255, 255, 0.5)',
                lineHeight: '1.5',
              }}
            >
              <div>HDG {selectedCapture.cameraState.heading.toFixed(0)} | PITCH {selectedCapture.cameraState.pitch.toFixed(0)}</div>
              <div>ALT {selectedCapture.cameraState.height.toFixed(0)}m</div>
            </div>
          </>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255, 255, 255, 0.3)',
              fontSize: '13px',
            }}
          >
            No capture selected
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: '4px',
          flexShrink: 0,
        }}
      >
        {captures.map((capture, index) => (
          <GlassCard
            key={capture.id}
            selected={index === selectedIndex}
            onClick={() => handleThumbnailClick(index)}
            style={{
              flexShrink: 0,
              width: '100px',
              padding: '4px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '92px',
                height: '60px',
                borderRadius: '6px',
                overflow: 'hidden',
                background: 'rgba(0, 0, 0, 0.3)',
                marginBottom: '4px',
              }}
            >
              <img
                src={`/api/site-recon/${site.id}/images/${capture.id}`}
                alt={capture.label}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 500,
                color: index === selectedIndex
                  ? 'rgba(255, 140, 0, 0.9)'
                  : 'rgba(255, 255, 255, 0.6)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {capture.label}
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Button row */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexShrink: 0,
          justifyContent: 'flex-end',
        }}
      >
        {onEnhanceSite && (
          <GlassButton variant="primary" size="sm" onClick={onEnhanceSite}>
            Enhance Site
          </GlassButton>
        )}
        {onRefresh3D && (
          <GlassButton variant="secondary" size="sm" onClick={onRefresh3D}>
            Refresh 3D
          </GlassButton>
        )}
        {onOpenLive3D && (
          <GlassButton variant="secondary" size="sm" onClick={onOpenLive3D}>
            Open Live 3D
          </GlassButton>
        )}
      </div>
    </GlassPanel>
  );
};
