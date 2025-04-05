// client/src/main.js
import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import axios from "axios";
import { setupNetworkDebug } from "./utils/debug";
import SocketService from "./services/SocketService";
import { loadConfig } from "./services/config";

Vue.config.productionTip = false;

// Set base URL for axios to local server with updated port
const localUrl = "http://localhost:5000"; // Updated from 3000 to 5000
axios.defaults.baseURL = localUrl;
console.log("Setting axios base URL to:", localUrl);

// Configure axios
axios.defaults.timeout = 10000; // 10 seconds timeout

// Set up global error handler
Vue.config.errorHandler = (err, vm, info) => {
  console.error("Vue Error:", err);
  console.error("Error Info:", info);
};

// Initialize auth from localStorage if available
const initAuth = async () => {
  const token = localStorage.getItem("token");
  if (token) {
    // Set token in store
    store.commit("SET_TOKEN", token);
    // Set header for future requests
    axios.defaults.headers.common["x-auth-token"] = token;

    try {
      // Fetch user data
      await store.dispatch("fetchUserData");
      console.log("User data loaded from token");
    } catch (error) {
      console.error("Error loading user data from token:", error);
      // Clear invalid token
      localStorage.removeItem("token");
      delete axios.defaults.headers.common["x-auth-token"];
      store.commit("CLEAR_AUTH");
    }
  }
};

// Load config and then initialize app
loadConfig()
  .then(async (config) => {
    console.log("Application config loaded:", config);

    // Update axios base URL if it's different
    if (config.apiUrl && config.apiUrl !== axios.defaults.baseURL) {
      axios.defaults.baseURL = config.apiUrl;
      console.log("Updated axios base URL to:", config.apiUrl);
    }

    // Initialize auth before mounting app
    await initAuth();

    // Initialize Vue instance
    new Vue({
      router,
      store,
      render: (h) => h(App),
    }).$mount("#app");

    // Initialize socket connection when a user is authenticated
    store.watch(
      (state) => state.user,
      (newUser) => {
        if (newUser && newUser.id) {
          // Initialize socket and register user
          SocketService.init()
            .then(() => {
              SocketService.registerUser(newUser.id);
              console.log(
                "Socket initialized and user registered:",
                newUser.id
              );
            })
            .catch((err) => {
              console.error("Failed to initialize socket:", err);
            });
        }
      }
    );
  })
  .catch((error) => {
    console.error("Failed to load config:", error);

    // Still initialize auth
    initAuth().then(() => {
      // Initialize Vue even if config fails
      new Vue({
        router,
        store,
        render: (h) => h(App),
      }).$mount("#app");
    });
  });

// Set up network debugging in development
if (process.env.NODE_ENV !== "production") {
  setupNetworkDebug();
}
