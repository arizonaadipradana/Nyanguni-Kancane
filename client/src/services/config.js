// client/src/services/config.js
// Modified version for accessing the API through ngrok

import axios from "axios";

let config = null;
let isLoading = false;
let loadPromise = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load application configuration from the server with better error handling
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
        // Remove ngrok URL from localStorage if it's causing issues
        const useNgrok = localStorage.getItem("useNgrok") === "true";
        if (!useNgrok && localStorage.getItem("ngrokUrl")) {
          console.log("Removing saved ngrok URL from localStorage");
          localStorage.removeItem("ngrokUrl");
        }

        // Start with direct server communication
        let configUrl = `${window.location.origin}/api/config`;
        console.log("Loading configuration from current origin:", configUrl);

        try {
          const response = await axios.get(configUrl, {
            timeout: 5000,
            headers: { "Cache-Control": "no-cache" },
          });

          config = response.data;
          console.log("Application configuration loaded:", config);

          // Only save ngrok URL if useNgrok is true
          if (useNgrok && config.isNgrok && config.apiUrl) {
            localStorage.setItem("ngrokUrl", config.apiUrl);
            console.log("Saved ngrok URL to localStorage:", config.apiUrl);
          }

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

        // Create simple fallback config with current origin
        config = {
          apiUrl: window.location.origin,
          socketUrl: window.location.origin,
          env: "development",
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

  // Use the current origin as default - most reliable for development
  const currentOrigin = window.location.origin;

  // Only use ngrok if explicitly enabled
  const useNgrok = localStorage.getItem("useNgrok") === "true";
  if (useNgrok) {
    // Try to get saved ngrok URL if enabled
    const savedNgrokUrl = localStorage.getItem("ngrokUrl");
    if (savedNgrokUrl) {
      return savedNgrokUrl;
    }
  }

  // For development with devices on local network, handle possible proxy setup
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
    return currentOrigin;
  }

  // For production, assume API is on same domain
  return currentOrigin;
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
