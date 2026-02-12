import { Menu, BrowserWindow, app, dialog, shell } from 'electron';

export function setupMenu(mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: 'Select Log Folder',
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('folder-selected', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('open-settings');
          },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => {
            mainWindow.removeAllListeners('close');
            app.quit();
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About SCENSUS Dashboard',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About SCENSUS Dashboard',
              message: `SCENSUS Dashboard v${app.getVersion()}`,
              detail: 'Real-time UAS tracking and monitoring system.',
            });
          },
        },
        {
          label: 'Check for Updates',
          click: () => {
            mainWindow.webContents.send('check-updates');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
