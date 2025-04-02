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
        <CommunityCards :communityCards="currentGame.communityCards" :formatCard="formatCard" />

        <!-- Players -->
        <PlayerList :players="currentGame.players" :currentUser="currentUser" :currentTurn="currentGame.currentTurn"
          :playerHand="playerHand" :formatCard="formatCard" />

        <!-- Player actions -->
        <PlayerActions v-if="isYourTurn || shouldShowActions()" :availableActions="availableActions"
          :currentGame="currentGame" :betAmount="betAmount" :raiseAmount="raiseAmount"
          :actionTimeLimit="actionTimeLimit" @updateBetAmount="betAmount = $event"
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
    GameChat,    // Add this
    WinnerDisplay
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
      actionTimeLimit: 60,
      isReconnecting: false,
    };
  },

  computed: {
    ...mapGetters([
      'currentUser',
      'currentGame',
      'errorMessage',
      'playerHand',
      'availableActions'
    ]),
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
      this.actionTimeLimit = data.timeLimit || 60;  // Get the time limit from the server

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
      SocketService.requestGameUpdate(this.gameId, this.currentUser.id);
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
      this.currentHandResult = result;
      this.showWinnerDisplay = true;

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
    }
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
</style>