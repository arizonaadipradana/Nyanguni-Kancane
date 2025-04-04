// client/src/services/ngrok-helper.js
import { loadConfig, resetConfig } from './config';

/**
 * Checks if the current application is running through ngrok
 * @returns {boolean} True if running through ngrok
 */
export const isNgrokEnvironment = () => {
  return window.location.hostname.includes('ngrok-free.app');
};

/**
 * Detects if the client needs to be redirected to a new ngrok URL
 * This helps when server restarts with a new ngrok URL and client is on old URL
 * @returns {Promise<boolean>} True if redirect is needed and performed
 */
export const checkNgrokRedirect = async () => {
  // Only run this logic if we're currently on an ngrok URL
  if (!isNgrokEnvironment()) {
    return false;
  }
  
  try {
    // Try to get the config and see if API URL is different from current URL
    const config = await loadConfig(true); // Force refresh
    
    if (!config || !config.apiUrl) {
      return false;
    }
    
    const currentOrigin = window.location.origin;
    const configApiUrl = config.apiUrl;
    
    // If the server reports a different ngrok URL than we're currently on, redirect
    if (configApiUrl.includes('ngrok-free.app') && 
        configApiUrl !== currentOrigin && 
        config.isNgrok) {
      
      console.log(`Detected ngrok URL mismatch. Current: ${currentOrigin}, Server: ${configApiUrl}`);
      
      // Confirm server is reachable at the new URL before redirecting
      try {
        const testResponse = await fetch(`${configApiUrl}/api/test`, { 
          method: 'GET',
          cache: 'no-store'
        });
        
        if (testResponse.ok) {
          console.log('Server is reachable at new ngrok URL, redirecting...');
          // Store state that might be needed after redirect
          localStorage.setItem('ngrokRedirect', 'true');
          localStorage.setItem('ngrokRedirectTime', Date.now().toString());
          localStorage.setItem('ngrokUrl', configApiUrl);
          
          // Redirect to the same path but on new origin
          const newUrl = `${configApiUrl}${window.location.pathname}${window.location.search}`;
          window.location.href = newUrl;
          return true;
        }
      } catch (error) {
        console.warn('Failed to verify new ngrok URL:', error);
      }
    }
  } catch (error) {
    console.error('Error checking for ngrok redirect:', error);
  }
  
  return false;
};

/**
 * Setup periodic check for ngrok URL changes
 * Call this once when your app initializes
 */
export const setupNgrokWatcher = () => {
  // Check for ngrok URL mismatch every minute
  const intervalId = setInterval(async () => {
    await checkNgrokRedirect();
  }, 60000);
  
  // Initial check on startup
  setTimeout(() => {
    checkNgrokRedirect();
  }, 2000);
  
  return () => clearInterval(intervalId); // Return cleanup function
};

/**
 * Handle reconnection after coming back to app
 * Call this in your main App component's useEffect
 */
export const handleNgrokVisibilityChange = () => {
  const handleVisibility = async () => {
    if (!document.hidden && isNgrokEnvironment()) {
      // App is visible again, check if we need to redirect
      resetConfig(); // Clear cached config
      await checkNgrokRedirect();
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibility);
  
  // Return cleanup function
  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
  };
};