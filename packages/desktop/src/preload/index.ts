/**
 * BCIS Desktop Client - Preload Script
 * Provides secure IPC communication between main and renderer
 */

import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
interface ElectronAPI {
  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;

  // App info
  getVersion: () => string;
  getPlatform: () => string;

  // File operations
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  writeFile: (path: string, data: Uint8Array | string) => Promise<void>;
  readFile: (path: string) => Promise<Uint8Array>;

  // Print
  print: (options: Electron.WebContentsPrintOptions) => Promise<void>;
  printToPDF: (options: Electron.PrintToPDFOptions) => Promise<Uint8Array>;

  // Clipboard
  writeText: (text: string) => void;
  readText: () => Promise<string>;

  // Dialogs
  showMessageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
  showErrorBox: (title: string, content: string) => void;

  // Notifications
  showNotification: (options: Electron.NotificationConstructorOptions) => void;

  // Store (persistent settings)
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };

  // Network
  fetch: (url: string, options?: RequestInit) => Promise<Response>;

  // Auth events
  onAuthChange: (callback: (user: any | null) => void) => () => void;
  onLogout: (callback: () => void) => () => void;
}

// Expose secure API
const electronAPI: ElectronAPI = {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // App info
  getVersion: () => app.getVersion(),
  getPlatform: () => process.platform,

  // File operations
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:save', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  writeFile: (path, data) => ipcRenderer.invoke('file:write', path, data),
  readFile: (path) => ipcRenderer.invoke('file:read', path),

  // Print
  print: (options) => ipcRenderer.invoke('print', options),
  printToPDF: (options) => ipcRenderer.invoke('print-to-pdf', options),

  // Clipboard
  writeText: (text) => ipcRenderer.send('clipboard:write', text),
  readText: () => ipcRenderer.invoke('clipboard:read'),

  // Dialogs
  showMessageBox: (options) => ipcRenderer.invoke('dialog:message', options),
  showErrorBox: (title, content) => ipcRenderer.send('dialog:error', title, content),

  // Notifications
  showNotification: (options) => ipcRenderer.send('notification:show', options),

  // Store
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete: (key) => ipcRenderer.invoke('store:delete', key),
  },

  // Network
  fetch: (url, options) => fetch(url, options),

  // Auth events
  onAuthChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, user: any) => callback(user);
    ipcRenderer.on('auth:change', listener);
    return () => ipcRenderer.off('auth:change', listener);
  },
  onLogout: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('auth:logout', listener);
    return () => ipcRenderer.off('auth:logout', listener);
  },
};

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Import app for version
import { app } from 'electron';