// client/src/components/Game/GameHandlers.js
/**
 * Socket event handlers for the Game component
 */

export default {
  /**
   * Create handler objects for socket events
   * @param {Object} component - Vue component instance
   * @returns {Object} Object with handler methods
   */
  createHandlers(component) {
    return {
      // client/src/components/Game/GameHandlers.js - Fixed turn handling

      /**
       * Handle game state update event with real-time UI updates
       * @param {Object} gameState - New game state
       */
      handleGameUpdate(gameState) {
        if (!gameState) return;

        // Log detailed game state for debugging
        console.log("Updating game state with data:", {
          id: gameState.id,
          status: gameState.status,
          currentTurn: gameState.currentTurn,
          playerCount: gameState.players?.length || 0,
          bettingRound: gameState.bettingRound,
        });

        // Make sure important fields are present
        const enhancedGameState = { ...gameState };

        // Force status to 'active' if players have cards but status doesn't reflect it
        if (
          gameState.players &&
          gameState.players.some((p) => p.hasCards) &&
          gameState.status !== "active"
        ) {
          console.log(
            "Players have cards but game status is not active; forcing to active"
          );
          enhancedGameState.status = "active";
        }

        // Add creator info if it's missing but we previously had it
        if (
          !gameState.creator &&
          component.currentGame &&
          component.currentGame.creator
        ) {
          console.log("Preserving creator info that was missing in update");
          enhancedGameState.creator = component.currentGame.creator;
        }

        // IMPORTANT: Check if it's no longer the current user's turn - if so, clear turn state
        if (
          component.isYourTurn &&
          component.currentUser &&
          gameState.currentTurn &&
          gameState.currentTurn !== component.currentUser.id
        ) {
          console.log(
            "Game state indicates it is no longer your turn, updating UI"
          );
          component.endTurn();
        }

        // Update the game state in store
        component.updateGameState(enhancedGameState);

        // If this update includes turn info and it's the current user's turn,
        // make sure the isYourTurn flag is set
        if (
          component.currentUser &&
          gameState.currentTurn &&
          gameState.currentTurn === component.currentUser.id &&
          !component.isYourTurn
        ) {
          console.log(
            "Game state shows it is your turn, updating isYourTurn flag"
          );
          component.yourTurn({
            options: component.getDefaultOptions
              ? component.getDefaultOptions()
              : ["fold", "check", "call", "bet", "raise"],
          });
        }

        // Clear any error message once we successfully receive game state
        component.SET_ERROR_MESSAGE("");

        // Log connection status
        if (!component.isConnected) {
          component.isConnected = true;
          component.addToLog("Connected to game server");
        }
      },

      /**
       * Handle game started event
       * @param {Object} gameState - Game state after starting
       */
      handleGameStarted(gameState) {
        console.log("Game started event received:", gameState);

        // Make sure the game state has a status of 'active'
        if (gameState && gameState.status !== "active") {
          gameState.status = "active";
        }

        component.updateGameState(gameState);
        component.addToLog("Game has started!");

        // Mark game as in progress
        component.gameInProgress = true;

        // Request another update to ensure all clients are in sync
        setTimeout(() => {
          component.requestStateUpdate();
        }, 800);

        // Clear any error messages
        component.clearErrorMessage();
      },

      /**
       * Handle player joined event
       * @param {Object} data - Player data
       */
      handlePlayerJoined(data) {
        if (!data || !data.username) {
          console.warn("Received playerJoined event with invalid data:", data);
          return;
        }

        console.log("Player joined event received:", data);
        component.addToLog(`${data.username} joined the game`);

        // Update player list with automatic refresh
        setTimeout(() => {
          component.requestStateUpdate();
        }, 300);
      },

      /**
       * Handle player left event
       * @param {Object} data - Player data
       */
      handlePlayerLeft(data) {
        component.addToLog(`${data.username} left the game`);
      },

      /**
       * Handle chat message event
       * @param {Object} message - Chat message data
       */
      handleChatMessage(message) {
        // If it's a system message, add to game log
        if (message.type === "system") {
          component.addToLog(message.message);
        }
      },

      /**
       * Handle cards being dealt with improved update
       * @param {Object} data - Card data
       */
      /**
       * Handle cards being dealt with improved update and error handling
       * @param {Object} data - Card data
       */
      handleDealCards(data) {
        console.log("Received cards:", data);

        // Make sure the hand property exists and is an array
        if (!data || !data.hand || !Array.isArray(data.hand)) {
          console.warn("Received invalid card data:", data);
          data = { hand: [] };
        }

        // Force clear any existing cards first to ensure update
        component.playerHand = [];

        // Small delay to ensure state reset before setting new cards
        setTimeout(() => {
          // Apply the new cards
          component.playerHand = data.hand;
          component.addToLog("You have been dealt new cards");

          // Force UI update
          component.$forceUpdate();

          // Mark game as initialized when we get cards
          component.gameInitialized = true;
          component.gameInProgress = true;

          // Force the currentGame status to be 'active' if it's not already
          if (
            component.currentGame &&
            component.currentGame.status !== "active"
          ) {
            component.$set(component.currentGame, "status", "active");
            component.addToLog("Game status updated to active");
          }

          // Clear any lingering error messages
          component.clearErrorMessage();

          // Request a full game state update to ensure UI is in sync
          setTimeout(() => {
            component.requestStateUpdate();
          }, 500);
        }, 100);
      },

      /**
       * Handle your turn event with better lifecycle and validation
       * @param {Object} data - Turn data with available options
       */
      handleYourTurn(data) {
        // Check if we're already processing a turn or the state doesn't match
        if (component.currentGame && component.currentUser) {
          const currentTurnId = component.currentGame.currentTurn;
          const userId = component.currentUser.id;

          // Validate that this turn matches the game state
          if (currentTurnId && userId && currentTurnId !== userId) {
            console.warn(
              "Received yourTurn event but game state says it's not our turn!",
              {
                userTurn: userId,
                gameTurn: currentTurnId,
              }
            );

            // Request fresh state to ensure synchronization
            setTimeout(() => {
              component.requestStateUpdate();
            }, 300);
            return;
          }
        }

        // Prevent duplicate processing in quick succession
        if (component.isYourTurnProcessed) {
          console.log("Already processed yourTurn, ignoring duplicate");
          return;
        }

        console.log("Your turn event received:", data);

        // Update the UI state before adding to log to ensure fast UI response
        component.yourTurn(data);

        // Need to set component local state directly too for immediate UI update
        component.isYourTurn = true;

        component.addToLog("It is your turn");

        // Make sure UI shows game is active
        if (
          component.currentGame &&
          component.currentGame.status !== "active"
        ) {
          component.$set(component.currentGame, "status", "active");
        }

        // Mark game as initialized
        component.gameInitialized = true;
        component.gameInProgress = true;

        // Start action timer with the timeLimit from data or default to 60 seconds
        component.startActionTimer(data.timeLimit || 60);

        // Set flag to avoid duplicate processing
        component.isYourTurnProcessed = true;

        // Reset the flag after a delay
        setTimeout(() => {
          component.isYourTurnProcessed = false;
        }, 3000);
      },

      /**
       * Handle turn changed event
       * @param {Object} data - Turn data
       */
      handleTurnChanged(data) {
        // Add to log when someone else's turn starts
        if (
          !component.currentUser ||
          data.playerId !== component.currentUser.id
        ) {
          component.addToLog(`It is ${data.username}'s turn`);
        } else {
          // It's our turn!
          component.addToLog(`It is your turn`);

          // Ensure the isYourTurn flag is set
          if (!component.isYourTurn) {
            component.yourTurn({
              options: component.getDefaultOptions
                ? component.getDefaultOptions()
                : ["fold", "check", "call", "bet", "raise"],
            });
          }
        }
      },

      /**
       * Handle action taken event with better feedback
       * @param {Object} data - Action data
       */
      handleActionTaken(data) {
        // Immediately check if it was the current user's action
        const isCurrentUser =
          component.currentUser && data.playerId === component.currentUser.id;

        // If it was current user's action, make sure UI is updated
        if (isCurrentUser) {
          // Force end turn for responsive UI
          component.endTurn();
        }

        // Log actions from other players
        if (!isCurrentUser) {
          const player = component.currentGame?.players?.find(
            (p) => p.id === data.playerId
          );
          const playerName = player ? player.username : "Unknown";

          let actionText = `${playerName} ${data.action}s`;
          if (
            data.action === "bet" ||
            data.action === "raise" ||
            data.action === "allIn"
          ) {
            actionText += ` ${data.amount} chips`;
          }

          component.addToLog(actionText);
        }
      },

      /**
       * Handle flop dealt event
       */
      handleDealFlop() {
        component.addToLog("Flop is dealt");
      },

      /**
       * Handle turn card dealt event
       */
      handleDealTurn() {
        component.addToLog("Turn is dealt");
      },

      /**
       * Handle river card dealt event
       */
      handleDealRiver() {
        component.addToLog("River is dealt");
      },

      /**
       * Handle hand result event with better error handling
       * @param {Object} result - Hand result data
       */
      /**
       * Handle hand result event with better error handling
       * @param {Object} result - Hand result data
       */
      handleHandResult(result) {
        console.log("Received hand result:", result);

        // Add safety checks and debug info for hand result processing
        if (!result) {
          console.error("Hand result is empty or invalid");
          return;
        }

        // Deep inspect the result to see what we're receiving
        console.log("Winners array:", JSON.stringify(result.winners));
        console.log(
          "All players cards:",
          JSON.stringify(result.allPlayersCards)
        );
        console.log("Community cards:", JSON.stringify(result.communityCards));
        console.log("Pot amount:", result.pot);
        console.log("Is fold win:", result.isFoldWin);

        // Make sure winners array exists and is properly formatted
        if (
          !result.winners ||
          !Array.isArray(result.winners) ||
          result.winners.length === 0
        ) {
          console.error("No valid winners in result data");
          return;
        }

        // Create a safe copy of the winners with default values for missing properties
        const safeWinners = result.winners.map((winner) => ({
          playerId: winner.playerId || "unknown",
          username: winner.username || "Unknown Player",
          handName: winner.handName || "Unknown Hand",
          hand: Array.isArray(winner.hand) ? winner.hand : [],
        }));

        // Store all players' cards if provided
        const allPlayersCards = Array.isArray(result.allPlayersCards)
          ? result.allPlayersCards.map((player) => ({
              playerId: player.playerId || "unknown",
              username: player.username || "Unknown Player",
              handName: player.handName || "Unknown Hand",
              hand: Array.isArray(player.hand) ? player.hand : [],
              isWinner: player.isWinner || false,
            }))
          : [];

        // Store community cards if provided
        const communityCards = Array.isArray(result.communityCards)
          ? result.communityCards
          : [];

        // Safely set the data on the component (not on 'this')
        component.handWinners = safeWinners;
        component.allPlayersCards = allPlayersCards;
        component.communityCards = communityCards;
        component.winningPot = result?.pot || 0;
        component.isFoldWin = result?.isFoldWin || false;
        component.showWinnerDisplay = true;

        // Format winner names for log
        const winnerNames = safeWinners
          .map((winner) => winner.username)
          .join(", ");

        // Create appropriate log message
        let logMessage = `Hand complete. Winner(s): ${winnerNames}`;
        if (result.isFoldWin) {
          logMessage = `${winnerNames} wins by fold`;
        }

        component.addToLog(logMessage);

        // Force UI update
        component.forceCardUpdate();
      },

      /**
       * Handle new hand event
       * @param {Object} gameState - New game state
       */
      handleNewHand(gameState) {
        component.addToLog("Starting a new hand");
        component.updateGameState(gameState);
      },

      /**
       * Handle game ended event
       * @param {Object} data - Game end data
       */
      handleGameEnded(data) {
        component.addToLog(`Game ended: ${data.message}`);
      },

      /**
       * Handle game error event
       * @param {Object} data - Error data
       */
      handleGameError(data) {
        // Don't set error if game is already in progress - might be recoverable
        if (
          component.gameInProgress &&
          component.playerHand &&
          component.playerHand.length > 0
        ) {
          component.addToLog(`Warning: ${data.message} (game continuing)`);
        } else {
          component.SET_ERROR_MESSAGE(data.message);
          component.addToLog(`Error: ${data.message}`);
        }
      },

      /**
       * Handle creator info event
       * @param {Object} data - Creator info data
       */
      handleCreatorInfo(data) {
        console.log("Received creator info:", data);

        // If creator info isn't in the game data, add it
        if (
          component.currentGame &&
          !component.currentGame.creator &&
          data.creator
        ) {
          component.$set(component.currentGame, "creator", data.creator);
          component.addToLog("Creator info received and updated");
        }

        // Store explicit creator status in case computed property fails
        component.explicitIsCreator = data.isCreator;
      },
    };
  },
};
