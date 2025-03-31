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

          <button v-if="isCreator" @click="handleStartGame" class="btn"
            :disabled="currentGame.players.length < 2 || isStarting">
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
            <div v-for="(card, index) in currentGame.communityCards" :key="index" class="card-display">
              {{ formatCard(card) }}
            </div>
            <div v-for="i in (5 - currentGame.communityCards.length)" :key="`empty-${i}`" class="card-display empty">
              ?
            </div>
          </div>
        </div>

        <!-- Players -->
        <div class="players-container">
          <div v-for="player in currentGame.players" :key="player.id" class="player-spot" :class="{
            'current-player': player.id === currentUser.id,
            'active-turn': player.id === currentGame.currentTurn,
            'folded': player.hasFolded
          }">
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

        <!-- Player actions -->
        <div v-if="isYourTurn" class="player-actions">
          <h3>Your Turn</h3>

          <div class="action-buttons">
            <button v-if="availableActions.includes('fold')" @click="handleAction('fold')" class="btn btn-danger">
              Fold
            </button>

            <button v-if="availableActions.includes('check')" @click="handleAction('check')" class="btn">
              Check
            </button>

            <button v-if="availableActions.includes('call')" @click="handleAction('call')" class="btn">
              Call {{ currentGame.currentBet - getPlayerChipsInPot() }} chips
            </button>

            <div v-if="availableActions.includes('bet')" class="bet-action">
              <button @click="handleAction('bet', betAmount)" class="btn">
                Bet {{ betAmount }} chips
              </button>
              <input type="range" v-model.number="betAmount" :min="1"
                :max="getCurrentPlayer() ? getCurrentPlayer().totalChips : 1" class="bet-slider" />
            </div>

            <div v-if="availableActions.includes('raise')" class="bet-action">
              <button @click="handleAction('raise', raiseAmount)" class="btn">
                Raise to {{ raiseAmount }} chips
              </button>
              <input type="range" v-model.number="raiseAmount" :min="currentGame.currentBet * 2"
                :max="getCurrentPlayer() ? (getCurrentPlayer().totalChips + getCurrentPlayer().chips) : 1"
                class="bet-slider" />
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

import SocketService from '@/services/SocketService'
import { mapGetters, mapActions, mapMutations } from 'vuex'

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
        SocketService.leaveGame(this.gameId, this.currentUser.id);
        this.$router.push('/lobby');
      }
    },

    sendChatMessage() {
      if (!this.chatInput.trim()) return;

      SocketService.sendChatMessage(
        this.gameId,
        this.currentUser.id,
        this.currentUser.username,
        this.chatInput.trim()
      );

      this.chatInput = '';
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
      if (!this.isYourTurn) return;

      // Clear any existing timer
      this.clearActionTimer();

      SocketService.sendPlayerAction(
        this.gameId,
        this.currentUser.id,
        action,
        amount
      );

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
      const timestamp = new Date().toLocaleTimeString()
      this.gameLog.unshift(`[${timestamp}] ${message}`)

      // Keep log at reasonable size
      if (this.gameLog.length > 50) {
        this.gameLog.pop()
      }
    },

    async setupSocketConnection() {
      try {
        // Initialize the socket service and connect to the game
        await SocketService.init();

        // Join the game room
        await SocketService.joinGame(
          this.gameId,
          this.currentUser.id,
          this.currentUser.username
        );

        this.isConnected = true;
        this.addToLog('Connected to game server');

        // Register event handlers
        SocketService.on('gameUpdate', this.handleGameUpdate);
        SocketService.on('gameStarted', this.handleGameStarted);
        SocketService.on('playerJoined', this.handlePlayerJoined);
        SocketService.on('playerLeft', this.handlePlayerLeft);
        SocketService.on('chatMessage', this.handleChatMessage);
        SocketService.on('dealCards', this.handleDealCards);
        SocketService.on('yourTurn', this.handleYourTurn);
        SocketService.on('turnChanged', this.handleTurnChanged);
        SocketService.on('actionTaken', this.handleActionTaken);
        SocketService.on('dealFlop', this.handleDealFlop);
        SocketService.on('dealTurn', this.handleDealTurn);
        SocketService.on('dealRiver', this.handleDealRiver);
        SocketService.on('handResult', this.handleHandResult);
        SocketService.on('newHand', this.handleNewHand);
        SocketService.on('gameEnded', this.handleGameEnded);
        SocketService.on('gameError', this.handleGameError);

        // Request an initial game state update with retry logic
        this.requestGameState();
      } catch (error) {
        console.error('Error setting up socket connection:', error);
        this.addToLog('Failed to connect to game server');

        // Set up auto-reconnect
        setTimeout(() => {
          if (!this.isConnected) {
            console.log('Attempting to reconnect...');
            this.setupSocketConnection();
          }
        }, 3000);
      }
    },

    requestGameState(retries = 3) {
      SocketService.requestGameUpdate(this.gameId, this.currentUser.id);

      // Set up a timeout to check if we got a game state update
      if (retries > 0) {
        setTimeout(() => {
          if (!this.currentGame) {
            console.log(`Game state not received, retrying... (${retries} attempts left)`);
            this.requestGameState(retries - 1);
          }
        }, 1000);
      }
    },

    // Handler methods
    handleGameUpdate(gameState) {
      console.log('Game update received:', gameState);

      if (!gameState) {
        console.warn('Received empty game state');
        return;
      }

      this.updateGameState(gameState);

      // Log connection status
      if (!this.isConnected) {
        this.isConnected = true;
        this.addToLog('Connected to game server');
      }

      // Debugging: log player count
      console.log(`Game has ${gameState.players?.length || 0} players`);
    },

    handleGameStarted(gameState) {
      this.updateGameState(gameState);
      this.addToLog('Game has started!');
    },

    // Improved handler for player joined events
    handlePlayerJoined(data) {
      this.addToLog(`${data.username} joined the game`);

      // Make sure we get fresh game state
      setTimeout(() => {
        SocketService.requestGameUpdate(this.gameId, this.currentUser.id);
      }, 300);
    },

    handlePlayerLeft(data) {
      this.addToLog(`${data.username} left the game`);
    },

    handleChatMessage(message) {
      this.chatMessages.push(message);

      // Keep chat at reasonable size
      if (this.chatMessages.length > 100) {
        this.chatMessages.shift();
      }

      // If it's a system message, also add to game log
      if (message.type === 'system') {
        this.addToLog(message.message);
      }
    },

    handleDealCards(data) {
      this.receiveCards(data);
      this.addToLog('You have been dealt cards');
    },

    handleYourTurn(data) {
      this.yourTurn(data);
      this.addToLog('It is your turn');
      this.startActionTimer(data.timeLimit || 30);
    },

    handleTurnChanged(data) {
      // Add to log when someone else's turn starts
      if (data.playerId !== this.currentUser.id) {
        this.addToLog(`It is ${data.username}'s turn`);
      }
    },

    handleActionTaken(data) {
      // Log actions from other players
      if (data.playerId !== this.currentUser.id) {
        const player = this.currentGame.players.find(p => p.id === data.playerId);
        const playerName = player ? player.username : 'Unknown';

        let actionText = `${playerName} ${data.action}s`;
        if (data.action === 'bet' || data.action === 'raise' || data.action === 'allIn') {
          actionText += ` ${data.amount} chips`;
        }

        this.addToLog(actionText);
      }
    },

    handleDealFlop() {
      this.addToLog('Flop is dealt');
    },

    handleDealTurn() {
      this.addToLog('Turn is dealt');
    },

    handleDealRiver() {
      this.addToLog('River is dealt');
    },

    handleHandResult(result) {
      this.handResult = result;
      this.showResult = true;

      const winnerNames = result.winners.map(winner => winner.username).join(', ');
      this.addToLog(`Hand complete. Winner(s): ${winnerNames}`);
    },

    handleNewHand(gameState) {
      this.addToLog('Starting a new hand');
      this.updateGameState(gameState);
    },

    handleGameEnded(data) {
      this.addToLog(`Game ended: ${data.message}`);
    },

    handleGameError(data) {
      this.SET_ERROR_MESSAGE(data.message);
      this.addToLog(`Error: ${data.message}`);
    },
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
    window.debugGame = {
      socket: null,
      game: this,
      requestUpdate: () => {
        if (this.gameId && this.currentUser) {
          console.log('Manually requesting game update for debugging');
          if (this.socket) {
            this.socket.emit('requestGameUpdate', {
              gameId: this.gameId,
              userId: this.currentUser.id
            });
          } else {
            console.error('Socket not available');
          }
        } else {
          console.error('Game ID or user not available');
        }
      },
      getState: () => {
        return {
          gameId: this.gameId,
          currentGame: this.currentGame,
          isConnected: this.isConnected,
          socket: this.socket ? {
            id: this.socket.id,
            connected: this.socket.connected,
            disconnected: this.socket.disconnected
          } : null
        };
      }
    };
    window.debugGame.socket = this.socket;
  },

  beforeDestroy() {
    // Remove event listeners
    SocketService.off('gameUpdate', this.handleGameUpdate);
    SocketService.off('gameStarted', this.handleGameStarted);
    SocketService.off('playerJoined', this.handlePlayerJoined);
    SocketService.off('playerLeft', this.handlePlayerLeft);
    SocketService.off('chatMessage', this.handleChatMessage);
    SocketService.off('dealCards', this.handleDealCards);
    SocketService.off('yourTurn', this.handleYourTurn);
    SocketService.off('turnChanged', this.handleTurnChanged);
    SocketService.off('actionTaken', this.handleActionTaken);
    SocketService.off('dealFlop', this.handleDealFlop);
    SocketService.off('dealTurn', this.handleDealTurn);
    SocketService.off('dealRiver', this.handleDealRiver);
    SocketService.off('handResult', this.handleHandResult);
    SocketService.off('newHand', this.handleNewHand);
    SocketService.off('gameEnded', this.handleGameEnded);
    SocketService.off('gameError', this.handleGameError);

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