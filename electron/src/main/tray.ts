import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import { join } from 'path';

let tray: Tray | null = null;

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function setupTray(mainWindow: BrowserWindow): void {
  const iconPath = join(__dirname, '../../resources/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('SCENSUS Dashboard');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dashboard',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Status: Monitoring',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow.removeAllListeners('close');
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}
