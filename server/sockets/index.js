// server/sockets/index.js
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
        return socket.emit('gameError', { message: 'userId is required for registration' });
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
        socket.gameId = gameId;
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
              hasActed: false,
              isAllIn: false
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
        return socket.emit('gameError', { message: 'Missing required fields for chat message' });
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

    // Request for game state update - useful for reconnection
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
        game.bettingRound = 'preflop';
        game.dealerPosition = 0; // First player is dealer for first hand
        await game.save();
        
        // Initialize game with first hand
        const updatedGame = await gameLogic.startNewHand(game);

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
          const currentPlayer = gameWithBetting.players.find(p => 
            p.user.toString() === gameWithBetting.currentTurn.toString());
          
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
        socket.emit('gameError', { message: 'Server error', details: error.message });
      }
    });

    // Player action (fold, check, call, bet, raise, all-in)
    socket.on('playerAction', async ({ gameId, userId, action, amount = 0 }) => {
      try {
        // Find the game
        const game = await Game.findOne({ gameId });
        if (!game) {
          socket.emit('gameError', { message: 'Game not found' });
          return;
        }

        // Check if it's player's turn
        if (game.currentTurn.toString() !== userId) {
          socket.emit('gameError', { message: 'Not your turn' });
          return;
        }

        // Process the action
        const result = await gameLogic.processPlayerAction(game, userId, action, amount);

        // Notify all players about the action
        gameIo.to(gameId).emit('actionTaken', {
          playerId: userId,
          action,
          amount,
          pot: game.pot
        });

        // Update game state for all players
        gameIo.to(gameId).emit('gameUpdate', gameLogic.getSanitizedGameState(game));

        // Process the result of the action
        if (result.handEnded) {
          // Hand has ended (e.g., everyone folded except one player)
          const winnerPlayer = game.players.find(p => p.user.toString() === result.winners[0]);
          
          gameIo.to(gameId).emit('handResult', {
            winners: [{
              playerId: winnerPlayer.user.toString(),
              username: winnerPlayer.username,
              handName: 'Winner by fold'
            }],
            pot: game.pot,
            message: result.message
          });
          
          // Prepare for next hand after a delay
          setTimeout(async () => {
            const nextHandGame = await gameLogic.prepareNextHand(game);
            
            if (nextHandGame.status === 'completed') {
              // Game has ended
              gameIo.to(gameId).emit('gameEnded', {
                message: 'Game ended - not enough active players'
              });
            } else {
              // Start next hand
              const newHand = await gameLogic.startNewHand(nextHandGame);
              
              // Emit new game state
              gameIo.to(gameId).emit('newHand', gameLogic.getSanitizedGameState(newHand));
              
              // Emit private cards to each player
              newHand.players.forEach(player => {
                const socketId = userSockets.get(player.user.toString());
                if (socketId) {
                  gameIo.to(socketId).emit('dealCards', {
                    hand: player.hand
                  });
                }
              });
              
              // Start the betting round
              const bettingGame = await gameLogic.startBettingRound(newHand);
              
              // Notify the current player it's their turn
              if (bettingGame.currentTurn) {
                const currentPlayer = bettingGame.players.find(p => 
                  p.user.toString() === bettingGame.currentTurn.toString());
                
                if (currentPlayer) {
                  const socketId = userSockets.get(currentPlayer.user.toString());
                  if (socketId) {
                    gameIo.to(socketId).emit('yourTurn', {
                      options: gameLogic.getPlayerOptions(bettingGame, currentPlayer.user),
                      timeLimit: 30
                    });
                    
                    gameIo.to(gameId).emit('turnChanged', { 
                      playerId: currentPlayer.user.toString(),
                      username: currentPlayer.username
                    });
                  }
                }
              }
              
              // Update game state
              gameIo.to(gameId).emit('gameUpdate', gameLogic.getSanitizedGameState(bettingGame));
            }
          }, 5000); // 5 second delay before next hand
          
          return;
        }
        
        if (result.roundEnded) {
          // Betting round has ended, move to next phase
          let nextGame = game;
          
          if (result.nextPhase === 'flop') {
            // Deal the flop
            nextGame = await gameLogic.dealFlop(game);
            gameIo.to(gameId).emit('dealFlop', {
              communityCards: nextGame.communityCards
            });
          } else if (result.nextPhase === 'turn') {
            // Deal the turn
            nextGame = await gameLogic.dealTurn(game);
            gameIo.to(gameId).emit('dealTurn', {
              communityCards: nextGame.communityCards
            });
          } else if (result.nextPhase === 'river') {
            // Deal the river
            nextGame = await gameLogic.dealRiver(game);
            gameIo.to(gameId).emit('dealRiver', {
              communityCards: nextGame.communityCards
            });
          } else if (result.nextPhase === 'showdown') {
            // Process showdown
            const showdownResult = await gameLogic.processShowdown(game);
            
            gameIo.to(gameId).emit('handResult', {
              winners: showdownResult.winners,
              hands: showdownResult.hands,
              pot: game.pot
            });
            
            // Prepare for next hand after a delay
            setTimeout(async () => {
              const nextHandGame = await gameLogic.prepareNextHand(game);
              
              if (nextHandGame.status === 'completed') {
                // Game has ended
                gameIo.to(gameId).emit('gameEnded', {
                  message: 'Game ended - not enough active players'
                });
              } else {
                // Start next hand
                const newHand = await gameLogic.startNewHand(nextHandGame);
                
                // Emit new game state
                gameIo.to(gameId).emit('newHand', gameLogic.getSanitizedGameState(newHand));
                
                // Emit private cards to each player
                newHand.players.forEach(player => {
                  const socketId = userSockets.get(player.user.toString());
                  if (socketId) {
                    gameIo.to(socketId).emit('dealCards', {
                      hand: player.hand
                    });
                  }
                });
                
                // Start the betting round
                const bettingGame = await gameLogic.startBettingRound(newHand);
                
                // Notify the current player it's their turn
                if (bettingGame.currentTurn) {
                  const currentPlayer = bettingGame.players.find(p => 
                    p.user.toString() === bettingGame.currentTurn.toString());
                  
                  if (currentPlayer) {
                    const socketId = userSockets.get(currentPlayer.user.toString());
                    if (socketId) {
                      gameIo.to(socketId).emit('yourTurn', {
                        options: gameLogic.getPlayerOptions(bettingGame, currentPlayer.user),
                        timeLimit: 30
                      });
                      
                      gameIo.to(gameId).emit('turnChanged', { 
                        playerId: currentPlayer.user.toString(),
                        username: currentPlayer.username
                      });
                    }
                  }
                }
                
                // Update game state
                gameIo.to(gameId).emit('gameUpdate', gameLogic.getSanitizedGameState(bettingGame));
              }
            }, 5000); // 5 second delay before next hand
            
            return;
          }
          
          // Start next betting round
          const bettingGame = await gameLogic.startBettingRound(nextGame);
          
          // Notify the current player it's their turn
          if (bettingGame.currentTurn) {
            const currentPlayer = bettingGame.players.find(p => 
              p.user.toString() === bettingGame.currentTurn.toString());
            
            if (currentPlayer) {
              const socketId = userSockets.get(currentPlayer.user.toString());
              if (socketId) {
                gameIo.to(socketId).emit('yourTurn', {
                  options: gameLogic.getPlayerOptions(bettingGame, currentPlayer.user),
                  timeLimit: 30
                });
                
                gameIo.to(gameId).emit('turnChanged', { 
                  playerId: currentPlayer.user.toString(),
                  username: currentPlayer.username
                });
              }
            }
          }
          
          // Update game state
          gameIo.to(gameId).emit('gameUpdate', gameLogic.getSanitizedGameState(bettingGame));
        } else {
          // Round continues, notify next player
          if (game.currentTurn) {
            const currentPlayer = game.players.find(p => 
              p.user.toString() === game.currentTurn.toString());
            
            if (currentPlayer) {
              const socketId = userSockets.get(currentPlayer.user.toString());
              if (socketId) {
                gameIo.to(socketId).emit('yourTurn', {
                  options: gameLogic.getPlayerOptions(game, currentPlayer.user),
                  timeLimit: 30
                });
                
                gameIo.to(gameId).emit('turnChanged', { 
                  playerId: currentPlayer.user.toString(),
                  username: currentPlayer.username
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Player action error:', error);
        socket.emit('gameError', { message: 'Error processing action', details: error.message });
      }
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

    // Leave game
    socket.on('leaveGame', async ({ gameId, userId }) => {
      try {
        if (!gameId || !userId) {
          return socket.emit('gameError', { message: 'Missing required fields' });
        }

        // Find the game
        const game = await Game.findOne({ gameId });
        if (!game) {
          socket.emit('gameError', { message: 'Game not found' });
          return;
        }

        // Find the player
        const playerIndex = game.players.findIndex(p => p.user.toString() === userId);
        if (playerIndex === -1) {
          socket.emit('gameError', { message: 'Player not in game' });
          return;
        }

        // Get player info for notification
        const playerName = game.players[playerIndex].username;

        // Handle differently based on game status
        if (game.status === 'waiting') {
          // Remove player from the game completely
          game.players.splice(playerIndex, 1);
        } else {
          // Mark player as inactive, but keep their data
          game.players[playerIndex].isActive = false;
          game.players[playerIndex].hasFolded = true;
          
          // Check if the game can continue (need at least 2 active players)
          const activePlayers = game.players.filter(p => p.isActive && !p.hasFolded);
          if (activePlayers.length < 2) {
            // End the current hand, award pot to remaining player
            if (activePlayers.length === 1) {
              await gameLogic.awardPot(game, activePlayers);
              
              // Notify about the winner
              gameIo.to(gameId).emit('handResult', {
                winners: [{
                  playerId: activePlayers[0].user.toString(),
                  username: activePlayers[0].username,
                  handName: 'Winner by forfeit'
                }],
                pot: game.pot,
                message: `${activePlayers[0].username} wins the pot as other players left`
              });
            }
            
            // Check if game should end
            const remainingPlayers = game.players.filter(p => p.isActive);
            if (remainingPlayers.length < 2) {
              game.status = 'completed';
              
              // Notify about game ending
              gameIo.to(gameId).emit('gameEnded', {
                message: 'Game ended - not enough active players'
              });
            } else {
              // Prepare for next hand
              await gameLogic.prepareNextHand(game);
            }
          } else if (game.currentTurn && game.currentTurn.toString() === userId) {
            // If it was this player's turn, move to next player
            try {
              const nextPlayerId = gameLogic.getNextPlayerToAct(game, 
                game.players.findIndex(p => p.user.toString() === userId));
              game.currentTurn = nextPlayerId;
              
              // Notify next player
              const nextPlayer = game.players.find(p => p.user.toString() === nextPlayerId.toString());
              const nextSocketId = userSockets.get(nextPlayerId.toString());
              
              if (nextSocketId && nextPlayer) {
                gameIo.to(nextSocketId).emit('yourTurn', {
                  options: gameLogic.getPlayerOptions(game, nextPlayerId),
                  timeLimit: 30
                });
                
                gameIo.to(gameId).emit('turnChanged', { 
                  playerId: nextPlayerId.toString(),
                  username: nextPlayer.username
                });
              }
            } catch (error) {
              console.log('Error getting next player, betting round may be complete');
              // Handle round end if needed
            }
          }
        }

        // Save the updated game
        await game.save();

        // Leave the socket room
        socket.leave(gameId);
        
        // Remove from game rooms tracking
        if (gameRooms.has(gameId)) {
          gameRooms.get(gameId).delete(socket.id);
        }

        // Notify all clients that player left
        gameIo.to(gameId).emit('playerLeft', {
          userId,
          username: playerName
        });
        
        // Send a chat message
        gameIo.to(gameId).emit('chatMessage', {
          type: 'system',
          message: `${playerName} has left the game`,
          timestamp: new Date()
        });

        // Update game state for all clients
        gameIo.to(gameId).emit('gameUpdate', gameLogic.getSanitizedGameState(game));

        // Acknowledge successful leave
        socket.emit('leaveGameSuccess');
      } catch (error) {
        console.error('Leave game error:', error);
        socket.emit('gameError', { message: 'Error leaving game', details: error.message });
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