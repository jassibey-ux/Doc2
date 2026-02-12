import { BrowserWindow, app } from 'electron';
import { join } from 'path';

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

  // Load the app from Express server
  win.loadURL(`http://127.0.0.1:${serverPort}/app/`);

  // Minimize to tray instead of closing
  win.on('close', (event) => {
    event.preventDefault();
    win.hide();
  });

  return win;
}
