// client/src/services/AuthService.js
import axios from 'axios';
import store from '../store';

/**
 * Service for handling authentication-related API calls
 */
class AuthService {
  /**
   * Login a user with improved error handling
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise} Response with token and user data
   */
  async login(username, password) {
    try {
      console.log('Sending login request to:', axios.defaults.baseURL + '/api/auth/login');
      
      // Send login request
      const response = await axios.post('/api/auth/login', {
        username,
        password
      }, {
        timeout: 10000 // 10 second timeout
      });
      
      // Check for valid response
      if (!response || !response.data) {
        throw new Error('Invalid response from server');
      }
      
      // Store token in localStorage
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        
        // Set auth header for future requests
        axios.defaults.headers.common['x-auth-token'] = response.data.token;
      } else {
        throw new Error('No authentication token received');
      }
      
      console.log('Login successful:', response.data);
      return response.data;
    } catch (error) {
      console.error('Login error details:', {
        message: error.message, 
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Generate helpful error message
      let errorMessage = 'Login failed';
      
      if (error.response) {
        // Server responded with an error
        errorMessage = error.response.data?.msg || `Server error: ${error.response.status}`;
      } else if (error.request) {
        // No response received
        errorMessage = 'No response from server. Please check your connection.';
      }
      
      const enhancedError = new Error(errorMessage);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }
  
  /**
   * Register a new user with improved error handling
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise} Response with token and user data
   */
  async register(username, password) {
    try {
      console.log('Sending register request to:', axios.defaults.baseURL + '/api/auth/register');
      
      // Send registration request
      const response = await axios.post('/api/auth/register', {
        username,
        password
      }, {
        timeout: 10000 // 10 second timeout
      });
      
      // Check for valid response
      if (!response || !response.data) {
        throw new Error('Invalid response from server');
      }
      
      // Store token in localStorage
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        
        // Set auth header for future requests
        axios.defaults.headers.common['x-auth-token'] = response.data.token;
      } else {
        throw new Error('No authentication token received');
      }
      
      console.log('Registration successful:', response.data);
      return response.data;
    } catch (error) {
      console.error('Register error details:', {
        message: error.message, 
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Generate helpful error message
      let errorMessage = 'Registration failed';
      
      if (error.response) {
        // Server responded with an error
        errorMessage = error.response.data?.msg || `Server error: ${error.response.status}`;
      } else if (error.request) {
        // No response received
        errorMessage = 'No response from server. Please check your connection.';
      }
      
      const enhancedError = new Error(errorMessage);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }
  
  /**
   * Logout the current user
   */
  logout() {
    // Remove token from localStorage
    localStorage.removeItem('token');
    
    // Remove auth header
    delete axios.defaults.headers.common['x-auth-token'];
    
    // Clear user state in Vuex store
    store.commit('CLEAR_AUTH');
  }
  
  /**
   * Get current user data
   * @returns {Promise} User data
   */
  async getCurrentUser() {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        return null;
      }
      
      const response = await axios.get('/api/auth/user', {
        headers: {
          'x-auth-token': token
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Get user error:', error);
      
      // If token is invalid, logout
      if (error.response && error.response.status === 401) {
        this.logout();
      }
      
      throw error;
    }
  }
  
  /**
   * Check if user is authenticated
   * @returns {boolean} True if authenticated
   */
  isAuthenticated() {
    return !!localStorage.getItem('token');
  }
  
  /**
   * Get the authentication token
   * @returns {string|null} The auth token or null
   */
  getToken() {
    return localStorage.getItem('token');
  }
  
  /**
   * Setup axios interceptors for authentication
   */
  setupInterceptors() {
    // Add request interceptor to include auth token
    axios.interceptors.request.use(
      config => {
        // Log important requests in development
        if (process.env.NODE_ENV !== 'production') {
          if (config.method && ['post', 'put', 'delete'].includes(config.method.toLowerCase())) {
            console.log(`📤 ${config.method.toUpperCase()} request to:`, config.url);
          }
        }
        
        const token = this.getToken();
        if (token) {
          config.headers['x-auth-token'] = token;
        }
        return config;
      },
      error => {
        return Promise.reject(error);
      }
    );
    
    // Add response interceptor to handle auth errors
    axios.interceptors.response.use(
      response => {
        // Log important responses in development
        if (process.env.NODE_ENV !== 'production') {
          if (response.config.method && 
              ['post', 'put', 'delete'].includes(response.config.method.toLowerCase())) {
            console.log(`📥 Response from ${response.config.method.toUpperCase()} ${response.config.url}:`, 
                        response.status);
          }
        }
        return response;
      },
      error => {
        // Log error details
        if (process.env.NODE_ENV !== 'production') {
          console.error('📛 API Error:', {
            url: error.config?.url,
            method: error.config?.method?.toUpperCase(),
            status: error.response?.status,
            message: error.message,
            data: error.response?.data
          });
        }
        
        if (error.response && error.response.status === 401) {
          // If 401 (Unauthorized), logout and redirect to login
          console.log('Authentication error. Logging out...');
          this.logout();
          // Only redirect to login if not already there
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        
        return Promise.reject(error);
      }
    );
  }
}

// Create and export a singleton instance
const authService = new AuthService();
authService.setupInterceptors();

export default authService;