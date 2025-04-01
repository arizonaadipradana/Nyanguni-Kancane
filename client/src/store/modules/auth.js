// client/src/store/modules/auth.js
import axios from 'axios';
import router from '../../router';

// Helper functions
const standardizeUserId = (userData) => {
  if (!userData) return null;
  
  const standardized = { ...userData };
  
  // Ensure both id and _id exist
  if (standardized.id && !standardized._id) standardized._id = standardized.id;
  if (standardized._id && !standardized.id) standardized.id = standardized._id;
  
  // Handle MongoDB $oid format
  if (typeof standardized.id === 'object' && standardized.id?.$oid) {
    standardized.id = standardized.id.$oid;
  }
  if (typeof standardized._id === 'object' && standardized._id?.$oid) {
    standardized._id = standardized._id.$oid;
  }
  
  // Convert to string for consistency
  if (standardized.id) standardized.id = String(standardized.id);
  if (standardized._id) standardized._id = String(standardized._id);
  
  return standardized;
};

const auth = {
  state: {
    token: localStorage.getItem('token') || '',
    user: null,
    loading: false,
    error: '',
  },
  
  getters: {
    isAuthenticated: (state) => !!state.token,
    currentUser: (state) => state.user,
    authError: (state) => state.error,
    isAuthLoading: (state) => state.loading,
  },
  
  mutations: {
    AUTH_REQUEST(state) {
      state.loading = true;
      state.error = '';
    },
    
    AUTH_SUCCESS(state, { token, user }) {
      state.token = token;
      state.user = standardizeUserId(user);
      state.loading = false;
      state.error = '';
    },
    
    AUTH_ERROR(state, errorMessage) {
      state.loading = false;
      state.error = errorMessage;
    },
    
    SET_USER(state, user) {
      state.user = standardizeUserId(user);
    },
    
    CLEAR_AUTH(state) {
      state.token = '';
      state.user = null;
      state.error = '';
    },
  },
  
  actions: {
    // Initialize auth from localStorage
    initAuth({ commit, dispatch }) {
      const token = localStorage.getItem('token');
      if (token) {
        // Set token in state
        commit('AUTH_SUCCESS', { token, user: null });
        // Set header for future requests
        axios.defaults.headers.common['x-auth-token'] = token;
        
        // Fetch user data
        return dispatch('fetchUser');
      }
      return Promise.resolve(false);
    },
    
    // Login user
    async login({ commit, dispatch }, credentials) {
      commit('AUTH_REQUEST');
      
      try {
        const response = await axios.post('/api/auth/login', credentials);
        const { token, user } = response.data;
        
        if (!token) {
          commit('AUTH_ERROR', 'No token received from server');
          return { success: false, error: 'Authentication failed' };
        }
        
        // Store token in localStorage and state
        localStorage.setItem('token', token);
        
        // Set auth header for axios
        axios.defaults.headers.common['x-auth-token'] = token;
        
        // Save user data if provided
        commit('AUTH_SUCCESS', { token, user });
        
        // If no user data in response, fetch it separately
        if (!user) {
          dispatch('fetchUser');
        }
        
        return { success: true, token };
      } catch (error) {
        const errorMsg = error.response?.data?.msg || 'Login failed';
        commit('AUTH_ERROR', errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    
    // Fetch current user
    async fetchUser({ commit, state, dispatch }) {
      if (!state.token) {
        commit('AUTH_ERROR', 'No authentication token');
        return { success: false };
      }
      
      try {
        const response = await axios.get('/api/auth/user', {
          headers: { 'x-auth-token': state.token }
        });
        
        if (!response.data || (!response.data.id && !response.data._id)) {
          commit('AUTH_ERROR', 'Invalid user data received');
          return { success: false };
        }
        
        commit('SET_USER', response.data);
        return { success: true, user: response.data };
      } catch (error) {
        const errorMsg = error.response?.data?.msg || 'Failed to fetch user data';
        commit('AUTH_ERROR', errorMsg);
        
        // If token is invalid, logout
        if (error.response?.status === 401) {
          dispatch('logout');
        }
        
        return { success: false, error: errorMsg };
      }
    },
    
    // Logout user
    logout({ commit }) {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['x-auth-token'];
      commit('CLEAR_AUTH');
      router.push('/login');
    },
  }
};

export default auth;