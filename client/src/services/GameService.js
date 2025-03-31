// client/src/services/GameService.js
import axios from 'axios';
import io from 'socket.io-client';
import authService from './AuthService';

const API_URL = process.env.VUE_APP_API_URL || '';
const SOCKET_URL = process.env.VUE_APP_SOCKET_URL || API_URL;

/**
 * Service for handling game-related API calls and socket connections
 */
class GameService {
  constructor() {
    this.socket = null;
    this.gameId = null;
    this.isConnected = false;
    this.eventHandlers = {};
  }
  
  /**
   * Create a new game
   * @param {string} creatorId - Creator user ID
   * @param {string} creatorName - Creator username
   * @returns {Promise} Response with gameId
   */
  async createGame(creatorId, creatorName) {
    try {
      const response = await axios.post(`${API_URL}/api/games`, {
        creatorId,
        creatorName
      });
      
      return response.data;
    } catch (error) {
      console.error('Create game error:', error);
      throw error;
    }
  }
  
  /**
   * Join an existing game
   * @param {string} gameId - Game ID
   * @param {string} playerId - Player user ID
   * @param {string} playerName - Player username
   * @returns {Promise} Response with success status
   */
  async joinGame(gameId, playerId, playerName) {
    try {
      const response = await axios.post(`${API_URL}/api/games/join/${gameId}`, {
        playerId,
        playerName
      });
      
      return response.data;
    } catch (error) {
      console.error('Join game error:', error);
      throw error;
    }
  }
  
  /**
   * Get game details by ID
   * @param {string} gameId - Game ID
   * @returns {Promise} Game data
   */
  async getGame(gameId) {
    try {
      const response = await axios.get(`${API_URL}/api/games/${gameId}`);
      return response.data;
    } catch (error) {
      console.error('Get game error:', error);
      throw error;
    }
  }
  
  /**
   * Start a game
   * @param {string} gameId - Game ID
   * @param {string} playerId - Player user ID
   * @returns {Promise} Response with success status
   */
  async startGame(gameId, playerId) {
    try {
      const response = await axios.post(`${API_URL}/api/games/start/${gameId}`, {
        playerId
      });
      
      return response.data;
    } catch (error) {
      console.error('Start game error:', error);
      throw error;
    }
  }
  
  /**
   * End a game
   * @param {string} gameId - Game ID
   * @returns {Promise} Response with success status
   */
  async endGame(gameId) {
    try {
      const response = await axios.put(`${API_URL}/api/games/end/${gameId}`);
      return response.data;
    } catch (error) {
      console.error('End game error:', error);
      throw error;
    }
  }
  
  /**
   * Get all active games
   * @returns {Promise} List of active games
   */
  async getActiveGames() {
    try {
      const response = await axios.get(`${API_URL}/api/games`);
      return response.data;
    } catch (error) {
      console.error('Get active games error:', error);
      throw error;
    }
  }
  
  /**
   * Get user's games
   * @returns {Promise} List of user's games
   */
  async getUserGames() {
    try {
      const response = await axios.get(`${API_URL}/api/games/user`);
      return response.data;
    } catch (error) {
      console.error('Get user games error:', error);
      throw error;
    }
  }
  
  /**
   * Get game results
   * @param {string} gameId - Game ID
   * @returns {Promise} Game results
   */
  async getGameResults(gameId) {
    try {
      const response = await axios.get(`${API_URL}/api/games/results/${gameId}`);
      return response.data;
    } catch (error) {
      console.error('Get game results error:', error);
      throw error;
    }
  }
  
  /**
   * Connect to game socket
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @returns {Promise} Promise that resolves when connected
   */
  connectToGame(gameId, userId, username) {
    return new Promise((resolve, reject) => {
      if (this.socket && this.isConnected && this.gameId === gameId) {
        // Already connected to this game
        resolve();
        return;
      }
      
      // Disconnect from any existing socket
      this.disconnect();
      
      // Connect to game namespace
      this.socket = io(`${SOCKET_URL}/game`);
      this.gameId = gameId;
      
      // Set up connection event
      this.socket.on('connect', () => {
        console.log('Connected to game socket');
        this.isConnected = true;
        
        // Register user with socket
        this.socket.emit('register', { userId });
        
        // Join game room
        this.socket.emit('joinGame', {
          gameId,
          userId,
          username
        });
        
        resolve();
      });
      
      // Set up error event
      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        reject(error);
      });
      
      // Set up disconnect event
      this.socket.on('disconnect', () => {
        console.log('Disconnected from game socket');
        this.isConnected = false;
      });
      
      // Forward all socket events to registered handlers
      this.setupEventForwarding();
    });
  }
  
  /**
   * Disconnect from game socket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.gameId = null;
  }
  
  /**
   * Setup forwarding of socket events to registered handlers
   */
  setupEventForwarding() {
    const events = [
      'gameUpdate',
      'gameStarted',
      'dealCards',
      'yourTurn',
      'turnChanged',
      'actionTaken',
      'dealFlop',
      'dealTurn',
      'dealRiver',
      'handResult',
      'newHand',
      'chatMessage',
      'playerJoined',
      'playerLeft',
      'gameEnded',
      'gameError',
      'playerConnectionChange'
    ];
    
    events.forEach(event => {
      this.socket.on(event, (data) => {
        // Call all registered handlers for this event
        if (this.eventHandlers[event]) {
          this.eventHandlers[event].forEach(handler => handler(data));
        }
      });
    });
  }
  
  /**
   * Register a handler for a socket event
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }
  
  /**
   * Unregister a handler for a socket event
   * @param {string} event - Event name
   * @param {Function} handler - Event handler to remove
   */
  off(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }
  }
  
  /**
   * Send a player action
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} action - Action (fold, check, call, bet, raise, allIn)
   * @param {number} amount - Bet/raise amount
   */
  sendPlayerAction(gameId, userId, action, amount = 0) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to game');
    }
    
    this.socket.emit('playerAction', {
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
   * @param {string} message - Message text
   */
  sendChatMessage(gameId, userId, username, message) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to game');
    }
    
    this.socket.emit('sendMessage', {
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
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to game');
    }
    
    this.socket.emit('leaveGame', {
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
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to game');
    }
    
    this.socket.emit('requestGameUpdate', {
      gameId,
      userId
    });
  }
}

// Create and export a singleton instance
export default new GameService();