/**
 * Electron API exposed via preload contextBridge.
 * These APIs are only available when running inside Electron.
 */

interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  getVersion: () => Promise<string>;
  getAppPath: () => Promise<string>;
  onFolderSelected: (callback: (path: string) => void) => void;
  onOpenSettings: (callback: () => void) => void;
  onUpdateAvailable: (callback: (version: string) => void) => void;
  onUpdateReady: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
