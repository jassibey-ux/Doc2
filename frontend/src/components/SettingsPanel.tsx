import { useState, useEffect, useCallback } from 'react';
import { X, Check, AlertCircle, Download, FileText, Globe, FolderOpen } from 'lucide-react';
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
