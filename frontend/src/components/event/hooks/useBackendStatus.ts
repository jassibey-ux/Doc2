/**
 * useBackendStatus — Probes backend availability and exposes demo mode API.
 *
 * On mount:
 *   GET /api/system/demo-mode          → current demo state
 *   GET /api/system/demo-mode/scenarios → available scenarios
 * If both fail → backendAvailable = false
 *
 * enableDemoMode(scenarioId) → POST /api/system/demo-mode { enabled: true, scenario }
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  droneCount?: number;
  location?: string;
}

interface UseBackendStatusReturn {
  backendAvailable: boolean;
  demoModeEnabled: boolean;
  scenarios: DemoScenario[];
  isChecking: boolean;
  enableDemoMode: (scenarioId: string) => Promise<boolean>;
}

export function useBackendStatus(): UseBackendStatusReturn {
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [isChecking, setIsChecking] = useState(true);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const probe = async () => {
      try {
        const [statusRes, scenariosRes] = await Promise.allSettled([
          fetch('/api/system/demo-mode'),
          fetch('/api/system/demo-mode/scenarios'),
        ]);

        const statusOk = statusRes.status === 'fulfilled' && statusRes.value.ok;
        const scenariosOk = scenariosRes.status === 'fulfilled' && scenariosRes.value.ok;

        if (!statusOk && !scenariosOk) {
          setBackendAvailable(false);
          setIsChecking(false);
          return;
        }

        setBackendAvailable(true);

        if (statusOk) {
          const data = await statusRes.value.json();
          setDemoModeEnabled(!!data.enabled);
        }

        if (scenariosOk) {
          const data = await scenariosRes.value.json();
          setScenarios(Array.isArray(data) ? data : data.scenarios ?? []);
        }
      } catch {
        setBackendAvailable(false);
      } finally {
        setIsChecking(false);
      }
    };

    probe();
  }, []);

  const enableDemoMode = useCallback(async (scenarioId: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/system/demo-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, scenario: scenarioId }),
      });
      if (res.ok) {
        setDemoModeEnabled(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return { backendAvailable, demoModeEnabled, scenarios, isChecking, enableDemoMode };
}
