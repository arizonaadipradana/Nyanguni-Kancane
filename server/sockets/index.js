// server/sockets/index.js
const gameLogic = require("../utils/gameLogic");
const Game = require("../models/Game");
const User = require("../models/User");
const mongoose = require("mongoose");
const joiningPlayers = new Map(); // gameId-userId -> timestamp

// Map user IDs to socket IDs
const userSockets = new Map();
// Map game IDs to sets of connected sockets
const gameRooms = new Map();
module.exports = (io) => {
  // Game namespace
  const gameIo = io.of("/game");

  /**
   * Safely compare MongoDB ObjectIDs
   * @param {ObjectId|string} id1 - First ID
   * @param {ObjectId|string} id2 - Second ID
   * @returns {boolean} True if IDs match
   */
  function compareIds(id1, id2) {
    const str1 = id1?.toString ? id1.toString() : String(id1);
    const str2 = id2?.toString ? id2.toString() : String(id2);

    return str1 === str2;
  }

  gameIo.on("connection", (socket) => {
    console.log("New client connected to game namespace", socket.id);
    console.log("Client handshake query:", socket.handshake.query);
    console.log("Client handshake headers:", socket.handshake.headers);

    // Store user socket
    socket.on("register", ({ userId }) => {
      if (!userId) {
        return socket.emit("gameError", {
          message: "userId is required for registration",
        });
      }

      // Store the mapping
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    // Join game room
    socket.on("joinGame", async ({ gameId, userId, username }) => {
      try {
        if (!gameId || !userId || !username) {
          return socket.emit("gameError", {
            message: "Missing required fields",
          });
        }

        // Create a unique key for this join operation
        const joinKey = `${gameId}-${userId}`;

        // Check if this player is already in the process of joining
        const existingJoin = joiningPlayers.get(joinKey);
        if (existingJoin) {
          const now = Date.now();
          // If the existing join is less than 5 seconds old, skip this request
          if (now - existingJoin < 5000) {
            console.log(
              `Ignoring duplicate join request for ${username} (${userId}) to game ${gameId} - already processing`
            );
            return;
          } else {
            // If it's an old join (>5 seconds), clear it and continue
            joiningPlayers.delete(joinKey);
          }
        }

        // Set joining status to prevent duplicate processing
        joiningPlayers.set(joinKey, Date.now());

        // Join the socket room for this game
        socket.join(gameId);
        socket.gameId = gameId;
        console.log(`User ${username} (${userId}) joined game ${gameId}`);

        // Track connections for this game
        if (!gameRooms.has(gameId)) {
          gameRooms.set(gameId, new Set());
        }
        gameRooms.get(gameId).add(socket.id);

        // Find the game with findOne to get a fresh document
        const game = await Game.findOne({ gameId });
        if (!game) {
          joiningPlayers.delete(joinKey); // Clear join status
          socket.emit("gameError", { message: "Game not found" });
          return;
        }

        // Check if player is already in the game
        const existingPlayerIndex = game.players.findIndex(
          (player) => String(player.user) === String(userId)
        );

        let playerAdded = false;
        let playerReactivated = false;

        if (existingPlayerIndex === -1) {
          // Player is not in the game yet, add them
          if (game.status === "waiting") {
            try {
              const user = await User.findById(userId);
              if (!user) {
                joiningPlayers.delete(joinKey); // Clear join status
                socket.emit("gameError", { message: "User not found" });
                return;
              }

              // IMPORTANT FIX: Make sure user ID is a proper ObjectId or string
              const userIdToAdd = mongoose.Types.ObjectId.isValid(userId)
                ? mongoose.Types.ObjectId(userId)
                : userId;

              // Add the new player with proper ID format
              game.players.push({
                user: userIdToAdd,
                username,
                position: game.players.length,
                chips: 0,
                totalChips: user.balance > 1000 ? 1000 : user.balance,
                hand: [],
                isActive: true,
                hasFolded: false,
                hasActed: false,
                isAllIn: false,
              });

              // FIX: Use a more robust approach with findOneAndUpdate
              // instead of save() to avoid version conflicts
              const mongooseHelpers = require("../utils/mongoose-helpers");

              try {
                // Use atomic update to add player without version conflicts
                await mongooseHelpers.atomicGameUpdate(Game, gameId, {
                  $push: {
                    players: {
                      user: userIdToAdd,
                      username,
                      position: game.players.length - 1,
                      chips: 0,
                      totalChips: user.balance > 1000 ? 1000 : user.balance,
                      hand: [],
                      isActive: true,
                      hasFolded: false,
                      hasActed: false,
                      isAllIn: false,
                    },
                  },
                });

                playerAdded = true;
                console.log(
                  `New player ${username} added to game ${gameId} using atomic update`
                );
              } catch (atomicError) {
                console.error(`Atomic update failed: ${atomicError.message}`);

                // Fallback to traditional save with retry logic if atomic update fails
                let saved = false;
                let attempts = 0;
                const maxAttempts = 3;

                while (!saved && attempts < maxAttempts) {
                  try {
                    await game.save();
                    saved = true;
                    playerAdded = true;
                    console.log(
                      `New player ${username} added to game ${gameId} using save()`
                    );
                  } catch (saveError) {
                    if (saveError.name === "VersionError") {
                      attempts++;
                      console.log(
                        `Version conflict on join (attempt ${attempts}), retrying...`
                      );

                      // Get a fresh copy
                      const freshGame = await Game.findOne({ gameId });
                      if (!freshGame) {
                        throw new Error("Game no longer exists");
                      }

                      // Check if player was added by another process
                      const playerExists = freshGame.players.some(
                        (p) => String(p.user) === String(userId)
                      );

                      if (playerExists) {
                        console.log(
                          `Player ${username} was already added by another process`
                        );
                        saved = true; // Consider it saved
                        playerAdded = true;
                      } else {
                        // Player still needs to be added
                        freshGame.players.push({
                          user: userIdToAdd,
                          username,
                          position: freshGame.players.length,
                          chips: 0,
                          totalChips: user.balance > 1000 ? 1000 : user.balance,
                          hand: [],
                          isActive: true,
                          hasFolded: false,
                          hasActed: false,
                          isAllIn: false,
                        });

                        // Try to save the fresh document
                        try {
                          await freshGame.save();
                          saved = true;
                          playerAdded = true;
                        } catch (retryError) {
                          if (attempts >= maxAttempts - 1) {
                            throw retryError;
                          }
                          // Otherwise continue to next iteration
                        }
                      }

                      // Short delay before retry
                      await new Promise((resolve) =>
                        setTimeout(resolve, 100 * attempts)
                      );
                    } else {
                      // Not a version error, rethrow
                      throw saveError;
                    }
                  }
                }
              }
            } catch (error) {
              console.error(`Error adding player to game: ${error.message}`);
              joiningPlayers.delete(joinKey); // Clear join status
              socket.emit("gameError", {
                message: `Failed to join game: ${error.message}`,
              });
              return;
            }
          } else {
            joiningPlayers.delete(joinKey); // Clear join status
            socket.emit("gameError", { message: "Game already started" });
            return;
          }
        }

        // Always send updated game state to all players in the room
        // Use findOne to get the latest state
        const latestGame = await Game.findOne({ gameId });
        const sanitizedGame = gameLogic.getSanitizedGameState(latestGame);

        console.log(`Game update for ${gameId}:`, {
          status: sanitizedGame.status,
          playerCount: sanitizedGame.players.length,
          players: sanitizedGame.players.map(p => ({
            id: p.id,
            username: p.username
          }))
        });
        
        // Ensure creator property is explicitly set for everyone
        if (!sanitizedGame.creator && latestGame.creator) {
          console.log(`Adding missing creator info to game ${gameId}`);
          sanitizedGame.creator = {
            user: latestGame.creator.user.toString(),
            username: latestGame.creator.username
          };
        }
        
        // Important - make sure this is visible to all clients including the host
        sanitizedGame.allPlayers = sanitizedGame.players.map(p => ({
          id: p.id,
          username: p.username,
          isActive: p.isActive
        }));        

        // Emit game update to everyone
        gameIo.to(gameId).emit("gameUpdate", sanitizedGame);

        // Send creator info to the new player
        socket.emit("creatorInfo", {
          creator: latestGame.creator,
          currentUserId: userId,
          isCreator:
            latestGame.creator && latestGame.creator.user.toString() === userId,
        });

        // Only send join notifications for newly added players
        if (playerAdded) {
          // Emit a specific event when a new player joins
          gameIo.to(gameId).emit("playerJoined", {
            userId,
            username,
            position: latestGame.players.length - 1,
          });

          // Send a chat message about the new player joining
          gameIo.to(gameId).emit("chatMessage", {
            type: "system",
            message: `${username} has joined the game`,
            timestamp: new Date(),
          });
        } else if (playerReactivated) {
          // Send a chat message about the player rejoining
          gameIo.to(gameId).emit("chatMessage", {
            type: "system",
            message: `${username} has rejoined the game`,
            timestamp: new Date(),
          });
        }

        // Clear the joining status now that we're done
        joiningPlayers.delete(joinKey);
      } catch (error) {
        // Clear joining status on error
        if (gameId && userId) {
          joiningPlayers.delete(`${gameId}-${userId}`);
        }

        console.error("Join game socket error:", error);
        socket.emit("gameError", {
          message: "Server error",
          details: error.message,
        });
      }
    });

    // Chat messages
    socket.on("sendMessage", ({ gameId, userId, username, message }) => {
      if (!gameId || !userId || !username || !message) {
        return socket.emit("gameError", {
          message: "Missing required fields for chat message",
        });
      }

      const chatMessage = {
        type: "user",
        userId,
        username,
        message,
        timestamp: new Date(),
      };

      gameIo.to(gameId).emit("chatMessage", chatMessage);
    });

    // Request for game state update - useful for reconnection
    socket.on("requestGameUpdate", async ({ gameId, userId }) => {
      try {
        if (!gameId) {
          return socket.emit("gameError", { message: "Game ID is required" });
        }

        console.log(
          `Game update requested for ${gameId} by ${userId || "unknown user"}`
        );

        const game = await Game.findOne({ gameId });
        if (!game) {
          return socket.emit("gameError", { message: "Game not found" });
        }

        // Send game state to ALL clients in the room to ensure everyone is in sync
        const sanitizedGame = gameLogic.getSanitizedGameState(game);
        console.log(`Game update for ${gameId}:`, {
          status: sanitizedGame.status,
          playerCount: sanitizedGame.players.length,
          players: sanitizedGame.players.map((p) => ({
            id: p.id,
            username: p.username,
          })),
        });

        // Ensure creator property is explicitly set for everyone
        if (!sanitizedGame.creator && latestGame.creator) {
          console.log(`Adding missing creator info to game ${gameId}`);
          sanitizedGame.creator = {
            user: latestGame.creator.user.toString(),
            username: latestGame.creator.username,
          };
        }

        // Important - make sure this is visible to all clients including the host
        sanitizedGame.allPlayers = sanitizedGame.players.map((p) => ({
          id: p.id,
          username: p.username,
          isActive: p.isActive,
        }));

        gameIo.to(gameId).emit("gameUpdate", sanitizedGame);

        // If userId is provided, send their personal cards too
        if (userId) {
          const player = game.players.find((p) => p.user.toString() === userId);
          if (player && player.hand && player.hand.length > 0) {
            socket.emit("dealCards", { hand: player.hand });
          }

          // If it's this player's turn, make sure they know
          if (game.currentTurn && game.currentTurn.toString() === userId) {
            // Get the current player
            const currentPlayer = game.players.find(
              (p) => p.user.toString() === userId
            );

            if (currentPlayer) {
              // Tell this player it's their turn
              socket.emit("yourTurn", {
                options: gameLogic.getPlayerOptions(game, userId),
                timeLimit: 30, // 30 seconds to make a decision
              });

              // Also broadcast to everyone whose turn it is
              gameIo.to(gameId).emit("turnChanged", {
                playerId: userId,
                username: currentPlayer.username,
              });

              console.log(
                `Notified ${currentPlayer.username} that it's their turn`
              );
            }
          }
        }
      } catch (error) {
        console.error("Request game update error:", error);
        socket.emit("gameError", { message: "Error fetching game update" });
      }
    });

    // Start game
    socket.on("startGame", async ({ gameId, userId }) => {
      console.log(
        `Received startGame event for game ${gameId} from user ${userId}`
      );

      try {
        // Find the game with lean() for better performance
        const game = await Game.findOne({ gameId });
        if (!game) {
          console.log(`Game not found: ${gameId}`);
          return socket.emit("gameError", { message: "Game not found" });
        }

        // Check if player is the creator
        const creatorId = game.creator.user.toString();
        const requestUserId = userId.toString();

        if (creatorId !== requestUserId) {
          console.log(
            `User ${userId} is not the creator (${creatorId}) of game ${gameId}`
          );
          return socket.emit("gameError", {
            message: "Only the creator can start the game",
          });
        }

        // Check if enough players
        if (game.players.length < 2) {
          console.log(
            `Not enough players in game ${gameId}: ${game.players.length}`
          );
          return socket.emit("gameError", {
            message: "Need at least 2 players to start",
          });
        }

        // Check if game already started
        if (game.status !== "waiting") {
          console.log(
            `Game ${gameId} already started (status: ${game.status})`
          );
          return socket.emit("gameError", {
            message: "Game has already been started",
          });
        }

        console.log(
          `Starting game ${gameId} with ${game.players.length} players`
        );

        // IMPORTANT FIX: Create a completely fresh deck with enhanced shuffling
        const cardDeck = require("../utils/cardDeck");
        game.deck = cardDeck.getFreshShuffledDeck();

        // Log deck statistics to verify proper shuffling
        const deckStats = cardDeck.getDeckStats(game.deck);
        console.log(`New game deck statistics:`, deckStats);

        // Update game status
        game.status = "active";
        game.bettingRound = "preflop";
        game.dealerPosition = 0; // First player is dealer for first hand
        await game.save();

        // Send system message about game starting
        gameIo.to(gameId).emit("chatMessage", {
          type: "system",
          message: "The game has started",
          timestamp: new Date(),
        });

        console.log(`Game ${gameId} status updated to active`);

        // Initialize game with first hand - WRAPPED IN TRY/CATCH WITH BETTER ERROR HANDLING
        try {
          // Start a new hand with our enhanced shuffled deck
          const updatedGame = await gameLogic.startNewHand(game);
          console.log(`First hand started for game ${gameId}`);

          // Log the cards dealt to each player for verification
          updatedGame.players.forEach((player) => {
            if (player.hand && player.hand.length) {
              console.log(
                `Player ${player.username} cards:`,
                player.hand.map((c) => `${c.rank} of ${c.suit}`).join(", ")
              );
            }
          });

          // VALIDATION: Check for duplicate cards
          try {
            gameLogic.validateGameCards(updatedGame);
          } catch (validationError) {
            console.error(`Card validation failed: ${validationError.message}`);

            // Try to fix the issue
            const debugging = require("../utils/debugging");
            try {
              await debugging.fixDuplicateCards(updatedGame);
              // Re-validate after fixing
              gameLogic.validateGameCards(updatedGame);
            } catch (fixError) {
              socket.emit("gameError", {
                message: "Card validation failed. Please restart the game.",
                details: validationError.message,
              });
              return;
            }
          }

          // Emit game state to all players
          gameIo
            .to(gameId)
            .emit("gameStarted", gameLogic.getSanitizedGameState(updatedGame));
          console.log(`Game started event emitted for game ${gameId}`);

          // Emit private cards to each player
          for (const player of updatedGame.players) {
            const socketId = userSockets.get(player.user.toString());
            if (socketId) {
              console.log(
                `Sending cards to player ${player.username}:`,
                player.hand.map((c) => `${c.rank} of ${c.suit}`).join(", ")
              );
              gameIo.to(socketId).emit("dealCards", {
                hand: player.hand,
              });
            } else {
              console.log(
                `Could not find socket for player ${player.username}`
              );
            }
          }

          // Start the first betting round
          const gameWithBetting = await gameLogic.startBettingRound(
            updatedGame
          );

          // Notify the current player it's their turn
          if (gameWithBetting.currentTurn) {
            const currentPlayer = gameWithBetting.players.find(
              (p) =>
                p.user.toString() === gameWithBetting.currentTurn.toString()
            );

            if (currentPlayer) {
              const socketId = userSockets.get(currentPlayer.user.toString());
              if (socketId) {
                gameIo.to(socketId).emit("yourTurn", {
                  options: gameLogic.getPlayerOptions(
                    gameWithBetting,
                    currentPlayer.user
                  ),
                  timeLimit: 30, // 30 seconds to make a decision
                });

                // Let everyone know whose turn it is
                gameIo.to(gameId).emit("turnChanged", {
                  playerId: currentPlayer.user.toString(),
                  username: currentPlayer.username,
                });

                console.log(`It's ${currentPlayer.username}'s turn`);
              } else {
                console.log(
                  `Could not find socket for current player ${currentPlayer.username}`
                );
              }
            } else {
              console.log(`Could not find current player in game ${gameId}`);
            }
          } else {
            console.log(`No current turn set for game ${gameId}`);
          }

          // Update game state for all players
          gameIo
            .to(gameId)
            .emit(
              "gameUpdate",
              gameLogic.getSanitizedGameState(gameWithBetting)
            );
          console.log(`Game state updated for all players in game ${gameId}`);
        } catch (gameInitError) {
          console.error(`Error initializing game: ${gameInitError.message}`);
          console.error(gameInitError.stack);

          // Try to recover
          try {
            // Reset the game status
            game.status = "waiting";
            await game.save();

            // Notify clients about the error
            socket.emit("gameError", {
              message: "Failed to initialize game. Please try again.",
              details: gameInitError.message,
            });
          } catch (recoveryError) {
            console.error(`Recovery error: ${recoveryError.message}`);
            socket.emit("gameError", {
              message: "Critical error starting game.",
            });
          }
        }
      } catch (error) {
        console.error(`Start game socket error for game ${gameId}:`, error);
        console.error(error.stack);
        socket.emit("gameError", {
          message: "Server error",
          details: error.message,
        });
      }
    });

    // Player action (fold, check, call, bet, raise, all-in)
    socket.on(
      "playerAction",
      async ({ gameId, userId, action, amount = 0 }) => {
        try {
          // Use mongoose helpers for working with fresh game objects
          const mongooseHelpers = require("../utils/mongoose-helpers");
          const Game = require("../models/Game");

          // Get a fresh copy of the game
          const game = await Game.findOne({ gameId });
          if (!game) {
            socket.emit("gameError", { message: "Game not found" });
            return;
          }

          // Check if it's player's turn
          if (game.currentTurn.toString() !== userId) {
            socket.emit("gameError", { message: "Not your turn" });
            return;
          }

          // Use our helper to process the action on a fresh game document
          const result = await mongooseHelpers.withFreshGame(
            gameId,
            async (freshGame) => {
              return await gameLogic.processPlayerAction(
                freshGame,
                userId,
                action,
                amount
              );
            }
          );

          // Notify all players about the action
          gameIo.to(gameId).emit("actionTaken", {
            playerId: userId,
            action,
            amount,
            pot: game.pot,
          });

          // Get a fresh copy of the game after the action
          const updatedGame = await Game.findOne({ gameId });

          // Update game state for all players
          gameIo
            .to(gameId)
            .emit("gameUpdate", gameLogic.getSanitizedGameState(updatedGame));

          // Process the result of the action
          if (result.handEnded) {
            // Hand has ended (e.g., everyone folded except one player)
            const winnerPlayer = updatedGame.players.find(
              (p) => p.user.toString() === result.winners[0]
            );

            gameIo.to(gameId).emit("handResult", {
              winners: [
                {
                  playerId: winnerPlayer.user.toString(),
                  username: winnerPlayer.username,
                  handName: "Winner by fold",
                },
              ],
              pot: updatedGame.pot,
              message: result.message,
            });

            // Prepare for next hand after a delay - USING ATOMIC UPDATES TO AVOID VERSION CONFLICTS
            setTimeout(async () => {
              try {
                // Use the safe operation wrapper for handling next hand preparation
                const nextHandGame = await mongooseHelpers.withFreshGame(
                  gameId,
                  async (freshGame) => {
                    // Use our utility from gameLogic but with the fresh game object
                    return await gameLogic.prepareNextHand(freshGame);
                  }
                );

                if (nextHandGame.status === "completed") {
                  // Game has ended
                  gameIo.to(gameId).emit("gameEnded", {
                    message: "Game ended - not enough active players",
                  });
                } else {
                  // Start next hand with the fresh deck
                  const newHand = await mongooseHelpers.withFreshGame(
                    gameId,
                    async (freshGame) => {
                      return await gameLogic.startNewHand(freshGame);
                    }
                  );

                  // VALIDATION: Check for duplicate cards
                  try {
                    gameLogic.validateGameCards(newHand);
                    console.log("Card validation passed for new hand");
                  } catch (validationError) {
                    console.error(
                      `Card validation failed: ${validationError.message}`
                    );

                    // Try to fix the issue
                    const debugging = require("../utils/debugging");
                    try {
                      await mongooseHelpers.withFreshGame(
                        gameId,
                        async (freshGame) => {
                          await debugging.fixDuplicateCards(freshGame);
                          return freshGame;
                        }
                      );

                      console.log("Fixed duplicate cards issue");
                    } catch (fixError) {
                      console.error(
                        `Failed to fix duplicate cards: ${fixError.message}`
                      );
                      gameIo.to(gameId).emit("gameError", {
                        message:
                          "Error in card distribution. Game will restart.",
                        details: validationError.message,
                      });
                      return;
                    }
                  }

                  // Get a fresh copy after all the updates
                  const refreshedNewHand = await Game.findOne({ gameId });

                  // Emit new game state
                  gameIo
                    .to(gameId)
                    .emit(
                      "newHand",
                      gameLogic.getSanitizedGameState(refreshedNewHand)
                    );

                  // Log card distribution for verification
                  console.log("Card distribution for new hand:");
                  refreshedNewHand.players.forEach((player) => {
                    if (player.hand && player.hand.length) {
                      console.log(
                        `Player ${player.username} cards: ${player.hand
                          .map((c) => `${c.rank}${c.suit[0]}`)
                          .join(", ")}`
                      );
                    }
                  });

                  // Emit private cards to each player
                  refreshedNewHand.players.forEach((player) => {
                    const socketId = userSockets.get(player.user.toString());
                    if (socketId) {
                      // Ensure we're sending a properly formatted hand object
                      // IMPORTANT: Force a clean hand array to avoid reference issues
                      const cleanHand = player.hand.map((card) => ({
                        suit: card.suit,
                        rank: card.rank,
                        value: card.value,
                        code: card.code,
                      }));

                      console.log(
                        `EXPLICITLY sending new cards to ${player.username}:`,
                        cleanHand
                          .map((c) => `${c.rank} of ${c.suit}`)
                          .join(", ")
                      );

                      // Send with a distinct event name to ensure client processing
                      gameIo.to(socketId).emit("dealCards", {
                        hand: cleanHand,
                        newHand: true, // Add a flag to indicate this is from a new hand
                        timestamp: Date.now(), // Add timestamp to prevent caching
                      });

                      // Also send a direct message to ensure the client updates
                      gameIo.to(socketId).emit("forceCardUpdate", {
                        hand: cleanHand,
                        message:
                          "Your cards have been updated for the new hand",
                      });
                    }
                  });

                  // Start the betting round
                  const bettingGame = await mongooseHelpers.withFreshGame(
                    gameId,
                    async (freshGame) => {
                      return await gameLogic.startBettingRound(freshGame);
                    }
                  );

                  // Get a fresh copy after updating
                  const refreshedBettingGame = await Game.findOne({ gameId });

                  // Notify the current player it's their turn
                  if (refreshedBettingGame.currentTurn) {
                    const currentPlayer = refreshedBettingGame.players.find(
                      (p) =>
                        p.user.toString() ===
                        refreshedBettingGame.currentTurn.toString()
                    );

                    if (currentPlayer) {
                      const socketId = userSockets.get(
                        currentPlayer.user.toString()
                      );
                      if (socketId) {
                        gameIo.to(socketId).emit("yourTurn", {
                          options: gameLogic.getPlayerOptions(
                            refreshedBettingGame,
                            currentPlayer.user
                          ),
                          timeLimit: 30,
                        });

                        gameIo.to(gameId).emit("turnChanged", {
                          playerId: currentPlayer.user.toString(),
                          username: currentPlayer.username,
                        });
                      }
                    }
                  }

                  // Update game state
                  gameIo
                    .to(gameId)
                    .emit(
                      "gameUpdate",
                      gameLogic.getSanitizedGameState(refreshedBettingGame)
                    );
                }
              } catch (error) {
                console.error(
                  `Error handling next hand for game ${gameId}:`,
                  error
                );

                // Notify clients about the error but don't crash the game
                gameIo.to(gameId).emit("gameError", {
                  message: "Error preparing next hand, please refresh the page",
                  details: error.message,
                });

                // Try to recover by sending a game update
                try {
                  const currentGame = await Game.findOne({
                    gameId: gameId,
                  });
                  if (currentGame) {
                    gameIo
                      .to(gameId)
                      .emit(
                        "gameUpdate",
                        gameLogic.getSanitizedGameState(currentGame)
                      );
                  }
                } catch (updateError) {
                  console.error(
                    "Error sending recovery game update:",
                    updateError
                  );
                }
              }
            }, 15000); // 15 second delay before next hand

            return;
          }

          if (result.roundEnded) {
            // Betting round has ended, move to next phase
            try {
              if (result.nextPhase === "flop") {
                // Deal the flop with the fresh game - avoids version conflicts
                const nextGame = await mongooseHelpers.withFreshGame(
                  gameId,
                  async (freshGame) => {
                    return await gameLogic.dealFlop(freshGame);
                  }
                );

                // Get a fresh copy
                const refreshedGame = await Game.findOne({ gameId });

                gameIo.to(gameId).emit("dealFlop", {
                  communityCards: refreshedGame.communityCards,
                });

                // Start next betting round
                const bettingGame = await mongooseHelpers.withFreshGame(
                  gameId,
                  async (freshGame) => {
                    return await gameLogic.startBettingRound(freshGame);
                  }
                );

                // Get a fresh copy
                const refreshedBettingGame = await Game.findOne({ gameId });

                // Notify the current player it's their turn
                if (refreshedBettingGame.currentTurn) {
                  const currentPlayer = refreshedBettingGame.players.find(
                    (p) =>
                      p.user.toString() ===
                      refreshedBettingGame.currentTurn.toString()
                  );

                  if (currentPlayer) {
                    const socketId = userSockets.get(
                      currentPlayer.user.toString()
                    );
                    if (socketId) {
                      gameIo.to(socketId).emit("yourTurn", {
                        options: gameLogic.getPlayerOptions(
                          refreshedBettingGame,
                          currentPlayer.user
                        ),
                        timeLimit: 30,
                      });

                      gameIo.to(gameId).emit("turnChanged", {
                        playerId: currentPlayer.user.toString(),
                        username: currentPlayer.username,
                      });
                    }
                  }
                }

                // Update game state
                gameIo
                  .to(gameId)
                  .emit(
                    "gameUpdate",
                    gameLogic.getSanitizedGameState(refreshedBettingGame)
                  );
              } else if (result.nextPhase === "turn") {
                // Deal the turn
                const nextGame = await mongooseHelpers.withFreshGame(
                  gameId,
                  async (freshGame) => {
                    return await gameLogic.dealTurn(freshGame);
                  }
                );

                // Get a fresh copy
                const refreshedGame = await Game.findOne({ gameId });

                gameIo.to(gameId).emit("dealTurn", {
                  communityCards: refreshedGame.communityCards,
                });

                // Start next betting round
                const bettingGame = await mongooseHelpers.withFreshGame(
                  gameId,
                  async (freshGame) => {
                    return await gameLogic.startBettingRound(freshGame);
                  }
                );

                // Get a fresh copy
                const refreshedBettingGame = await Game.findOne({ gameId });

                // Notify the current player it's their turn
                if (refreshedBettingGame.currentTurn) {
                  const currentPlayer = refreshedBettingGame.players.find(
                    (p) =>
                      p.user.toString() ===
                      refreshedBettingGame.currentTurn.toString()
                  );

                  if (currentPlayer) {
                    const socketId = userSockets.get(
                      currentPlayer.user.toString()
                    );
                    if (socketId) {
                      gameIo.to(socketId).emit("yourTurn", {
                        options: gameLogic.getPlayerOptions(
                          refreshedBettingGame,
                          currentPlayer.user
                        ),
                        timeLimit: 30,
                      });

                      gameIo.to(gameId).emit("turnChanged", {
                        playerId: currentPlayer.user.toString(),
                        username: currentPlayer.username,
                      });
                    }
                  }
                }

                // Update game state
                gameIo
                  .to(gameId)
                  .emit(
                    "gameUpdate",
                    gameLogic.getSanitizedGameState(refreshedBettingGame)
                  );
              } else if (result.nextPhase === "river") {
                // Deal the river
                const nextGame = await mongooseHelpers.withFreshGame(
                  gameId,
                  async (freshGame) => {
                    return await gameLogic.dealRiver(freshGame);
                  }
                );

                // Get a fresh copy
                const refreshedGame = await Game.findOne({ gameId });

                gameIo.to(gameId).emit("dealRiver", {
                  communityCards: refreshedGame.communityCards,
                });

                // Start next betting round
                const bettingGame = await mongooseHelpers.withFreshGame(
                  gameId,
                  async (freshGame) => {
                    return await gameLogic.startBettingRound(freshGame);
                  }
                );

                // Get a fresh copy
                const refreshedBettingGame = await Game.findOne({ gameId });

                // Notify the current player it's their turn
                if (refreshedBettingGame.currentTurn) {
                  const currentPlayer = refreshedBettingGame.players.find(
                    (p) =>
                      p.user.toString() ===
                      refreshedBettingGame.currentTurn.toString()
                  );

                  if (currentPlayer) {
                    const socketId = userSockets.get(
                      currentPlayer.user.toString()
                    );
                    if (socketId) {
                      gameIo.to(socketId).emit("yourTurn", {
                        options: gameLogic.getPlayerOptions(
                          refreshedBettingGame,
                          currentPlayer.user
                        ),
                        timeLimit: 30,
                      });

                      gameIo.to(gameId).emit("turnChanged", {
                        playerId: currentPlayer.user.toString(),
                        username: currentPlayer.username,
                      });
                    }
                  }
                }

                // Update game state
                gameIo
                  .to(gameId)
                  .emit(
                    "gameUpdate",
                    gameLogic.getSanitizedGameState(refreshedBettingGame)
                  );
              } else if (result.nextPhase === "showdown") {
                // Process showdown with a fresh game
                const showdownResult = await mongooseHelpers.withFreshGame(
                  gameId,
                  async (freshGame) => {
                    return await gameLogic.processShowdown(freshGame);
                  }
                );

                // Get a fresh copy
                const refreshedGame = await Game.findOne({ gameId });

                // Include community cards in the result
                showdownResult.communityCards = refreshedGame.communityCards;
                showdownResult.pot = refreshedGame.pot;

                gameIo.to(gameId).emit("handResult", showdownResult);

                // Prepare for next hand after a delay with the same mechanism as for fold wins
                setTimeout(async () => {
                  // Similar code as above for starting next hand, copied to avoid nesting
                  // Use withFreshGame to avoid version conflicts
                  try {
                    const nextHandGame = await mongooseHelpers.withFreshGame(
                      gameId,
                      async (freshGame) => {
                        return await gameLogic.prepareNextHand(freshGame);
                      }
                    );

                    if (nextHandGame.status === "completed") {
                      // Game has ended
                      gameIo.to(gameId).emit("gameEnded", {
                        message: "Game ended - not enough active players",
                      });
                    } else {
                      // Start next hand with the same approach as in the fold case
                      // (code is identical to above section but kept for completeness)
                      const newHand = await mongooseHelpers.withFreshGame(
                        gameId,
                        async (freshGame) => {
                          return await gameLogic.startNewHand(freshGame);
                        }
                      );

                      // Get a fresh copy
                      const refreshedNewHand = await Game.findOne({ gameId });

                      // Emit new game state
                      gameIo
                        .to(gameId)
                        .emit(
                          "newHand",
                          gameLogic.getSanitizedGameState(refreshedNewHand)
                        );

                      // Send cards to players as before
                      refreshedNewHand.players.forEach((player) => {
                        const socketId = userSockets.get(
                          player.user.toString()
                        );
                        if (socketId) {
                          const cleanHand = player.hand.map((card) => ({
                            suit: card.suit,
                            rank: card.rank,
                            value: card.value,
                            code: card.code,
                          }));

                          gameIo.to(socketId).emit("dealCards", {
                            hand: cleanHand,
                            newHand: true,
                            timestamp: Date.now(),
                          });

                          gameIo.to(socketId).emit("forceCardUpdate", {
                            hand: cleanHand,
                            message:
                              "Your cards have been updated for the new hand",
                          });
                        }
                      });

                      // Start the betting round with a fresh game
                      const bettingGame = await mongooseHelpers.withFreshGame(
                        gameId,
                        async (freshGame) => {
                          return await gameLogic.startBettingRound(freshGame);
                        }
                      );

                      // Get a fresh copy
                      const refreshedBettingGame = await Game.findOne({
                        gameId,
                      });

                      // Notify the current player it's their turn
                      if (refreshedBettingGame.currentTurn) {
                        const currentPlayer = refreshedBettingGame.players.find(
                          (p) =>
                            p.user.toString() ===
                            refreshedBettingGame.currentTurn.toString()
                        );

                        if (currentPlayer) {
                          const socketId = userSockets.get(
                            currentPlayer.user.toString()
                          );
                          if (socketId) {
                            gameIo.to(socketId).emit("yourTurn", {
                              options: gameLogic.getPlayerOptions(
                                refreshedBettingGame,
                                currentPlayer.user
                              ),
                              timeLimit: 30,
                            });

                            gameIo.to(gameId).emit("turnChanged", {
                              playerId: currentPlayer.user.toString(),
                              username: currentPlayer.username,
                            });
                          }
                        }
                      }

                      // Update game state
                      gameIo
                        .to(gameId)
                        .emit(
                          "gameUpdate",
                          gameLogic.getSanitizedGameState(refreshedBettingGame)
                        );
                    }
                  } catch (error) {
                    console.error(
                      `Error handling next hand after showdown for game ${gameId}:`,
                      error
                    );

                    // Error handling similar to fold case
                    gameIo.to(gameId).emit("gameError", {
                      message:
                        "Error preparing next hand, please refresh the page",
                      details: error.message,
                    });

                    // Try to recover with a game update
                    try {
                      const currentGame = await Game.findOne({ gameId });
                      if (currentGame) {
                        gameIo
                          .to(gameId)
                          .emit(
                            "gameUpdate",
                            gameLogic.getSanitizedGameState(currentGame)
                          );
                      }
                    } catch (updateError) {
                      console.error(
                        "Error sending recovery game update:",
                        updateError
                      );
                    }
                  }
                }, 15000); // 15 second delay before next hand

                return;
              }
            } catch (roundError) {
              console.error(
                `Error processing round end: ${roundError.message}`
              );
              gameIo.to(gameId).emit("gameError", {
                message: "Error processing betting round",
                details: roundError.message,
              });

              // Try to recover with a game update
              try {
                const currentGame = await Game.findOne({ gameId });
                if (currentGame) {
                  gameIo
                    .to(gameId)
                    .emit(
                      "gameUpdate",
                      gameLogic.getSanitizedGameState(currentGame)
                    );
                }
              } catch (updateError) {
                console.error(
                  "Error sending recovery game update:",
                  updateError
                );
              }
            }
          } else {
            // Round continues, notify next player
            if (updatedGame.currentTurn) {
              const currentPlayer = updatedGame.players.find(
                (p) => p.user.toString() === updatedGame.currentTurn.toString()
              );

              if (currentPlayer) {
                const socketId = userSockets.get(currentPlayer.user.toString());
                if (socketId) {
                  gameIo.to(socketId).emit("yourTurn", {
                    options: gameLogic.getPlayerOptions(
                      updatedGame,
                      currentPlayer.user
                    ),
                    timeLimit: 30,
                  });

                  gameIo.to(gameId).emit("turnChanged", {
                    playerId: currentPlayer.user.toString(),
                    username: currentPlayer.username,
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error("Player action error:", error);
          socket.emit("gameError", {
            message: "Error processing action",
            details: error.message,
          });
        }
      }
    );

    // Handling player disconnection but staying in the game
    socket.on("disconnecting", () => {
      // Get all rooms this socket is in
      const rooms = Object.keys(socket.rooms);

      rooms.forEach((room) => {
        // Skip the socket's own room (which is its ID)
        if (room !== socket.id) {
          // This is a game room
          if (gameRooms.has(room)) {
            gameRooms.get(room).delete(socket.id);

            // Emit to others that this player's connection state changed
            if (socket.userId) {
              gameIo.to(room).emit("playerConnectionChange", {
                userId: socket.userId,
                connected: false,
                timestamp: new Date(),
              });

              console.log(
                `User ${socket.userId} disconnected from game ${room}`
              );
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
    socket.on("disconnect", () => {
      console.log("Client disconnected", socket.id);

      // This is handled in disconnecting event above,
      // but adding as a fallback
      if (socket.userId) {
        if (userSockets.get(socket.userId) === socket.id) {
          userSockets.delete(socket.userId);
        }
      }
    });

    // Player reconnecting
    socket.on("reconnect", ({ userId, gameId }) => {
      if (userId && gameId) {
        userSockets.set(userId, socket.id);
        socket.userId = userId;
        socket.join(gameId);

        if (!gameRooms.has(gameId)) {
          gameRooms.set(gameId, new Set());
        }
        gameRooms.get(gameId).add(socket.id);

        // Notify other players this user reconnected
        gameIo.to(gameId).emit("playerConnectionChange", {
          userId,
          connected: true,
          timestamp: new Date(),
        });

        console.log(`User ${userId} reconnected to game ${gameId}`);
      }
    });

    // Leave game
    socket.on("leaveGame", async ({ gameId, userId }) => {
      try {
        if (!gameId || !userId) {
          return socket.emit("gameError", {
            message: "Missing required fields",
          });
        }

        // Find the game - use fresh findOne to avoid version conflicts
        let game = await Game.findOne({ gameId });
        if (!game) {
          socket.emit("gameError", { message: "Game not found" });
          return;
        }

        // Find the player
        const playerIndex = game.players.findIndex(
          (p) => p.user.toString() === userId
        );
        if (playerIndex === -1) {
          socket.emit("gameError", { message: "Player not in game" });
          return;
        }

        // Get player info for notification
        const playerName = game.players[playerIndex].username;

        // Handle differently based on game status
        if (game.status === "waiting") {
          // In waiting status, completely remove the player from the game
          game.players.splice(playerIndex, 1);

          // Update positions for remaining players
          for (let i = 0; i < game.players.length; i++) {
            game.players[i].position = i;
          }
        } else {
          // In active game, mark player as inactive but keep their data
          game.players[playerIndex].isActive = false;
          game.players[playerIndex].hasFolded = true;

          // Check if the game can continue (need at least 2 active players)
          const activePlayers = game.players.filter(
            (p) => p.isActive && !p.hasFolded
          );

          if (activePlayers.length < 2) {
            // End the current hand, award pot to remaining player
            if (activePlayers.length === 1) {
              await gameLogic.awardPot(game, activePlayers);

              // Notify about the winner
              gameIo.to(gameId).emit("handResult", {
                winners: [
                  {
                    playerId: activePlayers[0].user.toString(),
                    username: activePlayers[0].username,
                    handName: "Winner by forfeit",
                  },
                ],
                pot: game.pot,
                message: `${activePlayers[0].username} wins the pot as other players left`,
              });
            }

            // Check if game should end
            const remainingPlayers = game.players.filter((p) => p.isActive);
            if (remainingPlayers.length < 2) {
              game.status = "completed";

              // Notify about game ending
              gameIo.to(gameId).emit("gameEnded", {
                message: "Game ended - not enough active players",
              });
            } else {
              // Prepare for next hand
              await gameLogic.prepareNextHand(game);
            }
          } else if (
            game.currentTurn &&
            game.currentTurn.toString() === userId
          ) {
            // If it was this player's turn, move to next player
            try {
              const nextPlayerId = gameLogic.getNextPlayerToAct(
                game,
                game.players.findIndex((p) => p.user.toString() === userId)
              );

              game.currentTurn = nextPlayerId;

              // Notify next player
              const nextPlayer = game.players.find(
                (p) => p.user.toString() === nextPlayerId.toString()
              );

              const nextSocketId = userSockets.get(nextPlayerId.toString());

              if (nextSocketId && nextPlayer) {
                gameIo.to(nextSocketId).emit("yourTurn", {
                  options: gameLogic.getPlayerOptions(game, nextPlayerId),
                  timeLimit: 60,
                });

                gameIo.to(gameId).emit("turnChanged", {
                  playerId: nextPlayerId.toString(),
                  username: nextPlayer.username,
                });
              }
            } catch (error) {
              console.log(
                "Error getting next player, betting round may be complete"
              );
              // Handle round end if needed
            }
          }
        }

        // Save the updated game with retry logic for version conflicts
        let saved = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!saved && attempts < maxAttempts) {
          try {
            await game.save();
            saved = true;
          } catch (saveError) {
            // If it's a version error, try to refresh the document and reapply changes
            if (saveError.name === "VersionError") {
              attempts++;
              console.log(
                `Version conflict detected (attempt ${attempts}), refreshing document...`
              );

              // Get a fresh copy of the game
              game = await Game.findOne({ gameId });

              if (!game) {
                throw new Error("Game no longer exists");
              }

              // Re-apply our changes to the fresh document
              if (game.status === "waiting") {
                // Find the player again in case the player list changed
                const newPlayerIndex = game.players.findIndex(
                  (p) => p.user.toString() === userId
                );

                if (newPlayerIndex !== -1) {
                  game.players.splice(newPlayerIndex, 1);

                  // Update positions for remaining players
                  for (let i = 0; i < game.players.length; i++) {
                    game.players[i].position = i;
                  }
                }
              } else {
                // Find the player again
                const newPlayerIndex = game.players.findIndex(
                  (p) => p.user.toString() === userId
                );

                if (newPlayerIndex !== -1) {
                  game.players[newPlayerIndex].isActive = false;
                  game.players[newPlayerIndex].hasFolded = true;
                }
              }

              // Wait a moment before retrying to reduce chance of conflict
              await new Promise((resolve) =>
                setTimeout(resolve, 100 * attempts)
              );
            } else {
              // If it's not a version error, rethrow it
              throw saveError;
            }
          }
        }

        if (!saved) {
          throw new Error(`Failed to save game after ${maxAttempts} attempts`);
        }

        // Leave the socket room
        socket.leave(gameId);

        // Remove from game rooms tracking
        if (gameRooms.has(gameId)) {
          gameRooms.get(gameId).delete(socket.id);
        }

        // Notify all clients that player left
        gameIo.to(gameId).emit("playerLeft", {
          userId,
          username: playerName,
        });

        // Send a chat message
        gameIo.to(gameId).emit("chatMessage", {
          type: "system",
          message: `${playerName} has left the game`,
          timestamp: new Date(),
        });

        // Update game state for all clients - use findById to get the latest state
        const updatedGame = await Game.findOne({ gameId });
        if (updatedGame) {
          const sanitizedGame = gameLogic.getSanitizedGameState(game);
          gameIo.to(gameId).emit("gameUpdate", sanitizedGame);
        }

        // Acknowledge successful leave
        socket.emit("leaveGameSuccess");
      } catch (error) {
        console.error("Leave game error:", error);
        socket.emit("gameError", {
          message: "Error leaving game",
          details: error.message,
        });
      }
    });

    // Full implementation for socket.on("initializeGame")
    socket.on("initializeGame", async ({ gameId, userId }) => {
      console.log(
        `Received initializeGame event for game ${gameId} from user ${userId}`
      );

      try {
        // Find the game
        const Game = require("../models/Game");
        const mongooseHelpers = require("../utils/mongoose-helpers");

        // Get a fresh copy of the game
        const game = await Game.findOne({ gameId });
        if (!game) {
          console.log(`Game not found: ${gameId}`);
          return socket.emit("gameError", { message: "Game not found" });
        }

        // Must be an active game
        if (game.status !== "active") {
          console.log(`Game ${gameId} is not active, cannot initialize`);
          return socket.emit("gameError", { message: "Game is not active" });
        }

        // Check if this is the creator (only creator can initialize)
        const creatorId = game.creator.user.toString();
        if (creatorId !== userId.toString()) {
          console.log(`User ${userId} is not the creator of game ${gameId}`);
          return socket.emit("gameError", {
            message: "Only the creator can initialize the game",
          });
        }

        console.log(`Initializing active game ${gameId}`);

        // Check if game already has cards dealt
        const hasDealtCards = game.players.some(
          (p) => p.hand && p.hand.length > 0
        );

        if (hasDealtCards) {
          console.log(
            `Game ${gameId} already has cards dealt, sending current state`
          );

          // Check for duplicate cards before proceeding
          const debugging = require("../utils/debugging");
          const checkResult = debugging.checkGameForDuplicates(game);

          if (checkResult.hasDuplicates) {
            console.error(
              `Duplicate cards detected in game ${gameId}:`,
              checkResult.duplicates
            );

            // Try to fix the duplicates using withFreshGame to avoid version conflicts
            try {
              await mongooseHelpers.withFreshGame(gameId, async (freshGame) => {
                await debugging.fixDuplicateCards(freshGame);
                return freshGame;
              });

              console.log(`Fixed duplicate cards in game ${gameId}`);

              // Reload the game to get the fixed state
              const updatedGame = await Game.findOne({ gameId });

              // Just send current game state
              const sanitizedGame =
                gameLogic.getSanitizedGameState(updatedGame);
              gameIo.to(gameId).emit("gameUpdate", sanitizedGame);

              // Resend private cards to each player
              updatedGame.players.forEach((player) => {
                if (player.hand && player.hand.length > 0) {
                  const socketId = userSockets.get(player.user.toString());
                  if (socketId) {
                    gameIo.to(socketId).emit("dealCards", {
                      hand: player.hand,
                    });
                    console.log(`Re-sent cards to player ${player.username}`);
                  }
                }
              });

              // If there's a current turn, notify that player
              if (updatedGame.currentTurn) {
                const currentPlayer = updatedGame.players.find(
                  (p) =>
                    p.user.toString() === updatedGame.currentTurn.toString()
                );

                if (currentPlayer) {
                  const socketId = userSockets.get(
                    currentPlayer.user.toString()
                  );
                  if (socketId) {
                    gameIo.to(socketId).emit("yourTurn", {
                      options: gameLogic.getPlayerOptions(
                        updatedGame,
                        currentPlayer.user
                      ),
                      timeLimit: 30,
                    });

                    gameIo.to(gameId).emit("turnChanged", {
                      playerId: currentPlayer.user.toString(),
                      username: currentPlayer.username,
                    });
                  }
                }
              }
            } catch (fixError) {
              console.error(
                `Failed to fix duplicate cards: ${fixError.message}`
              );
              socket.emit("gameError", {
                message:
                  "Card distribution error detected. Please restart the game.",
                details: fixError.message,
              });
              return;
            }
          } else {
            // No duplicates, proceed normally
            // Just send current game state
            const sanitizedGame = gameLogic.getSanitizedGameState(game);
            gameIo.to(gameId).emit("gameUpdate", sanitizedGame);

            // Resend private cards to each player
            game.players.forEach((player) => {
              if (player.hand && player.hand.length > 0) {
                const socketId = userSockets.get(player.user.toString());
                if (socketId) {
                  gameIo.to(socketId).emit("dealCards", {
                    hand: player.hand,
                  });
                  console.log(`Re-sent cards to player ${player.username}`);
                }
              }
            });

            // If there's a current turn, notify that player
            if (game.currentTurn) {
              const currentPlayer = game.players.find(
                (p) => p.user.toString() === game.currentTurn.toString()
              );

              if (currentPlayer) {
                const socketId = userSockets.get(currentPlayer.user.toString());
                if (socketId) {
                  gameIo.to(socketId).emit("yourTurn", {
                    options: gameLogic.getPlayerOptions(
                      game,
                      currentPlayer.user
                    ),
                    timeLimit: 30,
                  });

                  gameIo.to(gameId).emit("turnChanged", {
                    playerId: currentPlayer.user.toString(),
                    username: currentPlayer.username,
                  });
                }
              }
            }
          }
        } else {
          console.log(`Game ${gameId} needs first hand initialization`);

          // Use our withFreshGame helper to avoid version conflicts
          await mongooseHelpers.withFreshGame(gameId, async (freshGame) => {
            // Make sure there's a fresh deck
            console.log("Creating a fresh deck for the game");
            freshGame.deck = require("../utils/cardDeck").createDeck();

            // Skip validation
            freshGame._skipValidation = true;

            // Save the game with the new deck
            await freshGame.save();

            return freshGame;
          });

          // Get a fresh copy of the game
          const refreshedGame = await Game.findOne({ gameId });

          // Initialize first hand with a fresh deck - using our gameLogic function
          // but with more robust error handling
          try {
            const updatedGame = await gameLogic.startNewHand(refreshedGame);
            console.log(`First hand started for game ${gameId}`);

            // VALIDATION: Check for duplicate cards
            try {
              gameLogic.validateGameCards(updatedGame);
            } catch (validationError) {
              console.error(
                `Card validation failed: ${validationError.message}`
              );
              socket.emit("gameError", {
                message: "Card validation failed. Please restart the game.",
                details: validationError.message,
              });
              return; // Exit the function to prevent continuing with invalid cards
            }

            const allGamePlayers = updatedGame.players.map(player => ({
              id: player.user.toString(),
              username: player.username,
              isActive: player.isActive,
              position: player.position
            }));

            // Add this to the sanitized game state
const enhancedGameState = gameLogic.getSanitizedGameState(updatedGame);
enhancedGameState.allPlayers = allGamePlayers;

if (!enhancedGameState.creator && updatedGame.creator) {
  enhancedGameState.creator = {
    user: updatedGame.creator.user.toString(),
    username: updatedGame.creator.username
  };
}

            // Emit game state to all players
            gameIo.to(gameId).emit("gameStarted", enhancedGameState);

            // FIXED: Emit private cards to each player with unique cards
            updatedGame.players.forEach((player) => {
              const socketId = userSockets.get(player.user.toString());
              if (socketId) {
                gameIo.to(socketId).emit("dealCards", {
                  hand: player.hand,
                });
                console.log(`Cards dealt to player ${player.username}`);
              }
            });

            // Start the first betting round using withFreshGame to avoid version conflicts
            const gameWithBetting = await mongooseHelpers.withFreshGame(
              gameId,
              async (freshGame) => {
                const bettingGame = await gameLogic.startBettingRound(
                  freshGame
                );
                return bettingGame;
              }
            );

            // Notify the current player it's their turn
            if (gameWithBetting.currentTurn) {
              try {
                // Find the current player in a safer way
                const currentPlayer = gameWithBetting.players.find(
                  (p) =>
                    p.user &&
                    p.user.toString() === gameWithBetting.currentTurn.toString()
                );

                if (currentPlayer) {
                  const socketId = userSockets.get(
                    currentPlayer.user.toString()
                  );
                  if (socketId) {
                    // Safely get player options with error handling
                    let playerOptions = [];
                    try {
                      playerOptions = gameLogic.getPlayerOptions(
                        gameWithBetting,
                        currentPlayer.user
                      );
                    } catch (optionsError) {
                      console.error(
                        `Error getting player options: ${optionsError.message}`
                      );
                      // Provide fallback options
                      playerOptions = ["fold", "check", "call"];
                    }

                    gameIo.to(socketId).emit("yourTurn", {
                      options: playerOptions,
                      timeLimit: 30,
                    });

                    gameIo.to(gameId).emit("turnChanged", {
                      playerId: currentPlayer.user.toString(),
                      username: currentPlayer.username,
                    });
                  }
                } else {
                  console.log(
                    `Current turn player not found in gameWithBetting.players`
                  );
                }
              } catch (turnError) {
                console.error(
                  `Error handling current turn: ${turnError.message}`
                );
                // Game can continue even with this error
              }
            }

            // Update game state for all players
            gameIo.to(gameId).emit("gameUpdate", enhancedGameState);
          } catch (initError) {
            console.error(
              `Error initializing first hand: ${initError.message}`
            );
            socket.emit("gameError", {
              message: "Error initializing game - please try again",
              details: initError.message,
            });
            return;
          }
        }

        // Send a system message that initialization is complete
        gameIo.to(gameId).emit("chatMessage", {
          type: "system",
          message: "Game initialization complete",
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error(`Initialize game error for game ${gameId}:`, error);
        socket.emit("gameError", {
          message: "Error initializing game",
          details: error.message,
        });
      }
    });

    socket.on("reconnect", async ({ userId, gameId, username }) => {
      try {
        if (!userId || !gameId) {
          return socket.emit("gameError", {
            message: "Missing reconnection data",
          });
        }

        console.log(
          `User ${username || userId} attempting to reconnect to game ${gameId}`
        );

        // Update socket mappings
        userSockets.set(userId, socket.id);
        socket.userId = userId;
        socket.join(gameId);
        socket.gameId = gameId;

        // Add to room tracking
        if (!gameRooms.has(gameId)) {
          gameRooms.set(gameId, new Set());
        }
        gameRooms.get(gameId).add(socket.id);

        // Find the game
        const game = await Game.findOne({ gameId });
        if (!game) {
          socket.emit("gameError", {
            message: "Game not found during reconnection",
          });
          return;
        }

        // Find the player
        const playerIndex = game.players.findIndex(
          (p) => p.user.toString() === userId
        );
        if (playerIndex === -1) {
          socket.emit("gameError", { message: "Player not found in game" });
          return;
        }

        // Mark player as reconnected if they were disconnected
        if (!game.players[playerIndex].isActive) {
          game.players[playerIndex].isActive = true;

          // Save the game and notify other players
          await game.save();

          gameIo.to(gameId).emit("chatMessage", {
            type: "system",
            message: `${game.players[playerIndex].username} has reconnected to the game`,
            timestamp: new Date(),
          });
        }

        // Send reconnection confirmation
        socket.emit("reconnectConfirmed", {
          success: true,
          message: "Successfully reconnected to game",
        });

        // Send game state to the reconnected player
        const sanitizedGame = gameLogic.getSanitizedGameState(game);
        socket.emit("gameUpdate", sanitizedGame);

        // Send private cards if the game is active
        if (game.status === "active") {
          const player = game.players[playerIndex];
          if (player.hand && player.hand.length > 0) {
            socket.emit("dealCards", { hand: player.hand });
          }

          // If it's this player's turn, make sure they know
          if (game.currentTurn && game.currentTurn.toString() === userId) {
            socket.emit("yourTurn", {
              options: gameLogic.getPlayerOptions(game, userId),
              timeLimit: 60, // 60 seconds turn timer
            });
          }
        }

        // Notify other players about the reconnection
        gameIo.to(gameId).emit("playerConnectionChange", {
          userId,
          username: game.players[playerIndex].username,
          connected: true,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error("Reconnection error:", error);
        socket.emit("gameError", {
          message: "Error during reconnection",
          details: error.message,
        });
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

  // Utility function to handle async operations with retries and error handling
  async function safeAsyncOperation(operation, maxRetries = 3) {
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        attempts++;

        // Check if it's a version error (common with concurrent updates)
        if (error.name === "VersionError" && attempts < maxRetries) {
          console.log(
            `VersionError detected (attempt ${attempts}), retrying operation...`
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay before retry
          continue;
        }

        // For other errors or if we've exhausted retries, throw the error
        throw error;
      }
    }
  }
};
