<!-- client/src/components/Game/PlayerList.vue -->
<template>
  <div class="players-container">
    <!-- Show message when no players -->
    <div v-if="!players || players.length === 0" class="no-players">
      No players have joined yet
    </div>

    <div v-for="player in players" :key="`player-${player.id}-${updateKey}`" class="player-spot" :class="{
      'current-player': currentUser && player.id === currentUser.id,
      'active-turn': currentTurn && player.id === currentTurn,
      'folded': player.hasFolded
    }">
      <div class="player-info">
        <div class="player-name">{{ player.username || 'Unknown Player' }}</div>
        <div class="player-chips">
          Chips: {{ player.totalChips || 0 }}
          <span v-if="player.chips > 0">({{ player.chips }} in pot)</span>
        </div>
        <div v-if="player.hasFolded" class="player-status">Folded</div>
        <div v-else-if="player.hasActed" class="player-status">Acted</div>
      </div>

      <div v-if="currentUser && player.id === currentUser.id" class="player-hand">
        <div v-for="(card, index) in displayPlayerHand" :key="`card-${index}-${card.rank}-${card.suit}`"
          class="card-display player-card" :data-suit="card.suit">
          {{ formatCard(card) }}
        </div>
      </div>
      <div v-else class="player-hand">
        <div v-for="i in (player.hasCards ? 2 : 0)" :key="`back-${i}-${updateKey}`" class="card-display card-back">
          ●●
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PlayerList',

  props: {
    players: {
      type: Array,
      default: () => []
    },
    currentUser: {
      type: Object,
      default: null
    },
    currentTurn: {
      type: String,
      default: null
    },
    playerHand: {
      type: Array,
      default: () => []
    },
    formatCard: {
      type: Function,
      required: true
    }
  },

  data() {
    return {
      updateKey: 0, // Add an update key to force re-rendering
      lastHandUpdate: Date.now(),
      currentHandTimestamp: 0,
      lastKnownHandState: [],
    };
  },

  computed: {
    playerDebugInfo() {
      if (!this.players) return 'No players';

      // Log the first player for debugging
      const firstPlayer = this.players[0];
      return firstPlayer ? `First player: ${JSON.stringify(firstPlayer)}` : 'No first player';
    },

    // Add a computed property to handle player hand display
    displayPlayerHand() {
      // Make sure playerHand is an array
      if (!this.playerHand || !Array.isArray(this.playerHand)) {
        console.warn('Invalid playerHand in PlayerList component:', this.playerHand);
        return [];
      }

      // Add reactivity by creating new card objects with keys that will
      // trigger Vue's reactivity system
      return this.playerHand.map(card => ({
        ...card,
        _key: `${card.rank}-${card.suit}-${this.lastHandUpdate}-${this.updateKey}`
      }));
    },
    //A computed property to handle player hand display
    displayPlayerHand() {
      // Make sure playerHand is an array
      if (!this.playerHand || !Array.isArray(this.playerHand)) {
        console.warn('Invalid playerHand in PlayerList component:', this.playerHand);

        // If we don't have a current hand but have a last known state and game is in waiting state,
        // don't show any cards
        if (this.getCurrentGameStatus() === 'waiting' && this.lastKnownHandState.length > 0) {
          return [];
        }

        // Otherwise return empty array
        return [];
      }

      // If we have a new hand, update our last known state
      if (this.playerHand.length > 0) {
        this.lastKnownHandState = [...this.playerHand];
      }

      // If the game is waiting and the playerHand is empty, return empty to hide cards
      if (this.getCurrentGameStatus() === 'waiting' && this.playerHand.length === 0) {
        return [];
      }

      // Add reactivity by creating new card objects with keys that will
      // trigger Vue's reactivity system
      return this.playerHand.map(card => ({
        ...card,
        _key: `${card.rank}-${card.suit}-${this.lastHandUpdate}-${this.updateKey}`
      }));
    }
  },

  watch: {
    // Watch playerHand for changes and force updates
    playerHand: {
      handler(newHand, oldHand) {
        // Only force update if hand has changed meaningfully
        if (newHand && newHand.length > 0) {
          const newHandString = JSON.stringify(newHand);
          const oldHandString = oldHand ? JSON.stringify(oldHand) : '';

          if (newHandString !== oldHandString) {
            console.log('PlayerList detected hand change:',
              newHand.map(c => `${c.rank} of ${c.suit}`).join(', '));
            this.updateKey++; // Increment to force re-render
            this.lastHandUpdate = Date.now();
          }
        }
      },
      deep: true
    },
    // Watch for changes in game status
    '$parent.currentGame.status': {
      handler(newStatus) {
        console.log('Game status changed:', newStatus);
        if (newStatus === 'waiting') {
          // Delay slightly to ensure other components have finished processing
          setTimeout(() => {
            this.clearPlayerCards();
          }, 100);
        }
      }
    }
  },

  mounted() {
    console.log('PlayerList mounted with players:', this.players);
    console.log('CurrentUser in PlayerList:', this.currentUser);
    console.log('Initial playerHand:', this.playerHand);

    // Set up periodic checks for updates
    this.updateInterval = setInterval(() => {
      this.updateKey++; // Force re-render periodically
    }, 5000);
  },

  beforeDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  },

  methods: {
    // Get current game status safely
    getCurrentGameStatus() {
      const parent = this.$parent;
      if (parent && parent.currentGame) {
        return parent.currentGame.status;
      }
      return null;
    },
    // Add a method to force update
    // Force update method enhanced
    forceUpdate() {
      this.updateKey++;
      this.lastHandUpdate = Date.now();
      console.log('PlayerList forced update');

      // Check if we should clear cards based on game state
      if (this.getCurrentGameStatus() === 'waiting') {
        // Clear visual cards when in waiting state
        console.log('Game in waiting state, clearing card display');
      }
    },
    updateForNewHand(timestamp) {
      if (!timestamp || timestamp <= this.currentHandTimestamp) {
        return; // Ignore older updates
      }

      console.log('PlayerList updating for new hand with timestamp:', timestamp);
      this.currentHandTimestamp = timestamp;
      this.updateKey += 10; // Use a larger increment to distinguish from regular updates
      this.lastHandUpdate = Date.now();

      // Force component update
      this.$forceUpdate();
    },
    clearPlayerCards() {
      this.updateKey += 20; // Large increment to ensure update
      this.lastHandUpdate = Date.now();
      console.log('PlayerList cleared visual card display');
    }
  }
};
</script>

<style scoped>
.players-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
}

.no-players {
  width: 100%;
  text-align: center;
  padding: 20px;
  font-style: italic;
  color: #999;
}

.player-spot {
  width: 180px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 10px;
  margin: 10px;
  position: relative;
}

.player-spot.current-player {
  background-color: rgba(63, 140, 110, 0.3);
  box-shadow: 0 0 10px rgba(63, 140, 110, 0.5);
}

.player-spot.active-turn {
  border: 2px solid #ffcc00;
}

.player-spot.folded {
  opacity: 0.5;
}

.player-info {
  margin-bottom: 10px;
}

.player-name {
  font-weight: bold;
  font-size: 16px;
}

.player-chips {
  font-size: 14px;
  color: #ccc;
}

.player-status {
  font-size: 12px;
  color: #ff9999;
  font-style: italic;
}

.player-hand {
  display: flex;
  justify-content: center;
  gap: 5px;
}

.player-card {
  background: white;
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
}

.card-display.card-back {
  background-color: #2a2a2a;
  color: #3f8c6e;
}

.card-display[data-suit="hearts"],
.card-display[data-suit="diamonds"] {
  color: red;
}

@media (max-width: 768px) {
  .player-spot {
    width: 140px;
    margin: 5px;
  }

  .card-display {
    width: 40px;
    height: 60px;
    font-size: 16px;
  }
}
</style>