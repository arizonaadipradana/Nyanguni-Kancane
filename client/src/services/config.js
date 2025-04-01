// client/src/services/config.js
// Modified version for proper production deployment

import axios from "axios";

let config = null;
let isLoading = false;
let loadPromise = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Production backend URL on Render.com
const PRODUCTION_API_URL = "https://nyanguni-kancane.onrender.com";

/**
 * Load application configuration with environment awareness
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
    const fetchConfig = async () => {
      try {
        // Check if we're in a production environment (Netlify)
        const isProduction = 
          window.location.hostname.includes('netlify.app') || 
          !window.location.hostname.includes('localhost');

        if (isProduction) {
          // In production, use the hardcoded Render.com backend URL
          config = {
            apiUrl: PRODUCTION_API_URL,
            socketUrl: PRODUCTION_API_URL,
            env: "production",
            version: "1.0.0"
          };
          
          console.log("Using production configuration:", config);
          lastFetchTime = Date.now();
          isLoading = false;
          resolve(config);
          return;
        }

        // For development, try to load from local config endpoint first
        let configUrl = `${window.location.origin}/api/config`;
        console.log("Loading configuration from current origin:", configUrl);

        try {
          const response = await axios.get(configUrl, {
            timeout: 5000,
            headers: { "Cache-Control": "no-cache" },
          });

          config = response.data;
          console.log("Application configuration loaded:", config);
          lastFetchTime = Date.now();
          isLoading = false;
          resolve(config);
          return;
        } catch (originError) {
          console.warn(
            "Failed to load from origin, will try fallback:",
            originError
          );
        }

        // Create fallback config with improved URL determination
        config = {
          apiUrl: determineServerUrl(),
          socketUrl: determineServerUrl(),
          env: "development",
          version: "1.0.0",
          isFallback: true,
        };

        console.log("Using fallback configuration:", config);
        lastFetchTime = Date.now();

        isLoading = false;
        resolve(config);
      } catch (error) {
        console.error("Failed to load configuration, using defaults:", error);

        // Create simple fallback config that works in all environments
        const isProduction = 
          window.location.hostname.includes('netlify.app') || 
          !window.location.hostname.includes('localhost');
          
        config = {
          apiUrl: isProduction ? PRODUCTION_API_URL : window.location.origin,
          socketUrl: isProduction ? PRODUCTION_API_URL : window.location.origin,
          env: isProduction ? "production" : "development",
          version: "1.0.0",
          isFallback: true,
        };

        console.log("Using emergency fallback configuration:", config);
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
  const hostname = window.location.hostname;
  
  // Check if we're in production (Netlify)
  if (hostname.includes('netlify.app')) {
    return PRODUCTION_API_URL;
  }

  // Use the current origin as default for development
  const currentOrigin = window.location.origin;

  // For development with devices on local network
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.match(/192\.168\./) ||
    hostname.match(/10\./)
  ) {
    // If we're not running on port 3000, we're likely using Vue devserver with proxy
    if (window.location.port !== "3000") {
      console.log("Using current origin with proxy:", currentOrigin);
      return currentOrigin;
    }
    return "http://localhost:3000"; // Default local API server port
  }

  // For any other environment, use the hardcoded production URL
  return PRODUCTION_API_URL;
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

// Export a default function that returns the config
export default async function getConfig() {
  return loadConfig();
}