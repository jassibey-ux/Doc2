import { useState, useEffect, useCallback } from 'react';
import { X, Check, AlertCircle, Download, FileText, Globe, FolderOpen, Brain, Eye, EyeOff } from 'lucide-react';
import { pathService, ValidateResponse } from '../services/pathService';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pathInput, setPathInput] = useState<string>('');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // AI Analysis settings
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyMasked, setApiKeyMasked] = useState(true);
  const [aiModel, setAiModel] = useState<string>('claude-sonnet-4-latest');
  const [aiTestStatus, setAiTestStatus] = useState<{ type: 'success' | 'error' | 'testing'; text: string } | null>(null);

  // Load config on mount
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setLoadError(null);
    try {
      const cfg = await pathService.getConfig();
      setCurrentPath(cfg.log_root);
      setPathInput(cfg.log_root);
      // Validate current path
      if (cfg.log_root) {
        validatePath(cfg.log_root);
      }
      // Load AI settings — key comes back masked from API, show placeholder if configured
      if (cfg.anthropic_api_key && cfg.anthropic_api_key !== '') {
        setApiKey(cfg.anthropic_api_key);
      }
      if (cfg.anthropic_model) {
        setAiModel(cfg.anthropic_model);
      }
    } catch (err) {
      setLoadError('Failed to load settings. Please try again.');
    }
  };

  const validatePath = useCallback(async (path: string) => {
    if (!path.trim()) {
      setValidation(null);
      return;
    }

    setIsValidating(true);
    try {
      const result = await pathService.validatePath(path);
      setValidation(result);
    } catch (err) {
      console.error('Validation error:', err);
      setValidation({
        valid: false,
        exists: false,
        is_directory: false,
        sessions: [],
        message: 'Failed to validate path'
      });
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Debounce path validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (pathInput && pathInput !== currentPath) {
        validatePath(pathInput);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [pathInput, currentPath, validatePath]);

  const handleApplyChanges = async () => {
    if (!pathInput.trim() || !validation?.valid) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const result = await pathService.setLogRoot(pathInput);

      if (result.success) {
        setCurrentPath(pathInput);
        setSaveMessage({ type: 'success', text: result.message || 'Settings saved successfully' });

        // Auto-hide success message
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: result.message || 'Failed to save settings' });
      }
    } catch (err) {
      console.error('Failed to apply changes:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const blob = await pathService.exportCSV();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scensus_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export CSV failed:', err);
    }
  };

  const handleExportKML = async () => {
    try {
      const blob = await pathService.exportKML();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scensus_export_${new Date().toISOString().slice(0, 10)}.kml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export KML failed:', err);
    }
  };

  const handleSaveAiSettings = async () => {
    try {
      const resp = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropic_api_key: apiKey || undefined,
          anthropic_model: aiModel || 'claude-sonnet-4-latest',
        }),
      });
      if (resp.ok) {
        setSaveMessage({ type: 'success', text: 'AI settings saved' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: 'Failed to save AI settings' });
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to save AI settings' });
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setAiTestStatus({ type: 'error', text: 'Enter an API key first' });
      return;
    }
    setAiTestStatus({ type: 'testing', text: 'Testing connection...' });
    try {
      const resp = await fetch('/api/ai-analysis/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, model: aiModel }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setAiTestStatus({ type: 'success', text: `Connected (${data.model})` });
      } else {
        setAiTestStatus({ type: 'error', text: data.error || 'Connection failed' });
      }
    } catch {
      setAiTestStatus({ type: 'error', text: 'Connection failed — check network' });
    }
    setTimeout(() => setAiTestStatus(null), 5000);
  };

  const handleBrowse = async () => {
    try {
      const folder = await pathService.selectFolder();
      if (folder) {
        setPathInput(folder);
        validatePath(folder);
      }
    } catch (err) {
      console.error('Folder picker failed:', err);
    }
  };

  const hasChanges = pathInput !== currentPath;

  return (
    <div className={`settings-panel ${!isOpen ? 'hidden' : ''}`}>
      <div className="settings-panel-header">
        <h2>Settings</h2>
        <button className="side-panel-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="settings-panel-content">
        {/* Load Error */}
        {loadError && (
          <div className="save-message error">
            <AlertCircle size={14} />
            <span>{loadError}</span>
          </div>
        )}

        {/* Data Source Section */}
        <div className="settings-section">
          <h3 className="settings-section-title">Data Source</h3>

          <div className="path-input-group">
            <input
              type="text"
              className="path-input"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="Enter folder path (e.g. C:\Temp)"
            />
            <button className="browse-btn" onClick={handleBrowse}>
              <FolderOpen size={14} />
              Browse
            </button>
          </div>

          {/* Validation Status */}
          {isValidating ? (
            <div className="validation-status validating">
              <div className="loading-spinner-small" />
              <span>Validating...</span>
            </div>
          ) : validation && (
            <div className={`validation-status ${validation.valid ? 'valid' : 'invalid'}`}>
              {validation.valid ? (
                <>
                  <Check size={14} />
                  <span>{validation.message}</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} />
                  <span>{validation.message}</span>
                </>
              )}
            </div>
          )}

          {/* Session Preview */}
          {validation?.valid && validation.sessions.length > 0 && (
            <div className="session-preview">
              <div className="session-preview-header">
                <span>Recent Sessions</span>
              </div>
              <div className="session-preview-list">
                {validation.sessions.map((session) => (
                  <div key={session.name} className="session-preview-item">
                    <span className="session-name">{session.name}</span>
                    <span className="session-files">{session.file_count} files</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty Folder Help */}
          {validation?.valid && validation.sessions.length === 0
            && (validation.direct_file_count ?? 0) === 0 && !isValidating && (
            <div className="empty-folder-help">
              <AlertCircle size={16} />
              <div>
                <p className="empty-folder-help-title">No log files found</p>
                <p className="empty-folder-help-formats">Supported: .csv .nmea .kml .kmz</p>
                <p className="empty-folder-help-hint">Files can be in this folder or in subdirectories</p>
              </div>
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Download size={14} />
            Export Data
          </h3>
          <div className="export-buttons">
            <button className="export-btn" onClick={handleExportCSV}>
              <FileText size={16} />
              Export CSV
            </button>
            <button className="export-btn" onClick={handleExportKML}>
              <Globe size={16} />
              Export KML
            </button>
          </div>
        </div>

        {/* AI Analysis Section */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Brain size={14} />
            AI Analysis (Claude)
          </h3>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', margin: '0 0 10px 0' }}>
            Enable AI-powered analysis of CUAS test sessions using Anthropic's Claude API.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>API Key</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type={apiKeyMasked ? 'password' : 'text'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={() => setApiKeyMasked(!apiKeyMasked)}
                style={{
                  padding: '6px 8px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                }}
                title={apiKeyMasked ? 'Show key' : 'Hide key'}
              >
                {apiKeyMasked ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>

            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>Model</label>
            <select
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              style={{
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
              }}
            >
              <option value="claude-sonnet-4-latest">Claude Sonnet 4 (Recommended)</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Faster/Cheaper)</option>
              <option value="claude-opus-4-6">Claude Opus 4.6 (Most Capable)</option>
            </select>

            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button
                onClick={handleSaveAiSettings}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: apiKey ? 'rgba(255,140,0,0.8)' : 'rgba(255,255,255,0.05)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: apiKey ? 'pointer' : 'default',
                  opacity: apiKey ? 1 : 0.5,
                }}
                disabled={!apiKey}
              >
                Save AI Settings
              </button>
              <button
                onClick={handleTestConnection}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Test Connection
              </button>
            </div>

            {aiTestStatus && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                color: aiTestStatus.type === 'success' ? '#22c55e' :
                       aiTestStatus.type === 'error' ? '#ef4444' : 'rgba(255,255,255,0.6)',
              }}>
                {aiTestStatus.type === 'testing' && <div className="loading-spinner-small" />}
                {aiTestStatus.type === 'success' && <Check size={12} />}
                {aiTestStatus.type === 'error' && <AlertCircle size={12} />}
                <span>{aiTestStatus.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className={`save-message ${saveMessage.type}`}>
            {saveMessage.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{saveMessage.text}</span>
          </div>
        )}

        {/* Apply Button */}
        <div className="settings-footer">
          <button
            className={`apply-btn ${hasChanges && validation?.valid ? 'active' : ''}`}
            onClick={handleApplyChanges}
            disabled={!hasChanges || !validation?.valid || isSaving}
          >
            {isSaving ? (
              <>
                <div className="loading-spinner-small" />
                Applying...
              </>
            ) : (
              'Apply Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
