import { useState, useEffect } from 'react';
import { Settings, Upload, Radio } from 'lucide-react';
import { pathService } from '../services/pathService';

interface WelcomeOverlayProps {
  droneCount: number;
  connectionStatus: string;
  onOpenSettings: () => void;
  onOpenUpload: () => void;
}

const STORAGE_KEY = 'scensus_welcome_dismissed';

export default function WelcomeOverlay({
  droneCount,
  connectionStatus,
  onOpenSettings,
  onOpenUpload,
}: WelcomeOverlayProps) {
  const [dismissed, setDismissed] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      setDismissed(true);
    }
  }, []);

  // Fetch current monitored path
  useEffect(() => {
    pathService.getConfig().then(cfg => {
      setCurrentPath(cfg.log_root);
    }).catch(() => {});
  }, []);

  // Auto-dismiss when drone data arrives
  useEffect(() => {
    if (droneCount > 0) {
      setDismissed(true);
    }
  }, [droneCount]);

  const handleDismiss = (action: 'settings' | 'upload') => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    setDismissed(true);
    if (action === 'settings') {
      onOpenSettings();
    } else {
      onOpenUpload();
    }
  };

  // Don't show if dismissed, disconnected, or has drones
  if (dismissed || connectionStatus !== 'connected' || droneCount > 0) {
    return null;
  }

  return (
    <div className="welcome-overlay">
      <div className="welcome-card">
        <div className="welcome-icon">
          <Radio size={32} />
        </div>
        <h2 className="welcome-title">No data detected</h2>
        <p className="welcome-subtitle">
          The dashboard is connected but no tracker data has been received yet.
        </p>
        {currentPath && (
          <div className="welcome-path-display">
            <span className="welcome-path-label">Monitoring folder:</span>
            <span className="welcome-path-value">{currentPath}</span>
          </div>
        )}
        <div className="welcome-actions">
          <button
            className="welcome-btn welcome-btn-primary"
            onClick={() => handleDismiss('settings')}
          >
            <Settings size={16} />
            Open Settings
          </button>
          <button
            className="welcome-btn welcome-btn-secondary"
            onClick={() => handleDismiss('upload')}
          >
            <Upload size={16} />
            Upload Files
          </button>
        </div>
        <label className="welcome-dont-show">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Don't show again</span>
        </label>
      </div>
    </div>
  );
}
