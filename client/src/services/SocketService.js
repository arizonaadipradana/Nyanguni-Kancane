// client/src/services/SocketService.js
import io from 'socket.io-client';
import store from '../store';
import { loadConfig } from './config';

/**
 * Service for handling Socket.IO connections
 */
class SocketService {
  constructor() {
    this.socket = null;
    this.gameSocket = null;
    this.isConnected = false;
    this.events = {};
    this.connectionPromise = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
  }

  /**
   * Initialize and connect to socket server
   * @returns {Promise} Promise that resolves when connected
   */
  async init() {
    // If we already have a connection promise, return it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
  
    // If we're already connected, resolve immediately
    if (this.isConnected && this.gameSocket) {
      return Promise.resolve(this.gameSocket);
    }
  
    // Create a connection promise without using async in the executor
    this.connectionPromise = new Promise((resolve, reject) => {
      // Move the async logic to a separate function
      const setupConnection = async () => {
        try {
          // Load configuration to get the socket URL
          const config = await loadConfig();
          
          // Get the socket URL from config
          const socketUrl = config.socketUrl || window.location.origin;
          console.log('Connecting to socket server at:', socketUrl);
          
          // If there's an existing socket, disconnect it
          if (this.gameSocket) {
            this.gameSocket.disconnect();
            this.gameSocket = null;
          }
          
          // Connect to game namespace with settings that work with ngrok
          this.gameSocket = io(`${socketUrl}/game`, {
            transports: ['websocket', 'polling'], // Try both transport methods
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 15000, // Longer timeout for potentially slower connections
            autoConnect: true,
            withCredentials: true, // Important for CORS with cookies
            forceNew: true, // Force a new connection
            extraHeaders: {
              // Add explicit headers that might help with CORS
              'Origin': window.location.origin
            }
          });
          
          // Add connection event listener
          this.gameSocket.on('connect', () => {
            console.log('Connected to game socket with ID:', this.gameSocket.id);
            console.log('Using transport:', this.gameSocket.io.engine.transport.name);
            this.isConnected = true;
            this.connectionAttempts = 0;
            
            // Register user if available
            const user = store.getters.currentUser;
            if (user && user.id) {
              this.registerUser(user.id);
            }
            
            resolve(this.gameSocket);
          });
          
          // Add connection error listener with more details
          this.gameSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            console.error('Error type:', error.type);
            console.error('Error message:', error.message);
            console.error('Error description:', error.description);
            
            // Increment connection attempts
            this.connectionAttempts++;
            
            if (this.connectionAttempts >= this.maxConnectionAttempts) {
              this.connectionPromise = null;
              reject(new Error(`Failed to connect to socket server after ${this.maxConnectionAttempts} attempts`));
            }
          });
          
          // Add disconnect listener
          this.gameSocket.on('disconnect', (reason) => {
            console.log('Disconnected from game socket. Reason:', reason);
            this.isConnected = false;
            
            // Reset connection promise if disconnected permanently
            if (reason === 'io server disconnect' || reason === 'transport close') {
              this.connectionPromise = null;
            }
          });
          
          // Add error listener
          this.gameSocket.on('error', (error) => {
            console.error('Socket error:', error);
          });
          
          // Set up game event listeners
          this.setupGameListeners();
        } catch (error) {
          console.error('Error initializing socket service:', error);
          this.connectionPromise = null;
          reject(error);
        }
      };
  
      // Execute the setup function
      setupConnection().catch(reject);
    });
    
    return this.connectionPromise;
  }

  /**
   * Register user with socket
   * @param {string} userId - User ID
   */
  registerUser(userId) {
    if (!userId) {
      console.warn('Cannot register user - no userId provided');
      return;
    }
    
    if (!this.gameSocket) {
      console.warn('Cannot register user - socket not initialized');
      return this.init().then(() => this.registerUser(userId));
    }
    
    if (!this.isConnected) {
      console.warn('Socket not connected, will register when connected');
      
      // Add a one-time connect listener to register when connected
      this.gameSocket.once('connect', () => {
        this.registerUser(userId);
      });
      
      return;
    }
    
    this.gameSocket.emit('register', { userId });
    console.log(`Registered user ${userId} with socket`);
  }

  /**
   * Join a game room
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @returns {Promise} Promise that resolves when joined
   */
  async joinGame(gameId, userId, username) {
    if (!gameId || !userId || !username) {
      throw new Error('Missing required parameters for joinGame');
    }
    
    // Make sure socket is initialized and connected
    try {
      await this.init();
      
      console.log(`Joining game ${gameId} as ${username} (${userId})`);
      
      // Join the game room
      this.gameSocket.emit('joinGame', {
        gameId,
        userId,
        username
      });
      
      // Immediately request a game state update to ensure everyone is in sync
      setTimeout(() => {
        this.requestGameUpdate(gameId, userId);
      }, 500);
      
      return true;
    } catch (error) {
      console.error('Error joining game:', error);
      throw error;
    }
  }

  /**
   * Leave a game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   */
  leaveGame(gameId, userId) {
    if (!gameId || !userId) {
      console.warn('Cannot leave game - missing required parameters');
      return;
    }
    
    if (!this.gameSocket || !this.isConnected) {
      console.warn('Cannot leave game - socket not connected');
      return;
    }
    
    console.log(`Leaving game ${gameId}`);
    
    this.gameSocket.emit('leaveGame', {
      gameId,
      userId
    });
  }

  /**
   * Setup game event listeners
   */
  setupGameListeners() {
    if (!this.gameSocket) return;
    
    // Game state updates
    this.gameSocket.on('gameUpdate', (gameState) => {
      console.log('Received game update:', gameState);
      store.dispatch('updateGameState', gameState);
      this.emit('gameUpdate', gameState);
    });
    
    // Game started
    this.gameSocket.on('gameStarted', (gameState) => {
      console.log('Game started:', gameState);
      store.dispatch('updateGameState', gameState);
      this.emit('gameStarted', gameState);
    });
    
    // Player joined
    this.gameSocket.on('playerJoined', (data) => {
      console.log('Player joined:', data);
      this.emit('playerJoined', data);
      
      // Request fresh game state after player joins
      const gameId = store.getters.currentGameId;
      const userId = store.getters.currentUser?.id;
      if (gameId && userId) {
        // Small delay to ensure server has processed the join
        setTimeout(() => {
          this.requestGameUpdate(gameId, userId);
        }, 200);
      }
    });
    
    // Player left
    this.gameSocket.on('playerLeft', (data) => {
      console.log('Player left:', data);
      this.emit('playerLeft', data);
    });
    
    // Chat message
    this.gameSocket.on('chatMessage', (data) => {
      this.emit('chatMessage', data);
    });
    
    // Deal cards
    this.gameSocket.on('dealCards', (data) => {
      this.emit('dealCards', data);
    });
    
    // Your turn
    this.gameSocket.on('yourTurn', (data) => {
      store.dispatch('yourTurn', data);
      this.emit('yourTurn', data);
    });
    
    // Turn changed
    this.gameSocket.on('turnChanged', (data) => {
      this.emit('turnChanged', data);
    });
    
    // Action taken
    this.gameSocket.on('actionTaken', (data) => {
      this.emit('actionTaken', data);
    });
    
    // Deal community cards
    this.gameSocket.on('dealFlop', (data) => {
      this.emit('dealFlop', data);
    });
    
    this.gameSocket.on('dealTurn', (data) => {
      this.emit('dealTurn', data);
    });
    
    this.gameSocket.on('dealRiver', (data) => {
      this.emit('dealRiver', data);
    });
    
    // Hand results
    this.gameSocket.on('handResult', (data) => {
      this.emit('handResult', data);
    });
    
    // New hand
    this.gameSocket.on('newHand', (data) => {
      this.emit('newHand', data);
    });
    
    // Game ended
    this.gameSocket.on('gameEnded', (data) => {
      this.emit('gameEnded', data);
    });
    
    // Game error
    this.gameSocket.on('gameError', (data) => {
      console.error('Game error:', data);
      store.commit('SET_ERROR_MESSAGE', data.message);
      this.emit('gameError', data);
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
    if (!gameId || !userId || !action) {
      console.warn('Cannot send player action - missing required parameters');
      return;
    }
    
    if (!this.gameSocket || !this.isConnected) {
      console.warn('Cannot send player action - socket not connected');
      return;
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
    if (!gameId || !userId || !username || !message) {
      console.warn('Cannot send chat message - missing required parameters');
      return;
    }
    
    if (!this.gameSocket || !this.isConnected) {
      console.warn('Cannot send chat message - socket not connected');
      return;
    }
    
    this.gameSocket.emit('sendMessage', {
      gameId,
      userId,
      username,
      message
    });
  }

  /**
   * Request game state update
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   */
  requestGameUpdate(gameId, userId) {
    if (!gameId) {
      console.warn('Cannot request game update - missing gameId');
      return;
    }
    
    if (!this.gameSocket || !this.isConnected) {
      console.warn('Cannot request game update - socket not connected');
      return;
    }
    
    console.log(`Requesting game update for ${gameId}`);
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
    if (!gameId || !userId) {
      console.warn('Cannot start game - missing required parameters');
      return;
    }
    
    if (!this.gameSocket || !this.isConnected) {
      console.warn('Cannot start game - socket not connected');
      return;
    }
    
    this.gameSocket.emit('startGame', {
      gameId,
      userId
    });
  }

  /**
   * Disconnect from all sockets
   */
  disconnect() {
    if (this.gameSocket) {
      this.gameSocket.disconnect();
      this.gameSocket = null;
    }
    
    this.isConnected = false;
    this.connectionPromise = null;
    this.connectionAttempts = 0;
  }

  debug() {
    console.log('Socket Debug Info:');
    console.log('- Is Connected:', this.isConnected);
    console.log('- Socket ID:', this.gameSocket?.id || 'none');
    console.log('- Socket Connected:', this.gameSocket?.connected || false);
    console.log('- Socket Namespace:', this.gameSocket?.nsp || 'none');
    console.log('- Connection Attempts:', this.connectionAttempts);
    
    if (this.gameSocket && this.gameSocket.io) {
      console.log('- Transport Type:', this.gameSocket.io.engine?.transport?.name || 'none');
      console.log('- Engine ReadyState:', this.gameSocket.io.engine?.readyState || 'none');
      console.log('- Engine Transport Options:', this.gameSocket.io.engine?.opts || 'none');
    }
    
    // List all event listeners
    console.log('- Registered Event Handlers:');
    const events = Object.keys(this.events);
    events.forEach(event => {
      console.log(`  - ${event}: ${this.events[event].length} handlers`);
    });
    
    return {
      connected: this.isConnected,
      socketId: this.gameSocket?.id,
      transport: this.gameSocket?.io?.engine?.transport?.name,
      events: events
    };
  }

  debugSocket() {
    // Assuming SocketService is imported as a global in your app
    return SocketService.debug();
  }

  attemptReconnection() {
    console.log('Attempting to reconnect socket...');
    
    // Reset connection state
    this.isConnected = false;
    this.connectionPromise = null;
    
    // Close existing socket if any
    if (this.gameSocket) {
      this.gameSocket.close();
      this.gameSocket = null;
    }
    
    // Attempt to initialize again
    return this.init();
  }

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  isSocketConnected() {
    return this.isConnected && this.gameSocket && this.gameSocket.connected;
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