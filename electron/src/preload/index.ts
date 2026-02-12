import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  onFolderSelected: (callback: (path: string) => void) => {
    ipcRenderer.on('folder-selected', (_event, path) => callback(path));
  },
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', () => callback());
  },
  onUpdateAvailable: (callback: (version: string) => void) => {
    ipcRenderer.on('update-available', (_event, version) => callback(version));
  },
  onUpdateReady: (callback: () => void) => {
    ipcRenderer.on('update-ready', () => callback());
  },
});
