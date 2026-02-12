import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { WorkflowProvider } from './contexts/WorkflowContext';
import { SessionProvider } from './contexts/SessionContext';
import { TestSessionPhaseProvider } from './contexts/TestSessionPhaseContext';
import { ToastProvider } from './contexts/ToastContext';
import { CRMProvider } from './contexts/CRMContext';
import ErrorBoundary from './components/ErrorBoundary';
import MapView from './components/MapView';
import MonitoringConsole from './components/MonitoringConsole';
import SessionConsole from './components/SessionConsole';
import SessionAnalysisView from './components/SessionAnalysisView';
import ReplayPage from './components/ReplayPage';
import CRMDashboard from './components/crm/CRMDashboard';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter basename="/app">
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
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </CRMProvider>
                </TestSessionPhaseProvider>
              </SessionProvider>
            </WorkflowProvider>
          </WebSocketProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
