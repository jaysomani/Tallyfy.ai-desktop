// Preload script runs in an isolated context but has access to Node.js APIs
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// specific Electron APIs without exposing the entire API
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication methods
  auth: {
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:get-user')
  },
  
  // Database methods
  db: {
    testConnection: () => ipcRenderer.invoke('db:test-connection')
  },
  
  // Update methods
  updates: {
    checkForUpdates: () => ipcRenderer.invoke('updates:check-for-updates'),
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('updates:update-available', (_, info) => callback(info));
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('updates:update-downloaded', (_, info) => callback(info));
    }
  },
  
  // App information
  appInfo: {
    version: process.env.npm_package_version || '1.0.0',
    isDev: process.argv.includes('--dev') || process.env.NODE_ENV === 'development'
  }
});

// Log when preload script has executed
console.log('Preload script loaded'); 