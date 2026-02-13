import { BrowserWindow, app } from 'electron';
import { join } from 'path';
import log from 'electron-log';

export function createWindow(serverPort: number): BrowserWindow {
  // Use correct icon format for each platform
  const iconPath = process.platform === 'darwin'
    ? join(__dirname, '../../resources/icon.icns')
    : join(__dirname, '../../resources/icon.ico');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // Show when ready to prevent visual flash
  win.once('ready-to-show', () => {
    win.show();
    // Open DevTools in development
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      win.webContents.openDevTools();
    }
  });

  // Retry page load on failure (e.g. if server wasn't quite ready)
  win.webContents.on('did-fail-load', (_event, errorCode, _errorDesc, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      log.warn(`[window] Page load failed (code ${errorCode}), retrying in 1s...`);
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.loadURL(`http://127.0.0.1:${serverPort}/app/`);
        }
      }, 1000);
    }
  });

  // Load the app from Express server
  win.loadURL(`http://127.0.0.1:${serverPort}/app/`);

  // Minimize to tray instead of closing
  win.on('close', (event) => {
    event.preventDefault();
    win.hide();
  });

  return win;
}
