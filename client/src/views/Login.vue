<!-- client/src/views/Login.vue -->
<template>
  <div class="container">
    <div class="auth-form">
      <h2>Login</h2>
      
      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
        <button @click="clearErrorMessage" class="close-error">×</button>
      </div>
      
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">Username</label>
          <input 
            type="text" 
            id="username" 
            v-model="username" 
            required 
            class="form-control"
          />
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            required 
            class="form-control"
          />
        </div>
        
        <button type="submit" class="btn" :disabled="isLoading">
          {{ isLoading ? 'Logging in...' : 'Login' }}
        </button>
      </form>
      
      <p class="register-link">
        Don't have an account? 
        <router-link to="/register">Register</router-link>
      </p>
      
      <!-- Show API diagnostics if there's an error -->
      <div v-if="showDiagnostics">
        <hr>
        <ApiDiagnostic ref="diagnostics" />
      </div>
      
      <div class="debug-section">
        <button @click="toggleDiagnostics" class="debug-button">
          {{ showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapActions, mapMutations } from 'vuex';
import ApiDiagnostic from '@/components/ApiDiagnostic.vue';
import axios from 'axios';

export default {
  name: 'Login',
  
  components: {
    ApiDiagnostic
  },
  
  data() {
    return {
      username: '',
      password: '',
      isLoading: false,
      showDiagnostics: false,
      loginAttempts: 0
    };
  },
  
  computed: {
    ...mapGetters(['errorMessage'])
  },
  
  methods: {
    ...mapActions(['login', 'clearErrorMessage']),
    ...mapMutations(['SET_ERROR_MESSAGE']),
    
    toggleDiagnostics() {
      this.showDiagnostics = !this.showDiagnostics;
      if (this.showDiagnostics && this.$refs.diagnostics) {
        this.$refs.diagnostics.testConnection();
      }
    },
    
    async handleLogin() {
  this.isLoading = true;
  this.clearErrorMessage();
  
  try {
    // Log request info for debugging
    console.log('Login request to:', axios.defaults.baseURL);
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Login request timed out')), 10000);
    });
    
    // Race against timeout
    const result = await Promise.race([
      this.login({
        username: this.username,
        password: this.password
      }),
      timeoutPromise
    ]);
    
    if (result.success) {
      console.log('Login successful!', result);
      
      // Ensure token is set in localStorage
      const token = result.token || localStorage.getItem('token');
      if (token) {
        localStorage.setItem('token', token);
        console.log('Token saved to localStorage');
        
        // Set auth header for future requests
        axios.defaults.headers.common['x-auth-token'] = token;
        console.log('Auth header set for axios');
      } else {
        console.warn('No token received from login');
      }
      
      // Navigate to lobby
      this.$router.push('/lobby');
    } else {
      console.error('Login failed:', result);
      
      // Auto-show diagnostics after multiple failed attempts
      this.loginAttempts++;
      if (this.loginAttempts >= 2) {
        this.showDiagnostics = true;
        if (this.$refs.diagnostics) {
          this.$refs.diagnostics.testConnection();
        }
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Provide more helpful error messages for common issues
    if (error.message === 'Login request timed out') {
      this.SET_ERROR_MESSAGE('Login request timed out. Please check your connection and try again.');
    } else if (error.response?.status === 0 || error.message.includes('Network Error')) {
      this.SET_ERROR_MESSAGE('Network error. Please ensure you have internet access and the server is running.');
    } else {
      this.SET_ERROR_MESSAGE(error.message || 'Login failed. Please try again.');
    }
    
    // Auto-show diagnostics for network errors
    this.showDiagnostics = true;
    if (this.$refs.diagnostics) {
      this.$nextTick(() => {
        this.$refs.diagnostics.testConnection();
      });
    }
  } finally {
    this.isLoading = false;
  }
},

/**
 * Create a game directly using axios instead of store action
 */
 async createGameDirectly() {
  this.isCreating = true;
  this.clearErrorMessage();

  try {
    // Make the API call with axios directly
    const token = localStorage.getItem('token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await axios.post('/api/games', {
      creatorId: this.currentUser.id,
      creatorName: this.currentUser.username
    }, {
      headers: {
        'x-auth-token': token,
        'Content-Type': 'application/json'
      }
    });

    console.log('Direct API response:', response.data);

    if (response.data && response.data.gameId) {
      this.$router.push(`/game/${response.data.gameId}`);
    } else {
      throw new Error('Invalid server response');
    }
  } catch (error) {
    console.error('Direct API call error:', error);

    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Status:', error.response.status);
      this.SET_ERROR_MESSAGE(error.response.data.msg || `Error ${error.response.status}`);
    } else if (error.request) {
      this.SET_ERROR_MESSAGE('No response from server. Check your connection.');
    } else {
      this.SET_ERROR_MESSAGE(error.message || 'Error creating game');
    }
  } finally {
    this.isCreating = false;
  }
},

async testApiConnection() {
  this.apiTestResult = 'Testing API connection...';

  try {
    // Test basic API connection
    const baseResponse = await axios.get('/api', { timeout: 5000 });
    this.apiTestResult = `API base endpoint: ${baseResponse.status} OK\n`;

    // Test authentication
    const token = localStorage.getItem('token');
    if (!token) {
      this.apiTestResult += 'No auth token found!\n';
      return;
    }

    try {
      const authResponse = await axios.get('/api/auth/user', {
        headers: { 'x-auth-token': token },
        timeout: 5000
      });

      this.apiTestResult += `Auth test: ${authResponse.status} OK\n`;
      this.apiTestResult += `User data: ${JSON.stringify(authResponse.data, null, 2)}\n`;
    } catch (authError) {
      this.apiTestResult += `Auth test failed: ${authError.message}\n`;
      if (authError.response) {
        this.apiTestResult += `Status: ${authError.response.status}\n`;
        this.apiTestResult += `Response: ${JSON.stringify(authError.response.data, null, 2)}\n`;
      }
    }

    // Test games endpoint
    try {
      const gamesResponse = await axios.get('/api/games', {
        headers: { 'x-auth-token': token },
        timeout: 5000
      });

      this.apiTestResult += `Games list test: ${gamesResponse.status} OK\n`;
      this.apiTestResult += `Games count: ${gamesResponse.data.length}\n`;
    } catch (gamesError) {
      this.apiTestResult += `Games list test failed: ${gamesError.message}\n`;
      if (gamesError.response) {
        this.apiTestResult += `Status: ${gamesError.response.status}\n`;
        this.apiTestResult += `Response: ${JSON.stringify(gamesError.response.data, null, 2)}\n`;
      }
    }
  } catch (error) {
    this.apiTestResult = `API test failed: ${error.message}`;
    console.error('API test error:', error);
  }
},
/**
 * Direct method to join a game
 */
 async directJoinGame(gameId) {
  if (!gameId) {
    this.SET_ERROR_MESSAGE('Game ID is required');
    return;
  }
  
  this.isJoining = true;
  this.statusMessage = 'Joining game...';
  
  try {
    console.log(`Directly joining game ${gameId}`);
    
    // Get auth token
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }
    
    // Join the game via API
    const response = await axios.post(`/api/games/join/${gameId}`, {
      playerId: this.currentUser.id,
      playerName: this.currentUser.username
    }, {
      headers: {
        'x-auth-token': token
      },
      timeout: 5000
    });
    
    console.log('Join game response:', response.data);
    
    // Set game ID in store
    this.$store.commit('SET_CURRENT_GAME_ID', gameId);
    
    // Navigate to game page
    this.statusMessage = 'Joined! Redirecting...';
    
    // Use window.location for direct navigation
    window.location.href = `/game/${gameId}`;
  } catch (error) {
    console.error('Error joining game:', error);
    
    let errorMsg = 'Error joining game. Please try again.';
    
    if (error.response) {
      console.error('Server response:', error.response.data);
      errorMsg = error.response.data.msg || `Server error: ${error.response.status}`;
    } else if (error.request) {
      errorMsg = 'No response from server. Check your network connection.';
    } else {
      errorMsg = error.message || errorMsg;
    }
    
    this.SET_ERROR_MESSAGE(errorMsg);
  } finally {
    this.statusMessage = '';
    this.isJoining = false;
  }
}

  },
  
  beforeUnmount() {
    this.clearErrorMessage();
  }
};
</script>

<style scoped>
.auth-form {
  max-width: 400px;
  margin: 40px auto;
  padding: 30px;
  background-color: #2a2a2a;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

h2 {
  text-align: center;
  margin-top: 0;
  margin-bottom: 20px;
  color: #3f8c6e;
}

.error-message {
  background-color: #e74c3c;
  color: white;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
  position: relative;
}

.close-error {
  position: absolute;
  right: 10px;
  top: 10px;
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
}

button {
  width: 100%;
  margin-top: 10px;
}

.register-link {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
}

.register-link a {
  color: #3f8c6e;
  text-decoration: none;
}

.register-link a:hover {
  text-decoration: underline;
}

.debug-section {
  margin-top: 20px;
  text-align: center;
}

.debug-button {
  background-color: #555;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  width: auto;
}

.debug-button:hover {
  background-color: #444;
}

hr {
  border: none;
  border-top: 1px solid #444;
  margin: 20px 0;
}
</style>