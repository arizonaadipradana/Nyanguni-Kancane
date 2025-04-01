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
          @updateBetAmount="betAmount = $event" @updateRaiseAmount="raiseAmount = $event" @handleAction="handleAction"
          @getPlayerChipsInPot="getPlayerChipsInPot" @getCurrentPlayer="getCurrentPlayer" />
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
      showDebugPanel: false,
      explicitIsCreator: false,
      gameInProgress: false,
      gameInitialized: false,
      lastLogMessage: [],
      isYourTurnProcessed: false,
      messageDedupeTime: 1000
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
          SocketService.requestGameUpdate(this.gameId, this.currentUser.id);

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
            SocketService.requestGameUpdate(this.gameId, this.currentUser.id);

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
          SocketService.requestGameUpdate(this.gameId, this.currentUser.id);
        } else {
          this.SET_ERROR_MESSAGE(error.message || 'Error starting game. Please try again.');
          this.addToLog(`Failed to start game: ${error.message}`);
        }
      } finally {
        this.isStarting = false;
      }
    },

    // Add this helper method
    triggerGameInitialize() {
      // This is a fallback method to initialize the game if the gameUpdate doesn't work
      SocketService.gameSocket?.emit('initializeGame', {
        gameId: this.gameId,
        userId: this.currentUser.id
      });

      this.addToLog('Sent initialize game request');
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
      // Check for duplicates within the time window
      const timestamp = new Date().toLocaleTimeString();
      const now = Date.now();

      // Don't add the exact same message within the deduplication window
      const isDuplicate = this.lastLogMessages.some(item =>
        item.message === message && (now - item.time < this.messageDedupeTime)
      );

      if (isDuplicate) {
        console.log(`Suppressed duplicate log message: ${message}`);
        return;
      }

      // Add to tracking list for deduplication
      this.lastLogMessages.push({
        message,
        time: now
      });

      // Maintain the tracking list size
      if (this.lastLogMessages.length > 10) {
        this.lastLogMessages.shift();
      }

      // Add the message to the actual log
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
        SocketService.on('creatorInfo', this.handleCreatorInfo);

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

      // Force reload of players list when player count changes
      const oldPlayerCount = this.currentGame?.players?.length || 0;
      const newPlayerCount = gameState.players?.length || 0;

      this.updateGameState(gameState);

      // If game is now active and we previously were waiting, do special handling
      if (gameState.status === 'active' && !this.gameInProgress) {
        this.gameInProgress = true;
        this.addToLog('Game is now active!');
        this.clearErrorMessage();

        // Request initialization if we're the creator
        if (this.isCreator && !this.gameInitialized) {
          setTimeout(() => {
            this.requestInitialization();
          }, 500);
        }
      }

      // If player count changed, we might need to force UI update
      if (oldPlayerCount !== newPlayerCount) {
        console.log(`Player count changed: ${oldPlayerCount} → ${newPlayerCount}`);
        // Force component update by changing key
        this.$forceUpdate();
      }

      // Log connection status
      if (!this.isConnected) {
        this.isConnected = true;
        this.addToLog('Connected to game server');
      }
    },

    handleGameStarted(gameState) {
      console.log('Game started event received:', gameState);

      // Make sure the game state has a status of 'active'
      if (gameState && gameState.status !== 'active') {
        gameState.status = 'active';
      }

      this.updateGameState(gameState);
      this.addToLog('Game has started!');

      // Mark game as in progress
      this.gameInProgress = true;

      // Request another update to ensure all clients are in sync
      setTimeout(() => {
        SocketService.requestGameUpdate(this.gameId, this.currentUser.id);
      }, 800);

      // Clear any error messages
      this.clearErrorMessage();
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
      // Skip if we already have cards
      if (this.playerHand && this.playerHand.length > 0) {
        console.log('Already have cards, ignoring duplicate dealCards event');
        return;
      }

      console.log('Received cards:', data);
      this.receiveCards(data);
      this.addToLog('You have been dealt cards');

      // Mark game as initialized when we get cards
      this.gameInitialized = true;
      this.gameInProgress = true;

      // Force the currentGame status to be 'active' if it's not already
      if (this.currentGame && this.currentGame.status !== 'active') {
        this.$set(this.currentGame, 'status', 'active');
        this.addToLog('Game status updated to active');
      }

      // Clear any lingering error messages
      this.clearErrorMessage();

      // Request a full game state update to ensure UI is in sync
      setTimeout(() => {
        SocketService.requestGameUpdate(this.gameId, this.currentUser.id);
      }, 500);
    },

    handleYourTurn(data) {
      // Prevent duplicate processing in quick succession
      if (this.isYourTurnProcessed) {
        console.log('Already processed yourTurn, ignoring duplicate');
        return;
      }

      console.log('Your turn event received:', data);
      this.yourTurn(data);
      this.addToLog('It is your turn');

      // Make sure UI shows game is active
      if (this.currentGame && this.currentGame.status !== 'active') {
        this.$set(this.currentGame, 'status', 'active');
      }

      // Mark game as initialized
      this.gameInitialized = true;
      this.gameInProgress = true;

      this.startActionTimer(data.timeLimit || 30);

      // Set flag to avoid duplicate processing
      this.isYourTurnProcessed = true;

      // Reset the flag after a delay
      setTimeout(() => {
        this.isYourTurnProcessed = false;
      }, 1000);
    },

    handleTurnChanged(data) {
      // Add to log when someone else's turn starts
      if (data.playerId !== this.currentUser.id) {
        this.addToLog(`It is ${data.username}'s turn`);
      } else {
        // It's our turn!
        this.addToLog(`It is your turn`);

        // Ensure the isYourTurn flag is set
        if (!this.isYourTurn) {
          this.yourTurn({
            options: this.getDefaultOptions()
          });
        }
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
      // Don't set error if game is already in progress - might be recoverable
      if (this.gameInProgress && this.playerHand && this.playerHand.length > 0) {
        this.addToLog(`Warning: ${data.message} (game continuing)`);
      } else {
        this.SET_ERROR_MESSAGE(data.message);
        this.addToLog(`Error: ${data.message}`);
      }
    },

    handleCreatorInfo(data) {
      console.log('Received creator info:', data);

      // If creator info isn't in the game data, add it
      if (this.currentGame && !this.currentGame.creator && data.creator) {
        this.$set(this.currentGame, 'creator', data.creator);
        this.addToLog('Creator info received and updated');
      }

      // Store explicit creator status in case computed property fails
      this.explicitIsCreator = data.isCreator;
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
    },

    async debugStartGame() {
      console.group('DETAILED GAME START DEBUG');
      console.log('Game ID:', this.gameId);
      console.log('Current user:', this.currentUser);
      console.log('Is creator (computed):', this.isCreator);
      console.log('Current game status:', this.currentGame?.status);
      console.log('Player count:', this.currentGame?.players?.length);

      try {
        // Step 1: Check prerequisites
        console.log('=== STEP 1: Check Prerequisites ===');
        if (!this.currentGame) {
          throw new Error('No game data available');
        }
        if (!this.currentUser) {
          throw new Error('No user data available');
        }
        if (!this.isCreator) {
          throw new Error('Only the creator can start the game');
        }
        if (this.currentGame.players.length < 2) {
          throw new Error('Need at least 2 players to start the game');
        }
        console.log('Prerequisites check: PASSED');

        // Step 2: Call API endpoint
        console.log('=== STEP 2: Call API Endpoint ===');
        console.log('About to call startGame API with gameId:', this.gameId);
        const apiResult = await this.startGame(this.gameId);
        console.log('API response:', apiResult);

        if (!apiResult.success) {
          throw new Error('API returned failure: ' + (apiResult.error || 'Unknown error'));
        }
        console.log('API call: PASSED');

        // Step 3: Emit socket event
        console.log('=== STEP 3: Emit Socket Event ===');
        console.log('About to emit startGame socket event');
        // Add a promise wrapper to get result of socket event
        const socketPromise = new Promise((resolve, reject) => {
          // Set timeout for socket response
          const timeout = setTimeout(() => {
            reject(new Error('Socket event timed out'));
          }, 5000);

          // One-time event handler for successful game start
          SocketService.gameSocket?.once('gameStarted', (data) => {
            clearTimeout(timeout);
            resolve({ success: true, data });
          });

          // One-time event handler for error
          SocketService.gameSocket?.once('gameError', (error) => {
            clearTimeout(timeout);
            reject(new Error('Socket reported error: ' + (error.message || 'Unknown error')));
          });

          // Emit the event
          SocketService.gameSocket?.emit('startGame', {
            gameId: this.gameId,
            userId: this.currentUser.id
          });
        });

        try {
          const socketResult = await socketPromise;
          console.log('Socket event result:', socketResult);
          console.log('Socket event: PASSED');
        } catch (socketError) {
          console.error('Socket event failed:', socketError);
          throw socketError;
        }

        // Step 4: Update local game state
        console.log('=== STEP 4: Update Local Game State ===');
        setTimeout(() => {
          SocketService.requestGameUpdate(this.gameId, this.currentUser.id);
          console.log('Game state update requested');
        }, 500);

        console.log('Start game process completed successfully');
      } catch (error) {
        console.error('Game start process failed:', error);
        this.SET_ERROR_MESSAGE(error.message || 'Error starting game');
      }

      console.groupEnd();
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
      // If explicitly notified it's our turn, use that
      if (this.isYourTurn) return true;

      // Otherwise check if current game state says it's our turn
      if (!this.currentGame || !this.currentUser) return false;

      // Check if we're in active turn and status is active
      return this.currentGame.status === 'active' &&
        this.currentGame.currentTurn &&
        this.currentUser.id === this.currentGame.currentTurn.toString() &&
        this.gameInitialized;
    },
    getDefaultOptions() {
      // Return the basic actions a player might have
      return ['fold', 'check', 'call', 'bet', 'raise'];
    },
  },

  created() {
    this.gameId = this.$route.params.id;
    this.SET_CURRENT_GAME_ID(this.gameId);

    // Ensure we clear any previous game state
    this.clearErrorMessage();

    console.log(`Initializing game with ID: ${this.gameId}`);

    // Handle case where we navigated directly (e.g., via window.location)
    if (!this.currentGame) {
      console.log('No current game in store, will fetch from server');
    }
  },
  mounted() {
    // Fetch game data first, with retry logic
    this.fetchGameWithRetry(this.gameId, 3)
      .then(() => {
        if (this.currentGame) {
          this.addToLog(`Joined game #${this.gameId}`);

          // Update local game state based on fetched data
          if (this.currentGame.status === 'active') {
            this.gameInProgress = true;
            this.addToLog('Game is already active');
          }

          // Set up socket connection
          return this.setupSocketConnection();
        } else {
          throw new Error('Failed to load game data');
        }
      })
      .then(() => {
        // Once connected, ensure we get regular updates for the first 20 seconds
        if (this.currentUser && this.gameId) {
          SocketService.ensureGameUpdate(this.gameId, this.currentUser.id);

          // Additional check: if game is active but we haven't been initialized
          setTimeout(() => {
            if (this.currentGame?.status === 'active' && !this.gameInitialized && this.isCreator) {
              console.log('Game is active but not initialized, requesting initialization');
              this.requestInitialization();
            }
          }, 2000);
        }
      })
      .catch(error => {
        console.error('Error setting up game:', error);
        this.SET_ERROR_MESSAGE('Failed to load game. Please try again.');
      });
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

  beforeDestroy() {
    // Remove event listeners
    const eventHandlers = [
      'gameUpdate', 'gameStarted', 'playerJoined', 'playerLeft',
      'chatMessage', 'dealCards', 'yourTurn', 'turnChanged',
      'actionTaken', 'dealFlop', 'dealTurn', 'dealRiver',
      'handResult', 'newHand', 'gameEnded', 'gameError', 'creatorInfo'
    ];

    eventHandlers.forEach(event => {
      if (this[`handle${event.charAt(0).toUpperCase() + event.slice(1)}`]) {
        SocketService.off(event, this[`handle${event.charAt(0).toUpperCase() + event.slice(1)}`]);
      }
    });

    // Clear any timers
    this.clearActionTimer();

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