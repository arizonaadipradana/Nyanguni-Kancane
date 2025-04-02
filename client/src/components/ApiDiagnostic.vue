<!-- client/src/components/ApiDiagnostic.vue -->
<template>
  <div class="diagnostic-panel">
    <h3>API Diagnostic</h3>
    <div class="status-section" v-if="loading">
      <p>Testing API connection...</p>
      <div class="loader"></div>
    </div>
    <div class="status-section" v-else>
      <div class="status-item" :class="{ success: apiStatus === 'connected', error: apiStatus === 'failed' }">
        <span class="status-label">API Status:</span>
        <span class="status-value">{{ apiStatus === 'connected' ? 'Connected' : 'Failed' }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">API URL:</span>
        <span class="status-value">{{ apiUrl }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Current Origin:</span>
        <span class="status-value">{{ currentOrigin }}</span>
      </div>
      <div class="status-item" v-if="errorMessage">
        <span class="status-label">Error:</span>
        <span class="status-value error">{{ errorMessage }}</span>
      </div>
    </div>
    <div class="action-section">
      <button @click="testConnection" :disabled="loading" class="test-button">
        Test Connection
      </button>
      <button @click="testDirectConnection" :disabled="loading" class="test-button">
        Test Direct Connection (Port 5000)
      </button>
      <button @click="clearNgrok" :disabled="loading" class="test-button warning">
        Clear Ngrok URL
      </button>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'ApiDiagnostic',
  
  data() {
    return {
      apiStatus: 'unknown',
      apiUrl: axios.defaults.baseURL || window.location.origin + '/api',
      currentOrigin: window.location.origin,
      loading: false,
      errorMessage: ''
    };
  },
  
  mounted() {
    // Test connection when component is mounted
    this.testConnection();
  },
  
  methods: {
    async clearNgrok() {
      this.loading = true;
      this.errorMessage = '';
      
      try {
        console.log('Removing ngrok URL from localStorage');
        localStorage.removeItem('ngrokUrl');
        localStorage.setItem('useNgrok', 'false');
        
        // Update URLs to use current origin
        this.apiUrl = window.location.origin + '/api';
        
        // Reset axios default URL
        axios.defaults.baseURL = this.apiUrl;
        
        // Test the connection with the new URL
        await this.testConnection();
        
        // Reload the page to apply changes
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error) {
        console.error('Error clearing ngrok settings:', error);
        this.errorMessage = 'Failed to clear ngrok settings: ' + error.message;
      } finally {
        this.loading = false;
      }
    },
    
    async testConnection() {
      this.loading = true;
      this.errorMessage = '';
      
      try {
        // Use relative URL to avoid CORS and proxy issues
        const pingResponse = await axios.get('/api', {
          timeout: 5000 // 5 second timeout
        });
        
        console.log('API ping response:', pingResponse.data);
        
        if (pingResponse.status === 200) {
          this.apiStatus = 'connected';
          
          // Try to fetch any config info
          try {
            const configResponse = await axios.get('/api/config', {
              timeout: 5000
            });
            console.log('API config:', configResponse.data);
            
            // Update URL if different from what we're showing
            if (configResponse.data.apiUrl) {
              this.apiUrl = configResponse.data.apiUrl;
            }
          } catch (configError) {
            console.log('Config fetch error (non-critical):', configError);
          }
        } else {
          this.apiStatus = 'failed';
          this.errorMessage = `Unexpected status: ${pingResponse.status}`;
        }
      } catch (error) {
        this.apiStatus = 'failed';
        console.error('API connection test failed:', error);
        
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          this.errorMessage = `Server responded with error: ${error.response.status} ${error.response.statusText}`;
        } else if (error.request) {
          // The request was made but no response was received
          this.errorMessage = 'No response received from server. Check your connection and make sure the server is running.';
        } else {
          // Something happened in setting up the request that triggered an Error
          this.errorMessage = `Request setup error: ${error.message}`;
        }
      } finally {
        this.loading = false;
      }
    },
    
    async testDirectConnection() {
      this.loading = true;
      this.errorMessage = '';
      
      try {
        // Try to connect directly to port 5000
        const directUrl = 'http://localhost:5000/api';
        console.log('Testing direct connection to:', directUrl);
        
        const pingResponse = await axios.get(directUrl, {
          timeout: 5000
        });
        
        console.log('Direct API ping response:', pingResponse.data);
        
        if (pingResponse.status === 200) {
          this.apiStatus = 'connected';
          this.apiUrl = directUrl;
          this.errorMessage = 'Direct connection successful! Try restarting your client app.';
        } else {
          this.apiStatus = 'failed';
          this.errorMessage = `Direct connection - Unexpected status: ${pingResponse.status}`;
        }
      } catch (error) {
        this.apiStatus = 'failed';
        console.error('Direct connection test failed:', error);
        
        if (error.response) {
          this.errorMessage = `Direct connection - Server responded: ${error.response.status}`;
        } else if (error.request) {
          this.errorMessage = 'Direct connection failed - No response received. Ensure server is running on port 5000.';
        } else {
          this.errorMessage = `Direct connection error: ${error.message}`;
        }
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped>
.diagnostic-panel {
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  color: #f0f0f0;
}

h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #3f8c6e;
}

.status-section {
  margin-bottom: 15px;
}

.status-item {
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
}

.status-label {
  font-weight: bold;
  min-width: 100px;
}

.status-value {
  word-break: break-all;
}

.success {
  color: #4caf50;
}

.error {
  color: #f44336;
}

.action-section {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.test-button {
  background-color: #3f8c6e;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  cursor: pointer;
}

.test-button:hover {
  background-color: #2c664e;
}

.test-button.warning {
  background-color: #e74c3c;
}

.test-button.warning:hover {
  background-color: #c0392b;
}

.test-button:disabled {
  background-color: #555;
  cursor: not-allowed;
}

.loader {
  border: 3px solid #f3f3f3;
  border-top: 3px solid #3f8c6e;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  animation: spin 1s linear infinite;
  margin: 10px auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>