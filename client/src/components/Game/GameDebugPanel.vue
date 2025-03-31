<!-- client/src/components/Game/GameDebugPanel.vue -->
<template>
    <div class="debug-panel" v-if="enabled">
      <div class="debug-header">
        <h3>Game Debug Panel</h3>
        <button @click="$emit('close')" class="close-btn">×</button>
      </div>
      
      <div class="debug-content">
        <div class="debug-section">
          <h4>Game Info</h4>
          <div class="debug-item">
            <span class="label">Game ID:</span>
            <span class="value">{{ gameId }}</span>
          </div>
          <div class="debug-item">
            <span class="label">Status:</span>
            <span class="value">{{ currentGame ? currentGame.status : 'Unknown' }}</span>
          </div>
          <div class="debug-item">
            <span class="label">Players:</span>
            <span class="value">{{ currentGame ? currentGame.players.length : 0 }}</span>
          </div>
        </div>
        
        <div class="debug-section">
          <h4>Current User</h4>
          <div class="debug-item">
            <span class="label">User ID:</span>
            <span class="value">{{ currentUser ? currentUser.id : 'Not logged in' }}</span>
          </div>
          <div class="debug-item">
            <span class="label">Username:</span>
            <span class="value">{{ currentUser ? currentUser.username : 'Not logged in' }}</span>
          </div>
          <div class="debug-item">
            <span class="label">Is Creator:</span>
            <span class="value">{{ isCreator ? 'Yes' : 'No' }}</span>
          </div>
        </div>
        
        <div class="debug-section">
          <h4>Socket Status</h4>
          <div class="debug-item">
            <span class="label">Connected:</span>
            <span class="value" :class="{ 'status-good': isConnected, 'status-bad': !isConnected }">
              {{ isConnected ? 'Yes' : 'No' }}
            </span>
          </div>
        </div>
        
        <div class="debug-actions">
          <button @click="refreshGameState" class="debug-btn">Refresh Game State</button>
          <button @click="forceStartGame" class="debug-btn" :disabled="!isCreator">Force Start Game</button>
          <button @click="reconnectSocket" class="debug-btn">Reconnect Socket</button>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import SocketService from '@/services/SocketService';
  
  export default {
    name: 'GameDebugPanel',
    
    props: {
      enabled: {
        type: Boolean,
        default: false
      },
      gameId: {
        type: String,
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
      isCreator: {
        type: Boolean,
        default: false
      },
      isConnected: {
        type: Boolean,
        default: false
      }
    },
    
    methods: {
      refreshGameState() {
        if (this.gameId && this.currentUser) {
          console.log('Debug: Requesting game state update');
          SocketService.requestGameUpdate(this.gameId, this.currentUser.id);
          this.$emit('log', 'Debug: Requested game state update');
        }
      },
      
      forceStartGame() {
        if (!this.isCreator) {
          console.log('Debug: Only creator can start game');
          return;
        }
        
        console.log('Debug: Forcing game start');
        this.$emit('forceStart');
      },
      
      reconnectSocket() {
        console.log('Debug: Attempting to reconnect socket');
        SocketService.disconnect();
        
        setTimeout(() => {
          SocketService.init()
            .then(() => {
              if (this.currentUser && this.gameId) {
                SocketService.joinGame(
                  this.gameId,
                  this.currentUser.id,
                  this.currentUser.username
                ).then(() => {
                  this.$emit('log', 'Debug: Socket reconnected and rejoined game');
                }).catch(err => {
                  this.$emit('log', `Debug: Error rejoining game: ${err.message}`);
                });
              }
            })
            .catch(err => {
              this.$emit('log', `Debug: Error reconnecting socket: ${err.message}`);
            });
        }, 1000);
      }
    }
  };
  </script>
  
  <style scoped>
  .debug-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 300px;
    background-color: rgba(0, 0, 0, 0.8);
    border: 1px solid #555;
    border-radius: 5px;
    z-index: 1000;
    color: #fff;
    font-family: monospace;
    font-size: 12px;
  }
  
  .debug-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    background-color: #333;
    border-bottom: 1px solid #555;
  }
  
  .debug-header h3 {
    margin: 0;
    font-size: 14px;
    color: #ff9800;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
  }
  
  .debug-content {
    padding: 10px;
    max-height: 500px;
    overflow-y: auto;
  }
  
  .debug-section {
    margin-bottom: 15px;
  }
  
  .debug-section h4 {
    margin: 0 0 5px 0;
    color: #4caf50;
    border-bottom: 1px solid #444;
    padding-bottom: 3px;
  }
  
  .debug-item {
    margin-bottom: 3px;
    display: flex;
  }
  
  .label {
    width: 100px;
    color: #aaa;
  }
  
  .value {
    flex: 1;
    word-break: break-all;
  }
  
  .status-good {
    color: #4caf50;
  }
  
  .status-bad {
    color: #f44336;
  }
  
  .debug-actions {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 10px;
  }
  
  .debug-btn {
    background-color: #333;
    border: 1px solid #555;
    color: #fff;
    padding: 5px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-family: monospace;
    font-size: 12px;
  }
  
  .debug-btn:hover {
    background-color: #444;
  }
  
  .debug-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  </style>