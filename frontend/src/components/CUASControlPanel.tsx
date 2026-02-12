import { useState } from 'react';
import {
  Radio,
  ChevronUp,
  ChevronDown,
  RotateCw,
  Zap,
  ZapOff,
  Target,
} from 'lucide-react';
import { GlassPanel, GlassButton, Badge } from './ui/GlassUI';
import type { CUASPlacement, CUASProfile } from '../types/workflow';

interface CUASControlPanelProps {
  visible: boolean;
  placements: CUASPlacement[];
  profiles: CUASProfile[];
  jamStates: Map<string, boolean>;
  onToggleJam: (placementId: string) => Promise<boolean>;
  onSetJamState: (placementId: string, isJamming: boolean) => Promise<void>;
}

export default function CUASControlPanel({
  visible,
  placements,
  profiles,
  jamStates,
  onToggleJam,
  onSetJamState,
}: CUASControlPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);

  if (!visible || placements.length === 0) {
    return null;
  }

  const getProfile = (profileId: string): CUASProfile | undefined => {
    return profiles.find(p => p.id === profileId);
  };

  const handleToggleJam = async (placementId: string) => {
    setLoading(placementId);
    try {
      await onToggleJam(placementId);
    } finally {
      setLoading(null);
    }
  };

  const handleJamAll = async (enable: boolean) => {
    setLoading('all');
    try {
      for (const placement of placements) {
        await onSetJamState(placement.id, enable);
      }
    } finally {
      setLoading(null);
    }
  };

  const activeJammers = placements.filter(p => jamStates.get(p.id)).length;

  return (
    <GlassPanel
      style={{
        position: 'absolute',
        top: '120px',
        right: '20px',
        width: '320px',
        zIndex: 50,
        background: 'rgba(20, 20, 35, 0.95)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: activeJammers > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: activeJammers > 0 ? '#ef4444' : 'rgba(255, 255, 255, 0.5)',
            }}
          >
            <Radio size={18} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              CUAS Control
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
              {activeJammers} of {placements.length} active
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeJammers > 0 && (
            <Badge color="red" size="sm">
              JAMMING
            </Badge>
          )}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div style={{ padding: '12px' }}>
          {/* Quick Actions */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={() => handleJamAll(true)}
              disabled={loading === 'all'}
              style={{
                flex: 1,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ef4444',
              }}
            >
              <Zap size={14} />
              Enable All
            </GlassButton>
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={() => handleJamAll(false)}
              disabled={loading === 'all'}
              style={{ flex: 1 }}
            >
              <ZapOff size={14} />
              Disable All
            </GlassButton>
          </div>

          {/* CUAS List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            {placements.map((placement, index) => {
              const profile = getProfile(placement.cuas_profile_id);
              const isJamming = jamStates.get(placement.id) || false;
              const isLoading = loading === placement.id;

              return (
                <div
                  key={placement.id}
                  style={{
                    padding: '12px',
                    background: isJamming
                      ? 'rgba(239, 68, 68, 0.1)'
                      : 'rgba(255, 255, 255, 0.02)',
                    border: isJamming
                      ? '1px solid rgba(239, 68, 68, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Status indicator */}
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: isJamming
                          ? 'rgba(239, 68, 68, 0.3)'
                          : 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isJamming ? '#ef4444' : 'rgba(255, 255, 255, 0.4)',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#fff',
                        }}
                      >
                        {profile?.name || 'Unknown CUAS'}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'rgba(255, 255, 255, 0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '2px',
                        }}
                      >
                        <Target size={10} />
                        {profile?.effective_range_m || 0}m
                        <span style={{ opacity: 0.5 }}>•</span>
                        <RotateCw size={10} />
                        {placement.orientation_deg}°
                      </div>
                    </div>
                  </div>

                  {/* Jam Toggle Button */}
                  <GlassButton
                    variant={isJamming ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => handleToggleJam(placement.id)}
                    disabled={isLoading}
                    style={{
                      minWidth: '72px',
                      background: isJamming
                        ? 'rgba(239, 68, 68, 0.8)'
                        : 'rgba(255, 255, 255, 0.05)',
                      border: isJamming
                        ? '1px solid rgba(239, 68, 68, 0.4)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      color: isJamming ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    {isLoading ? (
                      <RotateCw size={14} className="spin" />
                    ) : isJamming ? (
                      <>
                        <Zap size={14} />
                        JAM
                      </>
                    ) : (
                      <>
                        <ZapOff size={14} />
                        STOP
                      </>
                    )}
                  </GlassButton>
                </div>
              );
            })}
          </div>

          {/* Coverage Info */}
          <div
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '6px',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Radio size={12} />
            Coverage zones shown on map when active
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
