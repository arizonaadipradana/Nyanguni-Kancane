// server/sockets/index.js
const gameLogic = require("../utils/gameLogic");
const Game = require("../models/Game");
const User = require("../models/User");
const mongoose = require("mongoose");
const { registerChatHandlers } = require("./chatHandlers");

// Map user IDs to socket IDs
const userSockets = new Map();
// Map game IDs to sets of connected sockets
const gameRooms = new Map();
module.exports = (io) => {
  // Game namespace
  const gameIo = io.of("/game");

  registerChatHandlers(io);

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
        let observerStatus = false;

        //Check if game is active - if so, user can only observe until it's in waiting state
        if (!existingPlayer && game.status === "active") {
          // Set observer status
          observerStatus = true;

          // Send a notification to the client that they are in observer mode
          socket.emit("observerStatus", {
            isObserver: true,
            message:
              "Game is in progress. You are in observer mode and can join when the current hand completes.",
          });

          // Add to chat for this user only
          socket.emit("chatMessage", {
            type: "system",
            message:
              "Game is in progress. You can join when the current hand completes.",
            timestamp: new Date(),
          });

          console.log(`User ${username} is observing game ${gameId}`);
        } else if (!existingPlayer) {
          // Add player to the game if it's in waiting state and there's room
          if (game.players.length < 8 && game.status === "waiting") {
            // Find user to check chip balance
            const user = await User.findById(userId);
            if (!user) {
              socket.emit("gameError", { message: "User not found" });
              return;
            }

            // Verify chip balance
            if (user.balance < 1) {
              socket.emit("gameError", {
                message:
                  "Insufficient chips to join game. Minimum 1 chip required.",
              });
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
            if (game.players.length >= 8) {
              socket.emit("gameError", { message: "Game is full" });
            } else {
              socket.emit("gameError", {
                message: "Cannot join the game while it's active",
              });
            }
            return;
          }
        }

        // Always send updated game state to all players in the room
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
          isObserver: observerStatus,
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
        // Find the game
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
        const activePlayers = game.players.filter(
          (p) => p.isActive && p.totalChips > 0
        );
        if (activePlayers.length < 2) {
          console.log(
            `Not enough active players with chips in game ${gameId}: ${activePlayers.length}`
          );
          return socket.emit("gameError", {
            message: "Need at least 2 active players with chips to start",
          });
        }

        // Add new check for player readiness
        const readyPlayers = activePlayers.filter((p) => p.isReady);
        if (readyPlayers.length < 2) {
          console.log(
            `Not enough ready players in game ${gameId}: ${readyPlayers.length}`
          );
          return socket.emit("gameError", {
            message: "Need at least 2 ready players to start",
          });
        }

        // Check if game is in 'waiting' state or 'completed' state (which might be due to player removals)
        const isGameContinuation =
          game.status === "completed" && activePlayers.length >= 2;

        if (game.status !== "waiting" && !isGameContinuation) {
          console.log(
            `Game ${gameId} already started (status: ${game.status})`
          );
          return socket.emit("gameError", {
            message: "Game has already been started",
          });
        }

        console.log(
          `Starting game ${gameId} with ${activePlayers.length} active players (${readyPlayers.length} ready)`
        );

        // IMPORTANT FIX: Create a completely fresh deck with enhanced shuffling
        const cardDeck = require("../utils/cardDeck");
        game.deck = cardDeck.getFreshShuffledDeck();

        // Log deck statistics to verify proper shuffling
        const deckStats = cardDeck.getDeckStats(game.deck);
        console.log(`New game deck statistics:`, deckStats);

        // If this is a continuation of a game after some players were removed
        if (isGameContinuation) {
          console.log(`Continuing game ${gameId} after player removals`);

          // Send a message to all players about the continuation
          gameIo.to(gameId).emit("chatMessage", {
            type: "system",
            message:
              "Game is continuing with remaining players who have chips.",
            timestamp: new Date(),
          });
        }

        // Update game status
        game.status = "active";
        game.bettingRound = "preflop";

        // Set dealer position based on whether it's a continuation
        if (!isGameContinuation) {
          game.dealerPosition = 0; // First player is dealer for first hand
        } else {
          // For continuation, rotate the dealer position among active players
          let nextDealerPos = (game.dealerPosition + 1) % game.players.length;

          // Find the next active player with chips
          let attempts = 0;
          while (attempts < game.players.length) {
            const player = game.players[nextDealerPos];
            if (player.isActive && player.totalChips > 0) {
              break; // Found an active player with chips
            }
            nextDealerPos = (nextDealerPos + 1) % game.players.length;
            attempts++;
          }

          game.dealerPosition = nextDealerPos;
        }

        // Reset ready status for next hand
        game.players.forEach((player) => {
          player.isReady = false;
        });

        await game.save();

        // Send system message about game starting
        gameIo.to(gameId).emit("chatMessage", {
          type: "system",
          message: "The game has started",
          timestamp: new Date(),
        });

        console.log(`Game ${gameId} status updated to active`);

        // Rest of the existing startGame implementation...
        // Initialize game with first hand
        try {
          // Start a new hand with our enhanced shuffled deck
          const updatedGame = await gameLogic.startNewHand(game);
          console.log(`First hand started for game ${gameId}`);

          // Validate and emit events
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
          message: "Server error while starting game",
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

          // Ensure the amount is a valid number for bet/raise actions
          if (
            (action === "bet" || action === "raise") &&
            (typeof amount !== "number" || amount <= 0)
          ) {
            socket.emit("gameError", { message: "Invalid bet amount" });
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

            // IMPORTANT FIX: Use the pot amount saved in the result object
            // This ensures we use the pot value before it was reset to zero
            const potAmount = result.potAmount || 0;

            // Log the pot amounts for debugging
            console.log(`Using pot amount from result: ${potAmount}`);
            console.log(`Current game pot: ${game.pot}`);

            // Make sure we have a valid pot amount
            if (!potAmount && potAmount !== 0) {
              console.error("No pot amount in result object:", result);
            }

            // Create a list of all active players for displaying cards
            const allActivePlayers = game.players.filter(
              (p) => p.isActive && p.hand && p.hand.length > 0
            );

            // Create the allPlayersCards array for the result
            const allPlayersCards = allActivePlayers.map((player) => {
              const isWinner = player.user.toString() === result.winners[0];
              return {
                playerId: player.user.toString(),
                username: player.username || "Unknown Player",
                // Only include hand for the winner, empty array for others
                hand: isWinner
                  ? Array.isArray(player.hand)
                    ? player.hand
                    : []
                  : [],
                isWinner: isWinner,
                handName: isWinner ? "Winner by fold" : "Folded",
              };
            });

            // Get the community cards that have been dealt so far
            const dealtCommunityCards = game.communityCards || [];

            // Emit the result with the saved pot amount
            gameIo.to(gameId).emit("handResult", {
              winners: [
                {
                  playerId: winnerPlayer.user.toString(),
                  username: winnerPlayer.username || "Unknown Player",
                  handName: "Winner by fold",
                  hand: Array.isArray(winnerPlayer.hand)
                    ? winnerPlayer.hand
                    : [],
                },
              ],
              allPlayersCards: allPlayersCards,
              communityCards: dealtCommunityCards,
              pot: potAmount, // Use the saved pot amount instead of game.pot
              isFoldWin: true, // Add flag to indicate this was a fold win
              message: `${winnerPlayer.username} wins by fold`,
            });
            //Ensure game status is immediately set to 'waiting'
            // This prevents turn signals from being processed after a fold win
            game.status = "waiting";
            await game.save();

            // Emit a special gameStatusChange event to force all clients to update their state
            gameIo.to(gameId).emit("gameStatusChange", {
              status: "waiting",
              message:
                "Hand completed - game is waiting for next hand to start",
              timestamp: Date.now(),
            });

            // Also update game state for all clients with the correct status
            gameIo
              .to(gameId)
              .emit("gameUpdate", gameLogic.getSanitizedGameState(game));

            // Send a signal to clear player hands client-side immediately
            gameIo.to(gameId).emit("clearPlayerHands", {
              timestamp: Date.now(),
              message: "Hand completed - clearing cards for next hand",
            });

            //Send signal to clear player hands client-side
            gameIo.to(gameId).emit("clearPlayerHands", {
              timestamp: Date.now(),
              message: "Clearing hands for the next round",
            });

            // Prepare for next hand
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

              // Notify all players that they need to ready up for the next hand
              gameIo.to(gameId).emit("chatMessage", {
                type: "system",
                message: "Hand complete. Please ready up for the next hand.",
                timestamp: new Date(),
              });

              // Send updated game state
              gameIo
                .to(gameId)
                .emit(
                  "gameUpdate",
                  gameLogic.getSanitizedGameState(nextHandGame)
                );
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
            }

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

              // Log showdown result data for debugging
              console.log(
                `Showdown results - Winners: ${
                  showdownResult.winners?.length || 0
                }, Pot: ${showdownResult.pot || game.pot}`
              );

              // IMPORTANT FIX: Ensure pot is correct in the result
              // If pot is missing or zero but we know there should be a pot, use the one from gameLogic result
              if (!showdownResult.pot && game.pot > 0) {
                showdownResult.pot = game.pot;
                console.log(
                  `Fixed missing pot in showdown result, set to ${game.pot}`
                );
              }

              // Additional safety: If both are zero but players have chips in pot, recalculate
              if (showdownResult.pot <= 0 && game.pot <= 0) {
                const totalChipsInPot = game.players.reduce(
                  (sum, p) => sum + p.chips,
                  0
                );
                if (totalChipsInPot > 0) {
                  showdownResult.pot = totalChipsInPot;
                  console.log(
                    `Recalculated pot from player chips: ${totalChipsInPot}`
                  );
                }
              }

              // Validate winner data before sending
              if (
                showdownResult.winners &&
                Array.isArray(showdownResult.winners) &&
                showdownResult.winners.length > 0
              ) {
                // Get detailed winner info for logging
                const winnerInfo = showdownResult.winners
                  .map(
                    (w) =>
                      `${w.username || "Unknown"} with ${
                        w.handName || "Unknown Hand"
                      }`
                  )
                  .join(", ");
                console.log(
                  `Showdown winners: ${winnerInfo}, pot: ${showdownResult.pot}`
                );

                // Send result to clients with improved data safety and all players' cards
                gameIo.to(gameId).emit("handResult", {
                  winners: showdownResult.winners.map((w) => {
                    // Safely get the player and their hand
                    const player = game.players.find(
                      (p) => p.user && p.user.toString() === w.playerId
                    );
                    return {
                      playerId: w.playerId || "unknown",
                      username: w.username || "Unknown Player",
                      handName: w.handName || "Unknown Hand",
                      hand:
                        player && Array.isArray(player.hand) ? player.hand : [], // Ensure hand is an array
                    };
                  }),
                  hands: Array.isArray(showdownResult.hands)
                    ? showdownResult.hands.map((h) => {
                        return {
                          playerId: h.playerId || "unknown",
                          username: h.username || "Unknown Player",
                          hand: Array.isArray(h.hand) ? h.hand : [],
                          handName: h.handName || "Unknown Hand",
                        };
                      })
                    : [],
                  allPlayersCards: showdownResult.allPlayersCards || [],
                  communityCards: game.communityCards,
                  // CRITICAL FIX: Ensure pot is not zero
                  pot:
                    showdownResult.pot ||
                    game.pot ||
                    game.players.reduce((sum, p) => sum + p.chips, 0),
                });
              } else {
                console.error("Invalid showdown result data:", showdownResult);
                gameIo.to(gameId).emit("gameError", {
                  message: "Error processing showdown result",
                });
              }

              // Prepare for next hand after a delay
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

                // Notify all players that they need to ready up for the next hand
                gameIo.to(gameId).emit("chatMessage", {
                  type: "system",
                  message: "Hand complete. Please ready up for the next hand.",
                  timestamp: new Date(),
                });

                // Send updated game state
                gameIo
                  .to(gameId)
                  .emit(
                    "gameUpdate",
                    gameLogic.getSanitizedGameState(nextHandGame)
                  );
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
              }

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
        const playerData = game.players[playerIndex];

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
              // Hand ends, remaining player wins
              const winnerPlayer = activePlayers[0];

              // Define a local result object instead of using undefined global
              const handResult = {
                handEnded: true,
                roundEnded: true,
                winners: [winnerPlayer.user.toString()],
              };

              // Award pot to winner
              await gameLogic.awardPot(game, [winnerPlayer]);

              // Only send the community cards that have been dealt so far
              const dealtCommunityCards = game.communityCards || [];

              // Create allPlayersCards format with only the winner's cards visible
              const allActivePlayers = game.players.filter(
                (p) => p.isActive && p.hand && p.hand.length > 0
              );

              // Create allPlayersCards format with only the winner's cards visible
              const allPlayersCards = allActivePlayers.map((player) => {
                const isWinner =
                  player.user.toString() === handResult.winners[0];
                return {
                  playerId: player.user.toString(),
                  username: player.username || "Unknown Player",
                  // Only include hand for the winner, empty array for others
                  hand: isWinner
                    ? Array.isArray(player.hand)
                      ? player.hand
                      : []
                    : [],
                  isWinner: isWinner,
                  handName: isWinner ? "Winner by fold" : "Folded",
                };
              });

              // Emit the result with the current state of the community cards
              gameIo.to(gameId).emit("handResult", {
                winners: [
                  {
                    playerId: winnerPlayer.user.toString(),
                    username: winnerPlayer.username || "Unknown Player",
                    handName: "Winner by fold",
                    hand: Array.isArray(winnerPlayer.hand)
                      ? winnerPlayer.hand
                      : [],
                  },
                ],
                allPlayersCards: allPlayersCards,
                communityCards: dealtCommunityCards,
                pot: game.pot,
                isFoldWin: true, // Add flag to indicate this was a fold win
                message: `${winnerPlayer.username} wins by fold`,
              });
            }

            // Also send a special gameUpdate event to notify about the change
            gameIo
              .to(gameId)
              .emit("gameUpdate", gameLogic.getSanitizedGameState(game));

            // Add special message about player leaving causing win
            gameIo.to(gameId).emit("chatMessage", {
              type: "system",
              message: `${playerName} left the game, causing a player to win by default`,
              timestamp: new Date(),
            });

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

        // IMPORTANT FIX: Update user balance in database before player leaves
        try {
          // Get the player's current balance from the game
          const currentBalance = playerData.totalChips || 0;

          // Update player's balance in the database
          await User.findByIdAndUpdate(
            userId,
            { balance: currentBalance },
            { new: true }
          );

          console.log(
            `Updated balance for leaving player ${playerName} to ${currentBalance}`
          );
        } catch (dbError) {
          console.error(
            `Error updating balance for leaving player: ${dbError.message}`
          );
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
    // Handle player ready status
    socket.on("playerReady", async ({ gameId, userId, isReady }) => {
      try {
        if (!gameId || !userId) {
          return socket.emit("gameError", {
            message: "Missing required fields",
          });
        }

        console.log(
          `Player ${userId} set ready status to ${isReady} in game ${gameId}`
        );

        // Find the game
        const game = await Game.findOne({ gameId });
        if (!game) {
          return socket.emit("gameError", { message: "Game not found" });
        }

        // Check if game is in waiting state
        if (game.status !== "waiting") {
          return socket.emit("gameError", {
            message: "Game has already started",
          });
        }

        // Find the player
        const player = game.players.find((p) => p.user.toString() === userId);
        if (!player) {
          return socket.emit("gameError", { message: "Player not in game" });
        }

        // Update player's ready status
        player.isReady = isReady;

        // Save the game
        await game.save();

        // Notify all players about the updated readiness status
        gameIo.to(gameId).emit("playerReadyUpdate", {
          userId,
          username: player.username,
          isReady,
        });

        // Send updated game state to all players
        const updatedGameState = gameLogic.getSanitizedGameState(game);
        gameIo.to(gameId).emit("gameUpdate", updatedGameState);

        // Check if all players are ready and emit an event
        // This is just to notify, but doesn't automatically start the game
        const readyPlayers = game.players.filter((p) => p.isReady);
        const allPlayersReady = readyPlayers.length === game.players.length;
        const enoughPlayers = readyPlayers.length >= 2;

        console.log(
          `Ready players: ${readyPlayers.length}/${game.players.length}, all ready: ${allPlayersReady}, enough: ${enoughPlayers}`
        );

        if (allPlayersReady && enoughPlayers) {
          // Emit event that all players are ready
          gameIo.to(gameId).emit("allPlayersReady", {
            readyCount: readyPlayers.length,
            totalPlayers: game.players.length,
            enoughToStart: true,
          });
        }
      } catch (error) {
        console.error("Player ready status update error:", error);
        socket.emit("gameError", {
          message: "Error updating ready status",
          details: error.message,
        });
      }
    });

    // Handle starting next hand with improved database synchronization
    socket.on("startNextHand", async ({ gameId, userId }) => {
      console.log(
        `Received startNextHand event for game ${gameId} from user ${userId}`
      );

      try {
        // Find the game
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
            message: "Only the creator can start the next hand",
          });
        }

        // Check if game is in waiting state
        if (game.status !== "waiting") {
          console.log(`Game ${gameId} not in waiting state (${game.status})`);
          return socket.emit("gameError", {
            message: "Game is not in waiting state",
          });
        }

        // Check if enough players are ready
        const readyPlayers = game.players.filter((p) => p.isReady);
        if (readyPlayers.length < 2) {
          console.log(
            `Not enough ready players in game ${gameId}: ${readyPlayers.length}`
          );
          return socket.emit("gameError", {
            message: "Need at least 2 ready players to start",
          });
        }

        // IMPORTANT: Synchronize player balances with database before starting new hand
        // This ensures we have the right balances from previous hand results
        for (const player of game.players) {
          try {
            const user = await User.findById(player.user);
            if (user) {
              // Update player's chips from the database balance
              if (player.totalChips !== user.balance) {
                console.log(
                  `Updating ${player.username}'s balance from ${player.totalChips} to ${user.balance} from database`
                );
                player.totalChips = user.balance;
              }
            }
          } catch (dbError) {
            console.error(
              `Error fetching user balance for ${player.username}:`,
              dbError
            );
          }
        }

        // Important: Set game status to active before dealing cards
        game.status = "active";

        // Make sure pot is reset to zero
        game.pot = 0;

        // Reset chips committed to pot for all players
        game.players.forEach((player) => {
          player.chips = 0;
        });

        await game.save();

        // IMPORTANT: Create a fresh deck with completely new cards
        game.deck = require("../utils/cardDeck").getFreshShuffledDeck();
        console.log(
          `Created fresh deck with ${game.deck.length} cards for new hand`
        );

        // Start a new hand with the fresh deck
        const updatedGame = await gameLogic.startNewHand(game);
        console.log(`New hand started for game ${gameId}`);

        // NEW: Check for and handle bankrupt players
        const removedPlayers = await gameLogic.checkAndRemoveBankruptPlayers(
          updatedGame
        );

        // Emit events for removed players
        if (removedPlayers && removedPlayers.length > 0) {
          for (const player of removedPlayers) {
            gameIo.to(gameId).emit("playerRemoved", {
              userId: player.userId,
              username: player.username,
              reason: "Insufficient chips",
            });

            // Also emit chat message
            gameIo.to(gameId).emit("chatMessage", {
              type: "system",
              message: `${player.username} has been removed from the game due to insufficient chips`,
              timestamp: new Date(),
            });
          }
        }

        // Notify everyone about the updated player balances
        gameIo.to(gameId).emit("chatMessage", {
          type: "system",
          message: "Player balances updated for new hand",
          timestamp: new Date(),
        });

        // Log card distribution for verification
        updatedGame.players.forEach((player) => {
          if (player.hand && player.hand.length) {
            console.log(
              `Player ${player.username} cards: ${player.hand
                .map((c) => `${c.rank}${c.suit[0]}`)
                .join(", ")}`
            );
          }
        });

        // Notify everyone about the updated player balances
        gameIo.to(gameId).emit("chatMessage", {
          type: "system",
          message: "Player balances updated for new hand",
          timestamp: new Date(),
        });

        //Send signal to clear any remaining player hands client-side
        gameIo.to(gameId).emit("clearPlayerHands", {
          timestamp: Date.now(),
          message: "Clearing hands for new hand",
        });

        // Emit game state to all players
        gameIo
          .to(gameId)
          .emit("gameStarted", gameLogic.getSanitizedGameState(updatedGame));
        console.log(`Game started event emitted for game ${gameId}`);

        // Reset ready status
        updatedGame.players.forEach((player) => {
          player.isReady = false;
        });

        // Emit private cards to each player with explicit clean copies
        updatedGame.players.forEach((player) => {
          if (player.isActive && player.hand && player.hand.length) {
            const socketId = userSockets.get(player.user.toString());
            if (socketId) {
              // Create clean copies of cards to avoid reference issues
              const cleanHand = player.hand.map((card) => ({
                suit: card.suit,
                rank: card.rank,
                value: card.value,
                code: card.code,
              }));

              console.log(
                `Sending new hand cards to ${player.username}:`,
                cleanHand.map((c) => `${c.rank} of ${c.suit}`).join(", ")
              );

              // Send with a timestamp to ensure client processes as new cards
              gameIo.to(socketId).emit("dealCards", {
                hand: cleanHand,
                newHand: true,
                timestamp: Date.now(),
              });
            }
          }
        });

        // Start the betting round
        const gameWithBetting = await gameLogic.startBettingRound(updatedGame);

        // Notify the current player it's their turn
        if (gameWithBetting.currentTurn) {
          const currentPlayer = gameWithBetting.players.find(
            (p) => p.user.toString() === gameWithBetting.currentTurn.toString()
          );

          if (currentPlayer) {
            const socketId = userSockets.get(currentPlayer.user.toString());
            if (socketId) {
              gameIo.to(socketId).emit("yourTurn", {
                options: gameLogic.getPlayerOptions(
                  gameWithBetting,
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

        // Update game state for all players
        gameIo
          .to(gameId)
          .emit("gameUpdate", gameLogic.getSanitizedGameState(gameWithBetting));
        console.log(`Game state updated for all players in game ${gameId}`);
      } catch (error) {
        console.error(`Error starting next hand for game ${gameId}:`, error);
        socket.emit("gameError", {
          message: "Server error",
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
