// client/src/components/Game/PlayerList.vue

<template>
  <div class="players-container">
    <!-- Show message when no players -->
    <div v-if="!players || players.length === 0" class="no-players">
      No players have joined yet
    </div>

    <!-- Add debug info in dev mode -->
    <div v-if="isDevelopment" class="player-count-debug">
      Players: {{ players.length }}
    </div>

    <div v-for="(player, index) in players" :key="`player-${player.id || index}-${updateKey}`" class="player-spot"
      :class="{
        'current-player': currentUser && player.id === currentUser.id,
        'active-turn': currentTurn && player.id === currentTurn,
        'folded': player.hasFolded
      }">
      <div class="player-info">
        <div class="player-name" @click="logPlayerDetails(player)">
          {{ player.username || 'Unknown Player' }}
          <span v-if="player.id === hostId" class="host-badge">Host</span>
        </div>
        <div class="player-chips">
          Chips: {{ player.totalChips || 0 }}
          <span v-if="player.chips > 0">({{ player.chips }} in pot)</span>
        </div>
        <div v-if="player.hasFolded" class="player-status">Folded</div>
        <div v-else-if="player.hasActed" class="player-status">Acted</div>
      </div>

      <div v-if="currentUser && player.id === currentUser.id" class="player-hand">
        <div v-for="(card, cardIndex) in displayPlayerHand" :key="`card-${cardIndex}-${card.rank}-${card.suit}`"
          class="card-display player-card">
          {{ formatCard(card) }}
        </div>
      </div>
      <div v-else class="player-hand">
        <div v-for="i in (player.hasCards ? 2 : 0)" :key="`back-${i}-${updateKey}-${index}`"
          class="card-display card-back">
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
      isDevelopment: process.env.NODE_ENV !== 'production'
    };
  },

  computed: {
    // Find the host ID (first player or player with position 0)
    hostId() {
      if (!this.players || this.players.length === 0) return null;
      
      // Try to find player with position 0
      const hostPlayer = this.players.find(p => p.position === 0);
      if (hostPlayer) return hostPlayer.id;
      
      // Fallback to first player in the array
      return this.players[0].id;
    },

    // Debug info about players
    playerDebugInfo() {
      if (!this.players) return 'No players';

      // Log the first player for debugging
      const firstPlayer = this.players[0];
      return firstPlayer ? `First player: ${JSON.stringify(firstPlayer)}` : 'No first player';
    },

    // Add a computed property to handle player hand display
    displayPlayerHand() {
      // This adds reactivity by creating new card objects
      return this.playerHand.map(card => ({
        ...card,
        _key: `${card.rank}-${card.suit}-${this.lastHandUpdate}`
      }));
    }
  },

  watch: {
    // Watch playerHand for changes and force updates
    playerHand: {
      handler(newHand) {
        if (newHand && newHand.length > 0) {
          console.log('PlayerList detected hand change:',
            newHand.map(c => `${c.rank} of ${c.suit}`).join(', '));
          this.updateKey++; // Increment to force re-render
          this.lastHandUpdate = Date.now();
        }
      },
      deep: true
    },
    
    // Watch players array for changes
    players: {
      handler(newPlayers, oldPlayers) {
        if (!oldPlayers || !newPlayers) return;
        
        // Check if player count changed
        if (newPlayers.length !== oldPlayers.length) {
          console.log(`PlayerList: Player count changed from ${oldPlayers.length} to ${newPlayers.length}`);
          this.updateKey++; // Force re-render
        }
      },
      deep: true
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
    // Add a method to force update
    forceUpdate() {
      this.updateKey++;
      this.lastHandUpdate = Date.now();
      console.log('PlayerList forced update');
    },
    
    // Log player details to console for debugging
    logPlayerDetails(player) {
      if (this.isDevelopment) {
        console.log('Player details:', JSON.stringify(player, null, 2));
      }
    }
  }
};
</script>

<style scoped>
.players-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
  position: relative;
}

.player-count-debug {
  position: absolute;
  top: -20px;
  right: 10px;
  background-color: #333;
  color: #ff9800;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.host-badge {
  font-size: 10px;
  background-color: #ff9800;
  color: black;
  padding: 1px 5px;
  border-radius: 10px;
  font-weight: normal;
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