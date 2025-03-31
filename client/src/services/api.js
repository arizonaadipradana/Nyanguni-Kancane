// client/src/services/api.js
import axios from 'axios';
import { loadConfig } from './config';

// Create a configured axios instance with dynamic base URL
const createApiInstance = async () => {
  // Load configuration
  const config = await loadConfig();
  
  // Create axios instance
  const api = axios.create({
    baseURL: `${config.apiUrl}/api`,
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 10000 // 10 second timeout
  });

  // Add a request interceptor to include auth token
  api.interceptors.request.use(
    config => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers['x-auth-token'] = token;
      }
      return config;
    },
    error => {
      console.error('API Request Error:', error);
      return Promise.reject(error);
    }
  );

  // Add a response interceptor for better error handling
  api.interceptors.response.use(
    response => {
      return response;
    },
    error => {
      // Handle token expiration
      if (error.response && error.response.status === 401) {
        console.error('Authentication error:', error.response.data);
        // Optionally redirect to login
        // window.location = '/login';
      }
      
      // Create a more informative error
      const enhancedError = new Error(
        error.response?.data?.msg || error.message || 'Unknown API error'
      );
      enhancedError.originalError = error;
      enhancedError.status = error.response?.status;
      enhancedError.data = error.response?.data;
      
      return Promise.reject(enhancedError);
    }
  );

  return api;
};

// API service singleton
let apiInstance = null;
let apiPromise = null;

// Get the API instance (initializes if needed)
const getApi = async () => {
  if (apiInstance) return apiInstance;
  
  if (!apiPromise) {
    apiPromise = createApiInstance().then(api => {
      apiInstance = api;
      return api;
    });
  }
  
  return apiPromise;
};

// Export the API services
export default {
  // Auth endpoints
  auth: {
    login: async (credentials) => {
      const api = await getApi();
      return api.post('/auth/login', credentials);
    },
    register: async (credentials) => {
      const api = await getApi();
      return api.post('/auth/register', credentials);
    },
    getUser: async () => {
      const api = await getApi();
      return api.get('/auth/user');
    }
  },
  
  // Game endpoints
  games: {
    create: async (creatorId, creatorName) => {
      const api = await getApi();
      return api.post('/games', { creatorId, creatorName });
    },
    join: async (gameId, playerId, playerName) => {
      const api = await getApi();
      return api.post(`/games/join/${gameId}`, { playerId, playerName });
    },
    get: async (gameId) => {
      const api = await getApi();
      return api.get(`/games/${gameId}`);
    },
    start: async (gameId, playerId) => {
      const api = await getApi();
      return api.post(`/games/start/${gameId}`, { playerId });
    },
    getActive: async () => {
      const api = await getApi();
      return api.get('/games');
    },
    getUserGames: async () => {
      const api = await getApi();
      return api.get('/games/user');
    }
  },
  
  // Reset the API instance (useful for testing)
  resetInstance: () => {
    apiInstance = null;
    apiPromise = null;
  }
};