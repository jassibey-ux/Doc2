import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { BrowserWindow } from 'electron';

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = log;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow.webContents.send('update-available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update-progress', progress.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded');
    mainWindow.webContents.send('update-ready');
  });

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err);
  });

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('Auto-update check failed:', err.message);
    });
  }, 10000);
}
