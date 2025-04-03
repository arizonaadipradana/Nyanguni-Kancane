<!-- client/src/components/Game/WinnerDisplay.vue -->
<template>
  <div class="winner-display" v-if="visible">
    <div class="winner-overlay"></div>
    <div class="winner-content">
      <h2 class="winner-title">
        <span v-if="winners && winners.length === 1">Winner!</span>
        <span v-else-if="winners && winners.length > 1">Split Pot!</span>
        <span v-else>Game Result</span>
      </h2>
      
      <div class="winner-info" v-for="(winner, index) in winners" :key="index">
        <div class="winner-name">{{ winner.username }}</div>
        <div class="winner-hand-name">{{ winner.handName }}</div>
        
        <div class="winner-cards">
          <div v-if="!winner.hand || winner.hand.length === 0" class="no-cards-message">
            No cards to display
          </div>
          <template v-else>
            <div 
              v-for="(card, cardIndex) in winner.hand" 
              :key="cardIndex" 
              class="card-display"
              :class="{ 'highlighted': isCardInWinningHand(card, winner) }"
            >
              {{ formatCard(card) }}
            </div>
          </template>
        </div>

        <!-- Show pot amount for the winner -->
        <div class="winner-pot">
          Won {{ splitPotAmount(winner) }} chips
        </div>
      </div>
      
      <!-- Ready Up Section instead of countdown -->
      <div class="ready-up-section">
        <p class="ready-message">Please ready up for the next hand</p>
        <button @click="toggleReady" class="ready-btn" :class="{ 'ready-confirm': isCurrentPlayerReady }">
          {{ isCurrentPlayerReady ? 'I\'m Ready ✓' : 'Mark as Ready' }}
        </button>
        <p v-if="readySummary" class="ready-info">{{ readySummary }}</p>
        
        <!-- Start Next Hand button for creator -->
        <div v-if="isCreator && areEnoughPlayersReady" class="start-next-hand">
          <button @click="emitStartNextHand" class="start-next-hand-btn">
            Start Next Hand
          </button>
        </div>
      </div>
      
      <!-- Close Button -->
      <button @click="closeWinnerDisplay" class="close-display-btn">Close</button>
    </div>
  </div>
</template>

<script>
import SocketService from '@/services/SocketService';

export default {
  name: 'WinnerDisplay',
  
  props: {
    winners: {
      type: Array,
      default: () => []
    },
    pot: {
      type: Number,
      default: 0
    },
    visible: {
      type: Boolean,
      default: false
    },
    formatCard: {
      type: Function,
      required: true
    },
    currentGame: {
      type: Object,
      default: null
    },
    currentUser: {
      type: Object,
      default: null
    },
    gameId: {
      type: String,
      default: ''
    },
    isCreator: {
      type: Boolean,
      default: false
    }
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
     * Check if enough players are ready to start next hand
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
    // Watch for changes in the current game to update readiness status
    currentGame: {
      handler() {
        // When game updates, check if we should enable start next hand button
        if (this.isCreator && this.areEnoughPlayersReady) {
          console.log('Enough players are ready for next hand');
        }
      },
      deep: true
    }
  },
  
  methods: {
    // Check if a card is part of the winning hand combination
    isCardInWinningHand(card, winner) {
      // In a real implementation, you would need logic to determine
      // which cards actually formed the winning hand
      // For now, we'll highlight all cards as winners
      return true;
    },
    
    // Calculate split pot amount for multiple winners
    splitPotAmount(winner) {
      if (this.winners.length <= 1) return this.pot;
      return Math.floor(this.pot / this.winners.length);
    },
    
    // Close the winner display
    closeWinnerDisplay() {
      this.$emit('close');
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
     * Emit event to start the next hand (for creator only)
     */
    emitStartNextHand() {
      if (!this.isCreator) {
        console.warn('Only the creator can start the next hand');
        return;
      }
      
      if (!this.areEnoughPlayersReady) {
        this.$emit('addToLog', 'Not enough players are ready yet');
        return;
      }
      
      console.log('Emitting startNextHand event');
      this.$emit('startNextHand');
      this.$emit('addToLog', 'Starting next hand...');
      
      // Close the winner display after starting next hand
      this.closeWinnerDisplay();
    }
  }
};
</script>

<style scoped>
.winner-display {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.winner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
}

.winner-content {
  position: relative;
  background-color: #1c4e38;
  border: 2px solid #3f8c6e;
  border-radius: 10px;
  padding: 20px;
  min-width: 300px;
  max-width: 800px;
  text-align: center;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  animation: scale-in 0.3s ease-out;
}

.winner-title {
  color: #f1c40f;
  font-size: 32px;
  margin-top: 0;
  margin-bottom: 20px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.winner-info {
  margin-bottom: 20px;
  padding: 15px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}

.winner-name {
  font-size: 24px;
  font-weight: bold;
  color: white;
  margin-bottom: 5px;
}

.winner-hand-name {
  font-size: 20px;
  color: #3f8c6e;
  margin-bottom: 15px;
}

.winner-cards {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 15px;
}

.card-display {
  width: 60px;
  height: 85px;
  background-color: white;
  color: black;
  border-radius: 5px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  font-weight: bold;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card-display.highlighted {
  box-shadow: 0 0 10px 2px #f1c40f;
  transform: translateY(-5px);
}

.no-cards-message {
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 5px;
  color: #aaa;
  font-style: italic;
}

.winner-pot {
  margin-top: 10px;
  font-size: 18px;
  color: #f1c40f;
}

.ready-up-section {
  margin-top: 30px;
  padding: 15px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.ready-message {
  font-size: 18px;
  color: white;
  margin-bottom: 15px;
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

.ready-info {
  margin-top: 15px;
  font-size: 16px;
  color: #ccc;
}

.start-next-hand {
  margin-top: 20px;
}

.start-next-hand-btn {
  background-color: #f39c12;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s;
  animation: pulse 2s infinite;
}

.start-next-hand-btn:hover {
  background-color: #e67e22;
}

.close-display-btn {
  margin-top: 20px;
  background-color: #333;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.close-display-btn:hover {
  background-color: #444;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(243, 156, 18, 0.7);
  }
  
  70% {
    transform: scale(1.05);
    box-shadow: 0 0 0 10px rgba(243, 156, 18, 0);
  }
  
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(243, 156, 18, 0);
  }
}

@keyframes scale-in {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (max-width: 600px) {
  .winner-content {
    width: 90%;
    padding: 15px;
  }
  
  .winner-title {
    font-size: 24px;
  }
  
  .winner-name {
    font-size: 20px;
  }
  
  .winner-hand-name {
    font-size: 16px;
  }
  
  .card-display {
    width: 40px;
    height: 60px;
    font-size: 16px;
  }
}
</style>