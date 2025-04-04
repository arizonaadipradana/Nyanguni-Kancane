// client/src/App.vue or client/src/App.jsx (depending on your framework)
// Here's a Vue example - adjust as needed for your actual framework

<template>
  <div id="app">
    <!-- Your app content -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-message">
        <p>Loading application...</p>
        <p v-if="connectionError" class="error-message">
          Connection issue detected. Trying to reconnect...
        </p>
      </div>
    </div>
    
    <!-- Your router view or main app content -->
    <router-view v-if="!isLoading"></router-view>
  </div>
</template>

<script>
import { loadConfig, getConfigValue } from './services/config';
import { setupNgrokWatcher, handleNgrokVisibilityChange, isNgrokEnvironment } from './services/ngrok-helper';

export default {
  name: 'App',
  data() {
    return {
      isLoading: true,
      connectionError: false,
      ngrokCleanup: null
    };
  },
  async created() {
    try {
      // Load app configuration
      await loadConfig();
      
      // Setup socket connection (adjust as needed for your actual socket setup)
      const socketUrl = await getConfigValue('socketUrl');
      if (socketUrl) {
        // Your socket setup code here
        console.log('Setting up socket connection to:', socketUrl);
      }
      
      // Setup ngrok watcher if we're in development mode
      if (process.env.NODE_ENV === 'development' || isNgrokEnvironment()) {
        this.ngrokCleanup = setupNgrokWatcher();
      }
      
      this.isLoading = false;
    } catch (error) {
      console.error('Error initializing app:', error);
      this.connectionError = true;
      
      // Give it a few seconds then try again
      setTimeout(async () => {
        try {
          await loadConfig(true);
          this.isLoading = false;
          this.connectionError = false;
        } catch (retryError) {
          console.error('Retry failed:', retryError);
        }
      }, 3000);
    }
  },
  mounted() {
    // Handle visibility changes for ngrok reconnection
    this.visibilityCleanup = handleNgrokVisibilityChange();
  },
  beforeDestroy() {
    // Clean up event listeners
    if (this.ngrokCleanup) {
      this.ngrokCleanup();
    }
    
    if (this.visibilityCleanup) {
      this.visibilityCleanup();
    }
  }
};
</script>

<style>
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.loading-message {
  background: white;
  padding: 20px;
  border-radius: 5px;
  text-align: center;
}

.error-message {
  color: red;
  margin-top: 10px;
}
</style>