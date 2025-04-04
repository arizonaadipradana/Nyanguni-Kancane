// client/src/services/config.js
// Updated version for more reliable ngrok connection

import axios from "axios";

let config = null;
let isLoading = false;
let loadPromise = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load application configuration from the server with improved error handling
 * @param {boolean} forceRefresh - Force a refresh of the configuration
 * @returns {Promise<Object>} Configuration object
 */
export const loadConfig = async (forceRefresh = false) => {
  const now = Date.now();
  if (config && !forceRefresh && now - lastFetchTime < CACHE_DURATION) {
    return config;
  }

  if (isLoading) {
    return loadPromise;
  }

  isLoading = true;

  loadPromise = new Promise((resolve) => {
    const fetchConfig = async () => {
      try {
        // First try loading from current origin
        const originUrl = `${window.location.origin}/api/config`;
        console.log('Attempting to load config from origin:', originUrl);
        
        try {
          const response = await axios.get(originUrl, {
            timeout: 5000,
            headers: { "Cache-Control": "no-cache" }
          });

          config = response.data;
          console.log('Config loaded from origin successfully:', config);
          
          // Store the ngrok URL if available
          if (config.isNgrok && config.apiUrl) {
            localStorage.setItem('ngrokUrl', config.apiUrl);
            localStorage.setItem('lastKnownNgrokHost', new URL(config.apiUrl).hostname);
            console.log('Saved ngrok URL:', config.apiUrl);
          }
          
          lastFetchTime = Date.now();
          isLoading = false;
          resolve(config);
          return;
        } catch (originError) {
          console.warn('Failed to load config from origin:', originError);
          
          // If origin failed, try fallback approaches
          // First check: Are we on ngrok now?
          const isCurrentlyOnNgrok = window.location.hostname.includes('ngrok-free.app');
          
          // Next try stored ngrok URL if we have one
          const storedNgrokUrl = localStorage.getItem('ngrokUrl');
          if (storedNgrokUrl) {
            try {
              console.log('Trying stored ngrok URL:', storedNgrokUrl);
              const ngrokResponse = await axios.get(`${storedNgrokUrl}/api/config`, {
                timeout: 5000,
                headers: { "Cache-Control": "no-cache" }
              });
              
              config = ngrokResponse.data;
              console.log('Config loaded from stored ngrok URL:', config);
              
              // Update stored URL if it changed
              if (config.isNgrok && config.apiUrl) {
                localStorage.setItem('ngrokUrl', config.apiUrl);
                localStorage.setItem('lastKnownNgrokHost', new URL(config.apiUrl).hostname);
              }
              
              lastFetchTime = Date.now();
              isLoading = false;
              resolve(config);
              return;
            } catch (ngrokError) {
              console.warn('Failed to load from stored ngrok URL:', ngrokError);
            }
          }
          
          // If we're on ngrok but previous attempts failed, it might be a new URL
          if (isCurrentlyOnNgrok) {
            // Use the current location as API URL since we're on ngrok
            const currentNgrokUrl = window.location.origin;
            console.log('Using current ngrok URL as API URL:', currentNgrokUrl);
            
            config = {
              apiUrl: currentNgrokUrl,
              socketUrl: currentNgrokUrl,
              env: 'development',
              version: '1.0.0',
              isNgrok: true,
              isFallback: true
            };
            
            // Store this new ngrok URL
            localStorage.setItem('ngrokUrl', currentNgrokUrl);
            localStorage.setItem('lastKnownNgrokHost', window.location.hostname);
            
            // Try to validate this URL works
            try {
              await axios.get(`${currentNgrokUrl}/api/test`, { timeout: 3000 });
              console.log('Validated current ngrok URL works');
            } catch (e) {
              console.warn('Current ngrok URL validation failed, using anyway:', e);
            }
            
            lastFetchTime = Date.now();
            isLoading = false;
            resolve(config);
            return;
          }
          
          // Final fallback - try localhost
          try {
            console.log('Trying localhost fallback');
            const localhostUrl = 'http://localhost:5000';
            const localhostResponse = await axios.get(`${localhostUrl}/api/config`, {
              timeout: 3000,
              headers: { "Cache-Control": "no-cache" }
            });
            
            config = localhostResponse.data;
            console.log('Config loaded from localhost:', config);
            
            lastFetchTime = Date.now();
            isLoading = false;
            resolve(config);
            return;
          } catch (localhostError) {
            console.warn('Failed to load from localhost:', localhostError);
          }
        }
        
        // Ultimate fallback if all else fails
        console.warn('All config loading attempts failed, using default values');
        config = {
          apiUrl: window.location.origin,
          socketUrl: window.location.origin,
          env: 'development',
          version: '1.0.0',
          isFallback: true
        };
        
        lastFetchTime = Date.now();
        isLoading = false;
        resolve(config);
      } catch (error) {
        console.error('Unhandled error in config loading:', error);
        config = {
          apiUrl: window.location.origin,
          socketUrl: window.location.origin,
          env: 'development',
          version: '1.0.0',
          isFallback: true
        };
        isLoading = false;
        resolve(config);
      }
    };

    fetchConfig();
  });

  return loadPromise;
};

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

/**
 * Check if we're currently running through ngrok
 * @returns {boolean} True if the current hostname is an ngrok domain
 */
export const isNgrokEnvironment = () => {
  return window.location.hostname.includes('ngrok-free.app');
};