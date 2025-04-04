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

      <!-- Community Cards Section -->
      <div class="community-cards-section">
        <h3>Community Cards</h3>
        <div v-if="isFoldWin && !displayCommunityCards.length" class="fold-win-message">
          Hand ended early - other player(s) folded or left
        </div>
        <div v-else-if="!displayCommunityCards.length" class="fold-win-message">
          No community cards
        </div>
        <div class="community-cards" v-else>
          <div v-for="(card, index) in displayCommunityCards" :key="'community-' + index"
            class="card-display community-card" :data-suit="card.suit">
            {{ formatCard(card) }}
          </div>
        </div>
      </div>

      <!-- All Players Cards Section -->
      <div class="all-players-section">
        <h3>Players' Hands</h3>
        <div class="players-grid">
          <div v-for="player in processedPlayers" :key="player.playerId" class="player-result"
            :class="{ 'winner-result': player.isWinner, 'folded-player': player.handType === 'Folded' }">
            <div class="player-name-heading">
              {{ player.username }}
              <span v-if="player.isWinner" class="winner-badge">Winner</span>
              <span v-if="player.handType === 'Folded'" class="folded-badge">Folded</span>
            </div>
            <div class="player-hand-name">{{ player.handDescription }}</div>
            <div v-if="player.handType === 'Folded'" class="folded-message">
              Player folded their hand
            </div>
            <div v-else class="player-cards">
              <div v-for="(card, cardIndex) in player.hand" :key="'player-' + player.playerId + '-card-' + cardIndex"
                class="card-display" :class="{ 'winning-card': player.isWinner }" :data-suit="card.suit">
                {{ formatCard(card) }}
              </div>
              <div v-if="player.hand.length === 0" class="no-cards">
                Cards not shown
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Winners Section -->
      <div class="winner-info" v-if="winners && winners.length > 0">
        <div class="winner-pot">
          <span v-if="winners.length === 1 && isFoldWin && pot > 0">
            {{ winners[0].username }} wins {{ pot }} chips (last player standing)
          </span>
          <span v-else-if="winners.length === 1 && pot > 0">
            {{ winners[0].username }} won {{ pot }} chips
          </span>
          <span v-else-if="winners.length > 1 && pot > 0">
            Split pot: {{winners.map(w => w.username).join(', ')}} each won {{ splitPotAmount(winners[0]) }} chips
          </span>
          <span v-else-if="!pot || pot <= 0" class="error-message">
            Error: No pot amount available.
            Please refresh the game page.
          </span>
        </div>
      </div>

      <!-- Ready Up Section -->
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

        <p v-if="currentGame && currentGame.status === 'active'" class="warning-message">
          Warning: Game state is inconsistent. Please refresh the page if issues persist.
        </p>
      </div>

      <!-- Close Button -->
      <button @click="closeWinnerDisplay" class="close-display-btn">Close</button>
    </div>
  </div>
</template>

<script>
import SocketService from '@/services/SocketService';
import PokerHandEvaluator from '@/utils/PokerHandEvaluator';

export default {
  name: 'WinnerDisplay',

  props: {
    winners: {
      type: Array,
      default: () => []
    },
    allPlayers: {
      type: Array,
      default: () => []
    },
    communityCards: {
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
    },
    isFoldWin: {
      type: Boolean,
      default: false
    },
    previousPlayerHand: {
      type: Array,
      default: () => []
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
    },

    /**
     * Safe access to community cards with validation
     */
    displayCommunityCards() {
      return Array.isArray(this.communityCards) ? this.communityCards : [];
    },

    formattedPlayerResults() {
      return this.allPlayers.map(player => {
        // Create a proper copy to avoid mutating props
        const formattedPlayer = { ...player };

        // Determine actual hand type by analyzing the cards
        formattedPlayer.handName = this.determineHandType(player.hand, this.communityCards);

        return formattedPlayer;
      });
    },
    processedPlayers() {
      return (this.allPlayers || []).map(player => {
        // Create a new object to avoid mutating props
        const processedPlayer = { ...player };

        // For the current user, use the previousPlayerHand if it's available and the player hand is empty
        if (this.currentUser && player.playerId === this.currentUser.id &&
          (!player.hand || player.hand.length === 0) &&
          this.previousPlayerHand && this.previousPlayerHand.length > 0) {
          processedPlayer.hand = this.previousPlayerHand;
        }

        // Evaluate the player's hand using our evaluator
        const handEvaluation = PokerHandEvaluator.evaluateHand(
          processedPlayer.hand || [],
          this.communityCards || []
        );

        // Add correct hand type and description
        processedPlayer.handType = handEvaluation.type;
        processedPlayer.handDescription = handEvaluation.description;

        return processedPlayer;
      });
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
    // Calculate split pot amount for multiple winners
    splitPotAmount(winner) {
      if (!this.pot || this.pot <= 0) {
        console.error('Invalid pot amount:', this.pot);
        return 0; // Return 0 to prevent NaN
      }

      if (!this.winners || this.winners.length <= 0) {
        console.error('No winners provided for pot calculation');
        return 0;
      }

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
    },

    /**
     * Determine actual hand type by analyzing the player's hand combined with community cards
     * @param {Array} playerHand - The player's hole cards
     * @param {Array} communityCards - The community cards
     * @returns {String} The hand type name
     */
    determineHandType(playerHand, communityCards) {
      if (!playerHand || !Array.isArray(playerHand) || playerHand.length === 0) {
        return 'Unknown Hand';
      }

      if (playerHand.length === 0) {
        return 'Folded';
      }

      // Simple hand detector for the most common hand types
      // In a real implementation, this should be replaced with a proper poker hand evaluator

      // Get all ranks from combined cards (player hand + community cards)
      const allCards = [...playerHand, ...communityCards];
      const ranks = allCards.map(card => card.rank);

      // Count occurrences of each rank
      const rankCounts = {};
      ranks.forEach(rank => {
        rankCounts[rank] = (rankCounts[rank] || 0) + 1;
      });

      // Check for pairs, three of a kind, etc.
      const pairCount = Object.values(rankCounts).filter(count => count === 2).length;
      const hasThreeOfKind = Object.values(rankCounts).some(count => count === 3);
      const hasFourOfKind = Object.values(rankCounts).some(count => count === 4);

      // Determine hand type based on counts
      if (hasFourOfKind) return 'Four of a Kind';
      if (hasThreeOfKind && pairCount > 0) return 'Full House';
      if (hasThreeOfKind) return 'Three of a Kind';
      if (pairCount >= 2) return 'Two Pair';
      if (pairCount === 1) return 'One Pair';

      // Determine highest card
      const rankValues = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
        'J': 11, 'Q': 12, 'K': 13, 'A': 14
      };

      const highestRank = ranks.reduce((highest, rank) => {
        return rankValues[rank] > rankValues[highest] ? rank : highest;
      }, ranks[0]);

      return `High Card ${highestRank}`;
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
  min-width: 320px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
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

/* Community Cards Section */
.community-cards-section {
  margin-bottom: 20px;
}

.community-cards-section h3 {
  color: #3f8c6e;
  margin-bottom: 10px;
}

.community-cards {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 15px;
}

/* All Players Section */
.all-players-section {
  margin-bottom: 20px;
}

.all-players-section h3 {
  color: #3f8c6e;
  margin-bottom: 10px;
}

.players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.player-result {
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.player-result.winner-result {
  background-color: rgba(241, 196, 15, 0.2);
  border: 1px solid #f1c40f;
}

.player-name-heading {
  font-size: 18px;
  font-weight: bold;
  color: white;
  margin-bottom: 5px;
  position: relative;
}

.winner-badge {
  font-size: 12px;
  background-color: #f1c40f;
  color: #000;
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: 8px;
  display: inline-block;
}

.player-hand-name {
  font-size: 16px;
  color: #3f8c6e;
  margin-bottom: 10px;
}

.player-cards {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
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

.card-display.winning-card {
  box-shadow: 0 0 10px 2px #f1c40f;
}

.card-display.community-card {
  background-color: #e8f4f0;
}

.winner-pot {
  margin-top: 10px;
  font-size: 18px;
  color: #f1c40f;
  font-weight: bold;
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

.fold-win-message {
  color: #aaa;
  font-style: italic;
  margin: 10px 0;
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 5px;
}

.folded-player {
  opacity: 0.7;
  background-color: rgba(0, 0, 0, 0.2);
}

.folded-badge {
  font-size: 12px;
  background-color: #999;
  color: #000;
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: 8px;
  display: inline-block;
}

.folded-message {
  color: #999;
  font-style: italic;
  margin: 10px 0;
  font-size: 14px;
}

.no-cards {
  color: #999;
  font-style: italic;
  height: 85px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 5px;
  padding: 0 15px;
}

.card-display[data-suit="hearts"],
.card-display[data-suit="diamonds"],
.community-card[data-suit="hearts"],
.community-card[data-suit="diamonds"] {
  color: red;
}

.error-message {
  color: #ff6b6b;
  font-weight: bold;
  background-color: rgba(255, 0, 0, 0.1);
  padding: 5px 10px;
  border-radius: 4px;
  margin-top: 10px;
}

.fold-win-message {
  color: #aaa;
  font-style: italic;
  margin: 10px 0;
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 5px;
}

.warning-message {
  color: #ff6b6b;
  font-weight: bold;
  background-color: rgba(255, 0, 0, 0.1);
  padding: 5px 10px;
  border-radius: 4px;
  margin-top: 10px;
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

@media (max-width: 768px) {
  .winner-content {
    width: 95%;
    padding: 15px;
  }

  .winner-title {
    font-size: 24px;
  }

  .players-grid {
    grid-template-columns: 1fr;
  }

  .card-display {
    width: 45px;
    height: 65px;
    font-size: 18px;
  }
}
</style>