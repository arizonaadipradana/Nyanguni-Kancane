<!-- client/src/views/Lobby.vue -->
<template>
  <div class="container">
    <div class="lobby">
      <h2>Game Lobby</h2>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
        <button @click="clearErrorMessage" class="close-error">×</button>
      </div>

      <div v-if="statusMessage" class="status-message">
        {{ statusMessage }}
      </div>

      <div class="user-info card">
        <h3>Welcome, {{ currentUser ? currentUser.username : 'Player' }}</h3>
        <p>Balance: {{ currentUser ? currentUser.balance : 0 }} chips ({{ formatRupiah(currentUser ? currentUser.balance
          * 500 : 0) }})</p>
      </div>

      <div class="lobby-actions">
        <div class="card">
          <h3>Create New Game</h3>
          <p>Start a new poker table and invite other players</p>
          <button @click="handleCreateGame" class="btn" :disabled="isCreating || isJoining">
            {{ isCreating ? 'Creating...' : 'Create Game' }}
          </button>
        </div>

        <div class="card">
          <h3>Create New Game</h3>
          <p>Start a new poker table and invite other players</p>
          <button @click="handleCreateGame" class="btn" :disabled="isCreating || isJoining">
            {{ isCreating ? 'Creating...' : 'Create Game' }}
          </button>

          <!-- Add this fallback button for troubleshooting -->
          <button v-if="showFallbackOptions" @click="createGameDirectly" class="btn btn-secondary fallback-btn">
            Create Game (Fallback)
          </button>
        </div>

        <div v-if="showFallbackOptions" class="debug-section">
          <h4>Troubleshooting</h4>
          <button @click="testApiConnection" class="debug-btn">
            Test API Connection
          </button>
          <div v-if="apiTestResult" class="api-test-result">
            <pre>{{ apiTestResult }}</pre>
          </div>
        </div>

        <div class="card">
          <h3>Join Existing Game</h3>
          <p>Enter a 6-character game ID to join</p>
          <div class="form-group">
            <input type="text" v-model="gameIdInput" placeholder="Enter Game ID" maxlength="6" class="form-control"
              :disabled="isCreating || isJoining" />
          </div>
          <button @click="handleJoinGame" class="btn" :disabled="!isValidGameId || isCreating || isJoining">
            {{ isJoining ? 'Joining...' : 'Join Game' }}
          </button>
        </div>
      </div>

      <div class="lobby-footer">
        <button @click="logout" class="btn btn-secondary" :disabled="isCreating || isJoining">Logout</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapActions, mapMutations } from 'vuex';
import SocketService from '../services/SocketService';
import axios from 'axios';

export default {
  name: 'Lobby',

  data() {
    return {
      gameIdInput: '',
      isCreating: false,
      isJoining: false,
      statusMessage: '',
      connectionAttempts: 0,
      maxConnectionAttempts: 2,
      operationTimeout: null,
      showFallbackOptions: process.env.NODE_ENV === 'development',
      apiTestResult: null
    };
  },

  computed: {
    ...mapGetters(['currentUser', 'errorMessage']),

    isValidGameId() {
      return this.gameIdInput.length === 6 && /^[0-9a-f]{6}$/.test(this.gameIdInput);
    }
  },

  created() {
    // Clear any error messages
    this.clearErrorMessage();
  },

  beforeCreate() {
    // Make AuthService available in the component
    this.$auth = require('@/services/AuthService').default;
  },

  methods: {
    ...mapActions(['createGame', 'joinGame', 'clearErrorMessage', 'logout']),
    ...mapMutations(['SET_ERROR_MESSAGE']),

    formatRupiah(amount) {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
      }).format(amount);
    },

    async initSocketConnection() {
      try {
        await SocketService.init();
        this.statusMessage = '';
        return true;
      } catch (error) {
        console.error('Socket initialization error:', error);
        return false;
      }
    },

    async mounted() {
      // Refresh user data when component mounts
      try {
        this.statusMessage = 'Refreshing user data...';
        const refreshSuccess = await this.$auth.refreshUserData();

        if (!refreshSuccess) {
          console.warn('Could not refresh user data');
        }
      } catch (error) {
        console.error('Error during user data refresh:', error);
      } finally {
        this.statusMessage = '';
      }
    },

    setOperationTimeout(operation, timeoutMs = 15000) {
      // Clear any existing timeout
      if (this.operationTimeout) {
        clearTimeout(this.operationTimeout);
      }

      // Set new timeout
      this.operationTimeout = setTimeout(() => {
        this.isCreating = false;
        this.isJoining = false;
        this.SET_ERROR_MESSAGE(`${operation} operation timed out. Please try again.`);
      }, timeoutMs);
    },

    clearOperationTimeout() {
      if (this.operationTimeout) {
        clearTimeout(this.operationTimeout);
        this.operationTimeout = null;
      }
    },

    async handleCreateGame() {
  this.isCreating = true;
  this.statusMessage = 'Creating new game...';
  this.clearErrorMessage();
  
  try {
    console.log('Creating game with user:', this.currentUser);
    
    // Make a direct axios call instead of using the store action
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }
    
    const response = await axios.post('/api/games', {
      creatorId: this.currentUser.id,
      creatorName: this.currentUser.username
    }, {
      headers: {
        'x-auth-token': token
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log('Game creation response:', response.data);
    
    if (response.data && response.data.gameId) {
      const gameId = response.data.gameId;
      console.log('Game created successfully with ID:', gameId);
      
      this.statusMessage = 'Game created! Redirecting...';
      
      // Force update Vuex state
      this.$store.commit('SET_CURRENT_GAME_ID', gameId);
      
      // Add a small delay before navigation
      setTimeout(() => {
        // Use direct window.location for more reliable navigation
        window.location.href = `/game/${gameId}`;
      }, 500);
    } else {
      throw new Error('Invalid response from server (no game ID)');
    }
  } catch (error) {
    console.error('Error creating game:', error);
    
    let errorMsg = 'Error creating game. Please try again.';
    
    if (error.response) {
      console.error('Server response:', error.response.data);
      errorMsg = error.response.data.msg || `Server error: ${error.response.status}`;
    } else if (error.request) {
      errorMsg = 'No response from server. Check your network connection.';
    } else {
      errorMsg = error.message || errorMsg;
    }
    
    this.SET_ERROR_MESSAGE(errorMsg);
    this.statusMessage = '';
    this.isCreating = false;
  }
},

async handleJoinGame() {
  if (!this.isValidGameId) return;
  
  // Use the direct join function
  await this.directJoinGame(this.gameIdInput);
}
  },

  async diagnoseConnectionIssues() {
    console.group('API Connection Diagnosis');

    try {
      // Check if user data is available
      console.log('1. Checking user data...');
      console.log('Current user:', this.currentUser);

      if (!this.currentUser || !this.currentUser.id) {
        console.error('User data missing or incomplete');
        return false;
      }

      // Check if token is available
      console.log('2. Checking authentication token...');
      const token = localStorage.getItem('token');
      console.log('Token exists:', !!token);

      if (!token) {
        console.error('Authentication token is missing');
        return false;
      }

      // Try a simple API request with a short timeout
      console.log('3. Testing API connection...');
      let apiOk = false;

      try {
        // Create a promise with timeout
        const apiPromise = axios.get('/api', { timeout: 3000 });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('API request timed out')), 3000)
        );

        // Race the promises
        const testResponse = await Promise.race([apiPromise, timeoutPromise]);
        console.log('API test response:', testResponse.data);
        apiOk = true;
      } catch (apiError) {
        console.error('API test failed:', apiError.message);
        console.error('API may be unreachable');
        // Continue to next test rather than returning
      }

      // Skip socket test if API failed - it will likely fail too
      if (!apiOk) {
        console.log('Skipping socket test due to API failure');
        return false;
      }

      // Try socket connection with a short timeout
      console.log('4. Testing socket connection...');
      try {
        const socketPromise = SocketService.init();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Socket connection timed out')), 3000)
        );

        // Race the promises
        await Promise.race([socketPromise, timeoutPromise]);
        console.log('Socket connection successful');
      } catch (socketError) {
        console.error('Socket connection failed:', socketError.message);
        return false;
      }

      console.log('All connection tests passed');
      return true;
    } catch (error) {
      console.error('Diagnosis failed with error:', error.message);
      return false;
    } finally {
      console.groupEnd();
    }
  },

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
 * Join a game directly, bypassing store actions
 * @param {string} gameId - The game ID to join
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
},

  beforeDestroy() {
    this.clearErrorMessage();
    this.clearOperationTimeout();
  }
};
</script>

<style scoped>
.lobby {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

h2 {
  text-align: center;
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

.status-message {
  background-color: #3498db;
  color: white;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
  text-align: center;
}

.user-info {
  text-align: center;
  margin-bottom: 30px;
}

.user-info h3 {
  margin-top: 0;
  margin-bottom: 10px;
}

.lobby-actions {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
}

@media (max-width: 600px) {
  .lobby-actions {
    flex-direction: column;
  }
}

.lobby-actions .card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.lobby-actions h3 {
  margin-top: 0;
  margin-bottom: 10px;
  color: #3f8c6e;
}

.lobby-actions p {
  margin-bottom: 15px;
  flex-grow: 1;
}

.lobby-actions button {
  width: 100%;
}

.lobby-footer {
  display: flex;
  justify-content: center;
}

.fallback-btn {
  margin-top: 10px;
  background-color: #666;
  font-size: 12px;
}

.debug-section {
  margin-top: 20px;
  padding: 15px;
  background-color: #2a2a2a;
  border-radius: 8px;
  text-align: left;
}
</style>