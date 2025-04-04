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
      <div class="game-status-wrapper">
        <GameStatus :currentGame="currentGame" :currentUser="currentUser" :gameId="gameId" :isCreator="isCreator"
          :isStarting="isStarting" :gameInitialized="gameInitialized"
          :key="currentGame ? currentGame.status + '-' + gameInitialized : 'loading'" @startGame="handleStartGame"
          @getCurrentPlayerName="getCurrentPlayerName" @requestInitialization="requestInitialization"
          @requestStateUpdate="requestStateUpdate" @addToLog="addToLog" />
      </div>

      <!-- Game table -->
      <div class="game-table">
        <!-- Community cards -->
        <CommunityCards :communityCards="currentGame.communityCards" :formatCard="formatCard" />

        <!-- Players -->
        <PlayerList ref="playerList" :players="currentGame.players" :currentUser="currentUser" :currentTurn="currentGame.currentTurn"
          :playerHand="playerHand" :formatCard="formatCard" />

        <!-- Player actions -->
        <PlayerActions v-if="isYourTurn || shouldShowActions()" :availableActions="availableActions"
          :currentGame="currentGame" :betAmount="betAmount" :raiseAmount="raiseAmount" :isYourTurn="isYourTurn"
          @updateBetAmount="betAmount = $event" @updateRaiseAmount="raiseAmount = $event" @handleAction="handleAction"
          @endTurn="endTurn" @getPlayerChipsInPot="getPlayerChipsInPot" @getCurrentPlayer="getCurrentPlayer" />

        <ActionTimer :initialTime="actionTimeLimit" :isActive="isYourTurn" :currentGame="currentGame"
          @timerComplete="handleTimerComplete" v-if="isYourTurn" />

        <WinnerDisplay :winners="handWinners" :allPlayers="allPlayersCards" :communityCards="communityCards"
          :pot="winningPot" :visible="showWinnerDisplay" :formatCard="formatCard" :currentGame="currentGame"
          :currentUser="currentUser" :gameId="gameId" :isCreator="isCreator" :isFoldWin="isFoldWin"
          @close="handleWinnerDisplayClose" @addToLog="addToLog" @startNextHand="startNextHand" />
      </div>

      <!-- Game chat/log -->
      <GameLog :gameLog="gameLog" />
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
import ActionTimer from '@/components/Game/ActionTimer.vue';
import WinnerDisplay from '@/components/Game/WinnerDisplay.vue';
import PlayerReadyComponent from '@/components/Game/PlayerReadyComponent.vue';
import PokerHandEvaluator from '@/utils/PokerHandEvaluator';

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
    ActionTimer,
    WinnerDisplay,
    PlayerReadyComponent,
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
      actionTimeLimit: 60,
      actionTimeRemaining: 60,
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
      handWinners: [],
      winningPot: 0,
      playerHand: [],
      availableActions: [],
      allPlayersCards: [],
      communityCards: [],
      isFoldWin: false,
      currentHandTimestamp: 0,
      cardRefreshCounter: 0,
    };
  },

  computed: {
    ...mapGetters([
      'currentUser',
      'currentGame',
      'errorMessage',
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
    /**
 * Format a card for display
 * @param {Object} card - Card object with suit and rank
 * @returns {String} Formatted card representation
 */
    formatCard(card) {
      // Safety check for null or invalid cards
      if (!card || !card.suit || !card.rank) {
        console.warn('Invalid card data received:', card);
        return '?';
      }

      const suitSymbols = {
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
        spades: '♠'
      };

      // Make sure the suit is valid
      const suitSymbol = suitSymbols[card.suit.toLowerCase()] || '?';

      return `${card.rank}${suitSymbol}`;
    },
    getDefaultOptions,

    yourTurn(data) {
      // Update local state
      this.isYourTurn = true;
      this.availableActions = data.options || [];

      // Update store state as well (if needed)
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

        // Register handler for player ready updates
        const playerReadyUpdateHandler = (data) => {
          console.log('Player ready update received:', data);
          // Game state will be updated through gameUpdate event
          // Just log the event
          const message = `${data.username} is ${data.isReady ? 'ready' : 'not ready'}`;
          this.addToLog(message);
        };

        // Add handler to track list
        SocketService.on('playerReadyUpdate', playerReadyUpdateHandler);
        this.eventHandlers.push({ event: 'playerReadyUpdate', handler: playerReadyUpdateHandler });

        // Handle all players ready event
        const allPlayersReadyHandler = (data) => {
          console.log('All players ready:', data);
          this.addToLog(`All players are ready (${data.readyCount}/${data.totalPlayers})!`);
        };

        // Add handler to track list
        SocketService.on('allPlayersReady', allPlayersReadyHandler);
        this.eventHandlers.push({ event: 'allPlayersReady', handler: allPlayersReadyHandler });

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

    startActionTimer(timeLimit = 60) {
      this.actionTimeLimit = timeLimit;

      // Clear any existing timer
      this.clearActionTimer();

      // Set a new timer
      this.actionTimer = setInterval(() => {
        this.actionTimeLimit--;

        if (this.actionTimeLimit <= 0) {
          this.clearActionTimer();
          this.handleTimerComplete();
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
      // Don't show actions if game isn't active
      if (!this.currentGame || this.currentGame.status !== 'active') {
        return false;
      }

      // Only show actions if it's explicitly the player's turn
      return this.isYourTurn;
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
    handleTimerComplete() {
      console.log('Timer complete - auto folding');
      if (this.isYourTurn) {
        this.handleAction('fold');
        this.addToLog('Time expired - auto fold');
      }
    },

    // Handle when winner display countdown completes
    handleWinnerDisplayClose() {
      console.log('Winner display closed');
      this.showWinnerDisplay = false;
      this.handWinners = [];

      // Request a game state update to ensure UI is up to date
      this.requestStateUpdate();

      // After short delay, try to fetch user data to update balances
      setTimeout(() => {
        this.$store.dispatch('fetchUserData')
          .then(() => console.log("User data refreshed after hand"))
          .catch(err => console.error("Failed to refresh user data:", err));
      }, 500);
    },
    handleHandResult(result) {
      console.log("Received hand result:", result);

      // Add safety checks and debug info for hand result processing
      if (!result) {
        console.error("Hand result is empty or invalid");
        return;
      }

      // Deep inspect the result to see what we're receiving
      console.log("Winners array:", JSON.stringify(result.winners));
      console.log("Pot amount:", result.pot);

      // Make sure winners array exists and is properly formatted
      if (!result.winners || !Array.isArray(result.winners) || result.winners.length === 0) {
        console.error("No valid winners in result data");
        return;
      }

      // Create a safe copy of the winners with default values for missing properties
      const safeWinners = result.winners.map(winner => ({
        playerId: winner.playerId || "unknown",
        username: winner.username || "Unknown Player",
        handName: winner.handName || "Unknown Hand",
        hand: Array.isArray(winner.hand) ? winner.hand : []
      }));

      // Process all players' cards with proper hand evaluation
      let allPlayersCards = [];

      if (Array.isArray(result.allPlayersCards)) {
        allPlayersCards = result.allPlayersCards.map(player => {
          // Get player hand correctly evaluated
          const hand = Array.isArray(player.hand) ? player.hand : [];
          const communityCards = Array.isArray(result.communityCards) ? result.communityCards : [];

          // Evaluate the actual hand type
          const evaluation = PokerHandEvaluator.evaluateHand(hand, communityCards);

          return {
            ...player,
            handName: evaluation.description,
            handType: evaluation.type,
            isWinner: player.isWinner || safeWinners.some(w => w.playerId === player.playerId)
          };
        });
      }

      // Store community cards
      const communityCards = Array.isArray(result.communityCards) ? result.communityCards : [];

      // Safely set the data on the component
      this.handWinners = safeWinners;
      this.allPlayersCards = allPlayersCards;
      this.communityCards = communityCards;
      this.winningPot = result?.pot || 0;
      this.isFoldWin = result?.isFoldWin || false;
      this.showWinnerDisplay = true;

      // Format winner names for log
      const winnerNames = this.handWinners
        .map(winner => winner.username)
        .join(", ");

      this.addToLog(`Hand complete. Winner(s): ${winnerNames}`);

      // Force UI update
      this.forceCardUpdate();
    },

    // Handle when winner display countdown completes
    handleWinnerDisplayComplete() {
      console.log('Winner display countdown complete');
      this.showWinnerDisplay = false;
      this.handWinners = [];
    },

    handleWinnerDisplayClose() {
      console.log('Winner display closed');
      this.showWinnerDisplay = false;
      this.handWinners = [];

      // Request a game state update to ensure UI is up to date
      this.requestStateUpdate();

      // After short delay, try to fetch user data to update balances
      setTimeout(() => {
        this.$store.dispatch('fetchUserData')
          .then(() => console.log("User data refreshed after hand"))
          .catch(err => console.error("Failed to refresh user data:", err));
      }, 500);
    },

    //A method to handle game reset
    resetGameState() {
      console.log('Resetting game state for new hand');
      // Reset game-related state
      this.playerHand = [];
      this.communityCards = [];
      this.isYourTurn = false;
      this.availableActions = [];
      this.handWinners = [];
      this.showWinnerDisplay = false;
      this.cardRefreshCounter = 0;

      // Force UI update
      this.$forceUpdate();

      // Update child components
      this.$nextTick(() => {
        if (this.$refs.playerList && typeof this.$refs.playerList.forceUpdate === 'function') {
          this.$refs.playerList.forceUpdate();
        }
      });
    },

    startNextHand() {
      if (!this.isCreator || !this.gameId || !this.currentUser) {
        console.warn('Only the creator can start the next hand');
        return;
      }

      console.log('Starting next hand...');
      this.addToLog('Starting next hand...');

      // Refresh user data first to ensure we have accurate balances
      this.$store.dispatch('fetchUserData')
        .then(() => {
          // Then tell server to start the next hand
          SocketService.gameSocket?.emit('startNextHand', {
            gameId: this.gameId,
            userId: this.currentUser.id
          });
        })
        .catch(err => {
          console.error("Failed to refresh user data before next hand:", err);
          // Still try to start the hand even if user data refresh fails
          SocketService.gameSocket?.emit('startNextHand', {
            gameId: this.gameId,
            userId: this.currentUser.id
          });
        });
    },
    handleGameStateChange(gameState) {
      // If game state changes from active to waiting, make sure to end any active turns
      if (
        this.currentGame &&
        this.currentGame.status === 'active' &&
        gameState &&
        gameState.status === 'waiting'
      ) {
        console.log('Game state changed from active to waiting, ending any active turns');
        if (this.isYourTurn) {
          this.endTurn();
        }
      }

      // Update the game state in store
      this.updateGameState(gameState);

      // Clear any error message after successful game state update
      this.SET_ERROR_MESSAGE('');
    },
    handleDealCards(data) {
      console.log("Received cards:", data);

      // Check if this is a new hand signal with timestamp
      if (data.newHand && data.timestamp) {
        console.log("Received new hand signal with timestamp:", data.timestamp);

        // Reset game state for new hand
        this.resetGameState();

        // Update the timestamp
        this.currentHandTimestamp = data.timestamp;

        // Small delay to ensure state reset before setting new cards
        setTimeout(() => {
          // Apply the new cards
          this.playerHand = data.hand || [];
          this.addToLog("You have been dealt new cards");

          // Force UI update
          this.$forceUpdate();

          // Also update store state
          this.$store.commit('SET_PLAYER_HAND', data.hand || []);

          // Force update child components
          this.$nextTick(() => {
            if (this.$refs.playerList && typeof this.$refs.playerList.forceUpdate === 'function') {
              this.$refs.playerList.updateForNewHand(data.timestamp);
            }
          });

          // Request a state update to ensure UI is in sync
          setTimeout(() => {
            this.requestStateUpdate();
          }, 500);
        }, 100);

        return;
      }

      // For regular card deals or reconnects
      if (!data || !data.hand || !Array.isArray(data.hand)) {
        console.warn("Received invalid card data:", data);
        return;
      }

      // Only update if this doesn't have a timestamp or the timestamp is newer than our current hand
      if (!this.currentHandTimestamp ||
        !data.timestamp ||
        data.timestamp >= this.currentHandTimestamp) {

        console.log("Updating cards with data:", data.hand.map(c => `${c.rank} of ${c.suit}`).join(", "));

        // Small delay to ensure state reset before setting new cards
        setTimeout(() => {
          // Apply the new cards - create a fresh copy to ensure reactivity
          this.playerHand = [...data.hand];

          if (!data.newHand) {
            this.addToLog("You have been dealt cards");
          }

          // Force UI update
          this.$forceUpdate();

          // Update store state
          this.$store.commit('SET_PLAYER_HAND', data.hand);

          // Also update the timestamp if provided
          if (data.timestamp) {
            this.currentHandTimestamp = data.timestamp;
          }

          // Mark game as initialized when we get cards
          this.gameInitialized = true;
          this.gameInProgress = true;

          // Clear any lingering error messages
          this.clearErrorMessage();
        }, 100);
      } else {
        console.log("Ignoring older card data with timestamp:", data.timestamp);
      }
    },
    handleGameStatusChange(statusData) {
      console.log('Game status changed:', statusData);

      // If game status is changing to waiting, reset for a new hand
      if (statusData.status === 'waiting') {
        console.log('Game status changed to waiting, preparing for new hand');

        // End any active turns
        if (this.isYourTurn) {
          this.endTurn();
        }

        // Reset game state
        this.resetGameState();

        // Clear current hand timestamp to accept new cards
        this.currentHandTimestamp = 0;
      }
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
      await this.fetchGameWithRetry(this.gameId, 3);

      if (this.currentGame) {
        this.addToLog(`Joined game #${this.gameId}`);

        // Update local game state based on fetched data
        if (this.currentGame.status === 'active') {
          this.gameInProgress = true;
          this.addToLog('Game is already active');
        }

        // Set up socket connection
        await this.setupSocketConnection();

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
      } else {
        throw new Error('Failed to load game data');
      }
    } catch (error) {
      console.error('Error setting up game:', error);
      this.SET_ERROR_MESSAGE('Failed to load game. Please try again.');
    };

    // Add a card refresh interval
    this.cardRefreshInterval = setInterval(() => {
      if (this.playerHand && this.playerHand.length > 0) {
        // If we have cards, check if the UI needs updating
        this.forceCardUpdate();
      }
    }, 2000); // Check every 2 seconds

    if (this.handlers.handleHandResult) {
      SocketService.on('handResult', this.handlers.handleHandResult);
      this.eventHandlers.push({ event: 'handResult', handler: this.handlers.handleHandResult });
    };

    const gameUpdateHandler = (gameState) => {
      this.handleGameStateChange(gameState);
    };
    SocketService.on('gameUpdate', gameUpdateHandler);
    this.eventHandlers.push({ event: 'gameUpdate', handler: gameUpdateHandler });

    // Handle status changes
    const gameStatusChangeHandler = (statusData) => {
      this.handleGameStatusChange(statusData);
    };
    SocketService.on('gameStatusChange', gameStatusChangeHandler);
    this.eventHandlers.push({ event: 'gameStatusChange', handler: gameStatusChangeHandler });

    if (this.handlers && this.handlers.handleHandResult) {
      SocketService.on('handResult', this.handlers.handleHandResult);
      this.eventHandlers.push({ event: 'handResult', handler: this.handlers.handleHandResult });
    }

    // A fresh card handler for new hands
    const newHandCardsHandler = (data) => {
      if (data && data.newHand && data.timestamp) {
        console.log('Received new hand cards event');
        this.handleDealCards(data);
      }
    };
    SocketService.on('newHandCards', newHandCardsHandler);
    this.eventHandlers.push({ event: 'newHandCards', handler: newHandCardsHandler });
  },

  beforeDestroy() {
    // Clear the card refresh interval
    if (this.cardRefreshInterval) {
      clearInterval(this.cardRefreshInterval);
    }
    // Remove event listeners
    this.eventHandlers.forEach(({ event, handler }) => {
      SocketService.off(event, handler);
    });

    // Clear any timers
    this.clearActionTimer();

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
      "log";
  }
}

.game-status-wrapper {
  grid-area: status;
  width: 100%;
}
</style>