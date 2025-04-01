// client/src/services/SocketService.js
import io from 'socket.io-client';
import store from '../store';
import { loadConfig } from './config';

/**
 * Service for handling Socket.IO connections
 */
// Define a map to track the last update time for each game
const lastUpdateTime = {};

class SocketService {
  constructor() {
    this.socket = null;
    this.gameSocket = null;
    this.isConnected = false;
    this.events = {};
    this.connectionPromise = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.connectionTimeout = null;
  }

  /**
   * Initialize and connect to socket server
   * @returns {Promise} Promise that resolves when connected
   */
  async init() {
    // Clear any existing timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // If we already have a connection promise, return it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
  
    // If we're already connected, resolve immediately
    if (this.isConnected && this.gameSocket) {
      return Promise.resolve(this.gameSocket);
    }
  
    // Create a connection promise with timeout handling
    this.connectionPromise = new Promise((resolve, reject) => {
      // Set a timeout to prevent hanging connections
      this.connectionTimeout = setTimeout(() => {
        console.error('Socket connection timeout after 10 seconds');
        this.connectionPromise = null;
        reject(new Error('Connection timeout'));
      }, 10000);

      // Move the async logic to a separate function
      const setupConnection = () => {
        // Load configuration to get the socket URL
        loadConfig()
          .then(config => {
            // Get the socket URL from config
            const socketUrl = config.socketUrl || window.location.origin;
            console.log('Connecting to socket server at:', socketUrl);
            
            // If there's an existing socket, disconnect it
            if (this.gameSocket) {
              this.gameSocket.disconnect();
              this.gameSocket = null;
            }
            
            // Connect to game namespace with optimized settings
            this.gameSocket = io(`${socketUrl}/game`, {
              transports: ['websocket', 'polling'], // Try both transport methods
              reconnection: true,
              reconnectionAttempts: 5,
              reconnectionDelay: 1000,
              timeout: 8000, // Reduced timeout for faster feedback
              autoConnect: true,
              withCredentials: true,
              forceNew: true
            });
            
            // Add connection event listener
            this.gameSocket.on('connect', () => {
              console.log('Connected to game socket with ID:', this.gameSocket.id);
              console.log('Using transport:', this.gameSocket.io.engine.transport.name);
              this.isConnected = true;
              this.connectionAttempts = 0;
              
              // Clear the connection timeout
              if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
              }
              
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
              
              // Increment connection attempts
              this.connectionAttempts++;
              
              if (this.connectionAttempts >= this.maxConnectionAttempts) {
                if (this.connectionTimeout) {
                  clearTimeout(this.connectionTimeout);
                  this.connectionTimeout = null;
                }
                this.connectionPromise = null;
                reject(new Error(`Failed to connect after ${this.maxConnectionAttempts} attempts`));
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
            
            // Set up game event listeners
            this.setupGameListeners();
          })
          .catch(error => {
            console.error('Error loading config in socket service:', error);
            if (this.connectionTimeout) {
              clearTimeout(this.connectionTimeout);
              this.connectionTimeout = null;
            }
            this.connectionPromise = null;
            reject(error);
          });
      };
  
      // Execute the setup function
      setupConnection();
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
    
    // Make sure socket is initialized and connected with timeout
    try {
      // First initialize socket connection
      await this.init();
      
      // Then create promise for game joining
      const joinPromise = new Promise((resolve, reject) => {
        // Set a timeout for the join operation
        const joinTimeout = setTimeout(() => {
          reject(new Error('Join game timeout after 8 seconds'));
        }, 8000);
        
        // Set up a one-time event listener for join confirmation
        this.gameSocket.once('gameUpdate', () => {
          clearTimeout(joinTimeout);
          resolve(true);
        });
        
        // Also listen for errors
        const errorHandler = (error) => {
          clearTimeout(joinTimeout);
          reject(error);
        };
        
        this.gameSocket.once('gameError', errorHandler);
        
        console.log(`Joining game ${gameId} as ${username} (${userId})`);
        
        // Join the game room
        this.gameSocket.emit('joinGame', {
          gameId,
          userId,
          username
        });
        
        // Request game state update as a backup
        setTimeout(() => {
          this.requestGameUpdate(gameId, userId);
        }, 500);
      });
      
      return await joinPromise;
    } catch (error) {
      console.error('Error joining game:', error);
      throw error;
    }
  }

  /**
   * Start a game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise} Promise that resolves when game starts
   */
  startGame(gameId, userId) {
    // First initialize the socket, then handle the game start
    return this.init().then(() => {
      return new Promise((resolve, reject) => {
        if (!gameId || !userId) {
          return reject(new Error('Missing required parameters for startGame'));
        }
        
        if (!this.gameSocket || !this.isConnected) {
          return reject(new Error('Socket not connected'));
        }
        
        console.log(`Emitting startGame event for game ${gameId}`);
        
        // Set a timeout for the operation
        const startTimeout = setTimeout(() => {
          reject(new Error('Start game timeout after 10 seconds'));
        }, 10000);
        
        // Set up a one-time event listener for confirmation
        this.gameSocket.once('gameStarted', (data) => {
          console.log('Received gameStarted event:', data);
          clearTimeout(startTimeout);
          resolve(data);
        });
        
        // Also listen for errors
        const errorHandler = (error) => {
          console.error('Game error during start:', error);
          clearTimeout(startTimeout);
          reject(error);
        };
        
        this.gameSocket.once('gameError', errorHandler);
        
        // Emit the start game event
        this.gameSocket.emit('startGame', {
          gameId,
          userId
        });
        
        // Also emit a simple log message for debugging
        this.gameSocket.emit('chatMessage', {
          gameId,
          userId,
          username: 'System',
          message: 'Starting game...'
        });
      });
    }).catch(error => {
      console.error('Error in startGame:', error);
      throw error;
    });
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
   * Request game state update
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise} Promise that resolves when update is received
   */
  requestGameUpdate(gameId, userId) {
    if (!gameId) {
      console.warn('Cannot request game update - gameId is required');
      return;
    }
    
    if (!this.gameSocket || !this.isConnected) {
      console.warn('Cannot request game update - socket not connected');
      return;
    }
    
    // Throttle requests - don't send if recent request was made
    const now = Date.now();
    const lastUpdate = lastUpdateTime[gameId] || 0;
    
    if (now - lastUpdate < 2000) {
      console.log('Throttling game update request');
      return;
    }
    
    console.log(`Requesting game update for ${gameId}`);
    lastUpdateTime[gameId] = now;
    
    this.gameSocket.emit('requestGameUpdate', {
      gameId,
      userId
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
   * Setup game event listeners
   */
  setupGameListeners() {
    if (!this.gameSocket) return;
    
    // Define events to listen for
    const events = [
      'gameUpdate',
      'gameStarted',
      'playerJoined',
      'playerLeft',
      'chatMessage',
      'dealCards',
      'yourTurn',
      'turnChanged',
      'actionTaken',
      'dealFlop',
      'dealTurn',
      'dealRiver',
      'handResult',
      'newHand',
      'gameEnded',
      'gameError',
      'playerConnectionChange'
    ];
    
    // Register listeners for each event
    events.forEach(event => {
      // Remove any existing listeners to prevent duplicates
      this.gameSocket.off(event);
      
      // Add new listener that will emit to our own events system
      this.gameSocket.on(event, (data) => {
        this.emit(event, data);
      });
    });
  }

  /**
   * Disconnect from socket
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

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  isSocketConnected() {
    return this.isConnected && this.gameSocket && this.gameSocket.connected;
  }

  /**
   * Debug information about socket state
   */
  debug() {
    console.group('Socket Debug Info');
    console.log('Is Connected:', this.isConnected);
    console.log('Socket ID:', this.gameSocket?.id || 'none');
    console.log('Socket Connected:', this.gameSocket?.connected || false);
    console.log('Connection Attempts:', this.connectionAttempts);
    
    // List all event listeners
    console.log('Registered Event Handlers:');
    const events = Object.keys(this.events);
    events.forEach(event => {
      console.log(`- ${event}: ${this.events[event].length} handlers`);
    });
    console.groupEnd();
    
    return {
      connected: this.isConnected,
      socketId: this.gameSocket?.id,
      handlers: events.length
    };
  }

  async joinGameWithRetry(gameId, userId, username, maxRetries = 3) {
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        console.log(`Attempt ${retries + 1} to join game ${gameId}`);
        
        // Make sure we're connected
        if (!this.isConnected || !this.gameSocket) {
          await this.init();
        }
        
        // Join the game room
        await this.joinGame(gameId, userId, username);
        
        console.log(`Successfully joined game ${gameId} on attempt ${retries + 1}`);
        
        // Request immediate game update to ensure current state
        this.requestGameUpdate(gameId, userId);
        
        return true;
      } catch (error) {
        console.error(`Join game attempt ${retries + 1} failed:`, error);
        retries++;
        
        if (retries >= maxRetries) {
          console.error(`Failed to join game after ${maxRetries} attempts`);
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  // Add this method to ensure reliable game updates
  ensureGameUpdate(gameId, userId, intervalMs = 5000, duration = 20000) {
    console.log(`Setting up game update polling for game ${gameId}`);
    
    // Request initial update if enough time has passed since last update
    const now = Date.now();
    const lastUpdate = lastUpdateTime[gameId] || 0;
    
    if (now - lastUpdate > 2000) {
      this.requestGameUpdate(gameId, userId);
      lastUpdateTime[gameId] = now;
    } else {
      console.log('Skipping immediate update due to recent request');
    }
    
    // Set up interval for periodic updates with throttling
    const intervalId = setInterval(() => {
      if (!this.isConnected) return;
      
      const currentTime = Date.now();
      const lastUpdate = lastUpdateTime[gameId] || 0;
      
      // Only request update if enough time has passed
      if (currentTime - lastUpdate > 2000) {
        this.requestGameUpdate(gameId, userId);
        lastUpdateTime[gameId] = currentTime;
      }
    }, intervalMs);
    
    // Clear interval after duration
    setTimeout(() => {
      clearInterval(intervalId);
      console.log('Stopped game update polling');
    }, duration);
    
    return intervalId;
  }  
}

// Create and export singleton instance
export default new SocketService();