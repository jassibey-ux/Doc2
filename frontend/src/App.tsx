import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { WorkflowProvider } from './contexts/WorkflowContext';
import { SessionProvider } from './contexts/SessionContext';
import { TestSessionPhaseProvider } from './contexts/TestSessionPhaseContext';
import { ToastProvider } from './contexts/ToastContext';
import { CRMProvider } from './contexts/CRMContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ApiUsageProvider } from './contexts/ApiUsageContext';
import ErrorBoundary from './components/ErrorBoundary';
import MapView from './components/MapView';
import MonitoringConsole from './components/MonitoringConsole';
import SessionConsole from './components/SessionConsole';
import SessionAnalysisView from './components/SessionAnalysisView';
import ReplayPage from './components/ReplayPage';
import CRMDashboard from './components/crm/CRMDashboard';
import EventDashboard from './components/event/EventDashboard';
import LoginPage from './components/LoginPage';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isCloudMode } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0a', color: '#888' }}>
        Loading...
      </div>
    );
  }

  if (isCloudMode && !isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ApiUsageProvider>
          <AuthProvider>
            <BrowserRouter basename="/app">
              <AuthGate>
                <WebSocketProvider>
                  <WorkflowProvider>
                    <SessionProvider>
                      <TestSessionPhaseProvider>
                        <CRMProvider>
                        <Routes>
                          <Route path="/" element={<MapView />} />
                          <Route path="/monitor" element={<MonitoringConsole />} />
                          <Route path="/session/:sessionId/live" element={<SessionConsole />} />
                          <Route path="/session/:sessionId/analysis" element={<SessionAnalysisView />} />
                          <Route path="/replay" element={<ReplayPage />} />
                          <Route path="/replay/:sessionId" element={<ReplayPage />} />
                          <Route path="/crm" element={<CRMDashboard />} />
                          <Route path="/event" element={<EventDashboard />} />
                          <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                        </CRMProvider>
                      </TestSessionPhaseProvider>
                    </SessionProvider>
                  </WorkflowProvider>
                </WebSocketProvider>
              </AuthGate>
            </BrowserRouter>
          </AuthProvider>
        </ApiUsageProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
