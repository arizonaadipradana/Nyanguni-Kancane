<!-- client/src/views/Game.vue -->
<template>
  <div class="game-container">
    <GameHeader :gameId="gameId" :currentGame="currentGame" @copyGameId="copyGameId" @leaveGame="leaveGame" />

    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}

      <!-- Add this connection fix button -->
      <div class="error-actions">
        <button @click="diagnoseAndFix" class="btn-fix">
          Diagnose & Fix Connection
        </button>
      </div>
    </div>

    <div v-if="!currentGame" class="loading">
      Loading game...
    </div>

    <div v-else class="game-area">
      <div class="game-status-wrapper">
        <GameStatus :currentGame="currentGame" :gameId="gameId" :isCreator="isCreator" :isStarting="isStarting"
          :gameInitialized="gameInitialized" :key="currentGame ? currentGame.status + '-' + gameInitialized : 'loading'"
          @startGame="handleStartGame" @getCurrentPlayerName="getCurrentPlayerName"
          @requestInitialization="requestInitialization" @requestStateUpdate="requestStateUpdate" />
      </div>

      <!-- Game table -->
      <div class="game-table">
        <!-- Community cards -->
        <CommunityCards :communityCards="currentGame && currentGame.communityCards ? currentGame.communityCards : []"
          :formatCard="formatCard" />

        <!-- Players -->
        <PlayerList :players="getVisiblePlayers()" :currentUser="currentUser"
          :currentTurn="currentGame ? currentGame.currentTurn : null" :playerHand="playerHand"
          :formatCard="formatCard" />

        <!-- Player actions -->
        <PlayerActions v-if="isYourTurn || shouldShowActions()" :availableActions="availableActions"
          :currentGame="currentGame" :betAmount="betAmount" :raiseAmount="raiseAmount"
          :actionTimeLimit="actionTimeLimit" :isYourTurn="isYourTurn" @updateBetAmount="betAmount = $event"
          @updateRaiseAmount="raiseAmount = $event" @handleAction="handleAction" @timeWarning="handleTimeWarning"
          @getPlayerChipsInPot="getPlayerChipsInPot" @getCurrentPlayer="getCurrentPlayer" />
      </div>

      <!-- Game chat/log (flex container for chat and log) -->
      <div class="game-info-container">
        <GameLog :gameLog="gameLog" />
        <GameChat :gameId="gameId" :currentUser="currentUser" :isConnected="isConnected" />
      </div>
    </div>

    <WinnerDisplay :result="currentHandResult" :visible="showWinnerDisplay" :formatCard="formatCard" :displayTime="15"
      @close="closeWinnerDisplay" />

    <div v-if="isReconnecting" class="reconnecting-overlay">
      <div class="reconnecting-message">
        <div class="spinner"></div>
        <p>Reconnecting to game...</p>
      </div>
    </div>

    <!-- Debug toggle button -->
    <button @click="showDebugPanel = !showDebugPanel" class="debug-toggle">
      {{ showDebugPanel ? 'Hide Debug' : 'Show Debug' }}
    </button>

    <!-- Debug panel -->
    <GameDebugPanel :enabled="showDebugPanel" :gameId="gameId" :currentGame="currentGame" :currentUser="currentUser"
      :isCreator="isCreator" :isConnected="isConnected" @close="showDebugPanel = false" @log="addToLog"
      @forceStart="forceStartGame" />

    <DebugPlayerVisibility :visible="showPlayerDebug" :currentGame="currentGame" :currentUser="currentUser"
      :visiblePlayers="getVisiblePlayers()" @close="showPlayerDebug = false" @refresh="forceRefreshPlayers" />

    <!-- Debug toggle button for player visibility -->
    <button @click="showPlayerDebug = !showPlayerDebug" class="player-debug-toggle">
      {{ showPlayerDebug ? 'Hide Player Debug' : 'Debug Players' }}
    </button>
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
import GameHandlers from '@/components/Game/GameHandlers';
import { formatCard, getDefaultOptions, addToGameLog } from '@/utils/gameUtils';
import GameChat from '@/components/Game/GameChat.vue';
import WinnerDisplay from '@/components/Game/WinnerDisplay.vue';
import io from 'socket.io-client';
import DebugPlayerVisibility from '@/components/Game/DebugPlayerVisibility.vue';


export default {
  name: 'Game',

  components: {
    GameHeader,
    GameStatus,
    CommunityCards,
    PlayerList,
    PlayerActions,
    GameLog,
    GameDebugPanel,
    GameChat,
    WinnerDisplay,
    DebugPlayerVisibility
  },

  watch: {
    // Watch for changes to the player hand
    playerHand: {
      handler(newHand) {
        if (newHand && newHand.length > 0) {
          console.log('Game.vue detected player hand change:',
            newHand.map(c => `${c.rank} of ${c.suit}`).join(', '));
          this.forceCardUpdate();
        }
      },
      deep: true
    },

    // Watch for changes to the current game object
    'currentGame': {
      handler(newGame, oldGame) {
        // Check if player count has changed
        const newPlayers = newGame?.players?.length || 0;
        const oldPlayers = oldGame?.players?.length || 0;

        if (newPlayers !== oldPlayers) {
          console.log(`Player count changed: ${oldPlayers} -> ${newPlayers}`);
          // Force update to ensure UI reflects the change
          this.$forceUpdate();
        }

        // Check for allPlayers array
        if (newGame?.allPlayers && Array.isArray(newGame.allPlayers)) {
          const totalPlayers = newGame.allPlayers.length;
          console.log(`Game has ${totalPlayers} total players in allPlayers array`);
        }
      },
      deep: true
    },

    // Watch for changes to the error message
    errorMessage(newValue) {
      if (newValue) {
        console.error('Game error:', newValue);
      }
    }
  },

  data() {
    return {
      gameId: '',
      socket: null,
      isConnected: false,
      isStarting: false,
      gameLog: [],
      lastLogMessages: [],
      betAmount: 1,
      raiseAmount: 0,
      showResult: false,
      handResult: null,
      actionTimer: null,
      actionTimeLimit: 30,
      actionTimeRemaining: 30,
      showDebugPanel: false,
      explicitIsCreator: false,
      gameInProgress: false,
      gameInitialized: false,
      messageDedupeTime: 1000,
      isYourTurnProcessed: false,
      setupComplete: false,
      handlers: null, // Will store event handlers
      eventHandlers: [], // Track registered handlers for cleanup
      isYourTurn: false,
      showWinnerDisplay: false,
      currentHandResult: null,
      isReconnecting: false, // Add this missing property
      availableActions: [],
      cardRefreshInterval: null,
      showPlayerDebug: false,
    };
  },

  computed: {
    ...mapGetters([
      'currentUser',
      'currentGame',
      'errorMessage',
    ]),

    // Create a computed property with both getter and setter
    playerHand: {
      get() {
        return this.$store.getters.playerHand || [];
      },
      set(newHand) {
        // Use a proper mutation to update the hand
        this.$store.commit('SET_PLAYER_HAND', newHand);
      }
    },

    // Include availableActions from store or local data
    availableActions() {
      return this.$store.getters.availableActions || this.availableActions || [];
    },

    isAuthenticated() {
      return !!this.$store.getters.token || !!localStorage.getItem('token');
    },

    isCreator() {
      if (!this.currentGame || !this.currentUser) {
        console.log('isCreator check failed: missing required data');
        return false;
      }

      // PRIMARY METHOD: Use creator field if available
      if (this.currentGame.creator && this.currentGame.creator.user) {
        // Extract creator ID - handle different formats
        let creatorId = '';
        if (typeof this.currentGame.creator.user === 'object' && this.currentGame.creator.user.$oid) {
          creatorId = this.currentGame.creator.user.$oid;
        } else if (typeof this.currentGame.creator.user === 'string') {
          creatorId = this.currentGame.creator.user;
        } else if (typeof this.currentGame.creator.user.toString === 'function') {
          creatorId = this.currentGame.creator.user.toString();
        } else {
          creatorId = String(this.currentGame.creator.user);
        }

        // Extract user ID
        const userId = String(this.currentUser.id || this.currentUser._id);

        console.log('Creator ID for comparison:', creatorId);
        console.log('User ID for comparison:', userId);

        return creatorId === userId;
      }

      // FALLBACK METHOD: If creator field is missing, assume the first player is the creator
      console.log('No creator field found - using fallback method');

      // Check if the current user is the first player
      if (this.currentGame.players && this.currentGame.players.length > 0) {
        const firstPlayer = this.currentGame.players[0];
        const firstPlayerId = String(firstPlayer.id || firstPlayer.user || '');
        const currentUserId = String(this.currentUser.id || this.currentUser._id || '');

        console.log('First player ID:', firstPlayerId);
        console.log('Current user ID:', currentUserId);
        console.log('Is first player? (fallback):', firstPlayerId === currentUserId);

        return firstPlayerId === currentUserId;
      }

      if (this.explicitIsCreator) {
        console.log('Using explicit creator status: true');
        return true;
      }

      return false;
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

    // Common methods from gameUtils.js
    formatCard,
    getDefaultOptions,

    yourTurn(data) {
      // Update local state
      this.isYourTurn = true;
      this.availableActions = data.options || [];
      this.actionTimeLimit = data.timeLimit || 60;

      // Log the received options for debugging
      console.log(`Your turn with options:`, this.availableActions);

      // Update store state as well
      this.$store.commit('SET_YOUR_TURN', true);
      this.$store.commit('SET_AVAILABLE_ACTIONS', data.options || []);
    },

    getCurrentPlayerName() {
      if (!this.currentGame || !this.currentGame.currentTurn) return 'N/A';

      const player = this.currentGame.players.find(
        p => p.id === this.currentGame.currentTurn
      );

      return player ? player.username : 'Unknown';
    },

    endTurn() {
      // Update local state
      this.isYourTurn = false;
      this.availableActions = [];

      // Update store state
      this.$store.commit('SET_YOUR_TURN', false);
      this.$store.commit('SET_AVAILABLE_ACTIONS', []);

      this.isYourTurnProcessed = false;

      // Force component update
      this.$forceUpdate();
    },

    /**
 * Get the current player object for the current user
 * @returns {Object|null} Player object or null if not found
 */
    getCurrentPlayer() {
      if (!this.currentGame || !this.currentUser) return null;

      // Find the player with the current user's ID
      const player = this.currentGame.players.find(
        p => p.id === this.currentUser.id ||
          (p.user && p.user.toString() === this.currentUser.id.toString())
      );

      return player || null;
    },

    /**
 * Get the amount of chips the current player has committed to the pot
 * @returns {Number} Number of chips in pot
 */
    getPlayerChipsInPot() {
      const player = this.getCurrentPlayer();
      return player ? (player.chips || 0) : 0;
    },

    copyGameId() {
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
      this.clearErrorMessage();

      try {
        console.log('Starting game:', this.gameId);
        console.log('Current user:', this.currentUser);
        console.log('Is creator:', this.isCreator);
        console.log('Players in game:', this.currentGame.players.length);

        // Step 1: First check if game is already active
        if (this.currentGame.status === 'active') {
          this.addToLog('Game is already active, refreshing state...');

          // Request updated game state
          this.requestStateUpdate();

          // Consider game started
          this.gameInProgress = true;
          return;
        }

        // Step 2: Call API to update game status
        const apiResult = await this.startGame(this.gameId);

        if (apiResult.success) {
          this.addToLog('Game started on server, initializing...');

          // Immediately set gameInProgress to prevent duplicate starts
          this.gameInProgress = true;

          // Request a game state update instead of sending socket event
          setTimeout(() => {
            this.requestStateUpdate();

            // If we don't get cards within 2 seconds, try direct socket method
            setTimeout(() => {
              if (this.playerHand.length === 0) {
                console.log('No cards received yet, trying direct socket method');
                this.triggerGameInitialize();
              }
            }, 2000);
          }, 500);
        } else {
          // Handle API error
          console.error('Start game API returned error:', apiResult.error);
          throw new Error(apiResult.error || 'Failed to start game on the server');
        }
      } catch (error) {
        console.error('Error starting game:', error);

        // Special handling for "already started" error - treat as success
        if (error.message && error.message.includes('already been started')) {
          this.addToLog('Game is already in progress, refreshing state...');
          this.gameInProgress = true;

          // Request updated game state
          this.requestStateUpdate();
        } else {
          this.SET_ERROR_MESSAGE(error.message || 'Error starting game. Please try again.');
          this.addToLog(`Failed to start game: ${error.message}`);
        }
      } finally {
        this.isStarting = false;
      }
    },

    triggerGameInitialize() {
      // This is a fallback method to initialize the game if the gameUpdate doesn't work
      SocketService.gameSocket?.emit('initializeGame', {
        gameId: this.gameId,
        userId: this.currentUser.id
      });

      this.addToLog('Sent initialize game request');
    },

    /**
 * Handle an action from the current player
 * @param {String} action - Action type (fold, check, call, bet, raise, allIn)
 * @param {Number} amount - Bet amount (for bet, raise, call actions)
 */
    handleAction(action, amount = 0) {
      if (!this.isYourTurn) {
        console.warn('Not your turn - ignoring action');
        return;
      }

      // Clear any existing timer by calling stopTimer on the TurnTimer component
      if (this.$refs.turnTimer) {
        this.$refs.turnTimer.stopTimer();
      }

      // Clear any existing timer
      this.clearActionTimer();

      // Immediately end the turn in UI to prevent double actions
      this.endTurn();

      // Validate and sanitize amount for relevant actions
      if (action === 'bet' || action === 'raise' || action === 'call') {
        // Ensure amount is a valid number
        amount = parseFloat(amount);
        if (isNaN(amount)) {
          console.error(`Invalid amount for ${action}: ${amount}`);
          // Set sensible defaults for different actions
          if (action === 'call') {
            const currentBet = this.currentGame.currentBet || 0;
            const playerChips = this.getPlayerChipsInPot();
            amount = Math.max(0, currentBet - playerChips);
          } else {
            amount = 1; // Default minimum bet/raise
          }
        }
      }

      console.log(`Sending player action: ${action} with amount: ${amount}`);

      // Send action to server via socket
      SocketService.sendPlayerAction(
        this.gameId,
        this.currentUser.id,
        action,
        amount
      );

      // Update local state
      this.$store.dispatch('performAction', { action, amount });

      // Create log message
      let logMessage = `You ${action}`;
      if (action === 'bet' || action === 'raise') {
        logMessage += ` ${amount} chips`;
      } else if (action === 'call' && amount > 0) {
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
      const result = addToGameLog(this.gameLog, this.lastLogMessages, message, this.messageDedupeTime);
      this.gameLog = result.gameLog;
      this.lastLogMessages = result.lastLogMessages;
    },

    async _originalSetupSocketConnection() {
      try {
        // Initialize the socket service and connect to the game
        await SocketService.init();

        // Join the game room
        await SocketService.joinGame(
          this.gameId,
          this.currentUser.id,
          this.currentUser.username
        );

        // IMPORTANT: Update the isConnected flag based on the SocketService status
        this.isConnected = SocketService.isSocketConnected();

        this.addToLog('Connected to game server');

        // Create socket event handlers
        this.handlers = GameHandlers.createHandlers(this);

        // Register event handlers
        const events = [
          'gameUpdate', 'gameStarted', 'playerJoined', 'playerLeft',
          'chatMessage', 'dealCards', 'yourTurn', 'turnChanged',
          'actionTaken', 'dealFlop', 'dealTurn', 'dealRiver',
          'handResult', 'newHand', 'gameEnded', 'gameError', 'creatorInfo', 'forceCardUpdate',
        ];

        events.forEach(event => {
          const handlerName = `handle${event.charAt(0).toUpperCase() + event.slice(1)}`;
          if (this.handlers[handlerName]) {
            const handler = this.handlers[handlerName];
            SocketService.on(event, handler);

            // Track for cleanup
            this.eventHandlers.push({ event, handler });
          }
        });

        // Add a connect listener to update isConnected when the socket connects
        SocketService.gameSocket.on('connect', () => {
          console.log('Socket connected event received');
          this.isConnected = true;
        });

        // Add a disconnect listener to update isConnected when the socket disconnects
        SocketService.gameSocket.on('disconnect', () => {
          console.log('Socket disconnected event received');
          this.isConnected = false;
        });

        // Request an initial game state update with retry logic
        this.requestGameState();
        return true;
      } catch (error) {
        console.error('Error setting up socket connection:', error);
        this.addToLog('Failed to connect to game server');
        this.isConnected = false;

        // Set up auto-reconnect
        setTimeout(() => {
          if (!this.isConnected) {
            console.log('Attempting to reconnect...');
            this.setupSocketConnection();
          }
        }, 3000);
        return false;
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

    requestInitialization() {
      this.addToLog('Requesting game initialization...');
      this.triggerGameInitialize();
    },

    requestStateUpdate() {
      this.addToLog('Requesting game state update...');

      if (!this.currentUser || !this.currentUser.id) {
        console.warn("Cannot request update - no user ID");
        return;
      }

      if (!this.gameId) {
        console.warn("Cannot request update - no game ID");
        return;
      }

      // First try via socket service
      SocketService.requestGameUpdate(this.gameId, this.currentUser.id)
        .then(success => {
          if (!success) {
            console.log("Socket update failed, trying API fallback");

            // Fallback to API if socket fails
            this.$store.dispatch('fetchGame', this.gameId)
              .catch(err => {
                console.error("API fallback also failed:", err);
                this.SET_ERROR_MESSAGE("Failed to update game state");
              });
          }
        })
        .catch(err => {
          console.error("Error requesting game update:", err);
          this.addToLog("Error updating game state");
        });
    },

    shouldShowActions() {
      // If game isn't active, don't show actions
      if (!this.currentGame || this.currentGame.status !== 'active') {
        return false;
      }

      // Don't show actions if it's explicitly not your turn
      if (!this.isYourTurn) {
        return false;
      }

      // Don't show actions if we're displaying the winner
      if (this.showWinnerDisplay) {
        return false;
      }

      // Make sure we have a current user and valid turn data
      if (!this.currentUser || !this.currentGame.currentTurn) {
        return false;
      }

      // Check if the current turn actually matches the current user
      const currentTurnId = String(this.currentGame.currentTurn);
      const userId = String(this.currentUser.id || this.currentUser._id);

      return currentTurnId === userId && this.gameInitialized;
    },

    forceStartGame() {
      console.log('Force starting game through debug panel');
      this.handleStartGame();
    },

    async fetchGameWithRetry(gameId, maxRetries = 3) {
      let retries = 0;

      while (retries < maxRetries) {
        try {
          console.log(`Attempt ${retries + 1} to fetch game data`);
          const result = await this.fetchGame(gameId);

          if (result.success) {
            console.log('Successfully fetched game data');
            return result;
          }

          throw new Error(result.error || 'Failed to fetch game');
        } catch (error) {
          console.error(`Fetch attempt ${retries + 1} failed:`, error);
          retries++;

          if (retries >= maxRetries) {
            console.error(`Failed to fetch game after ${maxRetries} attempts`);
            throw error;
          }

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    },
    forceCardUpdate() {
      // This method manually forces all components to update
      this.$forceUpdate();

      // Also force child components to update
      this.$children.forEach(child => {
        if (typeof child.$forceUpdate === 'function') {
          child.$forceUpdate();
        }
      });

      // Log for debugging
      console.log("Forced game component update");
    },
    handleHandResult(result) {
      console.log("Hand result received:", result);
      this.currentHandResult = result;
      this.showWinnerDisplay = true;

      // Make sure we have all the data needed for display
      if (!this.currentHandResult.communityCards && this.currentGame && this.currentGame.communityCards) {
        this.currentHandResult.communityCards = this.currentGame.communityCards;
      }

      // Add a message to the game log
      const winners = result.winners || [];
      if (winners.length > 0) {
        const winnerNames = winners.map(w => w.username).join(', ');
        this.addToLog(`Hand complete. Winner(s): ${winnerNames}`);
      } else {
        this.addToLog('Hand complete.');
      }
    },

    closeWinnerDisplay() {
      this.showWinnerDisplay = false;

      // Force a game state update after closing the winner display
      // This ensures chip balances are synchronized
      this.requestStateUpdate();
    },

    handleTimeWarning() {
      // This could show a notification or play a sound
      this.addToLog('Warning: 15 seconds remaining for your turn');
    },
    // Reconnection handling
    async checkForReconnection() {
      const reconnectInfo = SocketService.checkForPendingReconnection();
      if (reconnectInfo && reconnectInfo.gameId === this.gameId) {
        console.log('Found pending reconnection:', reconnectInfo);
        this.isReconnecting = true;

        try {
          // Attempt to reconnect
          const success = await SocketService.reconnectToGame(
            reconnectInfo.gameId,
            reconnectInfo.userId,
            reconnectInfo.username
          );

          if (success) {
            this.addToLog('Successfully reconnected to game');
          } else {
            this.addToLog('Failed to reconnect. Please refresh the page.');
          }
        } catch (error) {
          console.error('Reconnection error:', error);
          this.addToLog('Error during reconnection. Please refresh the page.');
        } finally {
          this.isReconnecting = false;
        }
      }
    },
    async setupSocketConnection() {
      const result = await this._originalSetupSocketConnection();

      // Add custom reconnection handling
      if (result && SocketService.gameSocket) {
        // Setup reconnection handlers
        if (typeof SocketService.setupReconnectionHandlers === 'function') {
          SocketService.setupReconnectionHandlers();
        }

        // Check for pending reconnection
        if (typeof SocketService.checkForPendingReconnection === 'function') {
          this.checkForReconnection();
        }
      }

      return result;
    },

    async diagnoseAndFix() {
      this.SET_ERROR_MESSAGE('Diagnosing connection issues...');

      try {
        // First, check server status
        try {
          const response = await fetch('/api/server-status');
          if (response.ok) {
            const status = await response.json();
            console.log('Server status:', status);
            this.addToLog('Server is running, attempting to fix socket connection...');
          }
        } catch (error) {
          console.warn('Could not check server status:', error);
          // Continue anyway - error checking server doesn't mean we can't fix the socket
        }

        // Force disconnect any existing socket
        if (SocketService.gameSocket) {
          SocketService.gameSocket.disconnect();
          SocketService.gameSocket = null;
        }

        // Direct socket connection with no dependencies
        const socketUrl = 'http://localhost:5000';
        console.log('Connecting directly to:', socketUrl);

        // Import io directly to avoid "io is not defined" errors
        try {
          // Try to use the imported io if available
          const io = (await import('socket.io-client')).default;

          // Create a new socket with polling (most reliable)
          const socket = io(`${socketUrl}/game`, {
            transports: ['polling'],
            reconnection: true,
            timeout: 20000,
            forceNew: true
          });

          // Set up connection events
          await new Promise((resolve, reject) => {
            // Connection successful
            socket.on('connect', () => {
              console.log('Socket connected successfully:', socket.id);
              SocketService.gameSocket = socket;
              SocketService.isConnected = true;
              this.isConnected = true;

              // Register user
              if (this.currentUser && this.currentUser.id) {
                socket.emit('register', { userId: this.currentUser.id });

                // Join game
                if (this.gameId) {
                  socket.emit('joinGame', {
                    gameId: this.gameId,
                    userId: this.currentUser.id,
                    username: this.currentUser.username
                  });

                  console.log(`Joined game ${this.gameId}`);
                }
              }

              resolve(true);
            });

            // Connection error
            socket.on('connect_error', (error) => {
              console.error('Socket connection error:', error);
              reject(new Error(`Socket connection failed: ${error.message}`));
            });

            // Set timeout
            setTimeout(() => {
              if (!socket.connected) {
                reject(new Error('Connection timeout after 10 seconds'));
              }
            }, 10000);
          });

          // If we get here, connection was successful
          this.SET_ERROR_MESSAGE('');
          this.addToLog('Connection fixed! Game loading...');

          // Request game state
          setTimeout(() => {
            if (SocketService.gameSocket && SocketService.isConnected) {
              SocketService.gameSocket.emit('requestGameUpdate', {
                gameId: this.gameId,
                userId: this.currentUser.id
              });
            }
          }, 1000);

        } catch (importError) {
          console.error('Error importing socket.io-client:', importError);

          // Try using window.io as fallback if available
          if (typeof window.io !== 'undefined') {
            this.addToLog('Trying to connect using CDN fallback...');

            const socket = window.io(`${socketUrl}/game`, {
              transports: ['polling'],
              reconnection: true,
              timeout: 20000,
              forceNew: true
            });

            // Similar connection logic as above
            // ... (same code as above for socket events)
          } else {
            throw new Error('Socket.IO client not available');
          }
        }

      } catch (error) {
        console.error('Connection fix failed:', error);
        this.SET_ERROR_MESSAGE(`Connection failed: ${error.message}. Try refreshing the page.`);
      }
    },
    async checkServerStatus() {
      try {
        // Call the server status endpoint
        const response = await fetch('/api/server-status');

        if (!response.ok) {
          return {
            success: false,
            message: `Server returned status ${response.status}`,
            details: await response.text()
          };
        }

        const status = await response.json();
        console.log('Server status:', status);

        return {
          success: true,
          status
        };
      } catch (error) {
        console.error('Error checking server status:', error);
        return {
          success: false,
          message: 'Could not connect to server',
          error
        };
      }
    },

    receiveCards(data) {
      if (!data || !data.hand) return;

      console.log('Received new cards:', data.hand.map(c => `${c.rank} of ${c.suit}`).join(', '));

      // Use store dispatch to avoid reactivity issues
      this.$store.dispatch('forceUpdatePlayerHand', data.hand);

      // Also update our local reactive state
      this.playerHand = data.hand;
    },

    handleNewHand(gameState) {
      this.addToLog("Starting a new hand");
      this.updateGameState(gameState);

      // Make sure to hide winner display if it's still showing
      this.showWinnerDisplay = false;

      // Reset any current player turn state
      this.isYourTurn = false;
      this.availableActions = [];

      // Force UI update
      this.$forceUpdate();
    },

    debugCurrentPlayer() {
      if (!this.currentGame || !this.currentUser) {
        console.log('No game or user data available');
        return;
      }

      const player = this.currentGame.players.find(
        p => p.id === this.currentUser.id
      );

      if (!player) {
        console.log('Current player not found in game players list!');
        console.log('Current user ID:', this.currentUser.id);
        console.log('Game players:', this.currentGame.players.map(p => ({ id: p.id, username: p.username })));
        return;
      }

      console.log('Current player state:', {
        id: player.id,
        username: player.username,
        chips: player.chips,
        totalChips: player.totalChips,
        isActive: player.isActive,
        hasFolded: player.hasFolded,
        hasActed: player.hasActed,
        isAllIn: player.isAllIn
      });
      console.log('Game state:', {
        currentTurn: this.currentGame.currentTurn,
        currentBet: this.currentGame.currentBet,
        bettingRound: this.currentGame.bettingRound,
        pot: this.currentGame.pot
      });
    },
    debugGameState() {
      console.log("=== GAME STATE DEBUG ===");
      console.log("Current Game:", this.currentGame);
      console.log("Current User:", this.currentUser);
      console.log("Is Creator:", this.isCreator);
      console.log("Is Connected:", this.isConnected);
      console.log("Is Your Turn:", this.isYourTurn);
      console.log("Available Actions:", this.availableActions);
      console.log("Player Hand:", this.playerHand);
      console.log("Game Initialized:", this.gameInitialized);
      console.log("Game In Progress:", this.gameInProgress);

      // Check for players in the game
      if (this.currentGame && this.currentGame.players) {
        console.log(`Players (${this.currentGame.players.length}):`);
        this.currentGame.players.forEach((player, index) => {
          console.log(`  Player ${index}: ${player.username} (ID: ${player.id})`);
        });
      } else {
        console.log("No players found in game state");
      }

      // Check if current user is in the players list
      if (this.currentUser && this.currentGame && this.currentGame.players) {
        const foundPlayer = this.currentGame.players.find(p =>
          p.id === this.currentUser.id ||
          (this.currentUser._id && p.id === this.currentUser._id)
        );

        if (foundPlayer) {
          console.log("Current user found in players list:", foundPlayer);
        } else {
          console.warn("IMPORTANT: Current user NOT found in players list!");
          console.log("Current User ID:", this.currentUser.id);
          console.log("Player IDs:", this.currentGame.players.map(p => p.id));
        }
      }

      console.log("=======================");
    },

    // Add this method to force resynchronization if a player can't see others:
    forceSyncPlayers() {
      if (!this.currentGame || !this.gameId) {
        console.warn("Cannot sync - no current game");
        this.addToLog("Cannot sync - no game loaded");
        return;
      }

      this.addToLog("Forcing player list synchronization...");

      // First request a game state update
      this.requestStateUpdate();

      // Then set up a delayed follow-up to check if it worked
      setTimeout(() => {
        if (this.currentGame && this.currentGame.players) {
          this.addToLog(`Synchronized with ${this.currentGame.players.length} players`);

          // Force UI update
          this.$forceUpdate();

          // Find all child components and force update them too
          this.$children.forEach(child => {
            if (typeof child.$forceUpdate === 'function') {
              child.$forceUpdate();
            }
          });
        } else {
          this.addToLog("Sync failed - please try again");
        }
      }, 2000);
    },

    fixPlayerVisibility() {
      if (!this.currentGame || !this.gameId || !this.currentUser) {
        this.addToLog("Cannot fix player visibility - missing data");
        return;
      }

      this.addToLog("Attempting to fix player visibility...");

      // First check if we're properly connected
      if (!this.isConnected) {
        // Try to reconnect first
        this.addToLog("Reconnecting to game server...");
        SocketService.init()
          .then(() => {
            return SocketService.joinGame(
              this.gameId,
              this.currentUser.id,
              this.currentUser.username
            );
          })
          .then(() => {
            this.addToLog("Reconnected and joined game");
            this.forceSyncPlayers();
          })
          .catch(err => {
            console.error("Error reconnecting:", err);
            this.addToLog("Failed to reconnect");
          });
        return;
      }

      // If we're connected but don't see players, force rejoin
      this.addToLog("Rejoining game to refresh player list...");
      SocketService.leaveGame(this.gameId, this.currentUser.id);

      // Short delay before rejoining
      setTimeout(() => {
        SocketService.joinGame(
          this.gameId,
          this.currentUser.id,
          this.currentUser.username
        )
          .then(() => {
            this.addToLog("Rejoined game");
            this.forceSyncPlayers();
          })
          .catch(err => {
            console.error("Error rejoining:", err);
            this.addToLog("Failed to rejoin");
          });
      }, 1000);
    },
    /**
 * Get the visible players - combines players from multiple sources to ensure visibility
 * @returns {Array} Combined list of players from all available sources
 */
    /**
 * Get the visible players - combines players from multiple sources to ensure visibility
 * @returns {Array} Combined list of players from all available sources
 */
    getVisiblePlayers() {
      // No game loaded yet
      if (!this.currentGame) return [];

      // Start with the regular players array
      let players = this.currentGame.players || [];

      // If we have allPlayers array (from enhanced server response), merge with players
      if (this.currentGame.allPlayers && Array.isArray(this.currentGame.allPlayers)) {
        // Create a set of existing player IDs for fast lookup
        const existingPlayerIds = new Set(players.map(p => p.id));

        // Add any players from allPlayers that aren't already in players
        this.currentGame.allPlayers.forEach(player => {
          if (!existingPlayerIds.has(player.id)) {
            // Create a full player object with default values
            players.push({
              id: player.id,
              username: player.username,
              chips: 0,
              totalChips: 0,
              hasCards: false,
              hasFolded: false,
              hasActed: false,
              isAllIn: false,
              isActive: player.isActive !== undefined ? player.isActive : true,
              position: player.position || 0
            });
            console.log(`Added missing player to display: ${player.username}`);
          }
        });
      }

      // Log the players we're displaying
      console.log(`Displaying ${players.length} players:`,
        players.map(p => p.username).join(', '));

      return players;
    },
    forceRefreshPlayers() {
      // Request fresh game state
      this.requestStateUpdate();

      // Force component updates
      this.$forceUpdate();
      this.$nextTick(() => {
        if (this.$refs.playerList && typeof this.$refs.playerList.forceUpdate === 'function') {
          this.$refs.playerList.forceUpdate();
        }
      });

      // Add a log message
      this.addToLog('Forcing player refresh...');

      // Try to reset the socket connection if there are issues
      setTimeout(() => {
        // Only reconnect if player count seems wrong
        if (this.currentGame && this.currentGame.players &&
          this.currentGame.players.length < 2 && this.isCreator) {

          this.addToLog('Attempting to fix player visibility with socket reset...');

          // Disconnect and reconnect
          SocketService.disconnect();

          setTimeout(() => {
            SocketService.init()
              .then(() => {
                return SocketService.joinGame(
                  this.gameId,
                  this.currentUser.id,
                  this.currentUser.username
                );
              })
              .then(() => {
                this.addToLog('Socket reconnected');
                this.requestStateUpdate();
              })
              .catch(err => {
                console.error('Reconnection error:', err);
                this.addToLog('Reconnection failed');
              });
          }, 1000);
        }
      }, 2000);
    },
  },

  created() {
    this.gameId = this.$route.params.id;
    this.SET_CURRENT_GAME_ID(this.gameId);

    // Ensure we clear any previous game state
    this.clearErrorMessage();

    console.log(`Initializing game with ID: ${this.gameId}`);
  },

  async mounted() {
    // Get token from localStorage 
    const token = localStorage.getItem('token');
    const isAuthenticated = !!token;

    // Check authentication but avoid redirect loop
    if (!isAuthenticated) {
      console.log('User not authenticated, redirecting to login');
      this.SET_ERROR_MESSAGE('Please login to view this game');

      // Use replace instead of push to avoid the redirect error
      this.$router.replace('/login');
      return;
    }

    // If we're authenticated but don't have user data, try to fetch it
    if (!this.currentUser && token) {
      console.log('No user data, attempting to fetch');
      this.$store.dispatch('fetchUserData').catch(err => {
        console.error('Error fetching user data:', err);
      });
    }

    // Continue with normal initialization
    this.gameId = this.$route.params.id;
    this.SET_CURRENT_GAME_ID(this.gameId);
    this.clearErrorMessage();

    console.log(`Initializing game with ID: ${this.gameId}`);

    try {
      // Fetch game data with retry logic
      this.fetchGameWithRetry(this.gameId, 3).then(() => {
        if (this.currentGame) {
          this.addToLog(`Joined game #${this.gameId}`);

          // Update local game state based on fetched data
          if (this.currentGame.status === 'active') {
            this.gameInProgress = true;
            this.addToLog('Game is already active');
          }

          // Set up socket connection
          this.setupSocketConnection().then(() => {
            // Once connected, ensure we get regular updates
            if (this.currentUser && this.gameId) {
              // Request a game state update
              if (SocketService.isSocketConnected()) {
                this.requestStateUpdate();
              }

              // Additional check for active but uninitialized game
              setTimeout(() => {
                if (this.currentGame?.status === 'active' && !this.gameInitialized && this.isCreator) {
                  console.log('Game is active but not initialized, requesting initialization');
                  this.requestInitialization();
                }
              }, 2000);
            }
          });
        } else {
          throw new Error('Failed to load game data');
        }
      });
    } catch (error) {
      console.error('Error setting up game:', error);
      this.SET_ERROR_MESSAGE('Failed to load game. Please try again.');
    }

    // Add a card refresh interval
    this.cardRefreshInterval = setInterval(() => {
      if (this.playerHand && this.playerHand.length > 0) {
        // If we have cards, check if the UI needs updating
        this.forceCardUpdate();
      }
    }, 2000); // Check every 2 seconds
  },

  beforeDestroy() {
    // Remove event listeners
    this.eventHandlers.forEach(({ event, handler }) => {
      SocketService.off(event, handler);
    });

    // Clear any timers
    this.clearActionTimer();

    // Clear reconnection info
    SocketService.clearReconnectionInfo();

    // Clear error message
    this.clearErrorMessage();

    this.currentHandResult = {
      winners: [],
      hands: [],
      pot: 0,
      communityCards: []
    };
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

.error-actions {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}

.btn-fix {
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
}

.btn-fix:hover {
  background-color: #2980b9;
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
    "info info";
}

.game-info-container {
  grid-area: info;
  display: flex;
  gap: 20px;
}

.game-log {
  flex: 1;
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 15px;
  max-height: 200px;
  overflow-y: auto;
}

.reconnecting-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.reconnecting-message {
  background-color: #2a2a2a;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

.spinner {
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top: 4px solid #3f8c6e;
  width: 40px;
  height: 40px;
  margin: 0 auto 15px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.game-table {
  grid-area: table;
  background-color: #1c4e38;
  border-radius: 8px;
  padding: 20px;
  min-height: 400px;
  position: relative;
}

.debug-toggle {
  position: fixed;
  bottom: 10px;
  right: 10px;
  background-color: #333;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  z-index: 1000;
}

@media (max-width: 768px) {
  .game-area {
    grid-template-columns: 1fr;
    grid-template-areas:
      "status"
      "table"
      "info";
  }

  .game-info-container {
    flex-direction: column;
  }
}

.game-status-wrapper {
  grid-area: status;
  width: 100%;
}

.player-debug-toggle {
  position: fixed;
  bottom: 10px;
  left: 10px;
  background-color: #333;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  z-index: 1000;
}
</style>