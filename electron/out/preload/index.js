"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => electron.ipcRenderer.invoke("select-folder"),
  getVersion: () => electron.ipcRenderer.invoke("get-version"),
  getAppPath: () => electron.ipcRenderer.invoke("get-app-path"),
  onFolderSelected: (callback) => {
    electron.ipcRenderer.on("folder-selected", (_event, path) => callback(path));
  },
  onOpenSettings: (callback) => {
    electron.ipcRenderer.on("open-settings", () => callback());
  },
  onUpdateAvailable: (callback) => {
    electron.ipcRenderer.on("update-available", (_event, version) => callback(version));
  },
  onUpdateReady: (callback) => {
    electron.ipcRenderer.on("update-ready", () => callback());
  }
});
