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

// Set base URL for axios to local server
const localUrl = 'http://localhost:3000'
axios.defaults.baseURL = localUrl
console.log('Setting axios base URL to:', localUrl)

// Configure axios
axios.defaults.timeout = 10000 // 10 seconds timeout

// Set up global error handler
Vue.config.errorHandler = (err, vm, info) => {
  console.error('Vue Error:', err);
  console.error('Error Info:', info);
};

// Load config and then initialize app
loadConfig()
  .then(config => {
    console.log('Application config loaded:', config);
    
    // Update axios base URL if it's different
    if (config.apiUrl && config.apiUrl !== axios.defaults.baseURL) {
      axios.defaults.baseURL = config.apiUrl;
      console.log('Updated axios base URL to:', config.apiUrl);
    }
    
    // Initialize Vue instance
    new Vue({
      router,
      store,
      render: h => h(App)
    }).$mount('#app');
    
    // Initialize socket connection when a user is authenticated
    store.watch(
      (state) => state.user,
      (newUser) => {
        if (newUser && newUser.id) {
          // Initialize socket and register user
          SocketService.init()
            .then(() => {
              SocketService.registerUser(newUser.id);
              console.log('Socket initialized and user registered:', newUser.id);
            })
            .catch(err => {
              console.error('Failed to initialize socket:', err);
            });
        }
      }
    );
  })
  .catch(error => {
    console.error('Failed to load config:', error);
    
    // Initialize Vue even if config fails
    new Vue({
      router,
      store,
      render: h => h(App)
    }).$mount('#app');
  });

// Set up network debugging in development
if (process.env.NODE_ENV !== 'production') {
  setupNetworkDebug();
}