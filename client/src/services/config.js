// client/src/services/config.js
import axios from "axios";

let config = null;
let isLoading = false;
let loadPromise = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Predefined backend URLs
const BACKEND_URLS = [
  'https://nyanguni-kancane.onrender.com',
  'http://localhost:3000'
];

/**
 * Attempt to connect to a list of potential backend URLs
 * @param {string[]} urls - List of URLs to try
 * @returns {Promise<Object>} Configuration object
 */
async function tryUrls(urls) {
  for (const url of urls) {
    try {
      const response = await axios.get(`${url}/api/config`, {
        timeout: 5000,
        headers: { 'Cache-Control': 'no-cache' }
      });

      console.log(`Successfully connected to backend at: ${url}`);
      return { ...response.data, apiUrl: url, socketUrl: url };
    } catch (error) {
      console.warn(`Failed to connect to ${url}:`, error.message);
    }
  }

  throw new Error('Could not connect to any backend URL');
}

/**
 * Load application configuration from the server with improved error handling
 * @param {boolean} forceRefresh - Force a refresh of the configuration
 * @returns {Promise<Object>} Configuration object
 */
export const loadConfig = async (forceRefresh = false) => {
  // Return cached config if it's recent and not forced to refresh
  const now = Date.now();
  if (config && !forceRefresh && now - lastFetchTime < CACHE_DURATION) {
    return config;
  }

  // If already loading, return the existing promise
  if (isLoading) {
    return loadPromise;
  }

  isLoading = true;

  loadPromise = new Promise((resolve) => {
    const loadAsync = async () => {
      try {
        // First, try saved URLs
        const savedUrls = [
          localStorage.getItem('backendUrl'),
          ...BACKEND_URLS
        ].filter(Boolean);

        try {
          config = await tryUrls(savedUrls);
          
          // Save successful URL
          localStorage.setItem('backendUrl', config.apiUrl);
        } catch (urlError) {
          // Fallback configuration if all URLs fail
          config = {
            apiUrl: window.location.origin,
            socketUrl: window.location.origin,
            env: 'development',
            version: '1.0.0',
            isFallback: true
          };
        }

        lastFetchTime = Date.now();
        isLoading = false;
        resolve(config);
      } catch (error) {
        console.error('Configuration loading failed:', error);
        
        config = {
          apiUrl: window.location.origin,
          socketUrl: window.location.origin,
          env: 'development',
          version: '1.0.0',
          isFallback: true,
          error: error.message
        };

        lastFetchTime = Date.now();
        isLoading = false;
        resolve(config);
      }
    };

    loadAsync();
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
  localStorage.removeItem('backendUrl');
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
  localStorage.removeItem('backendUrl');
  return loadConfig(true);
};