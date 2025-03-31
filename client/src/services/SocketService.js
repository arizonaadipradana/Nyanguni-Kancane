// client/src/services/SocketService.js
import io from 'socket.io-client';
import store from '../store';

const SOCKET_URL = process.env.VUE_APP_SOCKET_URL || 'http://localhost:3000';

/**
 * Service for handling Socket.IO connections
 */
class SocketService {
  constructor() {
    this.socket = null;
    this.gameSocket = null;
    this.lobbySocket = null;
    this.isConnected = false;
    this.events = {};
  }

  /**
   * Connect to main socket
   * @param {string} userId - User ID
   * @returns {Promise} Promise that resolves when connected
   */
  connect(userId) {
    return new Promise((resolve, reject) => {
      // Disconnect if already connected
      if (this.socket) {
        this.disconnect();
      }

      // Connect to main socket
      this.socket = io(SOCKET_URL);

      // Setup event listeners
      this.socket.on('connect', () => {
        console.log('Connected to main socket');
        this.isConnected = true;

        // Register user with socket
        this.socket.emit('register', { userId });

        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from main socket');
        this.isConnected = false;
      });
    });
  }

  /**
   * Disconnect from all sockets
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.gameSocket) {
      this.gameSocket.disconnect();
      this.gameSocket = null;
    }

    if (this.lobbySocket) {
      this.lobbySocket.disconnect();
      this.lobbySocket = null;
    }

    this.isConnected = false;
  }

  /**
   * Connect to game namespace
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @returns {Promise} Promise that resolves when connected
   */
  connectToGame(gameId, userId, username) {
    return new Promise((resolve, reject) => {
      // Disconnect from any existing game socket
      if (this.gameSocket) {
        this.gameSocket.disconnect();
        this.gameSocket = null;
      }

      // Connect to game namespace
      this.gameSocket = io(`${SOCKET_URL}/game`);

      // Setup event listeners
      this.gameSocket.on('connect', () => {
        console.log('Connected to game socket');

        // Register user with socket
        this.gameSocket.emit('register', { userId });

        // Join game room
        this.gameSocket.emit('joinGame', {
          gameId,
          userId,
          username
        });

        resolve();
      });

      this.gameSocket.on('connect_error', (error) => {
        console.error('Game socket connection error:', error);
        reject(error);
      });

      this.gameSocket.on('disconnect', () => {
        console.log('Disconnected from game socket');
      });

      // Set up game event listeners
      this.setupGameListeners();
    });
  }

  /**
   * Connect to lobby namespace
   * @param {string} userId - User ID
   * @returns {Promise} Promise that resolves when connected
   */
  connectToLobby(userId) {
    return new Promise((resolve, reject) => {
      // Disconnect from any existing lobby socket
      if (this.lobbySocket) {
        this.lobbySocket.disconnect();
        this.lobbySocket = null;
      }

      // Connect to lobby namespace
      this.lobbySocket = io(`${SOCKET_URL}/lobby`);

      // Setup event listeners
      this.lobbySocket.on('connect', () => {
        console.log('Connected to lobby socket');

        // Register user with socket
        this.lobbySocket.emit('register', { userId });

        resolve();
      });

      this.lobbySocket.on('connect_error', (error) => {
        console.error('Lobby socket connection error:', error);
        reject(error);
      });

      this.lobbySocket.on('disconnect', () => {
        console.log('Disconnected from lobby socket');
      });

      // Setup lobby event listeners
      this.setupLobbyListeners();
    });
  }

  /**
   * Setup game event listeners
   */
  setupGameListeners() {
    // Game state updates
    this.gameSocket.on('gameUpdate', (gameState) => {
      store.dispatch('updateGameState', gameState);
    });

    // Game started
    this.gameSocket.on('gameStarted', (gameState) => {
      store.dispatch('updateGameState', gameState);
    });

    // Deal cards
    this.gameSocket.on('dealCards', ({ hand }) => {
      store.dispatch('receiveCards', { hand });
    });

    // Your turn
    this.gameSocket.on('yourTurn', ({ options }) => {
      store.dispatch('yourTurn', { options });
    });

    // Turn ended
    this.gameSocket.on('endTurn', () => {
      store.dispatch('endTurn');
    });

    // Hand result
    this.gameSocket.on('handResult', (result) => {
      // Custom event
      this.emit('handResult', result);
    });

    // Game error
    this.gameSocket.on('gameError', ({ message }) => {
      store.commit('SET_ERROR_MESSAGE', message);
    });

    // Other game events - emit them for components to listen
    const forwardEvents = [
      'playerJoined',
      'playerLeft',
      'chatMessage',
      'turnChanged',
      'actionTaken',
      'dealFlop',
      'dealTurn',
      'dealRiver',
      'newHand',
      'gameEnded',
      'leaveGameSuccess',
      'playerConnectionChange'
    ];

    forwardEvents.forEach(event => {
      this.gameSocket.on(event, (data) => {
        this.emit(event, data);
      });
    });
  }

  /**
   * Setup lobby event listeners
   */
  setupLobbyListeners() {
    // Lobby events
    const lobbyEvents = [
      'gameCreated',
      'gameStarted',
      'gameEnded',
      'gameUpdated',
      'playerJoined',
      'playerLeft',
      'lobbyMessage'
    ];

    lobbyEvents.forEach(event => {
      this.lobbySocket.on(event, (data) => {
        this.emit(event, data);
      });
    });
  }

  /**
   * Send a player action
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} action - Action type
   * @param {number} amount - Bet amount
   */
  sendPlayerAction(gameId, userId, action, amount = 0) {
    if (!this.gameSocket) {
      throw new Error('Not connected to game socket');
    }

    this.gameSocket.emit('playerAction', {
      gameId,
      userId,
      action,
      amount
    });
  }

  /**
   * Send a chat message
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {string} message - Chat message
   */
  sendChatMessage(gameId, userId, username, message) {
    if (!this.gameSocket) {
      throw new Error('Not connected to game socket');
    }

    this.gameSocket.emit('sendMessage', {
      gameId,
      userId,
      username,
      message
    });
  }

  /**
   * Leave a game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   */
  leaveGame(gameId, userId) {
    if (!this.gameSocket) {
      throw new Error('Not connected to game socket');
    }

    this.gameSocket.emit('leaveGame', {
      gameId,
      userId
    });
  }

  /**
   * Request game state update
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   */
  requestGameUpdate(gameId, userId) {
    if (!this.gameSocket) {
      throw new Error('Not connected to game socket');
    }

    this.gameSocket.emit('requestGameUpdate', {
      gameId,
      userId
    });
  }

  /**
   * Start a game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   */
  startGame(gameId, userId) {
    if (!this.gameSocket) {
      throw new Error('Not connected to game socket');
    }

    this.gameSocket.emit('startGame', {
      gameId,
      userId
    });
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback to remove
   */
  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach(callback => callback(data));
  }
}

// Create and export singleton instance
export default new SocketService();