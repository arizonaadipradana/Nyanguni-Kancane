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
        <p>Balance: {{ currentUser ? currentUser.balance : 0 }} chips ({{ formatRupiah(currentUser ? currentUser.balance * 500 : 0) }})</p>
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
          <h3>Join Existing Game</h3>
          <p>Enter a 6-character game ID to join</p>
          <div class="form-group">
            <input 
              type="text" 
              v-model="gameIdInput" 
              placeholder="Enter Game ID" 
              maxlength="6"
              class="form-control"
              :disabled="isCreating || isJoining"
            />
          </div>
          <button 
            @click="handleJoinGame" 
            class="btn" 
            :disabled="!isValidGameId || isCreating || isJoining"
          >
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
      operationTimeout: null
    };
  },
  
  computed: {
    ...mapGetters(['currentUser', 'errorMessage']),
    
    isValidGameId() {
      return this.gameIdInput.length === 6 && /^[0-9a-f]{6}$/.test(this.gameIdInput);
    }
  },
  
  created() {
    // Initialize socket connection with better error handling
    this.statusMessage = 'Connecting to server...';
    
    this.initSocketConnection().catch(error => {
      console.error('Failed to initialize socket connection:', error);
      this.statusMessage = '';
      this.SET_ERROR_MESSAGE('Could not connect to game server. Please check your connection and try again.');
    });
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
      this.isCreating = true;
      this.statusMessage = 'Creating new game...';
      this.clearErrorMessage();
      
      // Set operation timeout as a fallback
      this.setOperationTimeout('Create game');
      
      try {
        // Initialize or confirm socket connection first
        const socketReady = await this.initSocketConnection();
        if (!socketReady) {
          throw new Error('Could not connect to game server');
        }
        
        const result = await this.createGame();
        
        if (result.success) {
          this.statusMessage = 'Game created! Connecting...';
          
          // Connect to socket for this game
          try {
            await SocketService.joinGame(
              result.gameId,
              this.currentUser.id,
              this.currentUser.username
            );
            
            this.clearOperationTimeout();
            this.$router.push(`/game/${result.gameId}`);
          } catch (socketError) {
            console.error('Socket connection error:', socketError);
            throw new Error('Could not connect to the game room. Please try again.');
          }
        } else {
          throw new Error(result.error || 'Failed to create game');
        }
      } catch (error) {
        console.error('Error creating game:', error);
        this.SET_ERROR_MESSAGE(error.message || 'Error creating game. Please try again.');
      } finally {
        this.isCreating = false;
        this.statusMessage = '';
        this.clearOperationTimeout();
      }
    },
    
    async handleJoinGame() {
      if (!this.isValidGameId) return;
      
      this.isJoining = true;
      this.statusMessage = 'Joining game...';
      this.clearErrorMessage();
      
      // Set operation timeout as a fallback
      this.setOperationTimeout('Join game');
      
      try {
        // First initialize socket connection
        const socketReady = await this.initSocketConnection();
        if (!socketReady) {
          throw new Error('Could not connect to game server');
        }
        
        // Then make the HTTP request to join the game
        const result = await this.joinGame(this.gameIdInput);
        
        if (result.success) {
          this.statusMessage = 'Game joined! Connecting to room...';
          
          // Finally join the socket room with a retry mechanism
          const maxRetries = 2;
          let retryCount = 0;
          let joined = false;
          
          while (retryCount < maxRetries && !joined) {
            try {
              await SocketService.joinGame(
                this.gameIdInput,
                this.currentUser.id,
                this.currentUser.username
              );
              joined = true;
            } catch (socketError) {
              console.error(`Join attempt ${retryCount + 1} failed:`, socketError);
              retryCount++;
              
              if (retryCount >= maxRetries) {
                throw socketError;
              }
              
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          this.clearOperationTimeout();
          this.$router.push(`/game/${this.gameIdInput}`);
        } else {
          throw new Error(result.error || 'Failed to join game');
        }
      } catch (error) {
        console.error('Error joining game:', error);
        this.SET_ERROR_MESSAGE(error.message || 'Error joining game. Please try again.');
      } finally {
        this.isJoining = false;
        this.statusMessage = '';
        this.clearOperationTimeout();
      }
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
</style>