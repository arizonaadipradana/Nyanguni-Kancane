// client/src/services/AuthService.js
import axios from 'axios';
import store from '../store';

const API_URL = process.env.VUE_APP_API_URL || '';

/**
 * Service for handling authentication-related API calls
 */
class AuthService {
  /**
   * Login a user
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise} Response with token and user data
   */
  async login(username, password) {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        username,
        password
      });
      
      // Store token in localStorage
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        
        // Set auth header for future requests
        axios.defaults.headers.common['x-auth-token'] = response.data.token;
      }
      
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }
  
  /**
   * Register a new user
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise} Response with token and user data
   */
  async register(username, password) {
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        username,
        password
      });
      
      // Store token in localStorage
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        
        // Set auth header for future requests
        axios.defaults.headers.common['x-auth-token'] = response.data.token;
      }
      
      return response.data;
    } catch (error) {
      console.error('Register error:', error);
      throw error;
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
      
      const response = await axios.get(`${API_URL}/api/auth/user`, {
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
   * Update user profile
   * @param {Object} userData - User data to update
   * @returns {Promise} Updated user data
   */
  async updateProfile(userData) {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      const response = await axios.put(`${API_URL}/api/auth/profile`, userData, {
        headers: {
          'x-auth-token': token
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  }
  
  /**
   * Get user statistics
   * @returns {Promise} User statistics
   */
  async getUserStats() {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      const response = await axios.get(`${API_URL}/api/auth/stats`, {
        headers: {
          'x-auth-token': token
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Get user stats error:', error);
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
      response => response,
      error => {
        if (error.response && error.response.status === 401) {
          // If 401 (Unauthorized), logout and redirect to login
          this.logout();
          window.location.href = '/login';
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