import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, FolderOpen } from 'lucide-react';
import { pathService } from '../services/pathService';

interface UploadResult {
  processed: number;
  errors: string[];
  trackers_found: string[];
}

interface FileUploadPanelProps {
  visible: boolean;
  onClose: () => void;
}

export default function FileUploadPanel({ visible, onClose }: FileUploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showWatchPrompt, setShowWatchPrompt] = useState(false);
  const [watchPath, setWatchPath] = useState('');
  const [watchStatus, setWatchStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Global drag overlay
  const [showOverlay, setShowOverlay] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer?.types.includes('Files')) {
        setShowOverlay(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setShowOverlay(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setShowOverlay(false);

      if (e.dataTransfer?.files) {
        const files = Array.from(e.dataTransfer.files).filter(f => {
          const ext = f.name.toLowerCase().split('.').pop();
          return ['nmea', 'csv', 'kml', 'kmz'].includes(ext || '');
        });
        if (files.length > 0) {
          setSelectedFiles(files);
          handleUpload(files);
        }
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setResult(null);
    setShowWatchPrompt(false);
    setWatchStatus(null);

    try {
      const uploadResult = await pathService.uploadFiles(files);
      setResult(uploadResult);

      // After successful upload, show watch folder prompt
      if (uploadResult.processed > 0) {
        setShowWatchPrompt(true);
        // Try to guess a common path
        const firstName = files[0]?.name || '';
        if (firstName.includes('RFReceiver') || firstName.includes('RSSI')) {
          setWatchPath('C:\\Temp');
        }
      }
    } catch (err) {
      setResult({
        processed: 0,
        errors: [err instanceof Error ? err.message : 'Upload failed'],
        trackers_found: [],
      });
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => {
        const ext = f.name.toLowerCase().split('.').pop();
        return ['nmea', 'csv', 'kml', 'kmz'].includes(ext || '');
      });
      if (files.length > 0) {
        setSelectedFiles(files);
        handleUpload(files);
      }
    }
  }, [handleUpload]);

  const handleWatchFolder = useCallback(async () => {
    if (!watchPath.trim()) return;
    try {
      const res = await pathService.setLogRoot(watchPath.trim());
      if (res.success) {
        setWatchStatus('Monitoring started');
      } else {
        setWatchStatus(res.message || 'Failed to set watch folder');
      }
    } catch {
      setWatchStatus('Failed to set watch folder');
    }
  }, [watchPath]);

  const handleClear = useCallback(() => {
    setResult(null);
    setSelectedFiles([]);
    setShowWatchPrompt(false);
    setWatchStatus(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleDropZoneDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDropZoneDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDropZoneDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer?.files) {
      const files = Array.from(e.dataTransfer.files).filter(f => {
        const ext = f.name.toLowerCase().split('.').pop();
        return ['nmea', 'csv', 'kml', 'kmz'].includes(ext || '');
      });
      if (files.length > 0) {
        setSelectedFiles(files);
        handleUpload(files);
      }
    }
  }, [handleUpload]);

  if (!visible && !showOverlay) return null;

  // Full-screen drag overlay
  if (showOverlay && !visible) {
    return (
      <div className="file-upload-overlay" onDrop={(e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setShowOverlay(false);
        if (e.dataTransfer?.files) {
          const files = Array.from(e.dataTransfer.files).filter(f => {
            const ext = f.name.toLowerCase().split('.').pop();
            return ['nmea', 'csv', 'kml', 'kmz'].includes(ext || '');
          });
          if (files.length > 0) {
            setSelectedFiles(files);
            handleUpload(files);
          }
        }
      }} onDragOver={(e) => e.preventDefault()}>
        <div className="file-upload-overlay-content">
          <Upload size={64} strokeWidth={1.5} />
          <h2>Drop Files Here</h2>
          <p>.nmea, .csv, .kml, .kmz</p>
        </div>
      </div>
    );
  }

  return (
    <div className="file-upload-panel">
      <div className="file-upload-header">
        <h3><Upload size={16} /> File Upload</h3>
        <button className="file-upload-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="file-upload-body">
        {/* Drop zone */}
        <div
          ref={dropRef}
          className={`file-upload-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDropZoneDrag}
          onDragEnter={handleDropZoneDrag}
          onDragLeave={handleDropZoneDragLeave}
          onDrop={handleDropZoneDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={32} strokeWidth={1.5} />
          <p className="file-upload-dropzone-text">
            {isDragging ? 'Drop files here' : 'Drag & drop files or click to browse'}
          </p>
          <p className="file-upload-dropzone-formats">.nmea, .csv, .kml, .kmz</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".nmea,.csv,.kml,.kmz"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* Upload progress */}
        {isUploading && (
          <div className="file-upload-status">
            <div className="file-upload-spinner" />
            <span>Processing {selectedFiles.length} file(s)...</span>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="file-upload-result">
            {result.processed > 0 ? (
              <div className="file-upload-success">
                <CheckCircle size={16} />
                <span>
                  Loaded {result.processed.toLocaleString()} records from{' '}
                  {result.trackers_found.length} tracker(s)
                </span>
              </div>
            ) : null}

            {result.trackers_found.length > 0 && (
              <div className="file-upload-trackers">
                {result.trackers_found.map(id => (
                  <span key={id} className="file-upload-tracker-tag">{id}</span>
                ))}
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="file-upload-errors">
                {result.errors.map((err, i) => (
                  <div key={i} className="file-upload-error">
                    <AlertCircle size={12} />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Watch folder prompt */}
            {showWatchPrompt && (
              <div className="file-upload-watch">
                <p className="file-upload-watch-label">
                  <FolderOpen size={14} />
                  Monitor folder for new files?
                </p>
                <div className="file-upload-watch-input">
                  <input
                    type="text"
                    value={watchPath}
                    onChange={e => setWatchPath(e.target.value)}
                    placeholder="e.g. C:\Temp"
                  />
                  <button onClick={handleWatchFolder} disabled={!watchPath.trim()}>
                    Watch
                  </button>
                </div>
                {watchStatus && (
                  <p className="file-upload-watch-status">{watchStatus}</p>
                )}
              </div>
            )}

            <button className="file-upload-clear" onClick={handleClear}>
              Clear & Upload More
            </button>
          </div>
        )}

        {/* File list */}
        {selectedFiles.length > 0 && !isUploading && !result && (
          <div className="file-upload-filelist">
            {selectedFiles.map((f, i) => (
              <div key={i} className="file-upload-fileitem">
                <FileText size={14} />
                <span>{f.name}</span>
                <span className="file-upload-filesize">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
