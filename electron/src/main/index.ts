import { app, BrowserWindow, dialog } from 'electron';
import log from 'electron-log';
import { join } from 'path';
import { startServer, getDashboardApp, stopServer } from '../server/index';

// --- Fix 8: Configure production logging ---
log.transports.file.resolvePathFn = () => {
  const logDir = join(app.getPath('userData'), 'logs');
  return join(logDir, 'main.log');
};
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB rotation

// --- Fix 12: Disable console transport to prevent EPIPE errors ---
// When running via npm scripts with redirected output, the console transport
// can cause EPIPE errors when the pipe is closed
log.transports.console.level = false;
import { createWindow } from './window';
import { setupTray, destroyTray } from './tray';
import { setupMenu } from './menu';
import { setupIPC } from './ipc';
import { setupAutoUpdater } from './updater';

const SERVER_PORT = 8082;

let mainWindow: BrowserWindow | null = null;

// --- Fix 7: Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  dialog.showErrorBox(
    'Already Running',
    'Another instance of SCENSUS Dashboard is already running.'
  );
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// --- Fix 1: Global Error Handling ---
process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  log.error('Uncaught exception:', error);

  // Silently ignore EPIPE errors - these are expected when WebSocket clients disconnect
  if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
    log.info('EPIPE error ignored (client disconnected)');
    return;
  }

  dialog.showErrorBox(
    'Unexpected Error',
    `An unexpected error occurred:\n\n${error.message}\n\nThe application will continue running but may be unstable.`
  );
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});

async function bootstrap(): Promise<void> {
  // Start Express server (Fix 2: port conflict handling is inside startServer)
  await startServer(SERVER_PORT);

  // Create main window
  mainWindow = createWindow(SERVER_PORT);

  // Setup system tray
  setupTray(mainWindow);

  // Setup native menus
  setupMenu(mainWindow);

  // Setup IPC handlers
  setupIPC();

  // Fix 5: Initialize auto-updater
  setupAutoUpdater(mainWindow);
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (err: any) {
    log.error('Bootstrap failed:', err);
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application:\n\n${err.message}`
    );
    app.quit();
  }
});

// --- Fix 3: Graceful Shutdown ---
app.on('before-quit', async () => {
  log.info('Application quitting, cleaning up...');
  try {
    const dashApp = getDashboardApp();
    await dashApp.shutdown();
    await stopServer();
  } catch (e) {
    log.error('Error during shutdown:', e);
  }
  destroyTray();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running in menu bar
  if (process.platform !== 'darwin') {
    // Don't quit - minimize to tray
  }
});

app.on('activate', () => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createWindow(SERVER_PORT);
  } else {
    mainWindow.show();
  }
});
