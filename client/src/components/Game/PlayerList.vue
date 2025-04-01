// client/src/components/Game/PlayerList.vue
// Update PlayerList component to correctly handle player data

<template>
  <div class="players-container">
    <!-- Show message when no players -->
    <div v-if="!players || players.length === 0" class="no-players">
      No players have joined yet
    </div>

    <div 
      v-for="player in players" 
      :key="player.id || index" 
      class="player-spot" 
      :class="{
        'current-player': currentUser && player.id === currentUser.id,
        'active-turn': currentTurn && player.id === currentTurn,
        'folded': player.hasFolded
      }"
    >
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
        <div v-for="(card, index) in playerHand" :key="index" class="card-display player-card">
          {{ formatCard(card) }}
        </div>
      </div>
      <div v-else class="player-hand">
        <div v-for="i in (player.hasCards ? 2 : 0)" :key="`back-${i}`" class="card-display card-back">
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

  // Add a computed property to log player data for debugging
  computed: {
    playerDebugInfo() {
      if (!this.players) return 'No players';
      
      // Log the first player for debugging
      const firstPlayer = this.players[0];
      return firstPlayer ? `First player: ${JSON.stringify(firstPlayer)}` : 'No first player';
    }
  },

  // Add a mounted hook to log player data when component mounts
  mounted() {
    console.log('PlayerList mounted with players:', this.players);
    console.log('CurrentUser in PlayerList:', this.currentUser);
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