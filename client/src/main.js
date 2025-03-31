// client/src/main.js
import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import { setupNetworkDebug } from './utils/debug'
import SocketService from './services/SocketService'

Vue.config.productionTip = false

// Set up global error handler
Vue.config.errorHandler = (err, vm, info) => {
  console.error('Vue Error:', err);
  console.error('Error Info:', info);
  // You could send errors to a monitoring service here
};

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

// Create Vue instance
new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')

// Set up network debugging in development
if (process.env.NODE_ENV !== 'production') {
  setupNetworkDebug();
}