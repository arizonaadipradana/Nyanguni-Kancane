<!-- client/src/components/Game/GameStatus.vue - Update template section -->

<template>
  <div class="game-status">
    <div v-if="currentGame.status === 'waiting'" class="waiting-status">
      <p>Waiting for players to join...</p>
      <p>Game ID: <strong>{{ gameId }}</strong></p>
      <p>Players: {{ currentGame.players.length }}/8</p>
      
      <!-- Prominent game creator section -->
      <div class="creator-info" v-if="isCreator">
        <div class="creator-badge">
          You are the game creator
        </div>
        
        <div class="player-count-info">
          <p v-if="currentGame.players.length >= 2" class="ready-message">
            ✅ You have enough players to start the game!
          </p>
          <p v-else class="waiting-message">
            ⏳ Waiting for more players to join (need at least 2)
          </p>
        </div>
        
        <div v-if="currentGame.players.length >= 2" class="start-game-container">
          <button @click="startGame" class="start-btn" :disabled="isStarting">
            {{ isStarting ? 'Starting...' : 'START GAME' }}
          </button>
        </div>
        
        <div v-else class="start-game-container">
          <button class="start-btn disabled" disabled>
            Need More Players
          </button>
        </div>
      </div>
      
      <!-- Non-creator waiting message -->
      <div v-else class="waiting-message">
        <p>Waiting for game creator to start the game...</p>
      </div>
    </div>

    <div v-else-if="currentGame.status === 'active'" class="active-status">
      <p>Game in progress</p>
      <div class="game-info">
        <div class="info-item">
          <span class="label">Current turn:</span>
          <span class="value">{{ getCurrentPlayerName() }}</span>
        </div>
        <div class="info-item">
          <span class="label">Current bet:</span>
          <span class="value">{{ currentGame.currentBet }} chips</span>
        </div>
        <div class="info-item">
          <span class="label">Betting round:</span>
          <span class="value">{{ formatBettingRound(currentGame.bettingRound) }}</span>
        </div>
      </div>

      <!-- If game is active but not initialized for this user -->
      <div v-if="isCreator && !gameInitialized" class="initialization-message">
        <p>Game is active but not fully initialized.</p>
        <button @click="requestInitialization" class="initialize-btn">
          Initialize Game
        </button>
      </div>
    </div>
    
    <div v-else class="completed-status">
      <p>Game completed</p>
      <button @click="returnToLobby" class="btn">
        Return to Lobby
      </button>
    </div>
    
    <!-- Debug info always visible during development -->
    <div class="debug-section" v-if="isDevelopment">
      <button @click="debugVisible = !debugVisible" class="debug-toggle">
        {{ debugVisible ? 'Hide Debug Info' : 'Show Debug Info' }}
      </button>
      
      <div v-if="debugVisible" class="debug-details">
        <div class="debug-item">
          <span class="debug-label">Creator:</span>
          <span class="debug-value">{{ getCreatorUsername() }}</span>
        </div>
        <div class="debug-item">
          <span class="debug-label">Is Creator:</span>
          <span class="debug-value">{{ isCreator }}</span>
        </div>
        <div class="debug-item">
          <span class="debug-label">Players:</span>
          <span class="debug-value">{{ currentGame.players.length }}</span>
        </div>
        <div class="debug-item">
          <span class="debug-label">Status:</span>
          <span class="debug-value">{{ currentGame.status }}</span>
        </div>
        <button @click="forceStartGame" class="debug-btn">Force Start Game</button>
        <button @click="requestStateUpdate" class="debug-btn">Request Game Update</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'GameStatus',
  
  props: {
    currentGame: {
      type: Object,
      required: true
    },
    gameId: {
      type: String,
      required: true
    },
    isCreator: {
      type: Boolean,
      default: false
    },
    isStarting: {
      type: Boolean,
      default: false
    },
    gameInitialized: {
      type: Boolean,
      default: false
    }
  },
  
  data() {
    return {
      debugVisible: false,
      isDevelopment: process.env.NODE_ENV !== 'production'
    };
  },
  
  methods: {
    getCurrentPlayerName() {
      return this.$emit('getCurrentPlayerName') || 'Waiting...';
    },
    
    getCreatorUsername() {
      return this.currentGame.creator?.username || 'Unknown';
    },
    
    formatBettingRound(round) {
      const formats = {
        'preflop': 'Pre-Flop',
        'flop': 'Flop',
        'turn': 'Turn',
        'river': 'River',
        'showdown': 'Showdown'
      };
      return formats[round] || round;
    },
    
    startGame() {
      console.log("Start game button clicked");
      this.$emit('startGame');
    },
    
    forceStartGame() {
      console.log("Forcing game start from debug panel");
      this.$emit('startGame');
    },
    
    requestInitialization() {
      this.$emit('requestInitialization');
    },
    
    requestStateUpdate() {
      this.$emit('requestStateUpdate');
    },
    
    returnToLobby() {
      this.$router.push('/lobby');
    }
  }
};
</script>

<style scoped>
.game-status {
  grid-area: status;
  background-color: #2a2a2a;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
}

.waiting-status, .active-status, .completed-status {
  margin-bottom: 20px;
}

.game-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background-color: #333;
  border-radius: 6px;
  padding: 12px;
  margin: 10px auto;
  max-width: 300px;
}

.info-item {
  display: flex;
  width: 100%;
  justify-content: space-between;
  margin-bottom: 8px;
}

.label {
  color: #999;
  font-weight: bold;
}

.value {
  color: #fff;
}

.creator-info {
  margin-top: 20px;
  padding: 15px;
  background-color: rgba(63, 140, 110, 0.15);
  border-radius: 8px;
  border: 2px dashed #3f8c6e;
}

.creator-badge {
  background-color: #3f8c6e;
  color: white;
  padding: 6px 10px;
  border-radius: 20px;
  display: inline-block;
  margin-bottom: 15px;
  font-weight: bold;
}

.player-count-info {
  margin-bottom: 15px;
}

.ready-message {
  color: #4caf50;
  font-weight: bold;
  font-size: 16px;
}

.waiting-message {
  margin-top: 20px;
  font-style: italic;
  color: #aaa;
}

.initialization-message {
  margin-top: 20px;
  padding: 10px;
  background-color: #554400;
  border-radius: 8px;
  border: 1px solid #ffc107;
}

.start-game-container {
  margin-top: 20px;
}

.start-btn, .initialize-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  background-color: #4caf50;
  color: white;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s;
  animation: pulse 2s infinite;
}

.initialize-btn {
  background-color: #ff9800;
  animation: none;
}

.initialize-btn:hover {
  background-color: #e68900;
}

.start-btn:hover {
  background-color: #3d8b40;
}

.start-btn.disabled {
  background-color: #555;
  cursor: not-allowed;
  animation: none;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
  }
  
  70% {
    transform: scale(1.05);
    box-shadow: 0 0 0 10px rgba(76, 175, 80, 0);
  }
  
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
  }
}

.debug-section {
  margin-top: 20px;
  border-top: 1px dashed #555;
  padding-top: 15px;
  text-align: left;
}

.debug-toggle {
  background-color: #333;
  color: #aaa;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}

.debug-details {
  margin-top: 10px;
  padding: 10px;
  background-color: #333;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.debug-item {
  margin-bottom: 5px;
}

.debug-label {
  display: inline-block;
  width: 80px;
  color: #aaa;
}

.debug-value {
  color: #fff;
  word-break: break-all;
}

.debug-btn {
  background-color: #ff9800;
  color: black;
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  margin-top: 10px;
  margin-right: 5px;
  cursor: pointer;
  font-size: 12px;
}

.debug-btn:hover {
  background-color: #e68900;
}
</style>