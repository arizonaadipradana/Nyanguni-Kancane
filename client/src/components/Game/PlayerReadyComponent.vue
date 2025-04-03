<!-- client/src/components/Game/PlayerReadyComponent.vue -->
<template>
  <div class="player-ready-section">
    <!-- Ready status indicators for all players -->
    <div class="ready-status-container">
      <h3>Player Readiness</h3>
      <div class="ready-status-list">
        <div v-for="player in currentGame.players" :key="player.id" class="player-ready-item">
          <span class="player-name">{{ player.username }}</span>
          <span class="ready-indicator" :class="{ 'ready': player.isReady, 'not-ready': !player.isReady }">
            {{ player.isReady ? 'Ready ✓' : 'Not Ready' }}
          </span>
        </div>
      </div>
      
      <div class="ready-summary">
        <p>{{ readySummary }}</p>
      </div>
    </div>
    
    <!-- Current player's ready button (only show if game hasn't started) -->
    <div v-if="currentGame.status === 'waiting' && !gameStartCountdown" class="current-player-controls">
      <button 
        @click="toggleReady" 
        class="ready-btn" 
        :class="{ 'ready-confirm': isCurrentPlayerReady }"
      >
        {{ isCurrentPlayerReady ? 'I\'m Ready ✓' : 'Mark as Ready' }}
      </button>
    </div>
    
    <!-- Countdown timer (when all players are ready) -->
    <div v-if="gameStartCountdown" class="countdown-container">
      <p class="countdown-text">Game starting in {{ countdownSeconds }} seconds</p>
      <div class="countdown-progress">
        <div class="countdown-bar" :style="{ width: countdownProgress + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<script>
import SocketService from '@/services/SocketService';

export default {
  name: 'PlayerReadyComponent',
  
  props: {
    currentGame: {
      type: Object,
      required: true
    },
    currentUser: {
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
    }
  },
  
  data() {
    return {
      gameStartCountdown: false,
      countdownSeconds: 10,
      countdownTimer: null
    };
  },
  
  computed: {
    /**
     * Check if the current player is marked as ready
     */
    isCurrentPlayerReady() {
      if (!this.currentUser || !this.currentGame || !this.currentGame.players) {
        return false;
      }
      
      const currentPlayer = this.currentGame.players.find(
        p => p.id === this.currentUser.id
      );
      
      return currentPlayer ? currentPlayer.isReady : false;
    },
    
    /**
     * Get a summary of player readiness
     */
    readySummary() {
      if (!this.currentGame || !this.currentGame.players) {
        return 'Waiting for players...';
      }
      
      const readyCount = this.currentGame.players.filter(p => p.isReady).length;
      const totalPlayers = this.currentGame.players.length;
      
      if (readyCount === 0) {
        return 'No players are ready yet';
      } else if (readyCount === totalPlayers && totalPlayers >= 2) {
        return 'All players are ready!';
      } else {
        return `${readyCount} of ${totalPlayers} players ready`;
      }
    },
    
    /**
     * Calculate the countdown progress percentage
     */
    countdownProgress() {
      const maxCountdown = 10; // Maximum countdown in seconds
      return ((maxCountdown - this.countdownSeconds) / maxCountdown) * 100;
    },
    
    /**
     * Check if enough players are ready to start the game
     */
    areEnoughPlayersReady() {
      if (!this.currentGame || !this.currentGame.players) {
        return false;
      }
      
      const readyPlayers = this.currentGame.players.filter(p => p.isReady);
      return readyPlayers.length >= 2;
    }
  },
  
  watch: {
    // Watch for changes in the currentGame prop to update readiness status
    currentGame: {
      handler() {
        this.checkReadyStatus();
      },
      deep: true
    },
    
    // Specifically watch the computed property
    areEnoughPlayersReady: {
      handler(newValue) {
        console.log("Enough players ready changed:", newValue);
        this.$emit('playersReady', newValue);
      }
    }
  },
  
  mounted() {
    // Listen for player ready updates
    SocketService.on('playerReadyUpdate', this.handlePlayerReadyUpdate);
    
    // Listen for all players ready event to start countdown
    SocketService.on('allPlayersReady', this.handleAllPlayersReady);
    
    // Do initial check on mount
    this.$nextTick(() => {
      this.checkReadyStatus();
    });
  },
  
  beforeDestroy() {
    // Clean up event listeners
    SocketService.off('playerReadyUpdate', this.handlePlayerReadyUpdate);
    SocketService.off('allPlayersReady', this.handleAllPlayersReady);
    
    // Clear any active countdown
    this.clearCountdown();
  },
  
  methods: {
    /**
     * Check the status of ready players and emit events
     */
    checkReadyStatus() {
      const readyStatus = this.areEnoughPlayersReady;
      console.log("Checking ready status:", readyStatus);
      this.$emit('playersReady', readyStatus);
      
      // If all players are ready and there are at least 2, handle that
      if (this.currentGame && this.currentGame.players) {
        const allReady = this.currentGame.players.length >= 2 && 
                         this.currentGame.players.every(p => p.isReady);
        
        if (allReady && !this.gameStartCountdown) {
          this.handleAllPlayersReady({
            readyCount: this.currentGame.players.length,
            totalPlayers: this.currentGame.players.length
          });
        }
      }
    },
    
    /**
     * Toggle current player's ready status
     */
    toggleReady() {
      if (!this.currentUser || !this.gameId) {
        console.error('Cannot toggle ready: missing user or game data');
        return;
      }
      
      // Safety check for socket connection
      if (!SocketService.isSocketConnected()) {
        console.warn('Socket not connected, trying to reconnect...');
        SocketService.init().then(() => {
          this.toggleReady(); // Try again after connecting
        });
        return;
      }
      
      // Send ready status update via socket
      SocketService.gameSocket?.emit('playerReady', {
        gameId: this.gameId,
        userId: this.currentUser.id,
        isReady: !this.isCurrentPlayerReady
      });
      
      // Add to log
      this.$emit('addToLog', `You marked yourself as ${!this.isCurrentPlayerReady ? 'ready' : 'not ready'}`);
    },
    
    /**
     * Handle player ready updates from server
     */
    handlePlayerReadyUpdate(data) {
      // Log the event if it's another player
      if (data.userId !== this.currentUser?.id) {
        this.$emit('addToLog', `${data.username} is ${data.isReady ? 'ready' : 'not ready'}`);
      }
      
      // Check if this update affects our readiness status
      this.$nextTick(() => {
        this.checkReadyStatus();
      });
    },
    
    /**
     * Handle all players ready event from server
     */
    handleAllPlayersReady(data) {
      console.log("All players ready event received:", data);
      
      // If creator, enable start button
      if (this.isCreator) {
        this.$emit('playersReady', true);
      }
      
      // Optional: start countdown
      this.startCountdown();
      
      // Log the event
      this.$emit('addToLog', 'All players are ready! Game can start.');
    },
    
    /**
     * Start countdown timer for game start
     */
    startCountdown() {
      // Clear any existing countdown
      this.clearCountdown();
      
      // Initialize countdown
      this.gameStartCountdown = true;
      this.countdownSeconds = 10;
      
      // Start the timer
      this.countdownTimer = setInterval(() => {
        this.countdownSeconds--;
        
        if (this.countdownSeconds <= 0) {
          this.clearCountdown();
          
          // If creator, auto-start the game
          if (this.isCreator) {
            this.$emit('startGame');
          }
        }
      }, 1000);
    },
    
    /**
     * Clear the countdown timer
     */
    clearCountdown() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      this.gameStartCountdown = false;
    }
  }
};
</script>

<style scoped>
.player-ready-section {
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
}

.ready-status-container h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #3f8c6e;
}

.ready-status-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 15px;
}

.player-ready-item {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  width: calc(50% - 5px);
}

.ready-indicator {
  font-weight: bold;
}

.ready-indicator.ready {
  color: #4caf50;
}

.ready-indicator.not-ready {
  color: #f44336;
}

.ready-summary {
  font-weight: bold;
  text-align: center;
  margin: 15px 0;
  font-size: 16px;
}

.current-player-controls {
  display: flex;
  justify-content: center;
  margin-top: 15px;
}

.ready-btn {
  background-color: #555;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.ready-btn.ready-confirm {
  background-color: #4caf50;
}

.ready-btn:hover {
  background-color: #666;
}

.ready-btn.ready-confirm:hover {
  background-color: #3d8b40;
}

.countdown-container {
  margin-top: 20px;
  text-align: center;
}

.countdown-text {
  font-size: 18px;
  color: #f39c12;
  margin-bottom: 10px;
}

.countdown-progress {
  height: 8px;
  background-color: #333;
  border-radius: 4px;
  overflow: hidden;
}

.countdown-bar {
  height: 100%;
  background-color: #f39c12;
  transition: width 1s linear;
}

@media (max-width: 600px) {
  .player-ready-item {
    width: 100%;
  }
}
</style>