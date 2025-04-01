// client/src/main.js
import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import axios from 'axios'
import { setupNetworkDebug } from './utils/debug'
import SocketService from './services/SocketService'
import { loadConfig } from './services/config'

Vue.config.productionTip = false

// Global error handler
Vue.config.errorHandler = (err, vm, info) => {
  console.error('Vue Global Error:', err);
  console.error('Component:', vm);
  console.error('Error Info:', info);
};

// Axios default configuration
const configureAxios = (baseURL) => {
  axios.defaults.baseURL = baseURL;
  axios.defaults.timeout = 15000; // 15 seconds timeout
  
  // Request interceptor for logging and error tracking
  axios.interceptors.request.use(
    config => {
      console.log(`📤 ${config.method.toUpperCase()} ${config.url}`);
      return config;
    },
    error => {
      console.error('Request Error:', error);
      return Promise.reject(error);
    }
  );

  // Response interceptor for global error handling
  axios.interceptors.response.use(
    response => response,
    error => {
      console.error('Response Error:', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.message
      });
      
      if (error.response?.status === 401) {
        store.dispatch('logout');
        router.push('/login');
      }
      
      return Promise.reject(error);
    }
  );
};

// Authentication initialization
const initAuth = async () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      store.commit('SET_TOKEN', token);
      axios.defaults.headers.common['x-auth-token'] = token;
      await store.dispatch('fetchUserData');
    } catch (error) {
      console.error('Authentication initialization error:', error);
      localStorage.removeItem('token');
      store.commit('CLEAR_AUTH');
    }
  }
};

// Main application initialization
const initApp = async () => {
  try {
    // Load configuration first
    const config = await loadConfig();
    
    // Configure Axios with the loaded configuration
    configureAxios(config.apiUrl || window.location.origin);
    
    console.log('Application configuration loaded:', config);
    
    // Initialize authentication
    await initAuth();
    
    // Create Vue instance
    new Vue({
      router,
      store,
      render: h => h(App)
    }).$mount('#app');
    
    // Initialize socket connection when user is authenticated
    store.watch(
      (state) => state.user,
      (newUser) => {
        if (newUser && newUser.id) {
          SocketService.init()
            .then(() => {
              SocketService.registerUser(newUser.id);
            })
            .catch(err => {
              console.error('Socket initialization failed:', err);
            });
        }
      }
    );
  } catch (error) {
    console.error('Application initialization failed:', error);
    
    // Fallback to basic initialization
    new Vue({
      router,
      store,
      render: h => h(App, {
        props: {
          initializationError: error
        }
      })
    }).$mount('#app');
  }
};

// Setup network debugging in development
if (process.env.NODE_ENV !== 'production') {
  setupNetworkDebug();
}

// Start the application
initApp();