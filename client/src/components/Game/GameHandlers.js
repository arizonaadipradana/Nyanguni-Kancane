export default {
  /**
   * Create handler objects for socket events
   * @param {Object} component - Vue component instance
   * @returns {Object} Object with handler methods
   */
  createHandlers(component) {
    return {
      /**
       * Handle game state update event with real-time UI updates and array validation
       * @param {Object} gameState - New game state
       */
      handleGameUpdate(gameState) {
        if (!gameState) return;

        try {
          // Log detailed game state for debugging
          console.log("Updating game state with data:", {
            id: gameState.id,
            status: gameState.status,
            currentTurn: gameState.currentTurn,
            playerCount: gameState.players?.length || 0,
            bettingRound: gameState.bettingRound,
          });

          // Make sure important fields are present and valid
          const enhancedGameState = { ...gameState };

          // Ensure players is always a valid array
          if (
            !enhancedGameState.players ||
            !Array.isArray(enhancedGameState.players)
          ) {
            enhancedGameState.players = [];
          }

          // Ensure communityCards is always a valid array
          if (
            !enhancedGameState.communityCards ||
            !Array.isArray(enhancedGameState.communityCards)
          ) {
            enhancedGameState.communityCards = [];
          }

          // If there's an allPlayers array but the players array is missing entries,
          // merge the missing players from allPlayers into the players array
          if (
            enhancedGameState.allPlayers &&
            Array.isArray(enhancedGameState.allPlayers)
          ) {
            console.log(
              `Found ${enhancedGameState.allPlayers.length} players in allPlayers array`
            );

            // Create a map of existing player IDs for quick lookup
            const existingPlayers = new Map();
            enhancedGameState.players.forEach((player) => {
              if (player.id) {
                existingPlayers.set(player.id, true);
              }
            });

            // Add any missing players from allPlayers
            enhancedGameState.allPlayers.forEach((player) => {
              if (player.id && !existingPlayers.has(player.id)) {
                // Create a full player object with default values and add to players array
                enhancedGameState.players.push({
                  id: player.id,
                  username: player.username,
                  chips: 0,
                  totalChips: player.totalChips || 0,
                  hasCards: player.hasCards || false,
                  hasFolded: false,
                  hasActed: false,
                  isAllIn: false,
                  isActive:
                    player.isActive !== undefined ? player.isActive : true,
                  position: player.position || 0,
                });
                console.log(
                  `Added missing player to game state: ${player.username}`
                );
              }
            });
          }

          // Force status to 'active' if players have cards but status doesn't reflect it
          if (
            enhancedGameState.players &&
            enhancedGameState.players.some((p) => p.hasCards) &&
            enhancedGameState.status !== "active"
          ) {
            console.log(
              "Players have cards but game status is not active; forcing to active"
            );
            enhancedGameState.status = "active";
          }

          // Add creator info if it's missing but we previously had it
          if (
            !enhancedGameState.creator &&
            component.currentGame &&
            component.currentGame.creator
          ) {
            console.log("Preserving creator info that was missing in update");
            enhancedGameState.creator = component.currentGame.creator;
          }

          // Check if the component has the required properties before updating
          if (
            component.hasOwnProperty("isYourTurn") &&
            component.hasOwnProperty("currentUser")
          ) {
            // Check if it's no longer the current user's turn - if so, clear turn state
            if (
              component.isYourTurn &&
              component.currentUser &&
              enhancedGameState.currentTurn &&
              enhancedGameState.currentTurn !== component.currentUser.id
            ) {
              console.log(
                "Game state indicates it is no longer your turn, updating UI"
              );
              if (typeof component.endTurn === "function") {
                component.endTurn();
              } else {
                component.isYourTurn = false;
              }
            }
          }

          // Update the game state in store
          if (typeof component.updateGameState === "function") {
            component.updateGameState(enhancedGameState);
          }

          // If this update includes turn info and it's the current user's turn,
          // make sure the isYourTurn flag is set
          if (
            component.hasOwnProperty("currentUser") &&
            component.currentUser &&
            enhancedGameState.currentTurn &&
            enhancedGameState.currentTurn === component.currentUser.id &&
            component.hasOwnProperty("isYourTurn") &&
            !component.isYourTurn
          ) {
            console.log(
              "Game state shows it is your turn, updating isYourTurn flag"
            );
            if (typeof component.yourTurn === "function") {
              component.yourTurn({
                options: component.getDefaultOptions
                  ? component.getDefaultOptions()
                  : ["fold", "check", "call", "bet", "raise"],
              });
            } else {
              component.isYourTurn = true;
            }
          }

          // Clear any error message once we successfully receive game state
          if (
            component.hasOwnProperty("SET_ERROR_MESSAGE") &&
            typeof component.SET_ERROR_MESSAGE === "function"
          ) {
            component.SET_ERROR_MESSAGE("");
          }

          // Log connection status
          if (component.hasOwnProperty("isConnected")) {
            if (!component.isConnected) {
              component.isConnected = true;
              if (typeof component.addToLog === "function") {
                component.addToLog("Connected to game server");
              }
            }
          }

          // Force a UI update to ensure all players are visible
          if (
            component.$forceUpdate &&
            typeof component.$forceUpdate === "function"
          ) {
            component.$forceUpdate();
          }
        } catch (error) {
          console.error("Error handling game update:", error);
        }

        if (component._lastUiUpdate) {
          const now = Date.now();
          if (now - component._lastUiUpdate > 1000) {
            component._lastUiUpdate = now;
            if (
              component.$forceUpdate &&
              typeof component.$forceUpdate === "function"
            ) {
              component.$forceUpdate();
            }
          }
        } else {
          component._lastUiUpdate = Date.now();
          if (
            component.$forceUpdate &&
            typeof component.$forceUpdate === "function"
          ) {
            component.$forceUpdate();
          }
        }
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

        // Make sure component has the addToLog method
        if (typeof component.addToLog === "function") {
          component.addToLog(`${data.username} joined the game`);
        }

        // Update player list with automatic refresh
        setTimeout(() => {
          if (typeof component.requestStateUpdate === "function") {
            component.requestStateUpdate();
          }
        }, 300);
      },

      /**
       * Handle hand result event
       * @param {Object} result - Hand result data
       */
      handleHandResult(result) {
        console.log("Hand result received:", result);

        try {
          // Check if component has the expected properties
          if (component) {
            // Update UI state properties if they exist
            if ("handResult" in component) {
              component.handResult = result || {};
            }

            if ("showResult" in component) {
              component.showResult = true;
            }

            if ("currentHandResult" in component) {
              component.currentHandResult = result || {};
            }

            if ("showWinnerDisplay" in component) {
              component.showWinnerDisplay = true;
            }

            // Ensure we end any active turn when showing results
            if ("isYourTurn" in component && component.isYourTurn) {
              if (typeof component.endTurn === "function") {
                component.endTurn();
              } else {
                component.isYourTurn = false;
              }
            }

            // Make sure we have all the data needed for display
            if (
              component.currentHandResult &&
              !component.currentHandResult.communityCards &&
              component.currentGame &&
              component.currentGame.communityCards
            ) {
              component.currentHandResult.communityCards =
                component.currentGame.communityCards;
            }

            // Add a message to the game log
            if (typeof component.addToLog === "function") {
              const winners = result && result.winners ? result.winners : [];
              if (winners.length > 0) {
                const winnerNames = winners.map((w) => w.username).join(", ");
                component.addToLog(`Hand complete. Winner(s): ${winnerNames}`);
              } else {
                component.addToLog("Hand complete.");
              }
            }
          }
        } catch (error) {
          console.error("Error handling hand result:", error);
        }
      },

      /**
       * Handle your turn event with better lifecycle and validation
       * @param {Object} data - Turn data with available options
       */
      handleYourTurn(data) {
        try {
          // Check if we're already processing a turn or the state doesn't match
          if (component && component.currentGame && component.currentUser) {
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
              if (typeof component.requestStateUpdate === "function") {
                setTimeout(() => {
                  component.requestStateUpdate();
                }, 300);
              }
              return;
            }
          }

          // Prevent duplicate processing in quick succession
          if (
            component &&
            component.hasOwnProperty("isYourTurnProcessed") &&
            component.isYourTurnProcessed
          ) {
            console.log("Already processed yourTurn, ignoring duplicate");
            return;
          }

          console.log("Your turn event received:", data);

          // Update the UI state safely
          if (component) {
            if (typeof component.yourTurn === "function") {
              component.yourTurn(data);
            } else {
              // Direct property updates if no method exists
              if ("isYourTurn" in component) {
                component.isYourTurn = true;
              }

              if ("availableActions" in component) {
                component.availableActions = data.options || [];
              }
            }

            // Add to log
            if (typeof component.addToLog === "function") {
              component.addToLog("It is your turn");
            }

            // Make sure UI shows game is active
            if (
              component.currentGame &&
              component.currentGame.status !== "active" &&
              typeof component.$set === "function"
            ) {
              component.$set(component.currentGame, "status", "active");
            }

            // Set initialization flags
            if ("gameInitialized" in component) {
              component.gameInitialized = true;
            }

            if ("gameInProgress" in component) {
              component.gameInProgress = true;
            }

            // Start action timer if it exists
            if (typeof component.startActionTimer === "function") {
              component.startActionTimer(data.timeLimit || 30);
            }

            // Set processing flag to avoid duplicate handling
            if ("isYourTurnProcessed" in component) {
              component.isYourTurnProcessed = true;

              // Reset the flag after a delay
              setTimeout(() => {
                if (component && "isYourTurnProcessed" in component) {
                  component.isYourTurnProcessed = false;
                }
              }, 3000);
            }
          }
        } catch (error) {
          console.error("Error handling your turn event:", error);
        }
      },
      handleDealCards(data) {
        if (!data || !data.hand) return;

        try {
          console.log(
            "Received new cards:",
            data.hand.map((c) => `${c.rank} of ${c.suit}`).join(", ")
          );

          // Use store dispatch to update player hand
          if (
            component.$store &&
            typeof component.$store.dispatch === "function"
          ) {
            component.$store.dispatch("forceUpdatePlayerHand", data.hand);
          }

          // Also update local state if it exists
          if ("playerHand" in component) {
            component.playerHand = [...data.hand];

            // Log for debugging
            console.log(
              "Updated playerHand in component:",
              component.playerHand
                .map((c) => `${c.rank} of ${c.suit}`)
                .join(", ")
            );
          }

          // Force UI update to make sure cards are displayed
          if (typeof component.$forceUpdate === "function") {
            component.$forceUpdate();
          }

          // Add to game log
          if (typeof component.addToLog === "function") {
            component.addToLog("You were dealt new cards");
          }
        } catch (error) {
          console.error("Error handling dealCards event:", error);
        }
      },
    };
  },
};
