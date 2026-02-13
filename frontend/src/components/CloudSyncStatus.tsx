/**
 * Cloud Sync Status Indicator
 *
 * Shows sync state (queued/syncing/synced/error) in the UI.
 * Allows toggling cloud sync on/off and configuring cloud URL/API key.
 */

import React, { useState, useEffect, useCallback } from 'react';

interface SyncStatus {
  enabled: boolean;
  connected: boolean;
  pending_records: number;
  last_push_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

interface CloudConfig {
  enabled: boolean;
  cloud_url: string;
  api_key: string;
  organization_id: string;
  push_interval_ms: number;
  batch_size: number;
}

const API_BASE = '';

export const CloudSyncStatus: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [configForm, setConfigForm] = useState({
    cloud_url: '',
    api_key: '',
    organization_id: '',
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cloud-sync/status`);
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Server not available
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cloud-sync/config`);
      if (res.ok) {
        const cfg = await res.json();
        setConfig(cfg);
        setConfigForm({
          cloud_url: cfg.cloud_url || '',
          api_key: '',
          organization_id: cfg.organization_id || '',
        });
      }
    } catch {
      // Server not available
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleToggle = async () => {
    if (!status) return;
    const endpoint = status.enabled ? 'stop' : 'start';
    try {
      await fetch(`${API_BASE}/api/cloud-sync/${endpoint}`, { method: 'POST' });
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const handleSaveConfig = async () => {
    const updates: Record<string, unknown> = {
      cloud_url: configForm.cloud_url,
      organization_id: configForm.organization_id,
    };
    if (configForm.api_key) {
      updates.api_key = configForm.api_key;
    }

    try {
      await fetch(`${API_BASE}/api/cloud-sync/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      setShowConfig(false);
      fetchStatus();
    } catch {
      // ignore
    }
  };

  if (!status) return null;

  // Determine indicator state
  let indicatorColor = '#666';
  let label = 'Off';

  if (status.enabled) {
    if (status.consecutive_failures > 0) {
      indicatorColor = '#ef4444'; // red
      label = 'Error';
    } else if (status.pending_records > 0) {
      indicatorColor = '#f59e0b'; // amber
      label = `Syncing (${status.pending_records})`;
    } else if (status.connected) {
      indicatorColor = '#22c55e'; // green
      label = 'Synced';
    } else {
      indicatorColor = '#f59e0b';
      label = 'Waiting';
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Status dot */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: indicatorColor,
          cursor: 'pointer',
        }}
        title={status.last_error || label}
        onClick={() => {
          setShowConfig(!showConfig);
          if (!showConfig) fetchConfig();
        }}
      />
      <span
        style={{ fontSize: 12, color: '#ccc', cursor: 'pointer' }}
        onClick={handleToggle}
        title={status.enabled ? 'Click to disable cloud sync' : 'Click to enable cloud sync'}
      >
        Cloud: {label}
      </span>

      {/* Config panel */}
      {showConfig && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 10,
            background: '#1e1e1e',
            border: '1px solid #444',
            borderRadius: 8,
            padding: 16,
            zIndex: 9999,
            minWidth: 300,
          }}
        >
          <h4 style={{ margin: '0 0 12px', color: '#fff' }}>Cloud Sync Settings</h4>

          <div style={{ marginBottom: 8 }}>
            <label style={{ color: '#aaa', fontSize: 12 }}>Cloud URL</label>
            <input
              type="text"
              value={configForm.cloud_url}
              onChange={(e) => setConfigForm({ ...configForm, cloud_url: e.target.value })}
              style={{
                width: '100%',
                padding: 6,
                background: '#2a2a2a',
                border: '1px solid #555',
                borderRadius: 4,
                color: '#fff',
              }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ color: '#aaa', fontSize: 12 }}>Organization ID</label>
            <input
              type="text"
              value={configForm.organization_id}
              onChange={(e) => setConfigForm({ ...configForm, organization_id: e.target.value })}
              style={{
                width: '100%',
                padding: 6,
                background: '#2a2a2a',
                border: '1px solid #555',
                borderRadius: 4,
                color: '#fff',
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#aaa', fontSize: 12 }}>API Key (leave blank to keep existing)</label>
            <input
              type="password"
              value={configForm.api_key}
              onChange={(e) => setConfigForm({ ...configForm, api_key: e.target.value })}
              placeholder="***"
              style={{
                width: '100%',
                padding: 6,
                background: '#2a2a2a',
                border: '1px solid #555',
                borderRadius: 4,
                color: '#fff',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSaveConfig}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: '#f97316',
                border: 'none',
                borderRadius: 4,
                color: '#000',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              onClick={() => setShowConfig(false)}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: '#333',
                border: '1px solid #555',
                borderRadius: 4,
                color: '#ccc',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>

          {status.last_error && (
            <div style={{ marginTop: 8, color: '#ef4444', fontSize: 11 }}>
              Last error: {status.last_error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CloudSyncStatus;
