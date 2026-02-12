import { ipcMain, dialog, app } from 'electron';

export function setupIPC(): void {
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Log Folder',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-app-path', () => {
    return app.getPath('userData');
  });
}
