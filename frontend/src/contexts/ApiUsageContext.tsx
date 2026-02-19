/**
 * ApiUsageContext — Client-side tracking of Google Maps API consumption.
 *
 * Tracks tile loads, map initializations, and layer renders per session.
 * Persists daily totals to localStorage, resets at midnight.
 * Provides cost estimation based on Google Maps public pricing.
 */

import React, { createContext, useContext, useCallback, useState, useEffect, useRef, ReactNode } from 'react';

// Google Maps pricing (as of 2025)
// Only map loads are billable when using the Maps JavaScript API (gmp-map-3d).
// Tiles fetched within a map session are included — NOT billed separately.
// Photorealistic 3D Tiles are free when rendered through Google Maps Platform.
// Layer renders are purely client-side and have zero billing impact.
const PRICING = {
  mapLoad: 7.0 / 1000,  // $7 per 1,000 Dynamic Map loads (the only billable metric)
};

const STORAGE_KEY = 'scensus-api-usage-daily';

interface DailyTotals {
  date: string; // YYYY-MM-DD
  tileLoads: number;
  mapInits: number;
  layerRenders: number;
}

interface LayerRenderBreakdown {
  [layerName: string]: number;
}

export interface ApiUsageStats {
  // Session counters (reset on page load)
  sessionTileLoads: number;
  sessionMapInits: number;
  sessionLayerRenders: number;
  sessionLayerBreakdown: LayerRenderBreakdown;
  sessionStart: number;

  // Daily totals (persisted to localStorage)
  dailyTileLoads: number;
  dailyMapInits: number;
  dailyLayerRenders: number;

  // Cost estimates
  sessionCost: number;
  dailyCost: number;
}

interface ApiUsageContextValue extends ApiUsageStats {
  recordTileLoad: (count?: number) => void;
  recordMapInit: () => void;
  recordLayerRender: (layerName: string) => void;
  resetSession: () => void;
}

const ApiUsageContext = createContext<ApiUsageContextValue | null>(null);

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadDailyTotals(): DailyTotals {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: DailyTotals = JSON.parse(stored);
      if (parsed.date === getTodayKey()) {
        return parsed;
      }
    }
  } catch {
    // Corrupted storage, start fresh
  }
  return { date: getTodayKey(), tileLoads: 0, mapInits: 0, layerRenders: 0 };
}

function saveDailyTotals(totals: DailyTotals): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(totals));
  } catch {
    // localStorage full or unavailable
  }
}

function estimateCost(mapInits: number): number {
  return mapInits * PRICING.mapLoad;
}

export const ApiUsageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessionTileLoads, setSessionTileLoads] = useState(0);
  const [sessionMapInits, setSessionMapInits] = useState(0);
  const [sessionLayerRenders, setSessionLayerRenders] = useState(0);
  const [sessionLayerBreakdown, setSessionLayerBreakdown] = useState<LayerRenderBreakdown>({});
  const [sessionStart] = useState(() => Date.now());

  const dailyRef = useRef<DailyTotals>(loadDailyTotals());
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>(dailyRef.current);

  // Check for midnight rollover every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const today = getTodayKey();
      if (dailyRef.current.date !== today) {
        dailyRef.current = { date: today, tileLoads: 0, mapInits: 0, layerRenders: 0 };
        saveDailyTotals(dailyRef.current);
        setDailyTotals({ ...dailyRef.current });
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const recordTileLoad = useCallback((count: number = 1) => {
    setSessionTileLoads(prev => prev + count);
    dailyRef.current.tileLoads += count;
    saveDailyTotals(dailyRef.current);
    setDailyTotals({ ...dailyRef.current });
  }, []);

  const recordMapInit = useCallback(() => {
    setSessionMapInits(prev => prev + 1);
    dailyRef.current.mapInits += 1;
    saveDailyTotals(dailyRef.current);
    setDailyTotals({ ...dailyRef.current });
  }, []);

  const recordLayerRender = useCallback((layerName: string) => {
    setSessionLayerRenders(prev => prev + 1);
    setSessionLayerBreakdown(prev => ({
      ...prev,
      [layerName]: (prev[layerName] || 0) + 1,
    }));
    dailyRef.current.layerRenders += 1;
    saveDailyTotals(dailyRef.current);
    setDailyTotals({ ...dailyRef.current });
  }, []);

  const resetSession = useCallback(() => {
    setSessionTileLoads(0);
    setSessionMapInits(0);
    setSessionLayerRenders(0);
    setSessionLayerBreakdown({});
  }, []);

  const sessionCost = estimateCost(sessionMapInits);
  const dailyCost = estimateCost(dailyTotals.mapInits);

  return (
    <ApiUsageContext.Provider value={{
      sessionTileLoads,
      sessionMapInits,
      sessionLayerRenders,
      sessionLayerBreakdown,
      sessionStart,
      dailyTileLoads: dailyTotals.tileLoads,
      dailyMapInits: dailyTotals.mapInits,
      dailyLayerRenders: dailyTotals.layerRenders,
      sessionCost,
      dailyCost,
      recordTileLoad,
      recordMapInit,
      recordLayerRender,
      resetSession,
    }}>
      {children}
    </ApiUsageContext.Provider>
  );
};

export function useApiUsage(): ApiUsageContextValue {
  const context = useContext(ApiUsageContext);
  if (!context) {
    throw new Error('useApiUsage must be used within an ApiUsageProvider');
  }
  return context;
}

/**
 * Optional hook — returns null if outside provider (safe for components
 * that may render in contexts without the provider).
 */
export function useApiUsageSafe(): ApiUsageContextValue | null {
  return useContext(ApiUsageContext);
}
