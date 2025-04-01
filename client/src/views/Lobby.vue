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

  async mounted() {
    // Check if we have a token but no user data
    if (!this.currentUser && localStorage.getItem('token')) {
      console.log('No user data in Lobby, attempting to fetch from server');
      this.statusMessage = 'Loading user data...';
      
      try {
        // Dispatch the action to fetch user data
        await this.$store.dispatch('fetchUserData');
        console.log('User data loaded in Lobby:', this.currentUser);
      } catch (error) {
        console.error('Error fetching user data in Lobby:', error);
        this.SET_ERROR_MESSAGE('Failed to load user data. Please log in again.');
      } finally {
        this.statusMessage = '';
      }
    } else {
      console.log('Current user in Lobby:', this.currentUser);
    }
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
      // Safety check - ensure we have user data
      if (!this.currentUser) {
        console.error('Cannot create game: No user data available');
        this.SET_ERROR_MESSAGE('Your session appears to be invalid. Please log out and log in again.');
        return;
      }

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
      
      // Safety check - ensure we have user data
      if (!this.currentUser) {
        console.error('Cannot join game: No user data available');
        this.SET_ERROR_MESSAGE('Your session appears to be invalid. Please log out and log in again.');
        return;
      }
      
      // Use the direct join function
      await this.directJoinGame(this.gameIdInput);
    },
    
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

    async createGameDirectly() {
      // Safety check - ensure we have user data
      if (!this.currentUser) {
        console.error('Cannot create game directly: No user data available');
        this.SET_ERROR_MESSAGE('Your session appears to be invalid. Please log out and log in again.');
        return;
      }

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

    beforeDestroy() {
      this.clearErrorMessage();
      this.clearOperationTimeout();
    }
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