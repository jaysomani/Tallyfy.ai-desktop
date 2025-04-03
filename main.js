// Main Electron process
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Log important auto-updater events
autoUpdater.logger = log;
autoUpdater.autoDownload = true;

// Load environment variables from .env file
dotenv.config();

// Store settings
const Store = require('electron-store');
const store = new Store();

// Import modules
const auth = require(path.join(__dirname, 'src', 'main', 'auth'));
const database = require(path.join(__dirname, 'src', 'main', 'db'));


// Keep a global reference of the window object to avoid garbage collection
let mainWindow;
let loginWindow;

// Development mode detection
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

// Set app menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            checkForUpdates();
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About TallyfyAI',
          click: () => {
            dialog.showMessageBox({
              title: 'About TallyfyAI',
              message: 'TallyfyAI',
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nChromium: ${process.versions.chrome}\nNode.js: ${process.versions.node}\nV8: ${process.versions.v8}`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createLoginWindow() {
  // Create the login window
  loginWindow = new BrowserWindow({
    width: 480,
    height: 680,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    resizable: false,
    show: false,
    icon: path.join(__dirname, 'resources/icons/png/64x64.png')
  });

  // Load the login.html file
  loginWindow.loadFile('src/renderer/login.html');

  // Show when ready
  loginWindow.once('ready-to-show', () => {
    loginWindow.show();
  });

  // Handle login window closed
  loginWindow.on('closed', () => {
    loginWindow = null;
    if (!mainWindow) {
      // If main window isn't created yet and login is closed, quit app
      app.quit();
    }
  });

  // DevTools in development mode
  if (isDev) {
    loginWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createMainWindow() {
  // Create the main application window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    icon: path.join(__dirname, 'resources/icons/png/64x64.png')
  });

  // Load the main index.html file
  mainWindow.loadFile('src/renderer/index.html');

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Close login window if it exists
    if (loginWindow) {
      loginWindow.close();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// Check for updates
function checkForUpdates() {
  if (isDev) {
    dialog.showMessageBox({
      title: 'Updates',
      message: 'Updates are disabled in development mode',
      buttons: ['OK']
    });
    return;
  }

  // Trigger update check
  autoUpdater.checkForUpdatesAndNotify();
}

// Send update events to renderer
function sendStatusToWindow(event, data) {
  if (mainWindow) {
    mainWindow.webContents.send(event, data);
  }
}

// App ready event
app.whenReady().then(() => {
  // Create application menu
  createMenu();
  
  // Check if user is already logged in
  const isLoggedIn = store.get('user') && store.get('user').tokens;
  
  if (isLoggedIn) {
    createMainWindow();
  } else {
    createLoginWindow();
  }
  
  // macOS-specific behavior: recreate window when clicking dock icon
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (store.get('user') && store.get('user').tokens) {
        createMainWindow();
      } else {
        createLoginWindow();
      }
    }
  });

  // Initial check for updates
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
  sendStatusToWindow('updates:checking-for-update');
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info);
  sendStatusToWindow('updates:update-available', info);
  dialog.showMessageBox({
    title: 'Update Available',
    message: 'A new version is available!',
    detail: `TallyfyAI ${info.version} is available. You have ${app.getVersion()}. The update is downloading now.`,
    buttons: ['OK']
  });
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available:', info);
  sendStatusToWindow('updates:update-not-available', info);
  dialog.showMessageBox({
    title: 'No Updates',
    message: 'You have the latest version.',
    detail: `TallyfyAI ${app.getVersion()} is currently the newest version available.`,
    buttons: ['OK']
  });
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater:', err);
  sendStatusToWindow('updates:error', err);
  dialog.showMessageBox({
    title: 'Update Error',
    message: 'Error updating the application',
    detail: err.message || 'An unknown error occurred while checking for updates.',
    buttons: ['OK']
  });
});

autoUpdater.on('download-progress', (progressObj) => {
  let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
  logMessage = `${logMessage} - Downloaded ${progressObj.percent}%`;
  logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
  log.info(logMessage);
  sendStatusToWindow('updates:download-progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded:', info);
  sendStatusToWindow('updates:update-downloaded', info);
  const dialogOpts = {
    type: 'info',
    buttons: ['Restart', 'Later'],
    title: 'Application Update',
    message: 'Update Downloaded',
    detail: `TallyfyAI ${info.version} has been downloaded and will be installed on restart. Would you like to restart now?`
  };

  dialog.showMessageBox(dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

// Handle IPC messages from renderer process
// Login request
ipcMain.handle('auth:login', async (event, credentials) => {
  try {
    const result = await auth.login(credentials);
    
    if (result.success) {
      // Store user info
      store.set('user', result.user);
      
      // Create main window
      createMainWindow();
    }
    
    return result;
  } catch (error) {
    log.error('Login error:', error);
    return { success: false, error: error.message };
  }
});

// Logout request
ipcMain.handle('auth:logout', async (event) => {
  try {
    const result = await auth.logout();
    
    if (result.success) {
      // Clear stored user data
      store.delete('user');
      
      // Close main window
      if (mainWindow) {
        mainWindow.close();
      }
      
      // Create login window
      createLoginWindow();
    }
    
    return result;
  } catch (error) {
    log.error('Logout error:', error);
    return { success: false, error: error.message };
  }
});

// Database connection test
ipcMain.handle('db:test-connection', async (event) => {
  try {
    return await database.testConnection();
  } catch (error) {
    log.error('Database connection error:', error);
    return { success: false, error: error.message };
  }
});

// Get user data
ipcMain.handle('auth:get-user', async (event) => {
  try {
    const result = await auth.getUser();
    return result;
  } catch (error) {
    log.error('Get user error:', error);
    return { success: false, error: error.message };
  }
});

// Handle manual update check
ipcMain.handle('updates:check-for-updates', async () => {
  try {
    log.info('Manual update check triggered');
    
    if (isDev) {
      log.info('Updates are disabled in development mode');
      return { success: false, message: 'Updates are disabled in development mode' };
    }
    
    checkForUpdates();
    return { success: true };
  } catch (error) {
    log.error('Manual update check error:', error);
    return { success: false, error: error.message };
  }
}); 