// client/src/components/Game/DebugPlayerVisibility.vue

<template>
  <div class="debug-panel" v-if="visible">
    <h3>Player Visibility Debug</h3>
    
    <div class="debug-info">
      <div class="stat">
        <span class="label">Players in Game:</span>
        <span class="value">{{ playerCount }}</span>
      </div>
      
      <div class="stat">
        <span class="label">Players Visible:</span>
        <span class="value">{{ visiblePlayers.length }}</span>
      </div>
      
      <div class="stat">
        <span class="label">All Players Array:</span>
        <span class="value">{{ hasAllPlayers ? 'Yes' : 'No' }}</span>
      </div>
      
      <div class="stat">
        <span class="label">Current User:</span>
        <span class="value">{{ currentUser ? currentUser.username : 'Not logged in' }}</span>
      </div>
    </div>
    
    <div class="players-list">
      <h4>All Known Players:</h4>
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>ID</th>
            <th>Source</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(player, index) in allKnownPlayers" :key="index">
            <td>{{ player.username }}</td>
            <td class="id">{{ player.id }}</td>
            <td>{{ player.source }}</td>
            <td>{{ player.isActive ? 'Yes' : 'No' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div class="debug-actions">
      <button @click="forceRefresh" class="action-btn">
        Force Refresh Players
      </button>
      <button @click="$emit('close')" class="close-btn">
        Close
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DebugPlayerVisibility',
  
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    currentGame: {
      type: Object,
      default: null
    },
    currentUser: {
      type: Object,
      default: null
    },
    visiblePlayers: {
      type: Array,
      default: () => []
    }
  },
  
  computed: {
    playerCount() {
      return this.currentGame && this.currentGame.players 
        ? this.currentGame.players.length 
        : 0;
    },
    
    hasAllPlayers() {
      return this.currentGame && 
        this.currentGame.allPlayers && 
        Array.isArray(this.currentGame.allPlayers);
    },
    
    allPlayersCount() {
      return this.hasAllPlayers ? this.currentGame.allPlayers.length : 0;
    },
    
    allKnownPlayers() {
      const players = [];
      
      // Add players from regular players array
      if (this.currentGame && this.currentGame.players) {
        this.currentGame.players.forEach(player => {
          players.push({
            id: player.id,
            username: player.username,
            isActive: player.isActive,
            source: 'players'
          });
        });
      }
      
      // Add players from allPlayers array if they're not already included
      if (this.hasAllPlayers) {
        const existingIds = new Set(players.map(p => p.id));
        
        this.currentGame.allPlayers.forEach(player => {
          if (!existingIds.has(player.id)) {
            players.push({
              id: player.id,
              username: player.username,
              isActive: player.isActive !== undefined ? player.isActive : true,
              source: 'allPlayers'
            });
            existingIds.add(player.id);
          }
        });
      }
      
      // Add visible players if they're not already included
      if (this.visiblePlayers && this.visiblePlayers.length) {
        const existingIds = new Set(players.map(p => p.id));
        
        this.visiblePlayers.forEach(player => {
          if (!existingIds.has(player.id)) {
            players.push({
              id: player.id,
              username: player.username,
              isActive: player.isActive !== undefined ? player.isActive : true,
              source: 'visiblePlayers'
            });
            existingIds.add(player.id);
          }
        });
      }
      
      return players;
    }
  },
  
  methods: {
    forceRefresh() {
      this.$emit('refresh');
    }
  }
}
</script>

<style scoped>
.debug-panel {
  position: fixed;
  top: 20px;
  left: 20px;
  width: 80%;
  max-width: 600px;
  background-color: rgba(0, 0, 0, 0.9);
  border: 1px solid #555;
  border-radius: 5px;
  padding: 15px;
  z-index: 10000;
  color: white;
  font-family: monospace;
}

h3 {
  margin-top: 0;
  color: #ff9800;
  border-bottom: 1px solid #555;
  padding-bottom: 5px;
}

h4 {
  color: #4caf50;
  margin: 10px 0;
}

.debug-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 15px;
}

.stat {
  background-color: #333;
  padding: 5px;
  border-radius: 3px;
}

.label {
  color: #aaa;
  font-size: 12px;
}

.value {
  font-weight: bold;
  display: block;
  margin-top: 3px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 12px;
}

th, td {
  padding: 5px;
  text-align: left;
  border-bottom: 1px solid #444;
}

th {
  background-color: #333;
  color: #4caf50;
}

.id {
  font-size: 10px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.debug-actions {
  margin-top: 15px;
  display: flex;
  justify-content: space-between;
}

.action-btn, .close-btn {
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  border: none;
}

.action-btn {
  background-color: #4caf50;
  color: white;
}

.close-btn {
  background-color: #f44336;
  color: white;
}
</style>