/**
 * useGoogle3DScreenshot — Capture the Google 3D map view as an image.
 *
 * Google Maps 3D renders in Shadow DOM, so canvas.toDataURL() won't work.
 * - Web: uses html2canvas to capture the container element
 * - Electron: uses ipcRenderer.invoke('capture-page', boundingRect)
 */

import { useCallback } from 'react';

interface UseGoogle3DScreenshotOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function isElectron(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    (window as any).process?.versions?.electron
  );
}

export function useGoogle3DScreenshot({ containerRef }: UseGoogle3DScreenshotOptions) {
  const captureScreenshot = useCallback(async (): Promise<string | null> => {
    const container = containerRef.current;
    if (!container) return null;

    try {
      if (isElectron()) {
        // Electron path: use IPC to capture the page region
        const { ipcRenderer } = (window as any).require('electron');
        const rect = container.getBoundingClientRect();
        const dataUrl = await ipcRenderer.invoke('capture-page', {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
        return dataUrl || null;
      } else {
        // Web path: use html2canvas
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(container, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#000',
          scale: window.devicePixelRatio || 1,
        });
        return canvas.toDataURL('image/png');
      }
    } catch (err) {
      console.warn('[Google3D] Screenshot capture failed:', err);
      return null;
    }
  }, [containerRef]);

  return { captureScreenshot };
}
