import { app, protocol, BrowserWindow } from 'electron';
import { registerAppProtocol } from './protocol';
import { registerIpc } from './ipc';
import { VaultRegistry } from './vault-registry';
import { WindowManager } from './windows';
import { buildMenu } from './menu';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  const registry = new VaultRegistry();
  const windows = new WindowManager(registry);

  app.on('second-instance', () => {
    const win = windows.focusedOrLast();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    registerIpc({ registry, windows });
    buildMenu(windows);

    const requested = process.argv.find((a) => a.startsWith('--vault='));
    void windows.openStartup(requested ? requested.slice(8) : undefined);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void windows.openStartup();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
