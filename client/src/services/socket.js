// client/src/services/socket.js - Add this new file
import io from 'socket.io-client';
import { loadConfig } from './config';

// Store active socket connections
const activeConnections = new Map();

/**
 * Connect to a game socket namespace
 * @param {string} gameId - The game ID to connect to
 * @param {Function} onConnect - Connection callback
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} Socket instance
 */
export const connectGameSocket = async (gameId, onConnect, onError) => {
  try {
    // Check if we already have a connection for this game
    if (activeConnections.has(gameId)) {
      return activeConnections.get(gameId);
    }
    
    // Load app configuration
    const config = await loadConfig();
    
    // Create the socket URL
    const socketUrl = `${config.socketUrl}/game`;
    console.log(`Connecting to game socket at: ${socketUrl}`);
    
    // Connect to socket with better options for external access
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      query: { gameId }
    });
    
    // Set up event handlers
    socket.on('connect', () => {
      console.log(`Socket connected to game ${gameId}`);
      if (onConnect) onConnect(socket);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      if (onError) onError(error);
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${reason}`);
      
      // Remove from active connections if closed permanently
      if (reason === 'io server disconnect') {
        activeConnections.delete(gameId);
      }
    });
    
    // Store the connection
    activeConnections.set(gameId, socket);
    return socket;
  } catch (error) {
    console.error('Error setting up socket connection:', error);
    if (onError) onError(error);
    throw error;
  }
};

/**
 * Register a user with their socket
 * @param {Object} socket - Socket.IO instance
 * @param {string} userId - User ID
 */
export const registerUserSocket = (socket, userId) => {
  if (!socket || !userId) return;
  
  socket.emit('register', { userId });
  console.log(`Registered user ${userId} with socket`);
};

/**
 * Join a game room
 * @param {Object} socket - Socket.IO instance
 * @param {Object} data - Join data (gameId, userId, username)
 */
export const joinGame = (socket, { gameId, userId, username }) => {
  if (!socket || !gameId || !userId || !username) return;
  
  socket.emit('joinGame', { gameId, userId, username });
  console.log(`User ${username} joining game ${gameId}`);
};

/**
 * Disconnect from a game socket
 * @param {string} gameId - Game ID
 */
export const disconnectGameSocket = (gameId) => {
  if (activeConnections.has(gameId)) {
    const socket = activeConnections.get(gameId);
    socket.disconnect();
    activeConnections.delete(gameId);
    console.log(`Disconnected from game ${gameId}`);
  }
};

/**
 * Disconnect all active sockets
 */
export const disconnectAllSockets = () => {
  activeConnections.forEach((socket, gameId) => {
    socket.disconnect();
    console.log(`Disconnected from game ${gameId}`);
  });
  
  activeConnections.clear();
};