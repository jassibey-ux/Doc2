import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// Types
export interface Session {
  name: string;
  path: string;
  file_count: number;
  tracker_ids: string[];
  tracker_count: number;
  last_modified: string;
  total_size_bytes: number;
  is_active: boolean;
}

export interface SessionFile {
  name: string;
  path: string;
  size_bytes: number;
  modified: string;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  alt_m: number | null;
  timestamp: string;
  timestamp_ms: number;
  speed_mps: number | null;
  course_deg: number | null;
  rssi_dbm: number | null;
}

export interface SessionHistory {
  session_name: string;
  tracks: Record<string, TrackPoint[]>;
  tracker_ids: string[];
  total_points: number;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number;
}

interface SessionContextType {
  // State
  sessions: Session[];
  selectedSession: Session | null;
  selectedFile: SessionFile | null;
  sessionFiles: SessionFile[];
  sessionHistory: SessionHistory | null;
  loading: boolean;
  error: string | null;

  // Actions
  refreshSessions: () => Promise<void>;
  selectSession: (session: Session | null) => void;
  selectFile: (file: SessionFile | null) => void;
  loadSessionFiles: (sessionName: string) => Promise<void>;
  loadSessionHistory: (sessionName: string, trackerId?: string) => Promise<void>;
  loadFileHistory: (filePath: string) => Promise<void>;
  clearHistory: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const API_BASE = '';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedFile, setSelectedFile] = useState<SessionFile | null>(null);
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all sessions
  const refreshSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/sessions`);
      if (!response.ok) throw new Error('Failed to fetch sessions');

      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Select a session
  const selectSession = useCallback((session: Session | null) => {
    setSelectedSession(session);
    setSelectedFile(null);
    setSessionFiles([]);
    setSessionHistory(null);

    if (session) {
      // Auto-load files when session is selected
      loadSessionFiles(session.name);
    }
  }, []);

  // Select a file
  const selectFile = useCallback((file: SessionFile | null) => {
    setSelectedFile(file);
  }, []);

  // Load files for a session
  const loadSessionFiles = useCallback(async (sessionName: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionName)}/files`);
      if (!response.ok) throw new Error('Failed to fetch session files');

      const data = await response.json();
      setSessionFiles(data.files || []);
    } catch (err) {
      console.error('Error fetching session files:', err);
      setSessionFiles([]);
    }
  }, []);

  // Load track history for a session
  const loadSessionHistory = useCallback(async (sessionName: string, trackerId?: string) => {
    setLoading(true);
    setError(null);

    try {
      let url = `${API_BASE}/api/sessions/${encodeURIComponent(sessionName)}/history`;
      if (trackerId) {
        url += `?tracker_id=${encodeURIComponent(trackerId)}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch session history');

      const data = await response.json();
      setSessionHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
      console.error('Error fetching session history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load track history for a specific file
  const loadFileHistory = useCallback(async (filePath: string) => {
    console.log('[SessionContext] loadFileHistory called with:', filePath);
    setLoading(true);
    setError(null);

    try {
      // Use URLSearchParams for proper encoding (handles # correctly)
      const params = new URLSearchParams();
      params.set('path', filePath);
      const url = `/api/file/history?${params.toString()}`;
      console.log('[SessionContext] Fetching:', url);

      const response = await fetch(url);
      console.log('[SessionContext] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SessionContext] Error response:', errorText);
        throw new Error(`Failed to fetch file history: ${response.status}`);
      }

      const data = await response.json();
      console.log('[SessionContext] Received data:', data.total_points, 'points');
      setSessionHistory(data);
    } catch (err) {
      console.error('[SessionContext] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load file history');
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setSessionHistory(null);
    setSelectedFile(null);
  }, []);

  // Load sessions on mount
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  return (
    <SessionContext.Provider
      value={{
        sessions,
        selectedSession,
        selectedFile,
        sessionFiles,
        sessionHistory,
        loading,
        error,
        refreshSessions,
        selectSession,
        selectFile,
        loadSessionFiles,
        loadSessionHistory,
        loadFileHistory,
        clearHistory,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessions() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessions must be used within a SessionProvider');
  }
  return context;
}

export default SessionContext;
