/**
 * Path Service - API client for configuration and exports
 */

const API_BASE = '';

export interface SessionPreview {
  name: string;
  file_count: number;
  last_modified: string;
}

export interface ValidateResponse {
  valid: boolean;
  exists: boolean;
  is_directory: boolean;
  sessions: SessionPreview[];
  session_count?: number;
  direct_file_count?: number;
  message: string;
}

export interface SetLogRootResponse {
  success: boolean;
  message: string;
  log_root?: string;
}

export interface ConfigResponse {
  log_root: string;
  log_root_exists: boolean;
  has_sessions: boolean;
  active_event: string | null;
  is_configured: boolean;
  port: number;
  stale_seconds: number;
  anthropic_api_key?: string;
  anthropic_model?: string;
  ai_analysis_consent?: boolean;
}

export interface UploadResult {
  processed: number;
  errors: string[];
  trackers_found: string[];
}

export const pathService = {
  /**
   * Validate a path and get session preview
   */
  async validatePath(path: string): Promise<ValidateResponse> {
    const response = await fetch(
      `${API_BASE}/api/validate-path?path=${encodeURIComponent(path)}`
    );
    if (!response.ok) {
      throw new Error(`Failed to validate path: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Set the log root folder and start monitoring
   */
  async setLogRoot(path: string): Promise<SetLogRootResponse> {
    const response = await fetch(`${API_BASE}/api/config/log-root`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) {
      throw new Error(`Failed to set log root: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get current configuration
   */
  async getConfig(): Promise<ConfigResponse> {
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) {
      throw new Error(`Failed to get config: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Upload data files (NMEA, CSV, KML, KMZ) for parsing
   */
  async uploadFiles(files: File[]): Promise<UploadResult> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const response = await fetch(`${API_BASE}/api/upload/files`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Open native folder picker dialog
   */
  async selectFolder(): Promise<string> {
    const response = await fetch(`${API_BASE}/api/select-folder`);
    if (!response.ok) {
      throw new Error(`Failed to open folder picker: ${response.statusText}`);
    }
    const data = await response.json();
    return data.path || '';
  },

  /**
   * Export data as KML
   */
  async exportKML(eventName?: string): Promise<Blob> {
    const url = eventName
      ? `${API_BASE}/api/export/kml?event=${encodeURIComponent(eventName)}`
      : `${API_BASE}/api/export/kml`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to export KML: ${response.statusText}`);
    }
    return response.blob();
  },

  /**
   * Export data as CSV
   */
  async exportCSV(): Promise<Blob> {
    const response = await fetch(`${API_BASE}/api/export/csv`);
    if (!response.ok) {
      throw new Error(`Failed to export CSV: ${response.statusText}`);
    }
    return response.blob();
  },
};

export default pathService;
