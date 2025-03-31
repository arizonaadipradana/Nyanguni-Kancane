<!-- client/src/views/Game.vue -->
<template>
  <div class="game-container">
    <div class="game-header">
      <h2>Nyanguni Kancane - Game #{{ gameId }}</h2>
      <div class="game-info">
        <span>Pot: {{ currentGame ? currentGame.pot : 0 }} chips</span>
        <button @click="copyGameId" class="btn-secondary btn-sm">
          Share Game ID
        </button>
        <button @click="leaveGame" class="btn-danger btn-sm">
          Leave Game
        </button>
      </div>
    </div>
    
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>
    
    <div v-if="!currentGame" class="loading">
      Loading game...
    </div>
    
    <div v-else class="game-area">
      <!-- Game status -->
      <div class="game-status">
        <div v-if="currentGame.status === 'waiting'">
          <p>Waiting for players to join...</p>
          <p>Game ID: <strong>{{ gameId }}</strong></p>
          <p>Players: {{ currentGame.players.length }}/8</p>
          
          <button 
            v-if="isCreator" 
            @click="handleStartGame" 
            class="btn" 
            :disabled="currentGame.players.length < 2 || isStarting"
          >
            {{ isStarting ? 'Starting...' : 'Start Game' }}
          </button>
        </div>
        
        <div v-else>
          <p>Game in progress</p>
          <p>Current turn: {{ getCurrentPlayerName() }}</p>
          <p>Current bet: {{ currentGame.currentBet }} chips</p>
        </div>
      </div>
      
      <!-- Game table -->
      <div class="game-table">
        <!-- Community cards -->
        <div class="community-cards">
          <h3>Community Cards</h3>
          <div class="cards-container">
            <div 
              v-for="(card, index) in currentGame.communityCards" 
              :key="index" 
              class="card-display"
            >
              {{ formatCard(card) }}
            </div>
            <div 
              v-for="i in (5 - currentGame.communityCards.length)" 
              :key="`empty-${i}`" 
              class="card-display empty"
            >
              ?
            </div>
          </div>
        </div>
        
        <!-- Players -->
        <div class="players-container">
          <div 
            v-for="player in currentGame.players" 
            :key="player.id" 
            class="player-spot"
            :class="{
              'current-player': player.id === currentUser.id,
              'active-turn': player.id === currentGame.currentTurn,
              'folded': player.hasFolded
            }"
          >
            <div class="player-info">
              <div class="player-name">{{ player.username }}</div>
              <div class="player-chips">
                Chips: {{ player.totalChips }}
                <span v-if="player.chips > 0">({{ player.chips }} in pot)</span>
              </div>
              <div v-if="player.hasFolded" class="player-status">Folded</div>
              <div v-else-if="player.hasActed" class="player-status">Acted</div>
            </div>
            
            <div v-if="player.id === currentUser.id" class="player-hand">
              <div 
                v-for="(card, index) in playerHand" 
                :key="index" 
                class="card-display player-card"
              >
                {{ formatCard(card) }}
              </div>
            </div>
            <div v-else class="player-hand">
              <div 
                v-for="i in (player.hasCards ? 2 : 0)" 
                :key="`back-${i}`" 
                class="card-display card-back"
              >
                ●●
              </div>
            </div>
          </div>
        </div>
        
        <!-- Player actions -->
        <div v-if="isYourTurn" class="player-actions">
          <h3>Your Turn</h3>
          
          <div class="action-buttons">
            <button 
              v-if="availableActions.includes('fold')" 
              @click="handleAction('fold')" 
              class="btn btn-danger"
            >
              Fold
            </button>
            
            <button 
              v-if="availableActions.includes('check')" 
              @click="handleAction('check')" 
              class="btn"
            >
              Check
            </button>
            
            <button 
              v-if="availableActions.includes('call')" 
              @click="handleAction('call')" 
              class="btn"
            >
              Call {{ currentGame.currentBet - getPlayerChipsInPot() }} chips
            </button>
            
            <div v-if="availableActions.includes('bet')" class="bet-action">
              <button @click="handleAction('bet', betAmount)" class="btn">
                Bet {{ betAmount }} chips
              </button>
              <input 
                type="range" 
                v-model.number="betAmount" 
                :min="1" 
                :max="getCurrentPlayer() ? getCurrentPlayer().totalChips : 1" 
                class="bet-slider"
              />
            </div>
            
            <div v-if="availableActions.includes('raise')" class="bet-action">
              <button @click="handleAction('raise', raiseAmount)" class="btn">
                Raise to {{ raiseAmount }} chips
              </button>
              <input 
                type="range" 
                v-model.number="raiseAmount" 
                :min="currentGame.currentBet * 2" 
                :max="getCurrentPlayer() ? (getCurrentPlayer().totalChips + getCurrentPlayer().chips) : 1" 
                class="bet-slider"
              />
            </div>
          </div>
        </div>
      </div>
      
      <!-- Game chat/log -->
      <div class="game-log">
        <h3>Game Log</h3>
        <div class="log-entries">
          <div v-for="(entry, index) in gameLog" :key="index" class="log-entry">
            {{ entry }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapActions, mapMutations } from 'vuex'
import io from 'socket.io-client'

export default {
  name: 'Game',
  
  data() {
    return {
      gameId: '',
      socket: null,
      isConnected: false,
      isStarting: false,
      gameLog: [],
      betAmount: 1,
      raiseAmount: 0,
      showResult: false,
      handResult: null
    }
  },
  
  computed: {
    ...mapGetters([
      'currentUser', 
      'currentGame', 
      'errorMessage', 
      'playerHand',
      'isYourTurn',
      'availableActions'
    ]),
    
    isCreator() {
      if (!this.currentGame || !this.currentUser) return false
      return this.currentGame.creator && this.currentGame.creator.id === this.currentUser.id
    }
  },
  
  methods: {
    ...mapActions([
      'fetchGame', 
      'startGame', 
      'clearErrorMessage',
      'updateGameState',
      'receiveCards',
      'yourTurn',
      'endTurn',
      'performAction'
    ]),
    
    ...mapMutations([
      'SET_CURRENT_GAME_ID',
      'SET_ERROR_MESSAGE'
    ]),
    
    getCurrentPlayerName() {
      if (!this.currentGame || !this.currentGame.currentTurn) return 'N/A'
      
      const player = this.currentGame.players.find(
        p => p.id === this.currentGame.currentTurn
      )
      
      return player ? player.username : 'Unknown'
    },
    
    getCurrentPlayer() {
      if (!this.currentGame || !this.currentUser) return null
      
      return this.currentGame.players.find(
        p => p.id === this.currentUser.id
      ) || null
    },
    
    getPlayerChipsInPot() {
      const player = this.getCurrentPlayer()
      return player ? player.chips : 0
    },
    
    formatCard(card) {
      if (!card) return '?'
      
      const suitSymbols = {
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
        spades: '♠'
      }
      
      return `${card.rank}${suitSymbols[card.suit]}`
    },
    
    copyGameId() {
      // Modern clipboard API
      navigator.clipboard.writeText(this.gameId)
        .then(() => {
          alert('Game ID copied to clipboard')
        })
        .catch(err => {
          console.error('Could not copy text: ', err)
          
          // Fallback method
          const el = document.createElement('textarea')
          el.value = this.gameId
          document.body.appendChild(el)
          el.select()
          document.execCommand('copy')
          document.body.removeChild(el)
          alert('Game ID copied to clipboard')
        })
    },
    
    leaveGame() {
      if (confirm('Are you sure you want to leave the game?')) {
        if (this.socket) {
          this.socket.disconnect()
        }
        this.$router.push('/lobby')
      }
    },
    
    async handleStartGame() {
      this.isStarting = true
      
      try {
        await this.startGame(this.gameId)
        this.addToLog('Game started!')
      } catch (error) {
        console.error('Error starting game:', error)
      } finally {
        this.isStarting = false
      }
    },
    
    handleAction(action, amount = 0) {
      if (!this.isYourTurn) return
      
      this.socket.emit('playerAction', {
        gameId: this.gameId,
        userId: this.currentUser.id,
        action,
        amount
      })
      
      this.performAction({ action, amount })
      
      let logMessage = `You ${action}`
      if (action === 'bet' || action === 'raise') {
        logMessage += ` ${amount} chips`
      }
      this.addToLog(logMessage)
    },
    
    addToLog(message) {
      const timestamp = new Date().toLocaleTimeString()
      this.gameLog.unshift(`[${timestamp}] ${message}`)
      
      // Keep log at reasonable size
      if (this.gameLog.length > 50) {
        this.gameLog.pop()
      }
    },
    
    setupSocketConnection() {
      // Connect to the game namespace
      const socketUrl = process.env.VUE_APP_SOCKET_URL || 'http://localhost:3000'
      this.socket = io(`${socketUrl}/game`)
      
      this.socket.on('connect', () => {
        this.isConnected = true
        console.log('Connected to game socket')
        
        // Register user with socket
        this.socket.emit('register', {
          userId: this.currentUser.id
        })
        
        // Join game room
        this.socket.emit('joinGame', {
          gameId: this.gameId,
          userId: this.currentUser.id,
          username: this.currentUser.username
        })
        
        this.addToLog('Connected to game server')
      })
      
      this.socket.on('disconnect', () => {
        this.isConnected = false
        console.log('Disconnected from game socket')
        this.addToLog('Disconnected from game server')
      })
      
      this.socket.on('gameUpdate', gameState => {
        this.updateGameState(gameState)
      })
      
      this.socket.on('gameStarted', gameState => {
        this.updateGameState(gameState)
        this.addToLog('Game has started!')
      })
      
      this.socket.on('dealCards', ({ hand }) => {
        this.receiveCards({ hand })
        this.addToLog('You have been dealt cards')
      })
      
      this.socket.on('yourTurn', ({ options }) => {
        this.yourTurn({ options })
        this.addToLog('It is your turn')
      })
      
      this.socket.on('handResult', result => {
        this.handResult = result
        this.showResult = true
        
        const winnerNames = result.winners.map(winnerId => {
          const player = this.currentGame.players.find(p => p.id === winnerId)
          return player ? player.username : 'Unknown'
        }).join(', ')
        
        this.addToLog(`Hand complete. Winner(s): ${winnerNames}`)
        
        // Hide result after a few seconds
        setTimeout(() => {
          this.showResult = false
          this.handResult = null
        }, 5000)
      })
      
      this.socket.on('gameError', ({ message }) => {
        this.SET_ERROR_MESSAGE(message)
        this.addToLog(`Error: ${message}`)
      })
    }
  },
  
  created() {
    this.gameId = this.$route.params.id
    this.SET_CURRENT_GAME_ID(this.gameId)
    
    // Fetch game data
    this.fetchGame(this.gameId)
      .then(() => {
        if (this.currentGame) {
          this.addToLog(`Joined game #${this.gameId}`)
          
          // Set up socket connection
          this.setupSocketConnection()
        }
      })
      .catch(error => {
        console.error('Error fetching game:', error)
      })
  },
  
  beforeDestroy() {
    // Clean up socket connection
    if (this.socket) {
      this.socket.disconnect()
    }
    
    this.clearErrorMessage()
  }
}
</script>

<style scoped>
.game-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.game-header h2 {
  margin: 0;
  color: #3f8c6e;
}

.game-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
}

.error-message {
  background-color: #e74c3c;
  color: white;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
  font-size: 18px;
}

.game-area {
  display: grid;
  grid-template-columns: 1fr 3fr;
  grid-template-rows: auto 1fr auto;
  gap: 20px;
  grid-template-areas:
    "status status"
    "table table"
    "log log";
}

.game-status {
  grid-area: status;
  background-color: #2a2a2a;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
}

.game-table {
  grid-area: table;
  background-color: #1c4e38;
  border-radius: 8px;
  padding: 20px;
  min-height: 400px;
  position: relative;
}

.community-cards {
  text-align: center;
  margin-bottom: 30px;
}

.community-cards h3 {
  color: white;
  margin-top: 0;
  margin-bottom: 10px;
}

.cards-container {
  display: flex;
  justify-content: center;
  gap: 10px;
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

.card-display.empty {
  background-color: #333;
  color: #555;
}

.card-display.card-back {
  background-color: #2a2a2a;
  color: #3f8c6e;
}

.players-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
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

.player-actions {
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  padding: 15px;
  margin-top: 20px;
  text-align: center;
}

.player-actions h3 {
  color: white;
  margin-top: 0;
  margin-bottom: 15px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

.bet-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.bet-slider {
  width: 100%;
  margin-top: 5px;
}

.game-log {
  grid-area: log;
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 15px;
  max-height: 200px;
  overflow-y: auto;
}

.game-log h3 {
  margin-top: 0;
  margin-bottom: 10px;
  color: #3f8c6e;
}

.log-entry {
  padding: 5px 0;
  border-bottom: 1px solid #444;
  font-size: 14px;
}

@media (max-width: 768px) {
  .game-area {
    grid-template-columns: 1fr;
    grid-template-areas:
      "status"
      "table"
      "log";
  }
  
  .card-display {
    width: 40px;
    height: 60px;
    font-size: 16px;
  }
  
  .player-spot {
    width: 140px;
    margin: 5px;
  }
}
</style>