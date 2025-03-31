// server/sockets/index.js - Updated version with improved real-time updates

const gameLogic = require('../utils/gameLogic');
const Game = require('../models/Game');
const User = require('../models/User');

// Map user IDs to socket IDs
const userSockets = new Map();
// Map game IDs to sets of connected sockets
const gameRooms = new Map();

module.exports = (io) => {
  // Game namespace
  const gameIo = io.of('/game');

  gameIo.on('connection', (socket) => {
    console.log('New client connected to game namespace', socket.id);

    // Store user socket
    socket.on('register', ({ userId }) => {
      if (!userId) {
        return socket.emit('error', { message: 'userId is required for registration' });
      }
      
      // Store the mapping
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    // Join game room
    socket.on('joinGame', async ({ gameId, userId, username }) => {
      try {
        if (!gameId || !userId || !username) {
          return socket.emit('gameError', { message: 'Missing required fields' });
        }

        // Join the socket room for this game
        socket.join(gameId);
        console.log(`User ${username} (${userId}) joined game ${gameId}`);
        
        // Track connections for this game
        if (!gameRooms.has(gameId)) {
          gameRooms.set(gameId, new Set());
        }
        gameRooms.get(gameId).add(socket.id);

        // Find the game
        const game = await Game.findOne({ gameId });
        if (!game) {
          socket.emit('gameError', { message: 'Game not found' });
          return;
        }

        // Check if player is already in the game
        const existingPlayer = game.players.find(player => player.user.toString() === userId);
        let playerAdded = false;
        
        if (!existingPlayer) {
          // Add player to the game
          if (game.players.length < 8 && game.status === 'waiting') {
            const user = await User.findById(userId);
            if (!user) {
              socket.emit('gameError', { message: 'User not found' });
              return;
            }

            // Add the new player
            game.players.push({
              user: userId,
              username,
              position: game.players.length,
              chips: 0,
              totalChips: user.balance > 1000 ? 1000 : user.balance,
              hand: [],
              isActive: true,
              hasFolded: false,
              hasActed: false
            });

            await game.save();
            playerAdded = true;
            
            // Emit a specific event when a new player joins
            gameIo.to(gameId).emit('playerJoined', {
              userId,
              username,
              position: game.players.length - 1
            });
            
            console.log(`New player ${username} added to game ${gameId}`);
          } else {
            socket.emit('gameError', { message: 'Cannot join the game' });
            return;
          }
        }

        // Always send updated game state to all players in the room
        const sanitizedGame = gameLogic.getSanitizedGameState(game);
        gameIo.to(gameId).emit('gameUpdate', sanitizedGame);
        
        // Send a chat message about the new player joining
        if (playerAdded) {
          gameIo.to(gameId).emit('chatMessage', {
            type: 'system',
            message: `${username} has joined the game`,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Join game socket error:', error);
        socket.emit('gameError', { message: 'Server error', details: error.message });
      }
    });

    // Chat messages
    socket.on('sendMessage', ({ gameId, userId, username, message }) => {
      if (!gameId || !userId || !username || !message) {
        return socket.emit('error', { message: 'Missing required fields for chat message' });
      }
      
      const chatMessage = {
        type: 'user',
        userId,
        username,
        message,
        timestamp: new Date()
      };
      
      gameIo.to(gameId).emit('chatMessage', chatMessage);
    });

    // Request for game state update - useful for reconnection or when clients need syncing
    socket.on('requestGameUpdate', async ({ gameId, userId }) => {
      try {
        if (!gameId) {
          return socket.emit('gameError', { message: 'Game ID is required' });
        }
        
        const game = await Game.findOne({ gameId });
        if (!game) {
          return socket.emit('gameError', { message: 'Game not found' });
        }
        
        const sanitizedGame = gameLogic.getSanitizedGameState(game);
        socket.emit('gameUpdate', sanitizedGame);
        
        // If userId is provided, send their personal cards too
        if (userId) {
          const player = game.players.find(p => p.user.toString() === userId);
          if (player && player.hand && player.hand.length > 0) {
            socket.emit('dealCards', { hand: player.hand });
          }
        }
      } catch (error) {
        console.error('Request game update error:', error);
        socket.emit('gameError', { message: 'Error fetching game update' });
      }
    });

    // Heartbeat to keep connection alive and verify socket is healthy
    socket.on('heartbeat', (data) => {
      socket.emit('heartbeatResponse', { 
        receivedAt: new Date(),
        socketId: socket.id,
        ...data 
      });
    });

    // Start game
    socket.on('startGame', async ({ gameId, userId }) => {
      try {
        // Find the game
        const game = await Game.findOne({ gameId });
        if (!game) {
          socket.emit('gameError', { message: 'Game not found' });
          return;
        }

        // Check if player is the creator
        if (game.creator.user.toString() !== userId) {
          socket.emit('gameError', { message: 'Only the creator can start the game' });
          return;
        }

        // Check if enough players
        if (game.players.length < 2) {
          socket.emit('gameError', { message: 'Need at least 2 players to start' });
          return;
        }

        // Start the game
        game.status = 'active';
        await game.save();
        
        const updatedGame = await gameLogic.startGame(game);

        // Send system message about game starting
        gameIo.to(gameId).emit('chatMessage', {
          type: 'system',
          message: 'The game has started',
          timestamp: new Date()
        });

        // Emit game state to all players
        gameIo.to(gameId).emit('gameStarted', gameLogic.getSanitizedGameState(updatedGame));

        // Emit private cards to each player
        updatedGame.players.forEach(player => {
          const socketId = userSockets.get(player.user.toString());
          if (socketId) {
            gameIo.to(socketId).emit('dealCards', {
              hand: player.hand
            });
          }
        });

        // Start the first betting round
        const gameWithBetting = await gameLogic.startBettingRound(updatedGame);

        // Notify the current player it's their turn
        if (gameWithBetting.currentTurn) {
          const currentPlayer = gameWithBetting.players.find(p => p.user.toString() === gameWithBetting.currentTurn.toString());
          if (currentPlayer) {
            const socketId = userSockets.get(currentPlayer.user.toString());
            if (socketId) {
              gameIo.to(socketId).emit('yourTurn', {
                options: gameLogic.getPlayerOptions(gameWithBetting, currentPlayer.user),
                timeLimit: 30 // 30 seconds to make a decision
              });
              
              // Let everyone know whose turn it is
              gameIo.to(gameId).emit('turnChanged', { 
                playerId: currentPlayer.user.toString(),
                username: currentPlayer.username
              });
            }
          }
        }

        // Update game state for all players
        gameIo.to(gameId).emit('gameUpdate', gameLogic.getSanitizedGameState(gameWithBetting));
      } catch (error) {
        console.error('Start game socket error:', error);
        socket.emit('gameError', { message: 'Server error' });
      }
    });

    // Player actions (rest of the socket.on handlers remain the same)
    socket.on('playerAction', async ({ gameId, userId, action, amount }) => {
      // ... existing code ...
    });

    // Handling player disconnection but staying in the game
    socket.on('disconnecting', () => {
      // Get all rooms this socket is in
      const rooms = Object.keys(socket.rooms);
      
      rooms.forEach(room => {
        // Skip the socket's own room (which is its ID)
        if (room !== socket.id) {
          // This is a game room
          if (gameRooms.has(room)) {
            gameRooms.get(room).delete(socket.id);
            
            // Emit to others that this player's connection state changed
            if (socket.userId) {
              gameIo.to(room).emit('playerConnectionChange', {
                userId: socket.userId,
                connected: false,
                timestamp: new Date()
              });
              
              console.log(`User ${socket.userId} disconnected from game ${room}`);
            }
          }
        }
      });
      
      // Remove from userSockets map
      if (socket.userId) {
        if (userSockets.get(socket.userId) === socket.id) {
          userSockets.delete(socket.userId);
        }
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);
      
      // This is handled in disconnecting event above,
      // but adding as a fallback
      if (socket.userId) {
        if (userSockets.get(socket.userId) === socket.id) {
          userSockets.delete(socket.userId);
        }
      }
    });
    
    // Player reconnecting
    socket.on('reconnect', ({ userId, gameId }) => {
      if (userId && gameId) {
        userSockets.set(userId, socket.id);
        socket.userId = userId;
        socket.join(gameId);
        
        if (!gameRooms.has(gameId)) {
          gameRooms.set(gameId, new Set());
        }
        gameRooms.get(gameId).add(socket.id);
        
        // Notify other players this user reconnected
        gameIo.to(gameId).emit('playerConnectionChange', {
          userId,
          connected: true,
          timestamp: new Date()
        });
        
        console.log(`User ${userId} reconnected to game ${gameId}`);
      }
    });
  });
  
  // Regular cleanup of game rooms with no connections (every 5 minutes)
  setInterval(() => {
    for (const [gameId, sockets] of gameRooms.entries()) {
      if (sockets.size === 0) {
        gameRooms.delete(gameId);
        console.log(`Removed empty game room: ${gameId}`);
      }
    }
  }, 5 * 60 * 1000);
};