/**
 * Link Budget Panel
 *
 * Displays point-to-point RF link budget analysis between a CUAS and target.
 * Shows EIRP, path loss, Rx sensitivity, J/S ratio, and margin.
 */

import React, { useState, useEffect } from 'react';

interface LinkBudgetData {
  distance_m: number;
  path_loss_db: number;
  eirp_dbm: number;
  rx_power_dbm: number;
  js_ratio_db: number;
  gps_denial_effective: boolean;
  terrain_los: boolean;
  fresnel_clearance_pct: number;
  clutter_loss_db: number;
  gps_received_power_dbm: number;
}

interface Props {
  cuasLat: number;
  cuasLon: number;
  cuasHeightM?: number;
  cuasEirpDbm?: number;
  cuasFrequencyMhz?: number;
  cuasAntennaPattern?: string;
  cuasBeamWidthDeg?: number;
  cuasOrientationDeg?: number;
  cuasMinJsRatioDb?: number;
  targetLat: number;
  targetLon: number;
  targetHeightM?: number;
  environment?: string;
  onClose?: () => void;
}

const API_BASE = '';

const LinkBudgetPanel: React.FC<Props> = ({
  cuasLat, cuasLon,
  cuasHeightM = 5,
  cuasEirpDbm = 40,
  cuasFrequencyMhz = 1575.42,
  cuasAntennaPattern = 'omni',
  cuasBeamWidthDeg = 360,
  cuasOrientationDeg = 0,
  cuasMinJsRatioDb = 20,
  targetLat, targetLon,
  targetHeightM = 50,
  environment = 'open_field',
  onClose,
}) => {
  const [data, setData] = useState<LinkBudgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLinkBudget = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/v2/terrain/link-budget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cuas_lat: cuasLat,
            cuas_lon: cuasLon,
            cuas_height_m: cuasHeightM,
            cuas_eirp_dbm: cuasEirpDbm,
            cuas_frequency_mhz: cuasFrequencyMhz,
            cuas_antenna_pattern: cuasAntennaPattern,
            cuas_beam_width_deg: cuasBeamWidthDeg,
            cuas_orientation_deg: cuasOrientationDeg,
            cuas_min_js_ratio_db: cuasMinJsRatioDb,
            target_lat: targetLat,
            target_lon: targetLon,
            target_height_m: targetHeightM,
            environment,
          }),
        });

        if (res.ok) {
          setData(await res.json());
        }
      } catch (e) {
        console.error('Link budget fetch failed:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchLinkBudget();
  }, [cuasLat, cuasLon, cuasHeightM, cuasEirpDbm, cuasFrequencyMhz,
      cuasAntennaPattern, cuasBeamWidthDeg, cuasOrientationDeg, cuasMinJsRatioDb,
      targetLat, targetLon, targetHeightM, environment]);

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px solid #333',
    fontSize: 12,
  };

  const labelStyle: React.CSSProperties = { color: '#aaa' };
  const valueStyle: React.CSSProperties = { color: '#fff', fontFamily: 'monospace' };

  const statusColor = (ok: boolean) => ok ? '#22c55e' : '#ef4444';

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 8,
        padding: 16,
        minWidth: 280,
        position: 'relative',
      }}
    >
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 4, right: 8,
            background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16,
          }}
        >
          x
        </button>
      )}

      <h4 style={{ color: '#f97316', margin: '0 0 12px', fontSize: 14 }}>Link Budget Analysis</h4>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 20 }}>Computing...</div>
      ) : data ? (
        <>
          <div style={rowStyle}>
            <span style={labelStyle}>Distance</span>
            <span style={valueStyle}>{(data.distance_m / 1000).toFixed(2)} km</span>
          </div>

          <h5 style={{ color: '#888', margin: '12px 0 4px', fontSize: 11 }}>TRANSMITTER (CUAS)</h5>
          <div style={rowStyle}>
            <span style={labelStyle}>EIRP</span>
            <span style={valueStyle}>{data.eirp_dbm.toFixed(1)} dBm</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Frequency</span>
            <span style={valueStyle}>{cuasFrequencyMhz.toFixed(2)} MHz</span>
          </div>

          <h5 style={{ color: '#888', margin: '12px 0 4px', fontSize: 11 }}>PROPAGATION</h5>
          <div style={rowStyle}>
            <span style={labelStyle}>Path Loss</span>
            <span style={{ ...valueStyle, color: '#ef4444' }}>-{data.path_loss_db.toFixed(1)} dB</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Clutter Loss</span>
            <span style={{ ...valueStyle, color: '#f59e0b' }}>-{data.clutter_loss_db.toFixed(1)} dB</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Terrain LOS</span>
            <span style={{ ...valueStyle, color: statusColor(data.terrain_los) }}>
              {data.terrain_los ? 'Clear' : 'Blocked'}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Fresnel Clearance</span>
            <span style={{ ...valueStyle, color: data.fresnel_clearance_pct >= 60 ? '#22c55e' : '#f59e0b' }}>
              {data.fresnel_clearance_pct.toFixed(0)}%
            </span>
          </div>

          <h5 style={{ color: '#888', margin: '12px 0 4px', fontSize: 11 }}>RECEIVER (TARGET)</h5>
          <div style={rowStyle}>
            <span style={labelStyle}>Jammer Rx Power</span>
            <span style={valueStyle}>{data.rx_power_dbm.toFixed(1)} dBm</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>GPS Rx Power</span>
            <span style={valueStyle}>{data.gps_received_power_dbm.toFixed(1)} dBm</span>
          </div>

          <div style={{ margin: '12px 0', padding: '8px 12px', background: '#222', borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#ccc', fontWeight: 'bold', fontSize: 13 }}>J/S Ratio</span>
              <span style={{
                color: data.gps_denial_effective ? '#22c55e' : '#ef4444',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                fontSize: 16,
              }}>
                {data.js_ratio_db.toFixed(1)} dB
              </span>
            </div>
            <div style={{
              fontSize: 11,
              color: data.gps_denial_effective ? '#22c55e' : '#ef4444',
              marginTop: 4,
            }}>
              {data.gps_denial_effective
                ? `GPS denial effective (threshold: ${cuasMinJsRatioDb} dB)`
                : `Below threshold (need ${cuasMinJsRatioDb} dB)`
              }
            </div>
          </div>

          {/* Visual bar showing J/S vs threshold */}
          <div style={{ background: '#222', borderRadius: 4, height: 8, overflow: 'hidden', marginTop: 4 }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, (data.js_ratio_db / (cuasMinJsRatioDb * 2)) * 100))}%`,
                height: '100%',
                background: data.gps_denial_effective ? '#22c55e' : '#ef4444',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </>
      ) : (
        <div style={{ color: '#888', textAlign: 'center', padding: 20 }}>No data</div>
      )}
    </div>
  );
};

export default LinkBudgetPanel;
