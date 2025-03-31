// client/src/main.js
import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import { setupNetworkDebug } from './utils/debug';

Vue.config.productionTip = false

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')

if (process.env.NODE_ENV !== 'production') {
    setupNetworkDebug();
    }