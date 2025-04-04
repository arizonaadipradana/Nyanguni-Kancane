// client/src/components/ConnectionDiagnostic.vue (or .jsx)
// For Vue.js

<template>
  <div class="connection-diagnostic">
    <h2>Connection Diagnostic</h2>
    
    <div v-if="isLoading" class="status">
      Running diagnostics...
    </div>
    
    <div v-else class="results">
      <div class="status-item" :class="{ 'success': connected, 'error': !connected }">
        Server Connection: {{ connected ? 'Connected' : 'Failed' }}
      </div>
      
      <div v-if="errorMessage" class="error-message">
        Error: {{ errorMessage }}
      </div>
      
      <div class="info-panel">
        <h3>Connection Information</h3>
        <div class="info-table">
          <div class="info-row">
            <div class="info-label">Current URL:</div>
            <div class="info-value">{{ window.location.href }}</div>
          </div>
          <div class="info-row">
            <div class="info-label">API URL:</div>
            <div class="info-value">{{ apiUrl }}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Socket URL:</div>
            <div class="info-value">{{ socketUrl }}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Using Ngrok:</div>
            <div class="info-value">{{ isNgrok ? 'Yes' : 'No' }}</div>
          </div>
        </div>
      </div>
      
      <div class="actions">
        <button @click="runDiagnostic">Run Diagnostic Again</button>
        <button @click="refreshConfig">Refresh Configuration</button>
        <button v-if="connected" @click="connectToSocket">Test Socket Connection</button>
      </div>
      
      <div v-if="diagnosticResult" class="diagnostic-result">
        <h3>Diagnostic Result</h3>
        <pre>{{ JSON.stringify(diagnosticResult, null, 2) }}</pre>
      </div>
      
      <div v-if="socketStatus" class="socket-status">
        <h3>Socket Status</h3>
        <p>{{ socketStatus }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { loadConfig, getConfigValue, resetConfig, refreshConfig } from '../services/config';
import io from 'socket.io-client';

export default {
  name: 'ConnectionDiagnostic',
  data() {
    return {
      isLoading: true,
      connected: false,
      errorMessage: null,
      apiUrl: '',
      socketUrl: '',
      isNgrok: false,
      diagnosticResult: null,
      socketStatus: null,
      window: window
    };
  },
  
  async created() {
    await this.runDiagnostic();
  },
  
  methods: {
    async runDiagnostic() {
      this.isLoading = true;
      this.errorMessage = null;
      this.diagnosticResult = null;
      this.socketStatus = null;
      
      try {
        // Load configuration
        await resetConfig();
        const config = await loadConfig(true);
        
        this.apiUrl = config.apiUrl || 'Not configured';
        this.socketUrl = config.socketUrl || 'Not configured';
        this.isNgrok = config.isNgrok || false;
        
        // Test the API connection
        try {
          const testUrl = `${this.apiUrl}/api/config/test-connection`;
          console.log('Testing connection to:', testUrl);
          
          const response = await axios.get(testUrl, {
            timeout: 5000,
            headers: { 
              'Cache-Control': 'no-cache',
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          
          this.connected = true;
          this.diagnosticResult = response.data;
          console.log('Connection test successful:', response.data);
        } catch (apiError) {
          console.error('API connection test failed:', apiError);
          this.connected = false;
          this.errorMessage = `API connection failed: ${apiError.message}`;
          
          // Try fallbacks
          await this.tryFallbacks();
        }
      } catch (error) {
        console.error('Diagnostic error:', error);
        this.connected = false;
        this.errorMessage = `Diagnostic failed: ${error.message}`;
      } finally {
        this.isLoading = false;
      }
    },
    
    async refreshConfig() {
      try {
        this.isLoading = true;
        resetConfig();
        const config = await refreshConfig();
        
        this.apiUrl = config.apiUrl || 'Not configured';
        this.socketUrl = config.socketUrl || 'Not configured';
        this.isNgrok = config.isNgrok || false;
        
        await this.runDiagnostic();
      } catch (error) {
        console.error('Config refresh failed:', error);
        this.errorMessage = `Config refresh failed: ${error.message}`;
        this.isLoading = false;
      }
    },
    
    async tryFallbacks() {
      // Try different ways to connect
      const attemptUrls = [
        window.location.origin,
        'http://localhost:5000'
      ];
      
      // Check if we're on ngrok
      if (window.location.hostname.includes('ngrok-free.app')) {
        // Try stored ngrok URLs
        const storedNgrokUrl = localStorage.getItem('ngrokUrl');
        if (storedNgrokUrl) {
          attemptUrls.unshift(storedNgrokUrl);
        }
      }
      
      for (const url of attemptUrls) {
        try {
          console.log('Trying fallback URL:', url);
          const response = await axios.get(`${url}/api/test`, { 
            timeout: 3000,
            headers: { 'Cache-Control': 'no-cache' }
          });
          
          if (response.status === 200) {
            console.log('Fallback connection successful:', url);
            // Update config with working URL
            localStorage.setItem('ngrokUrl', url);
            this.apiUrl = url;
            this.socketUrl = url;
            this.connected = true;
            this.errorMessage = `Main connection failed, but fallback to ${url} succeeded.`;
            return true;
          }
        } catch (error) {
          console.warn(`Fallback attempt to ${url} failed:`, error);
        }
      }
      
      return false;
    },
    
    async connectToSocket() {
      try {
        this.socketStatus = 'Connecting to socket...';
        
        const socket = io(this.socketUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 3,
          reconnectionDelay: 1000,
          timeout: 5000
        });
        
        socket.on('connect', () => {
          this.socketStatus = `Socket connected successfully. ID: ${socket.id}`;
          console.log('Socket connected:', socket.id);
          
          // Send a test message
          socket.emit('ping', { time: new Date().toISOString() });
        });
        
        socket.on('connect_error', (error) => {
          this.socketStatus = `Socket connection error: ${error.message}`;
          console.error('Socket connection error:', error);
        });
        
        socket.on('pong', (data) => {
          this.socketStatus = `Socket communication successful. Server responded: ${JSON.stringify(data)}`;
        });
        
        socket.on('disconnect', (reason) => {
          this.socketStatus = `Socket disconnected: ${reason}`;
        });
        
        // Disconnect after 10 seconds to clean up
        setTimeout(() => {
          socket.disconnect();
        }, 10000);
      } catch (error) {
        this.socketStatus = `Socket initialization error: ${error.message}`;
        console.error('Socket initialization error:', error);
      }
    }
  }
};
</script>

<style scoped>
.connection-diagnostic {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.status {
  margin: 20px 0;
  padding: 10px;
  background-color: #f0f0f0;
  border-radius: 4px;
}

.status-item {
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 4px;
  font-weight: bold;
}

.success {
  background-color: #d4edda;
  color: #155724;
}

.error {
  background-color: #f8d7da;
  color: #721c24;
}

.error-message {
  margin: 10px 0;
  padding: 10px;
  background-color: #f8d7da;
  color: #721c24;
  border-radius: 4px;
}

.info-panel {
  margin: 20px 0;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.info-table {
  width: 100%;
}

.info-row {
  display: flex;
  border-bottom: 1px solid #ddd;
  padding: 8px 0;
}

.info-label {
  font-weight: bold;
  width: 120px;
  min-width: 120px;
}

.info-value {
  flex: 1;
  word-break: break-all;
}

.actions {
  margin: 20px 0;
}

button {
  background-color: #007bff;
  color: white;
  border: none;
  padding: 8px 15px;
  margin-right: 10px;
  margin-bottom: 10px;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #0069d9;
}

.diagnostic-result, .socket-status {
  margin: 20px 0;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
  overflow: auto;
}

pre {
  margin: 0;
  white-space: pre-wrap;
}
</style>