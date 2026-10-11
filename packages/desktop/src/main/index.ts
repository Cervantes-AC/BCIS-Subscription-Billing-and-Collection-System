/**
 * BCIS Desktop Client - Electron Main Process
 */

import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

declare const __BCIS_API_ORIGIN__: string;

// Security settings
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'BCIS Billing System',
    backgroundColor: '#0F2747',
    webPreferences: {
      // electron-vite emits the preload as ESM because the desktop package is
      // type=module. Keep this extension in sync with that output.
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Renderer failed to load (${errorCode}): ${errorDescription} — ${validatedURL}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process exited:', details);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`Renderer console error (${sourceId}:${line}): ${message}`);
    }
  });

  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const visibleText = await mainWindow?.webContents.executeJavaScript('document.body.innerText');
      console.info(`Renderer loaded ${mainWindow?.webContents.getURL()} — ${String(visibleText).trim().slice(0, 200)}`);
    } catch (error) {
      console.error('Could not inspect renderer after load:', error);
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Prevent opening new windows
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  ipcMain.handle('app:getVersion', () => app.getVersion());

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const devRendererUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined;
    const devRendererOrigin = devRendererUrl ? new URL(devRendererUrl).origin : undefined;
    const devRendererWebSocketOrigin = devRendererOrigin?.replace(/^http/, 'ws');

    // Set security headers
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const developmentScriptPolicy = devRendererUrl ? " 'unsafe-inline'" : '';
      const developmentConnectPolicy = [devRendererOrigin, devRendererWebSocketOrigin].filter(Boolean).join(' ');
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            `default-src 'self'; script-src 'self'${developmentScriptPolicy}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ${__BCIS_API_ORIGIN__} ${developmentConnectPolicy}`,
          ],
        },
      });
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up
});
