/**
 * ApiUsageSection — Dashboard for monitoring Google Maps API consumption.
 *
 * Shows session stats, daily totals, estimated costs, and a link
 * to Google Cloud Console for official billing data.
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Map,
  Layers,
  Clock,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { GlassCard, GlassButton, GlassDivider, Badge } from './ui/GlassUI';
import { useApiUsage } from '../contexts/ApiUsageContext';

const GOOGLE_BILLING_URL = 'https://console.cloud.google.com/billing';

function formatCost(dollars: number): string {
  if (dollars < 0.01) return '$0.00';
  return `$${dollars.toFixed(2)}`;
}

function formatDuration(startMs: number): string {
  const elapsed = Math.floor((Date.now() - startMs) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const ApiUsageSection: React.FC = () => {
  const usage = useApiUsage();
  const [, setTick] = useState(0);

  // Tick every second to update session duration
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const layerNames = Object.keys(usage.sessionLayerBreakdown);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Session Stats */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <Zap size={12} />
        Session Stats
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
          {formatDuration(usage.sessionStart)}
        </span>
      </div>

      <GlassCard style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <StatBox icon={<Map size={14} />} label="Tile Loads" value={usage.sessionTileLoads} color="#3b82f6" />
          <StatBox icon={<Layers size={14} />} label="Map Inits" value={usage.sessionMapInits} color="#22c55e" />
          <StatBox icon={<BarChart3 size={14} />} label="Layer Renders" value={usage.sessionLayerRenders} color="#f59e0b" />
        </div>
      </GlassCard>

      {/* Layer Breakdown */}
      {layerNames.length > 0 && (
        <GlassCard style={{ padding: 12 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            Layer Breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {layerNames.sort().map(name => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{name}</span>
                <span style={{ fontFamily: 'monospace', color: '#f59e0b' }}>
                  {usage.sessionLayerBreakdown[name]}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Session Cost Estimate */}
      <GlassCard style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Est. Session Cost</div>
          <span style={{
            fontFamily: 'monospace',
            fontSize: 18,
            fontWeight: 700,
            color: usage.sessionCost > 1 ? '#ef4444' : usage.sessionCost > 0.1 ? '#f59e0b' : '#22c55e',
          }}>
            {formatCost(usage.sessionCost)}
          </span>
        </div>
      </GlassCard>

      <GlassDivider />

      {/* Daily Totals */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingUp size={12} />
        Daily Totals
        <Badge color="blue" size="sm">Today</Badge>
      </div>

      <GlassCard style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <StatBox icon={<Map size={14} />} label="Tiles" value={usage.dailyTileLoads} color="#3b82f6" />
          <StatBox icon={<Layers size={14} />} label="Map Inits" value={usage.dailyMapInits} color="#22c55e" />
          <StatBox icon={<BarChart3 size={14} />} label="Layers" value={usage.dailyLayerRenders} color="#f59e0b" />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Est. Daily Cost</span>
          <span style={{
            fontFamily: 'monospace', fontSize: 14, fontWeight: 600,
            color: usage.dailyCost > 5 ? '#ef4444' : usage.dailyCost > 1 ? '#f59e0b' : '#22c55e',
          }}>
            {formatCost(usage.dailyCost)}
          </span>
        </div>
      </GlassCard>

      {/* Free Credit Reminder */}
      <div style={{
        fontSize: 10, color: 'rgba(255,255,255,0.4)',
        padding: '6px 10px', background: 'rgba(59, 130, 246, 0.08)',
        borderRadius: 6, border: '1px solid rgba(59, 130, 246, 0.15)',
      }}>
        Google Maps provides $200/month free credit. Estimated costs shown are approximate.
      </div>

      <GlassDivider />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <GlassButton
          variant="secondary"
          size="md"
          onClick={usage.resetSession}
          style={{ flex: 1 }}
        >
          <RefreshCw size={14} />
          Reset Session
        </GlassButton>
        <GlassButton
          variant="primary"
          size="md"
          onClick={() => window.open(GOOGLE_BILLING_URL, '_blank')}
          style={{ flex: 1 }}
        >
          <ExternalLink size={14} />
          View Billing
        </GlassButton>
      </div>
    </div>
  );
};

const StatBox: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}> = ({ icon, label, value, color }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ color, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{icon}</div>
    <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#fff' }}>
      {value.toLocaleString()}
    </div>
    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
      {label}
    </div>
  </div>
);

export default ApiUsageSection;
