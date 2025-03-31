<!-- client/src/views/Game.vue -->
<template>
  <div class="game-container">
    <GameHeader :gameId="gameId" :currentGame="currentGame" @copyGameId="copyGameId" @leaveGame="leaveGame" />

    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <div v-if="!currentGame" class="loading">
      Loading game...
    </div>

    <div v-else class="game-area">
      <!-- Game status -->
      <GameStatus :currentGame="currentGame" :gameId="gameId" :isCreator="isCreator" :isStarting="isStarting"
        @startGame="handleStartGame" @getCurrentPlayerName="getCurrentPlayerName" />

      <!-- Game table -->
      <div class="game-table">
        <!-- Community cards -->
        <CommunityCards :communityCards="currentGame.communityCards" :formatCard="formatCard" />

        <!-- Players -->
        <PlayerList :players="currentGame.players" :currentUser="currentUser" :currentTurn="currentGame.currentTurn"
          :playerHand="playerHand" :formatCard="formatCard" />

        <!-- Player actions -->
        <PlayerActions v-if="isYourTurn" :availableActions="availableActions" :currentGame="currentGame"
          :betAmount="betAmount" :raiseAmount="raiseAmount" @updateBetAmount="betAmount = $event"
          @updateRaiseAmount="raiseAmount = $event" @handleAction="handleAction"
          @getPlayerChipsInPot="getPlayerChipsInPot" @getCurrentPlayer="getCurrentPlayer" />
      </div>

      <!-- Game chat/log -->
      <GameLog :gameLog="gameLog" />
    </div>

    <!-- Debug toggle button -->
    <button @click="showDebugPanel = !showDebugPanel" class="debug-toggle">
      {{ showDebugPanel ? 'Hide Debug' : 'Show Debug' }}
    </button>

    <button @click="debugCreatorCheck()" class="debug-btn">Debug Creator Check</button>

    <!-- Debug panel -->
    <GameDebugPanel :enabled="showDebugPanel" :gameId="gameId" :currentGame="currentGame" :currentUser="currentUser"
      :isCreator="isCreator" :isConnected="isConnected" @close="showDebugPanel = false" @log="addToLog"
      @forceStart="forceStartGame" />
  </div>
</template>

<script>
import SocketService from '@/services/SocketService';
import { mapGetters, mapActions, mapMutations } from 'vuex';
import GameHeader from '@/components/Game/GameHeader.vue';
import GameStatus from '@/components/Game/GameStatus.vue';
import CommunityCards from '@/components/Game/CommunityCards.vue';
import PlayerList from '@/components/Game/PlayerList.vue';
import PlayerActions from '@/components/Game/PlayerActions.vue';
import GameLog from '@/components/Game/GameLog.vue';
import GameDebugPanel from '@/components/Game/GameDebugPanel.vue';
import {extractMongoId } from '@/utils/idUtils';

export default {
  name: 'Game',

  components: {
    GameHeader,
    GameStatus,
    CommunityCards,
    PlayerList,
    PlayerActions,
    GameLog,
    GameDebugPanel
  },

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
      actionTimer: null,
      actionTimeLimit: 30,
      actionTimeRemaining: 30,
      showDebugPanel: false
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
      if (!this.currentGame || !this.currentUser) {
        console.log('isCreator check failed: currentGame or currentUser is null');
        return false;
      }

      // Log the raw creator and user data for debugging
      console.log('Creator data:', JSON.stringify(this.currentGame.creator));
      console.log('Current user:', JSON.stringify(this.currentUser));

      // Extract creator ID
      let creatorId = null;

      // Handle MongoDB $oid structure
      if (this.currentGame.creator && this.currentGame.creator.user) {
        if (typeof this.currentGame.creator.user === 'object' && this.currentGame.creator.user.$oid) {
          creatorId = this.currentGame.creator.user.$oid;
        } else {
          creatorId = extractMongoId(this.currentGame.creator.user);
        }
      }

      if (!creatorId) {
        console.log('isCreator check failed: could not find creator ID');
        return false;
      }

      // Extract current user ID
      const currentUserId = extractMongoId(this.currentUser.id || this.currentUser._id);

      if (!currentUserId) {
        console.log('isCreator check failed: could not find current user ID');
        return false;
      }

      // Log the extracted IDs for debugging
      console.log('Extracted creator ID:', creatorId);
      console.log('Extracted user ID:', currentUserId);
      console.log('ID match:', creatorId === currentUserId);

      return creatorId === currentUserId;
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
      if (!this.currentGame || !this.currentGame.currentTurn) return 'N/A';

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

    copyGameId() {
      // Modern clipboard API
      navigator.clipboard.writeText(this.gameId)
        .then(() => {
          alert('Game ID copied to clipboard');
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
          alert('Game ID copied to clipboard');
        });
    },

    leaveGame() {
      if (confirm('Are you sure you want to leave the game?')) {
        SocketService.leaveGame(this.gameId, this.currentUser.id);
        this.$router.push('/lobby');
      }
    },

    async handleStartGame() {
      this.isStarting = true;
      this.addToLog('Attempting to start the game...');

      try {
        console.log('Starting game:', this.gameId);
        console.log('Current user:', this.currentUser);
        console.log('Players in game:', this.currentGame.players.length);

        // First call the API to update the game status
        const result = await this.startGame(this.gameId);

        if (result.success) {
          this.addToLog('Game started!');

          // Then emit the socket event
          console.log('Emitting socket startGame event');
          await SocketService.startGame(this.gameId, this.currentUser.id);
          console.log('Socket startGame event sent successfully');

          // Request a fresh game state update
          setTimeout(() => {
            this.addToLog('Requesting updated game state...');
            SocketService.requestGameUpdate(this.gameId, this.currentUser.id);
          }, 500);
        } else {
          console.error('Start game API returned error:', result.error);
          throw new Error(result.error || 'Failed to start game');
        }
      } catch (error) {
        console.error('Error starting game:', error);
        this.SET_ERROR_MESSAGE(error.message || 'Error starting game. Please try again.');
        this.addToLog(`Failed to start game: ${error.message}`);
      } finally {
        this.isStarting = false;
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
      const timestamp = new Date().toLocaleTimeString();
      this.gameLog.unshift(`[${timestamp}] ${message}`);

      // Keep log at reasonable size
      if (this.gameLog.length > 50) {
        this.gameLog.pop();
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

    startActionTimer(timeLimit = 30) {
      this.actionTimeLimit = timeLimit;
      this.actionTimeRemaining = timeLimit;

      // Clear any existing timer
      this.clearActionTimer();

      // Set a new timer that updates every second
      this.actionTimer = setInterval(() => {
        this.actionTimeRemaining--;

        if (this.actionTimeRemaining <= 0) {
          this.clearActionTimer();

          // Auto-fold when time runs out
          this.handleAction('fold');
          this.addToLog('Time ran out - auto-folding');
        }
      }, 1000);
    },

    clearActionTimer() {
      if (this.actionTimer) {
        clearInterval(this.actionTimer);
        this.actionTimer = null;
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
      // If it's a system message, add to game log
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

    /**
     * Debug the game state in the console
     */
    debugGameState() {
      console.group('Game State Debug');

      // Log basic game info
      console.log('Game ID:', this.gameId);
      console.log('Current user:', this.currentUser);
      console.log('Is creator:', this.isCreator);

      // Log game state
      if (this.currentGame) {
        console.log('Game status:', this.currentGame.status);
        console.log('Player count:', this.currentGame.players.length);
        console.log('Players:', this.currentGame.players);

        // Check creator comparison
        const creatorId = this.currentGame.creator && this.currentGame.creator.user ?
          (typeof this.currentGame.creator.user === 'object' ?
            this.currentGame.creator.user.toString() : this.currentGame.creator.user) : '';

        const currentUserId = this.currentUser ? this.currentUser.id.toString() : '';

        console.log('Creator ID:', creatorId);
        console.log('Current user ID:', currentUserId);
        console.log('IDs match:', creatorId === currentUserId);

        // Check button conditions
        console.log('Should show start button:',
          this.isCreator &&
          this.currentGame.status === 'waiting' &&
          this.currentGame.players.length >= 2);
      } else {
        console.log('No current game data');
      }

      // Log socket state
      console.log('Socket connected:', SocketService.isConnected);

      console.groupEnd();

      // Return status message
      return {
        status: this.currentGame ? this.currentGame.status : 'unknown',
        playerCount: this.currentGame ? this.currentGame.players.length : 0,
        isCreator: this.isCreator,
        socketConnected: SocketService.isConnected
      };
    },
    forceStartGame() {
      console.log('Force starting game through debug panel');
      this.handleStartGame();
    }
  },

  created() {
    this.gameId = this.$route.params.id;
    this.SET_CURRENT_GAME_ID(this.gameId);

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
      });

    // Make the debug function available globally
    window.debugGame = this.debugGameState.bind(this);
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
  },

  // Add this to your Game.vue methods:

  debugCreatorCheck() {
    console.group('Creator Check Debug');

    // Log the game and user data
    console.log('Current game:', this.currentGame);
    console.log('Current user:', this.currentUser);

    // Check if game and user exist
    if (!this.currentGame) {
      console.log('Game data is missing!');
      console.groupEnd();
      return false;
    }

    if (!this.currentUser) {
      console.log('User data is missing!');
      console.groupEnd();
      return false;
    }

    // Log the creator data
    console.log('Creator data:', this.currentGame.creator);

    if (!this.currentGame.creator) {
      console.log('Creator data is missing!');
      console.groupEnd();
      return false;
    }

    // Extract creator ID with detailed debugging
    let creatorId = null;

    if (this.currentGame.creator.user) {
      console.log('Creator user field exists');
      console.log('Creator user type:', typeof this.currentGame.creator.user);
      console.log('Creator user value:', this.currentGame.creator.user);

      if (typeof this.currentGame.creator.user === 'object' && this.currentGame.creator.user !== null) {
        console.log('Creator user is an object');

        if (this.currentGame.creator.user.$oid) {
          console.log('Found $oid structure:', this.currentGame.creator.user.$oid);
          creatorId = this.currentGame.creator.user.$oid;
        } else if (typeof this.currentGame.creator.user.toString === 'function') {
          console.log('Using toString() method');
          creatorId = this.currentGame.creator.user.toString();
        } else {
          console.log('Using JSON.stringify');
          creatorId = JSON.stringify(this.currentGame.creator.user);
        }
      } else {
        console.log('Creator user is not an object, using directly');
        creatorId = String(this.currentGame.creator.user);
      }
    }

    console.log('Extracted creator ID:', creatorId);

    // Extract user ID with detailed debugging
    let userId = null;

    if (this.currentUser.id) {
      console.log('Using currentUser.id');
      userId = String(this.currentUser.id);
    } else if (this.currentUser._id) {
      console.log('Using currentUser._id');
      if (typeof this.currentUser._id === 'object' && this.currentUser._id.$oid) {
        userId = this.currentUser._id.$oid;
      } else {
        userId = String(this.currentUser._id);
      }
    }

    console.log('Extracted user ID:', userId);
    console.log('IDs match:', creatorId === userId);

    console.groupEnd();

    this.addToLog(`Creator check: ${creatorId === userId ? 'You are the creator' : 'You are NOT the creator'}`);

    return creatorId === userId;
  }
};
</script>

<style scoped>
.game-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
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

.game-table {
  grid-area: table;
  background-color: #1c4e38;
  border-radius: 8px;
  padding: 20px;
  min-height: 400px;
  position: relative;
}

@media (max-width: 768px) {
  .game-area {
    grid-template-columns: 1fr;
    grid-template-areas:
      "status"
      "table"
      "log";
  }
}

.debug-toggle {
  position: fixed;
  bottom: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  z-index: 900;
}
</style>