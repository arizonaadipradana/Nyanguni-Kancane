// client/src/services/config.js
// Modified version for accessing the API through ngrok

import axios from 'axios';

let config = null;
let isLoading = false;
let loadPromise = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load application configuration from the server with fallback mechanisms
 * @param {boolean} forceRefresh - Force a refresh of the configuration
 * @returns {Promise<Object>} Configuration object
 */
export const loadConfig = async (forceRefresh = false) => {
  // Return cached config if it's recent and not forced to refresh
  const now = Date.now();
  if (config && !forceRefresh && (now - lastFetchTime < CACHE_DURATION)) {
    return config;
  }
  
  // If already loading, return the existing promise
  if (isLoading) {
    return loadPromise;
  }
  
  isLoading = true;
  
  loadPromise = new Promise((resolve) => {
    const fetchConfig = async () => {
      try {
        // First try to load from the ngrok URL if it's in localStorage
        const savedNgrokUrl = localStorage.getItem('ngrokUrl');
        let configUrl;
        
        if (savedNgrokUrl) {
          // Try loading from the saved ngrok URL
          configUrl = `${savedNgrokUrl}/api/config`;
          console.log('Trying saved ngrok URL:', configUrl);
          
          try {
            const ngrokResponse = await axios.get(configUrl, { 
              timeout: 3000,
              headers: { 'Cache-Control': 'no-cache' }
            });
            
            config = ngrokResponse.data;
            console.log('Configuration loaded from saved ngrok URL:', config);
            lastFetchTime = Date.now();
            
            isLoading = false;
            resolve(config);
            return;
          } catch (ngrokError) {
            console.warn('Failed to load from saved ngrok URL, will try other methods:', ngrokError);
          }
        }
        
        // Try to load from the current origin
        configUrl = `${window.location.origin}/api/config`;
        console.log('Loading configuration from current origin:', configUrl);
        
        const response = await axios.get(configUrl, { 
          timeout: 5000,
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        config = response.data;
        console.log('Application configuration loaded:', config);
        
        // If this is a ngrok URL, save it for future use
        if (config.isNgrok && config.apiUrl) {
          localStorage.setItem('ngrokUrl', config.apiUrl);
          console.log('Saved ngrok URL to localStorage:', config.apiUrl);
        }
        
        lastFetchTime = Date.now();
        isLoading = false;
        resolve(config);
      } catch (error) {
        console.error('Failed to load configuration, using defaults:', error);
        
        // Determine best server URL
        const serverUrl = determineServerUrl();
        
        // Create fallback config
        config = {
          apiUrl: serverUrl,
          socketUrl: serverUrl,
          env: 'development',
          version: '1.0.0',
          isFallback: true
        };
        
        console.log('Using fallback configuration:', config);
        lastFetchTime = Date.now();
        
        isLoading = false;
        resolve(config);
      }
    };
    
    fetchConfig();
  });
  
  return loadPromise;
};

/**
 * Intelligently determine the server URL based on client URL
 * @returns {string} Best guess of server URL
 */
function determineServerUrl() {
  // Try to get saved ngrok URL first
  const savedNgrokUrl = localStorage.getItem('ngrokUrl');
  if (savedNgrokUrl) {
    return savedNgrokUrl;
  }
  
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // If we're on an ngrok URL
  if (hostname.includes('ngrok')) {
    return `${protocol}//${hostname}`;
  }
  
  // If we're on a local IP
  if (hostname.match(/192\.168\./) || hostname.match(/10\./)) {
    return 'http://localhost:3000';
  }
  
  // If we're on localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (window.location.port !== '3000') {
      return 'http://localhost:3000';
    }
    return window.location.origin;
  }
  
  // For production, assume API is on same domain
  return window.location.origin;
}

/**
 * Reset the loaded configuration (useful for testing)
 */
export const resetConfig = () => {
  config = null;
  isLoading = false;
  loadPromise = null;
  lastFetchTime = 0;
};

/**
 * Get a specific configuration value
 * @param {string} key - Configuration key
 * @param {any} defaultValue - Default value if key not found
 * @returns {Promise<any>} Configuration value
 */
export const getConfigValue = async (key, defaultValue = null) => {
  const conf = await loadConfig();
  return conf[key] !== undefined ? conf[key] : defaultValue;
};

/**
 * Force reload the configuration
 * @returns {Promise<Object>} Fresh configuration
 */
export const refreshConfig = async () => {
  return loadConfig(true);
};