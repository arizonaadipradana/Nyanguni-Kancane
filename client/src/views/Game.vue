<!-- client/src/views/Game.vue -->
<template>
  <div class="game-container">
    <div class="game-header">
      <h2>{{ gameTitle }}</h2>
      <div class="game-info">
        <span class="pot-display">Pot: {{ currentGame ? formatChips(currentGame.pot) : 0 }} chips</span>
        <button @click="copyGameId" class="btn-secondary btn-sm">
          <i class="fas fa-share-alt"></i> Share Game ID
        </button>
        <button @click="leaveGame" class="btn-danger btn-sm">
          <i class="fas fa-sign-out-alt"></i> Leave Game
        </button>
      </div>
    </div>
    
    <div v-if="errorMessage" class="error-message">
      <i class="fas fa-exclamation-triangle"></i> {{ errorMessage }}
    </div>
    
    <div v-if="!currentGame" class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading game...</p>
    </div>
    
    <div v-else class="game-area">
      <!-- Game status -->
      <div class="game-status">
        <div v-if="currentGame.status === 'waiting'">
          <div class="waiting-status">
            <i class="fas fa-hourglass-half"></i>
            <h3>Waiting for players to join...</h3>
          </div>
          <p>Game ID: <strong>{{ gameId }}</strong></p>
          <p>Players: {{ currentGame.players.length }}/8</p>
          
          <button 
            v-if="isCreator" 
            @click="handleStartGame" 
            class="btn start-game-btn" 
            :disabled="currentGame.players.length < 2 || isStarting"
          >
            <i class="fas fa-play"></i> {{ isStarting ? 'Starting...' : 'Start Game' }}
          </button>
        </div>
        
        <div v-else-if="currentGame.status === 'active'" class="active-status">
          <div class="status-row">
            <div class="status-item">
              <span class="status-label">Current turn:</span>
              <span class="current-player">{{ getCurrentPlayerName() }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">Current bet:</span>
              <span class="current-bet">{{ formatChips(currentGame.currentBet) }} chips</span>
            </div>
            <div class="status-item">
              <span class="status-label">Round:</span>
              <span class="betting-round">{{ formatBettingRound(currentGame.bettingRound) }}</span>
            </div>
          </div>
        </div>
        
        <div v-else class="completed-status">
          <h3><i class="fas fa-flag-checkered"></i> Game completed</h3>
        </div>
      </div>
      
      <!-- Game table -->
      <div class="game-table" :class="{ 'waiting-table': currentGame.status === 'waiting' }">
        <!-- Community cards -->
        <div class="community-cards">
          <h3>Community Cards</h3>
          <div class="cards-container">
            <div 
              v-for="(card, index) in currentGame.communityCards" 
              :key="index" 
              class="card-display"
              :class="getCardClass(card)"
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
              'folded': player.hasFolded,
              'all-in': player.isAllIn,
              'inactive': !player.isActive
            }"
          >
            <div class="player-info">
              <div class="player-name">{{ player.username }}</div>
              <div class="player-chips">
                {{ formatChips(player.totalChips) }}
                <span v-if="player.chips > 0" class="bet-amount">({{ formatChips(player.chips) }} in pot)</span>
              </div>
              <div v-if="player.isAllIn" class="player-status all-in-status">All-In</div>
              <div v-else-if="player.hasFolded" class="player-status fold-status">Folded</div>
              <div v-else-if="player.hasActed" class="player-status acted-status">Acted</div>
              <div v-else-if="!player.isActive" class="player-status inactive-status">Inactive</div>
              <div v-else-if="player.id === currentGame.currentTurn" class="player-status turn-status">Acting</div>
            </div>
            
            <div v-if="player.id === currentUser.id" class="player-hand">
              <div 
                v-for="(card, index) in playerHand" 
                :key="index" 
                class="card-display player-card"
                :class="getCardClass(card)"
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
                <i class="fas fa-chess-queen"></i>
              </div>
            </div>
            
            <div v-if="player.id === currentGame.currentTurn" class="turn-indicator">
              <div class="turn-pulse"></div>
            </div>
            
            <div v-if="showDealer && currentGame.dealerPosition !== undefined && getPlayerPosition(player) === currentGame.dealerPosition" class="dealer-button">
              D
            </div>
          </div>
        </div>
        
        <!-- Hand result overlay -->
        <div v-if="showResult" class="hand-result-overlay">
          <div class="hand-result-content">
            <h2>Hand Result</h2>
            <div v-if="handResult && handResult.winners">
              <div v-for="(winner, index) in handResult.winners" :key="index" class="winner-info">
                <h3>{{ winner.username }} wins!</h3>
                <p>{{ winner.handName }}</p>
              </div>
              <p class="pot-info">Pot: {{ formatChips(handResult.pot) }} chips</p>
              
              <button @click="hideResult" class="btn">Continue</button>
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
              class="btn btn-danger action-btn"
            >
              <i class="fas fa-times"></i> Fold
            </button>
            
            <button 
              v-if="availableActions.includes('check')" 
              @click="handleAction('check')" 
              class="btn action-btn"
            >
              <i class="fas fa-check"></i> Check
            </button>
            
            <button 
              v-if="availableActions.includes('call')" 
              @click="handleAction('call')" 
              class="btn action-btn"
            >
              <i class="fas fa-phone"></i> Call {{ formatChips(currentGame.currentBet - getPlayerChipsInPot()) }}
            </button>
            
            <div v-if="availableActions.includes('bet')" class="bet-action">
              <button @click="handleAction('bet', betAmount)" class="btn action-btn">
                <i class="fas fa-coins"></i> Bet {{ formatChips(betAmount) }}
              </button>
              <div class="slider-container">
                <span class="min-value">{{ formatChips(minBet) }}</span>
                <input 
                  type="range" 
                  v-model.number="betAmount" 
                  :min="minBet" 
                  :max="getMaxBet()" 
                  class="bet-slider"
                />
                <span class="max-value">{{ formatChips(getMaxBet()) }}</span>
              </div>
            </div>
            
            <div v-if="availableActions.includes('raise')" class="bet-action">
              <button @click="handleAction('raise', raiseAmount)" class="btn action-btn">
                <i class="fas fa-arrow-up"></i> Raise to {{ formatChips(raiseAmount) }}
              </button>
              <div class="slider-container">
                <span class="min-value">{{ formatChips(getMinRaise()) }}</span>
                <input 
                  type="range" 
                  v-model.number="raiseAmount" 
                  :min="getMinRaise()" 
                  :max="getMaxRaise()" 
                  class="bet-slider"
                />
                <span class="max-value">{{ formatChips(getMaxRaise()) }}</span>
              </div>
            </div>
            
            <button 
              v-if="availableActions.includes('allIn')" 
              @click="handleAction('allIn')" 
              class="btn btn-warning action-btn all-in-btn"
            >
              <i class="fas fa-exclamation-circle"></i> All-In {{ formatChips(getCurrentPlayer().totalChips) }}
            </button>
          </div>
          
          <div class="timer-bar" :style="{ width: `${timePercentage}%` }"></div>
        </div>
      </div>
      
      <!-- Game chat/log -->
      <div class="game-chat-container">
        <div class="tabs">
          <button 
            @click="activeTab = 'log'" 
            :class="{ active: activeTab === 'log' }" 
            class="tab-btn"
          >
            Game Log
          </button>
          <button 
            @click="activeTab = 'chat'" 
            :class="{ active: activeTab === 'chat' }" 
            class="tab-btn"
          >
            Chat
          </button>
        </div>
        
        <div v-if="activeTab === 'log'" class="game-log">
          <div class="log-entries">
            <div v-for="(entry, index) in gameLog" :key="index" class="log-entry">
              {{ entry }}
            </div>
          </div>
        </div>
        
        <div v-else class="game-chat">
          <div class="chat-messages">
            <div v-for="(msg, index) in chatMessages" :key="index" 
              class="chat-message" 
              :class="{ 'system-message': msg.type === 'system' }"
            >
              <span v-if="msg.type !== 'system'" class="chat-username">{{ msg.username }}:</span>
              <span class="chat-text">{{ msg.message }}</span>
              <span class="chat-time">{{ formatTime(msg.timestamp) }}</span>
            </div>
          </div>
          
          <div class="chat-input">
            <input 
              type="text" 
              v-model="chatInput" 
              @keyup.enter="sendChatMessage" 
              placeholder="Type a message..." 
              class="form-control"
            />
            <button @click="sendChatMessage" class="btn btn-sm">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapActions, mapMutations } from 'vuex';
import io from 'socket.io-client';

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
      handResult: null,
      timePercentage: 100,
      timerInterval: null,
      actionTimeout: null,
      activeTab: 'log',
      chatMessages: [],
      chatInput: '',
      showDealer: true,
      minBet: 1
    };
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
      if (!this.currentGame || !this.currentUser) return false;
      return this.currentGame.creator && this.currentGame.creator.user === this.currentUser.id;
    },
    
    gameTitle() {
      return `Nyanguni Kancane - Game #${this.gameId}`;
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
    
    formatChips(amount) {
      return amount.toLocaleString();
    },
    
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    
    formatBettingRound(round) {
      if (!round) return 'Waiting';
      
      const rounds = {
        'preflop': 'Pre-Flop',
        'flop': 'Flop',
        'turn': 'Turn',
        'river': 'River',
        'showdown': 'Showdown'
      };
      
      return rounds[round] || round;
    },
    
    getPlayerPosition(player) {
      // Get player position in the game
      return this.currentGame.players.findIndex(p => p.id === player.id);
    },
    
    getCurrentPlayerName() {
      if (!this.currentGame || !this.currentGame.currentTurn) return 'Waiting...';
      
      const player = this.currentGame.players.find(
        p => p.id === this.currentGame.currentTurn
      );
      
      return player ? player.username : 'Unknown';
    },
    
    getCurrentPlayer() {
      if (!this.currentGame || !this.currentUser) return null;
      
      return this.currentGame.players.find(
        p => p.id === this.currentUser.id
      ) || null;
    },
    
    getPlayerChipsInPot() {
      const player = this.getCurrentPlayer();
      return player ? player.chips : 0;
    },
    
    formatCard(card) {
      if (!card) return '?';
      
      const suitSymbols = {
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
        spades: '♠'
      };
      
      return `${card.rank}${suitSymbols[card.suit]}`;
    },
    
    getCardClass(card) {
      if (!card) return '';
      
      return {
        'red-card': card.suit === 'hearts' || card.suit === 'diamonds',
        'black-card': card.suit === 'clubs' || card.suit === 'spades'
      };
    },
    
    getMinRaise() {
      return this.currentGame.currentBet * 2;
    },
    
    getMaxRaise() {
      const player = this.getCurrentPlayer();
      if (!player) return 0;
      return player.totalChips + player.chips;
    },
    
    getMaxBet() {
      const player = this.getCurrentPlayer();
      if (!player) return 0;
      return player.totalChips;
    },
    
    copyGameId() {
      // Modern clipboard API
      navigator.clipboard.writeText(this.gameId)
        .then(() => {
          this.addToLog('Game ID copied to clipboard');
        })
        .catch(err => {
          console.error('Could not copy text: ', err);
          
          // Fallback method
          const el = document.createElement('textarea');
          el.value = this.gameId;
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
          this.addToLog('Game ID copied to clipboard');
        });
    },
    
    leaveGame() {
      if (confirm('Are you sure you want to leave the game?')) {
        if (this.socket) {
          this.socket.emit('leaveGame', {
            gameId: this.gameId,
            userId: this.currentUser.id
          });
          this.socket.disconnect();
        }
        this.$router.push('/lobby');
      }
    },
    
    async handleStartGame() {
      this.isStarting = true;
      
      try {
        await this.startGame(this.gameId);
        this.addToLog('Game started!');
      } catch (error) {
        console.error('Error starting game:', error);
        this.addToLog('Failed to start game');
      } finally {
        this.isStarting = false;
      }
    },
    
    handleAction(action, amount = 0) {
      if (!this.isYourTurn) return;
      
      // Clear any existing timer
      this.clearActionTimer();
      
      this.socket.emit('playerAction', {
        gameId: this.gameId,
        userId: this.currentUser.id,
        action,
        amount
      });
      
      this.performAction({ action, amount });
      
      let logMessage = `You ${action}`;
      if (action === 'bet' || action === 'raise') {
        logMessage += ` ${amount} chips`;
      } else if (action === 'allIn') {
        const player = this.getCurrentPlayer();
        if (player) {
          logMessage += ` ${player.totalChips} chips`;
        }
      }
      
      this.addToLog(logMessage);
    },
    
    addToLog(message) {
      const timestamp = new Date().toLocaleTimeString();
      this.gameLog.unshift(`[${timestamp}] ${message}`);
      
      // Keep log at reasonable size
      if (this.gameLog.length > 50) {
        this.gameLog.pop();
      }
    },
    
    sendChatMessage() {
      if (!this.chatInput.trim()) return;
      
      this.socket.emit('sendMessage', {
        gameId: this.gameId,
        userId: this.currentUser.id,
        username: this.currentUser.username,
        message: this.chatInput.trim()
      });
      
      this.chatInput = '';
    },
    
    startActionTimer(duration = 30) {
      // Clear any existing timer
      this.clearActionTimer();
      
      // Set time to 100%
      this.timePercentage = 100;
      
      // Start countdown
      const interval = 100; // update every 100ms
      const step = (100 / (duration * 1000)) * interval;
      
      this.timerInterval = setInterval(() => {
        this.timePercentage -= step;
        
        if (this.timePercentage <= 0) {
          this.clearActionTimer();
        }
      }, interval);
      
      // Auto-fold after time expires
      this.actionTimeout = setTimeout(() => {
        if (this.isYourTurn) {
          this.handleAction('fold');
          this.addToLog('Auto-folded due to time limit');
        }
        this.clearActionTimer();
      }, duration * 1000);
    },
    
    clearActionTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      
      if (this.actionTimeout) {
        clearTimeout(this.actionTimeout);
        this.actionTimeout = null;
      }
    },
    
    hideResult() {
      this.showResult = false;
      this.handResult = null;
    },
    
    setupSocketConnection() {
      // Connect to the game namespace
      const socketUrl = process.env.VUE_APP_SOCKET_URL || 'http://localhost:3000';
      this.socket = io(`${socketUrl}/game`);
      
      this.socket.on('connect', () => {
        this.isConnected = true;
        console.log('Connected to game socket');
        
        // Register user with socket
        this.socket.emit('register', {
          userId: this.currentUser.id
        });
        
        // Join game room
        this.socket.emit('joinGame', {
          gameId: this.gameId,
          userId: this.currentUser.id,
          username: this.currentUser.username
        });
        
        this.addToLog('Connected to game server');
      });
      
      this.socket.on('disconnect', () => {
        this.isConnected = false;
        console.log('Disconnected from game socket');
        this.addToLog('Disconnected from game server');
      });
      
      this.socket.on('gameUpdate', gameState => {
        this.updateGameState(gameState);
      });
      
      this.socket.on('gameStarted', gameState => {
        this.updateGameState(gameState);
        this.addToLog('Game has started!');
      });
      
      this.socket.on('dealCards', ({ hand }) => {
        this.receiveCards({ hand });
        this.addToLog('You have been dealt cards');
      });
      
      this.socket.on('yourTurn', ({ options, timeLimit }) => {
        this.yourTurn({ options });
        this.addToLog('It is your turn');
        this.startActionTimer(timeLimit);
      });
      
      this.socket.on('turnChanged', ({ playerId, username }) => {
        // Add to log when someone else's turn starts
        if (playerId !== this.currentUser.id) {
          this.addToLog(`It is ${username}'s turn`);
        }
      });
      
      this.socket.on('actionTaken', ({ playerId, action, amount }) => {
        // Log actions from other players
        if (playerId !== this.currentUser.id) {
          const player = this.currentGame.players.find(p => p.id === playerId);
          const playerName = player ? player.username : 'Unknown';
          
          let actionText = `${playerName} ${action}s`;
          if (action === 'bet' || action === 'raise' || action === 'allIn') {
            actionText += ` ${amount} chips`;
          }
          
          this.addToLog(actionText);
        }
      });
      
      this.socket.on('dealFlop', ({ communityCards }) => {
        this.addToLog('Flop is dealt');
      });
      
      this.socket.on('dealTurn', ({ communityCards }) => {
        this.addToLog('Turn is dealt');
      });
      
      this.socket.on('dealRiver', ({ communityCards }) => {
        this.addToLog('River is dealt');
      });
      
      this.socket.on('handResult', result => {
        this.handResult = result;
        this.showResult = true;
        
        const winnerNames = result.winners.map(winner => winner.username).join(', ');
        this.addToLog(`Hand complete. Winner(s): ${winnerNames}`);
      });
      
      this.socket.on('newHand', gameState => {
        this.addToLog('Starting a new hand');
      });
      
      this.socket.on('chatMessage', message => {
        this.chatMessages.push(message);
        
        // Keep chat at reasonable size
        if (this.chatMessages.length > 100) {
          this.chatMessages.shift();
        }
        
        // If it's a system message, also add to game log
        if (message.type === 'system') {
          this.addToLog(message.message);
        }
      });
      
      this.socket.on('playerJoined', ({ userId, username }) => {
        this.addToLog(`${username} joined the game`);
      });
      
      this.socket.on('playerLeft', ({ userId, username }) => {
        this.addToLog(`${username} left the game`);
      });
      
      this.socket.on('gameEnded', ({ message }) => {
        this.addToLog(`Game ended: ${message}`);
      });
      
      this.socket.on('gameError', ({ message }) => {
        this.SET_ERROR_MESSAGE(message);
        this.addToLog(`Error: ${message}`);
      });
      
      this.socket.on('leaveGameSuccess', () => {
        this.$router.push('/lobby');
      });
    }
  },
  
  created() {
    this.gameId = this.$route.params.id;
    this.SET_CURRENT_GAME_ID(this.gameId);
    
    // Set initial bet amount
    this.betAmount = this.minBet;
    this.raiseAmount = this.minBet * 2;
    
    // Fetch game data
    this.fetchGame(this.gameId)
      .then(() => {
        if (this.currentGame) {
          this.addToLog(`Joined game #${this.gameId}`);
          
          // Set up socket connection
          this.setupSocketConnection();
        }
      })
      .catch(error => {
        console.error('Error fetching game:', error);
        this.addToLog('Failed to load game data');
      });
  },
  
  updated() {
    // Update bet and raise amounts when currentGame changes
    if (this.currentGame && this.currentGame.minBet) {
      this.minBet = this.currentGame.minBet;
      
      // Only update if not set by user
      if (this.betAmount < this.minBet) {
        this.betAmount = this.minBet;
      }
      
      // Update raise amount if available
      if (this.availableActions.includes('raise')) {
        const minRaise = this.getMinRaise();
        if (this.raiseAmount < minRaise) {
          this.raiseAmount = minRaise;
        }
      }
    }
  },
  
  beforeDestroy() {
    // Clean up socket connection
    if (this.socket) {
      this.socket.disconnect();
    }
    
    // Clear any timers
    this.clearActionTimer();
    
    this.clearErrorMessage();
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
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.2);
}

.game-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pot-display {
  font-weight: bold;
  font-size: 1.1em;
  color: #ffcc00;
  background-color: rgba(0, 0, 0, 0.3);
  padding: 5px 10px;
  border-radius: 4px;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.error-message {
  background-color: #e74c3c;
  color: white;
  padding: 10px 15px;
  border-radius: 4px;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 300px;
}

.loading-spinner {
  border: 5px solid rgba(63, 140, 110, 0.2);
  border-top: 5px solid #3f8c6e;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.game-area {
  display: grid;
  grid-template-columns: 1fr 3fr;
  grid-template-rows: auto 1fr auto;
  gap: 20px;
  grid-template-areas:
    "status status"
    "table table"
    "chat chat";
}

.game-status {
  grid-area: status;
  background-color: #2a2a2a;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
}

.waiting-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.waiting-status i {
  font-size: 24px;
  color: #ffcc00;
  margin-bottom: 10px;
}

.active-status .status-row {
  display: flex;
  justify-content: space-around;
  flex-wrap: wrap;
}

.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5px 15px;
}

.status-label {
  font-size: 0.9em;
  color: #999;
  margin-bottom: 5px;
}

.current-player {
  font-weight: bold;
  color: #ffcc00;
  font-size: 1.1em;
}

.current-bet {
  font-weight: bold;
  color: #f39c12;
  font-size: 1.1em;
}

.betting-round {
  font-weight: bold;
  color: #3498db;
  font-size: 1.1em;
}

.completed-status {
  padding: 10px;
}

.completed-status h3 {
  color: #e74c3c;
  margin: 0;
}

.start-game-btn {
  margin-top: 15px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  font-size: 16px;
  font-weight: bold;
}

.game-table {
  grid-area: table;
  background-color: #1c4e38;
  border-radius: 8px;
  padding: 20px;
  min-height: 400px;
  position: relative;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.waiting-table {
  background-color: #2a3b47;
}

.community-cards {
  text-align: center;
  margin-bottom: 30px;
}

.community-cards h3 {
  color: white;
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.8;
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
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  transition: transform 0.3s ease;
}

.card-display.red-card {
  color: #e74c3c;
}

.card-display.black-card {
  color: #2c3e50;
}

.card-display:hover {
  transform: translateY(-5px);
}

.card-display.empty {
  background-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.3);
  border: 1px dashed rgba(255, 255, 255, 0.3);
  box-shadow: none;
}

.card-display.card-back {
  background-color: #2c3e50;
  background-image: linear-gradient(45deg, #3f8c6e 25%, transparent 25%, transparent 75%, #3f8c6e 75%, #3f8c6e),
                    linear-gradient(45deg, #3f8c6e 25%, transparent 25%, transparent 75%, #3f8c6e 75%, #3f8c6e);
  background-size: 10px 10px;
  background-position: 0 0, 5px 5px;
  color: #f5f5f5;
}

.players-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
  gap: 15px;
  margin-bottom: 20px;
}

.player-spot {
  width: 180px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 15px;
  position: relative;
  transition: all 0.3s ease;
}

.player-spot.current-player {
  background-color: rgba(63, 140, 110, 0.3);
  box-shadow: 0 0 15px rgba(63, 140, 110, 0.5);
}

.player-spot.active-turn {
  border: 2px solid #ffcc00;
  box-shadow: 0 0 20px rgba(255, 204, 0, 0.5);
}

.player-spot.folded {
  opacity: 0.6;
}

.player-spot.all-in {
  background-color: rgba(243, 156, 18, 0.2);
}

.player-spot.inactive {
  opacity: 0.4;
  filter: grayscale(1);
}

.player-info {
  margin-bottom: 15px;
}

.player-name {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 5px;
  color: white;
}

.player-chips {
  font-size: 14px;
  color: #ccc;
}

.bet-amount {
  font-style: italic;
  color: #f39c12;
}

.player-status {
  margin-top: 5px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  display: inline-block;
}

.fold-status {
  background-color: rgba(231, 76, 60, 0.3);
  color: #e74c3c;
}

.all-in-status {
  background-color: rgba(243, 156, 18, 0.3);
  color: #f39c12;
}

.acted-status {
  background-color: rgba(52, 152, 219, 0.3);
  color: #3498db;
}

.inactive-status {
  background-color: rgba(127, 140, 141, 0.3);
  color: #7f8c8d;
}

.turn-status {
  background-color: rgba(255, 204, 0, 0.3);
  color: #ffcc00;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}

.player-hand {
  display: flex;
  justify-content: center;
  gap: 5px;
}

.turn-indicator {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 20px;
  height: 20px;
}

.turn-pulse {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #ffcc00;
  animation: pulse-turn 1.5s infinite;
}

@keyframes pulse-turn {
  0% { transform: scale(0.8); opacity: 0.7; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.7; }
}

.dealer-button {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: #f5f5f5;
  color: #1c4e38;
  font-weight: bold;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.hand-result-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 8px;
}

.hand-result-content {
  background-color: #2a2a2a;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
  text-align: center;
  max-width: 80%;
}

.hand-result-content h2 {
  color: #f39c12;
  margin-top: 0;
}

.winner-info {
  margin-bottom: 15px;
}

.winner-info h3 {
  color: #2ecc71;
  margin-bottom: 5px;
}

.winner-info p {
  color: #f5f5f5;
}

.pot-info {
  font-size: 18px;
  font-weight: bold;
  color: #f39c12;
  margin-bottom: 20px;
}

.player-actions {
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  padding: 15px;
  margin-top: 20px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.player-actions h3 {
  color: white;
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 18px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 15px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 100px;
  padding: 8px 16px;
  font-weight: bold;
  transition: all 0.2s ease;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.all-in-btn {
  font-size: 16px;
  padding: 10px 20px;
  background-color: #f39c12;
}

.bet-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.slider-container {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
}

.min-value, .max-value {
  font-size: 12px;
  color: #ccc;
  width: 50px;
}

.bet-slider {
  flex: 1;
  height: 4px;
  background-color: #555;
  outline: none;
  border-radius: 2px;
  -webkit-appearance: none;
}

.bet-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #f39c12;
  cursor: pointer;
}

.timer-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 4px;
  background-color: #f39c12;
  transition: width 0.1s linear;
}

.game-chat-container {
  grid-area: chat;
  background-color: #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 300px;
}

.tabs {
  display: flex;
  background-color: #222;
}

.tab-btn {
  flex: 1;
  background-color: transparent;
  border: none;
  color: #ccc;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background-color: #2a2a2a;
  color: #3f8c6e;
  font-weight: bold;
}

.game-log, .game-chat {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.log-entries {
  display: flex;
  flex-direction: column-reverse;
}

.log-entry {
  padding: 5px 0;
  border-bottom: 1px solid #444;
  font-size: 14px;
}

.chat-messages {
  display: flex;
  flex-direction: column;
}

.chat-message {
  padding: 5px;
  margin-bottom: 5px;
}

.system-message {
  color: #3f8c6e;
  font-style: italic;
}

.chat-username {
  font-weight: bold;
  color: #3498db;
  margin-right: 5px;
}

.chat-text {
  color: #f5f5f5;
}

.chat-time {
  margin-left: 5px;
  font-size: 12px;
  color: #999;
}

.chat-input {
  display: flex;
  border-top: 1px solid #444;
  padding: 10px;
}

.chat-input input {
  flex: 1;
  margin-right: 10px;
}

@media (max-width: 768px) {
  .game-area {
    grid-template-columns: 1fr;
    grid-template-areas:
      "status"
      "table"
      "chat";
  }
  
  .card-display {
    width: 40px;
    height: 60px;
    font-size: 16px;
  }
  
  .player-spot {
    width: 140px;
    margin: 5px;
    padding: 10px;
  }
  
  .action-buttons {
    flex-direction: column;
    align-items: center;
  }
  
  .action-btn {
    width: 100%;
  }
  
  .game-chat-container {
    height: 250px;
  }
}
</style>