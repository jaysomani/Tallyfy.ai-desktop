// Main application script

// DOM elements
const userName = document.getElementById('userName');
const userAvatar = document.getElementById('userAvatar');
const logoutButton = document.getElementById('logoutButton');
const logoutSidebarButton = document.getElementById('logoutSidebarButton');
const dbStatusMessage = document.getElementById('dbStatusMessage');
const checkDbButton = document.getElementById('checkDbButton');
const appVersion = document.getElementById('appVersion');
const appEnvironment = document.getElementById('appEnvironment');
const checkUpdatesButton = document.getElementById('checkUpdatesButton');
const updateStatus = document.getElementById('updateStatus');

// Update modal elements
const updateModal = new bootstrap.Modal(document.getElementById('updateModal'), {
  keyboard: false,
  backdrop: 'static'
});
const updateModalMessage = document.getElementById('updateModalMessage');
const updateProgressBar = document.getElementById('updateProgressBar');
const updateModalActionBtn = document.getElementById('updateModalActionBtn');

// Initialize application
async function initializeApp() {
  try {
    // Get user data
    const userResult = await window.electronAPI.auth.getUser();
    
    if (userResult.success) {
      // Update UI with user data
      updateUserInfo(userResult.user);
    } else {
      // If no user is logged in, we shouldn't get here (main process will redirect to login)
      console.error('No user logged in');
    }
    
    // Set app info
    updateAppInfo();
    
    // Test database connection
    testDbConnection();
    
    // Set up event listeners
    setupEventListeners();
  } catch (error) {
    console.error('Error initializing app:', error);
  }
}

// Set up event listeners
function setupEventListeners() {
  // Logout buttons
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
  
  if (logoutSidebarButton) {
    logoutSidebarButton.addEventListener('click', handleLogout);
  }
  
  // Database connection test button
  if (checkDbButton) {
    checkDbButton.addEventListener('click', testDbConnection);
  }
  
  // Check for updates button
  if (checkUpdatesButton) {
    checkUpdatesButton.addEventListener('click', checkForUpdates);
  }
  
  // Update modal action button
  if (updateModalActionBtn) {
    updateModalActionBtn.addEventListener('click', () => {
      // This would trigger a quit and install in a real app
      console.log('User confirmed update installation');
    });
  }
  
  // Add update event listeners if available
  if (window.electronAPI.updates) {
    // Listen for update events from main process
    window.electronAPI.updates.onUpdateAvailable(handleUpdateAvailable);
    window.electronAPI.updates.onUpdateDownloaded(handleUpdateDownloaded);
  }
}

// Update user information in the UI
function updateUserInfo(user) {
  if (user) {
    // Display user name
    userName.textContent = user.attributes.name || user.username;
    
    // Set user avatar with initials
    const name = user.attributes.name || user.username;
    const initials = name.split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
    
    userAvatar.textContent = initials;
  }
}

// Update application information
function updateAppInfo() {
  // Set app version from electronAPI bridge
  appVersion.textContent = window.electronAPI.appInfo.version || '1.0.0';
  
  // Set environment
  appEnvironment.textContent = window.electronAPI.appInfo.isDev ? 'Development' : 'Production';
}

// Test database connection
async function testDbConnection() {
  try {
    dbStatusMessage.textContent = 'Testing database connection...';
    dbStatusMessage.className = 'text-muted';
    
    // Call DB test API
    const result = await window.electronAPI.db.testConnection();
    
    if (result.success) {
      dbStatusMessage.textContent = result.message;
      dbStatusMessage.className = 'text-success';
    } else {
      dbStatusMessage.textContent = 'Failed to connect to database: ' + (result.error || 'Unknown error');
      dbStatusMessage.className = 'text-danger';
    }
  } catch (error) {
    console.error('Error testing DB connection:', error);
    dbStatusMessage.textContent = 'Error testing database connection.';
    dbStatusMessage.className = 'text-danger';
  }
}

// Handle updates available
function handleUpdateAvailable(info) {
  console.log('Update available:', info);
  
  // Show update status
  updateStatus.textContent = `New version ${info.version} available`;
  updateStatus.className = 'ms-3 text-success';
  
  // Update modal
  updateModalMessage.textContent = `A new version (${info.version}) is available and downloading. Current version: ${appVersion.textContent}`;
  updateProgressBar.style.width = '0%';
  updateProgressBar.setAttribute('aria-valuenow', 0);
  updateModalActionBtn.style.display = 'none';
  
  // Show modal
  updateModal.show();
}

// Handle update download progress
function handleUpdateProgress(progressObj) {
  if (progressObj && progressObj.percent) {
    const percent = Math.round(progressObj.percent);
    updateProgressBar.style.width = `${percent}%`;
    updateProgressBar.setAttribute('aria-valuenow', percent);
    updateModalMessage.textContent = `Downloading update: ${percent}% complete`;
  }
}

// Handle update downloaded
function handleUpdateDownloaded(info) {
  console.log('Update downloaded:', info);
  
  // Show update status
  updateStatus.textContent = `Update ${info.version} ready to install`;
  updateStatus.className = 'ms-3 text-success';
  
  // Update modal
  updateModalMessage.textContent = `Update ${info.version} has been downloaded and is ready to install. The application will restart after installation.`;
  updateProgressBar.style.width = '100%';
  updateProgressBar.setAttribute('aria-valuenow', 100);
  updateProgressBar.classList.remove('progress-bar-animated');
  updateModalActionBtn.style.display = 'block';
  updateModalActionBtn.textContent = 'Install & Restart';
  
  // Show modal if not already visible
  updateModal.show();
}

// Handle logout
async function handleLogout() {
  try {
    // Call logout API
    const result = await window.electronAPI.auth.logout();
    
    if (result.success) {
      // Logout successful - the main process will close this window and open login
      console.log('Logout successful');
    } else {
      console.error('Logout failed:', result.error);
    }
  } catch (error) {
    console.error('Error logging out:', error);
  }
}

// Check for updates manually
async function checkForUpdates() {
  try {
    // Update UI
    updateStatus.textContent = 'Checking for updates...';
    updateStatus.className = 'ms-3 text-muted';
    checkUpdatesButton.disabled = true;
    
    if (window.electronAPI.updates) {
      // Call update check API
      const result = await window.electronAPI.updates.checkForUpdates();
      
      if (result.success) {
        // The actual status will be handled by the event listeners
        console.log('Update check initiated');
      } else {
        updateStatus.textContent = result.message || 'Unable to check for updates';
        updateStatus.className = 'ms-3 text-warning';
      }
    } else {
      updateStatus.textContent = 'Update functionality not available';
      updateStatus.className = 'ms-3 text-warning';
    }
    
    // Re-enable button after 3 seconds
    setTimeout(() => {
      checkUpdatesButton.disabled = false;
    }, 3000);
  } catch (error) {
    console.error('Error checking for updates:', error);
    updateStatus.textContent = 'Error checking for updates';
    updateStatus.className = 'ms-3 text-danger';
    checkUpdatesButton.disabled = false;
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', initializeApp); 