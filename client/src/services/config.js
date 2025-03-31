// client/src/services/config.js - Add this new file
import axios from 'axios';

let config = null;
let isLoading = false;
let loadPromise = null;

/**
 * Load application configuration from the server
 * @returns {Promise<Object>} Configuration object
 */
export const loadConfig = async () => {
  if (config) return config;
  
  if (isLoading) {
    return loadPromise;
  }
  
  isLoading = true;
  // Fix for the 'reject' parameter error
  loadPromise = new Promise((resolve) => {
    const fetchConfig = async () => {
      try {
        const baseUrl = window.location.origin;
        const configUrl = `${baseUrl}/api/config`;
        
        console.log('Loading application configuration from:', configUrl);
        const response = await axios.get(configUrl);
        
        config = response.data;
        console.log('Application configuration loaded:', config);
        
        isLoading = false;
        resolve(config);
      } catch (error) {
        console.error('Failed to load configuration, using defaults:', error);
        
        // Fallback configuration
        config = {
          apiUrl: window.location.origin,
          socketUrl: window.location.origin,
          env: 'development',
          version: '1.0.0'
        };
        
        isLoading = false;
        resolve(config);
      }
    };
    
    fetchConfig();
  });
  
  return loadPromise;
};

// client/src/services/api.js - Update with dynamic configuration
