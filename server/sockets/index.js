// server/sockets/index.js
const gameLogic = require("../utils/gameLogic");
const Game = require("../models/Game");
const User = require("../models/User");
const mongoose = require("mongoose");

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
          socket.emit("gameError", { message: "Game not found" });
          return;
        }

        // Check if player is already in the game
        const existingPlayer = game.players.find(
          (player) => player.user.toString() === userId
        );
        let playerAdded = false;

        if (!existingPlayer) {
          // Add player to the game
          if (game.players.length < 8 && game.status === "waiting") {
            const user = await User.findById(userId);
            if (!user) {
              socket.emit("gameError", { message: "User not found" });
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
              isAllIn: false,
            });

            await game.save();
            playerAdded = true;

            // Emit a specific event when a new player joins
            // This goes to ALL clients in the room, including the sender
            gameIo.to(gameId).emit("playerJoined", {
              userId,
              username,
              position: game.players.length - 1,
            });

            console.log(`New player ${username} added to game ${gameId}`);
          } else {
            socket.emit("gameError", { message: "Cannot join the game" });
            return;
          }
        }

        // Always send updated game state to all players in the room
        // This is critical to keep everyone in sync
        const sanitizedGame = gameLogic.getSanitizedGameState(game);

        if (!sanitizedGame.creator && game.creator) {
          sanitizedGame.creator = game.creator;
          console.log("Adding creator info to sanitizedGame:", game.creator);
        }

        gameIo.to(gameId).emit("gameUpdate", sanitizedGame);

        socket.emit("creatorInfo", {
          creator: game.creator,
          currentUserId: userId,
          isCreator: game.creator && game.creator.user.toString() === userId,
        });

        // Send a chat message about the new player joining
        if (playerAdded) {
          gameIo.to(gameId).emit("chatMessage", {
            type: "system",
            message: `${username} has joined the game`,
            timestamp: new Date(),
          });
        }
      } catch (error) {
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
          // Find the game
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

          // Process the action
          const result = await gameLogic.processPlayerAction(
            game,
            userId,
            action,
            amount
          );

          // Notify all players about the action
          gameIo.to(gameId).emit("actionTaken", {
            playerId: userId,
            action,
            amount,
            pot: game.pot,
          });

          // Update game state for all players
          gameIo
            .to(gameId)
            .emit("gameUpdate", gameLogic.getSanitizedGameState(game));

          // Process the result of the action
          if (result.handEnded) {
            // Hand has ended (e.g., everyone folded except one player)
            const winnerPlayer = game.players.find(
              (p) => p.user.toString() === result.winners[0]
            );

            const winnerHand = winnerPlayer.hand || [];
            gameIo.to(gameId).emit("handResult", {
              winners: [
                {
                  playerId: winnerPlayer.user.toString(),
                  username: winnerPlayer.username,
                  handName: "Winner by fold",
                  hand: winnerHand,
                },
              ],
              pot: game.pot,
              message: result.message,
            });
            // Prepare for next hand after a delay - UPDATED WITH IMPROVED IMPLEMENTATION
            setTimeout(async () => {
              try {
                // Use the safe operation wrapper for handling next hand preparation
                const nextHandGame = await safeAsyncOperation(async () => {
                  // First, get a fresh copy of the game to avoid version conflicts
                  const freshGame = await Game.findOne({
                    gameId: game.gameId,
                  });

                  if (!freshGame) {
                    throw new Error(
                      `Game ${game.gameId} not found when preparing next hand`
                    );
                  }

                  // Create a fresh deck for the next hand - THIS IS KEY
                  const cardDeck = require("../utils/cardDeck");
                  freshGame.deck = cardDeck.createDeck();
                  console.log(
                    `Created fresh deck with ${freshGame.deck.length} cards for next hand`
                  );

                  // Use our utility from gameLogic but with the fresh game object
                  return await gameLogic.prepareNextHand(freshGame);
                });

                if (nextHandGame.status === "completed") {
                  // Game has ended
                  gameIo.to(gameId).emit("gameEnded", {
                    message: "Game ended - not enough active players",
                  });
                } else {
                  // Log deck status before starting next hand
                  console.log(
                    `Deck status before starting next hand: ${nextHandGame.deck.length} cards`
                  );

                  // Start next hand with the fresh deck
                  const newHand = await safeAsyncOperation(() =>
                    gameLogic.startNewHand(nextHandGame)
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
                      const fixResult = await debugging.fixDuplicateCards(
                        newHand
                      );
                      console.log(
                        `Fixed duplicate cards: ${JSON.stringify(fixResult)}`
                      );
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

                  // Emit new game state
                  gameIo
                    .to(gameId)
                    .emit("newHand", gameLogic.getSanitizedGameState(newHand));

                  // Log card distribution for verification
                  console.log("Card distribution for new hand:");
                  newHand.players.forEach((player) => {
                    if (player.hand && player.hand.length) {
                      console.log(
                        `Player ${player.username} cards: ${player.hand
                          .map((c) => `${c.rank}${c.suit[0]}`)
                          .join(", ")}`
                      );
                    }
                  });

                  // Emit private cards to each player
                  newHand.players.forEach((player) => {
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
                  const bettingGame = await safeAsyncOperation(() =>
                    gameLogic.startBettingRound(newHand)
                  );

                  // Notify the current player it's their turn
                  if (bettingGame.currentTurn) {
                    const currentPlayer = bettingGame.players.find(
                      (p) =>
                        p.user.toString() === bettingGame.currentTurn.toString()
                    );

                    if (currentPlayer) {
                      const socketId = userSockets.get(
                        currentPlayer.user.toString()
                      );
                      if (socketId) {
                        gameIo.to(socketId).emit("yourTurn", {
                          options: gameLogic.getPlayerOptions(
                            bettingGame,
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
                      gameLogic.getSanitizedGameState(bettingGame)
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
                    gameId: game.gameId,
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
            }, 15000); // Changed to 15 second delay before next hand

            return;
          }

          if (result.roundEnded) {
            // Betting round has ended, move to next phase
            let nextGame = game;

            if (result.nextPhase === "flop") {
              // Deal the flop
              nextGame = await gameLogic.dealFlop(game);
              gameIo.to(gameId).emit("dealFlop", {
                communityCards: nextGame.communityCards,
              });
            } else if (result.nextPhase === "turn") {
              // Deal the turn
              nextGame = await gameLogic.dealTurn(game);
              gameIo.to(gameId).emit("dealTurn", {
                communityCards: nextGame.communityCards,
              });
            } else if (result.nextPhase === "river") {
              // Deal the river
              nextGame = await gameLogic.dealRiver(game);
              gameIo.to(gameId).emit("dealRiver", {
                communityCards: nextGame.communityCards,
              });
            } else if (result.nextPhase === "showdown") {
              // Process showdown
              const showdownResult = await gameLogic.processShowdown(game);

              const safeWinners = showdownResult.winners.map((winner) => {
                // Get the player object safely
                const player = game.players.find(
                  (p) => p.user && p.user.toString() === winner.playerId
                );

                // Return formatted winner with hand
                return {
                  ...winner,
                  hand: player && player.hand ? player.hand : [], // Add more null checks
                };
              });

              // Send the result with better error handling
              gameIo.to(gameId).emit("handResult", {
                winners: safeWinners,
                hands: showdownResult.hands || [], // Add fallback
                pot: game.pot,
              });

              // Prepare for next hand after a delay - REPLACE WITH THE IMPROVED IMPLEMENTATION
              setTimeout(async () => {
                try {
                  // Use the safe operation wrapper for handling next hand preparation
                  const nextHandGame = await safeAsyncOperation(async () => {
                    // First, get a fresh copy of the game to avoid version conflicts
                    const freshGame = await Game.findOne({
                      gameId: game.gameId,
                    });

                    if (!freshGame) {
                      throw new Error(
                        `Game ${game.gameId} not found when preparing next hand`
                      );
                    }

                    // Create a fresh deck for the next hand - THIS IS KEY
                    const cardDeck = require("../utils/cardDeck");
                    freshGame.deck = cardDeck.createDeck();
                    console.log(
                      `Created fresh deck with ${freshGame.deck.length} cards for next hand`
                    );

                    // Use our utility from gameLogic but with the fresh game object
                    return await gameLogic.prepareNextHand(freshGame);
                  });

                  if (nextHandGame.status === "completed") {
                    // Game has ended
                    gameIo.to(gameId).emit("gameEnded", {
                      message: "Game ended - not enough active players",
                    });
                  } else {
                    // Log deck status before starting next hand
                    console.log(
                      `Deck status before starting next hand: ${nextHandGame.deck.length} cards`
                    );

                    // Start next hand with the fresh deck
                    const newHand = await safeAsyncOperation(() =>
                      gameLogic.startNewHand(nextHandGame)
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
                        const fixResult = await debugging.fixDuplicateCards(
                          newHand
                        );
                        console.log(
                          `Fixed duplicate cards: ${JSON.stringify(fixResult)}`
                        );
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

                    // Emit new game state
                    gameIo
                      .to(gameId)
                      .emit(
                        "newHand",
                        gameLogic.getSanitizedGameState(newHand)
                      );

                    // Log card distribution for verification
                    console.log("Card distribution for new hand:");
                    newHand.players.forEach((player) => {
                      if (player.hand && player.hand.length) {
                        console.log(
                          `Player ${player.username} cards: ${player.hand
                            .map((c) => `${c.rank}${c.suit[0]}`)
                            .join(", ")}`
                        );
                      }
                    });

                    // Emit private cards to each player
                    newHand.players.forEach((player) => {
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
                    const bettingGame = await safeAsyncOperation(() =>
                      gameLogic.startBettingRound(newHand)
                    );

                    // Notify the current player it's their turn
                    if (bettingGame.currentTurn) {
                      const currentPlayer = bettingGame.players.find(
                        (p) =>
                          p.user.toString() ===
                          bettingGame.currentTurn.toString()
                      );

                      if (currentPlayer) {
                        const socketId = userSockets.get(
                          currentPlayer.user.toString()
                        );
                        if (socketId) {
                          gameIo.to(socketId).emit("yourTurn", {
                            options: gameLogic.getPlayerOptions(
                              bettingGame,
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
                        gameLogic.getSanitizedGameState(bettingGame)
                      );
                  }
                } catch (error) {
                  console.error(
                    `Error handling next hand for game ${gameId}:`,
                    error
                  );

                  // Notify clients about the error but don't crash the game
                  gameIo.to(gameId).emit("gameError", {
                    message:
                      "Error preparing next hand, please refresh the page",
                    details: error.message,
                  });

                  // Try to recover by sending a game update
                  try {
                    const currentGame = await Game.findOne({
                      gameId: game.gameId,
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
              }, 15000); // Changed to 15 second delay before next hand

              return;
            }

            // Start next betting round
            const bettingGame = await gameLogic.startBettingRound(nextGame);

            // Notify the current player it's their turn
            if (bettingGame.currentTurn) {
              const currentPlayer = bettingGame.players.find(
                (p) => p.user.toString() === bettingGame.currentTurn.toString()
              );

              if (currentPlayer) {
                const socketId = userSockets.get(currentPlayer.user.toString());
                if (socketId) {
                  gameIo.to(socketId).emit("yourTurn", {
                    options: gameLogic.getPlayerOptions(
                      bettingGame,
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
              .emit("gameUpdate", gameLogic.getSanitizedGameState(bettingGame));
          } else {
            // Round continues, notify next player
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

        // Find the game
        const game = await Game.findOne({ gameId });
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
          // Remove player from the game completely
          game.players.splice(playerIndex, 1);
        } else {
          // Mark player as inactive, but keep their data
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
                  timeLimit: 30,
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

        // Save the updated game
        await game.save();

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

        // Update game state for all clients
        gameIo
          .to(gameId)
          .emit("gameUpdate", gameLogic.getSanitizedGameState(game));

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

            // Try to fix the duplicates
            try {
              const fixResult = await debugging.fixDuplicateCards(game);
              console.log(
                `Fixed duplicate cards: ${JSON.stringify(fixResult)}`
              );

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

          // Make sure there's a fresh deck
          console.log("Creating a fresh deck for the game");
          game.deck = require("../utils/cardDeck").createDeck();

          // Initialize first hand with a fresh deck
          const updatedGame = await gameLogic.startNewHand(game);
          console.log(`First hand started for game ${gameId}`);

          // VALIDATION: Check for duplicate cards
          try {
            gameLogic.validateGameCards(updatedGame);
          } catch (validationError) {
            console.error(`Card validation failed: ${validationError.message}`);
            socket.emit("gameError", {
              message: "Card validation failed. Please restart the game.",
              details: validationError.message,
            });
            return; // Exit the function to prevent continuing with invalid cards
          }

          // Emit game state to all players
          gameIo
            .to(gameId)
            .emit("gameStarted", gameLogic.getSanitizedGameState(updatedGame));

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

          // Start the first betting round
          const gameWithBetting = await gameLogic.startBettingRound(
            updatedGame
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
                const socketId = userSockets.get(currentPlayer.user.toString());
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
          gameIo
            .to(gameId)
            .emit(
              "gameUpdate",
              gameLogic.getSanitizedGameState(gameWithBetting)
            );
        }

        // Send a system message that initialization is complete
        gameIo.to(gameId).emit("chatMessage", {
          type: "system",
          message: "Game initialization complete",
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(`Initialize game error for game ${gameId}:`, error);
        socket.emit("gameError", {
          message: "Error initializing game",
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
