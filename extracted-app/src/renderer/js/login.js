// Login page functionality

// DOM Elements
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberCheckbox = document.getElementById('remember');
const loginButton = document.getElementById('loginBtn');
const loginButtonText = document.getElementById('loginBtnText');
const loginButtonSpinner = document.getElementById('loginBtnSpinner');
const loginError = document.getElementById('loginError');
const loginSuccess = document.getElementById('loginSuccess');

// Check if user is already logged in
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Try to get user data
    const userResult = await window.electronAPI.auth.getUser();
    
    if (userResult.success) {
      // User is already logged in, show success message
      showSuccess('Already logged in, redirecting to dashboard...');
    }
  } catch (error) {
    console.error('Error checking authentication status:', error);
  }
});

// Handle login form submission
loginForm.addEventListener('submit', async (event) => {
  // Prevent default form submission
  event.preventDefault();
  
  // Disable login button and show spinner
  setLoading(true);
  
  // Hide any previous error message
  hideError();
  
  try {
    // Get form values
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const rememberMe = rememberCheckbox.checked;
    
    // Call login API via electronAPI bridge
    const result = await window.electronAPI.auth.login({
      username,
      password,
      rememberMe
    });
    
    // Handle login result
    if (result.success) {
      showSuccess('Login successful! Redirecting to dashboard...');
      // The main process will handle the window change
    } else {
      showError(result.error || 'Login failed');
      setLoading(false);
    }
  } catch (error) {
    console.error('Login error:', error);
    showError('An unexpected error occurred');
    setLoading(false);
  }
});

// Clear error message when user types
usernameInput.addEventListener('input', hideError);
passwordInput.addEventListener('input', hideError);

// Helper functions
function showError(message) {
  loginError.textContent = message;
  loginError.classList.remove('d-none');
  loginSuccess.classList.add('d-none');
}

function hideError() {
  loginError.classList.add('d-none');
}

function showSuccess(message) {
  loginSuccess.textContent = message;
  loginSuccess.classList.remove('d-none');
  loginError.classList.add('d-none');
}

function setLoading(isLoading) {
  if (isLoading) {
    loginButton.disabled = true;
    loginButtonText.textContent = 'Logging in...';
    loginButtonSpinner.classList.remove('d-none');
  } else {
    loginButton.disabled = false;
    loginButtonText.textContent = 'Login';
    loginButtonSpinner.classList.add('d-none');
  }
} 