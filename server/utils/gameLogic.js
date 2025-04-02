// server/utils/gameLogic.js
const cardDeck = require("./cardDeck");
const handEvaluator = require("./handEvaluator");
const User = require("../models/User");
const Game = require("../models/Game");

// Game logic for Texas Hold'em
const gameLogic = {
  // Start a new game
  async startGame(game) {
    game.status = "active";
    return await this.startNewHand(game);
  },

  // Start a new hand
  async startNewHand(game) {
    // Check if this is a restart of an existing hand - don't deal new cards if players already have them
    const playersHaveCards = game.players.some(player => player.hand && player.hand.length > 0);
    
    if (playersHaveCards) {
      console.log(`Players already have cards, skipping card dealing in startNewHand`);
      
      // Just reset other game state elements but don't deal new cards
      game.bettingRound = "preflop";
      
      // Set blinds positions if they're not already set
      if (game.smallBlindPosition === undefined || game.bigBlindPosition === undefined) {
        this.setBlindPositions(game);
        
        // Set blinds
        const smallBlindPlayer = game.players[game.smallBlindPosition];
        const bigBlindPlayer = game.players[game.bigBlindPosition];
        
        // Small blind is half the minimum bet, big blind is the minimum bet
        await this.placeBet(game, smallBlindPlayer.user.toString(), game.minBet / 2);
        await this.placeBet(game, bigBlindPlayer.user.toString(), game.minBet);
      }
      
      // Make sure currentTurn is set correctly
      if (!game.currentTurn) {
        game.currentTurn = this.getNextActivePlayerAfter(game, game.bigBlindPosition);
      }
      
      // Save the updated game
      game._skipValidation = true;
      await game.save();
      
      return game;
    }
    
    // Reset game state for new hand
    game.pot = 0;
    game.communityCards = [];
  
    // CRITICAL FIX: Always create a completely new, properly shuffled deck
    const cardDeck = require('./cardDeck');
  
    // Use the enhanced getFreshShuffledDeck function for maximum randomness
    game.deck = cardDeck.getFreshShuffledDeck();
  
    // Log the deck stats for verification
    const deckStats = cardDeck.getDeckStats(game.deck);
    console.log(`New hand deck stats:`, deckStats);
  
    game.currentBet = 0;
    game.handNumber += 1;
    game.bettingRound = "preflop";
  
    // Reset player states
    game.players.forEach((player) => {
      player.hand = [];
      player.chips = 0;
      player.hasFolded = false;
      player.hasActed = false;
      player.isAllIn = false;
    });

    // Rotate dealer position (button)
    if (game.handNumber > 1) {
      game.dealerPosition = (game.dealerPosition + 1) % game.players.length;

      // Make sure the dealer position is on an active player
      while (!game.players[game.dealerPosition].isActive) {
        game.dealerPosition = (game.dealerPosition + 1) % game.players.length;
      }
    } else {
      // First hand, dealer can be random or position 0
      game.dealerPosition = 0;
    }

    // Set blinds positions (relative to dealer)
    this.setBlindPositions(game);

    // Verify deck is properly shuffled before dealing
    if (!cardDeck.isWellShuffled(game.deck)) {
      console.warn("Deck appears to be poorly shuffled, reshuffling");
      game.deck = cardDeck.superShuffle(game.deck);
    }

    // Deal two cards to each active player
    console.log(
      `Dealing cards to ${
        game.players.filter((p) => p.isActive && p.totalChips > 0).length
      } active players`
    );

    // Store all dealt cards to verify uniqueness
    const dealtCards = [];

    // Deal two cards to each active player
    for (let i = 0; i < 2; i++) {
      for (const player of game.players) {
        if (player.isActive && player.totalChips > 0) {
          // Draw a card
          let card = cardDeck.drawCard(game.deck);

          // Verify this card hasn't been dealt already (just in case)
          while (
            dealtCards.some((c) => c.suit === card.suit && c.rank === card.rank)
          ) {
            console.error(
              `DUPLICATE CARD DETECTED: ${card.rank} of ${card.suit}, redrawing`
            );
            // Put the card back in a random position and draw again
            const randomIndex = Math.floor(Math.random() * game.deck.length);
            game.deck.splice(randomIndex, 0, card);
            card = cardDeck.drawCard(game.deck);
          }

          // Add card to player's hand and tracking list
          player.hand.push(card);
          dealtCards.push(card);

          console.log(
            `Dealt ${card.rank} of ${card.suit} to player ${player.username}`
          );
        }
      }
    }

    // Set blinds
    const smallBlindPlayer = game.players[game.smallBlindPosition];
    const bigBlindPlayer = game.players[game.bigBlindPosition];

    // Small blind is half the minimum bet, big blind is the minimum bet
    await this.placeBet(
      game,
      smallBlindPlayer.user.toString(),
      game.minBet / 2
    );
    await this.placeBet(game, bigBlindPlayer.user.toString(), game.minBet);

    // Set first player to act (after big blind)
    game.currentTurn = this.getNextActivePlayerAfter(
      game,
      game.bigBlindPosition
    );

    // Update game history
    game.actionHistory.push({
      player: smallBlindPlayer.username,
      action: "smallBlind",
      amount: game.minBet / 2,
      timestamp: Date.now(),
    });

    game.actionHistory.push({
      player: bigBlindPlayer.username,
      action: "bigBlind",
      amount: game.minBet,
      timestamp: Date.now(),
    });

    // Verify no duplicates before saving
    try {
      this.validateGameCards(game);
      console.log("Card validation passed - no duplicates found");
    } catch (err) {
      console.error(`Card validation failed in startNewHand: ${err.message}`);
      // In this case, try to fix by recreating the deck and dealing again
      console.log("Attempting to fix by completely redealing cards");

      // Reset player hands
      game.players.forEach((player) => {
        player.hand = [];
      });

      // Create a new deck
      game.deck = cardDeck.getFreshShuffledDeck();

      // Deal cards again with extra checks
      dealtCards.length = 0; // Clear tracking array

      for (let i = 0; i < 2; i++) {
        for (const player of game.players) {
          if (player.isActive && player.totalChips > 0) {
            // Draw a card with additional validation
            let card = cardDeck.drawCard(game.deck);
            while (
              dealtCards.some(
                (c) => c.suit === card.suit && c.rank === card.rank
              )
            ) {
              console.error(
                `DUPLICATE DETECTED in redealing: ${card.rank} of ${card.suit}`
              );
              // Create a completely new deck as a last resort
              game.deck = cardDeck.getFreshShuffledDeck();
              card = cardDeck.drawCard(game.deck);
            }

            player.hand.push(card);
            dealtCards.push(card);
            console.log(
              `RE-DEALT ${card.rank} of ${card.suit} to player ${player.username}`
            );
          }
        }
      }

      // Verify again
      this.validateGameCards(game);
    }

    // Save the updated game with the skipValidation flag to avoid mongoose validation issues
    game._skipValidation = true;
    await game.save();

    // Log final hands for verification
    console.log("FINAL DEALT HANDS:");
    game.players.forEach((player) => {
      if (player.hand && player.hand.length) {
        console.log(
          `Player ${player.username}:`,
          player.hand.map((c) => `${c.rank} of ${c.suit}`).join(", ")
        );
      }
    });

    return game;
  },

  // Set the small and big blind positions relative to the dealer
  setBlindPositions(game) {
    const activePlayers = game.players.filter(
      (p) => p.isActive && p.totalChips > 0
    );

    if (activePlayers.length <= 1) {
      // Not enough players to play
      throw new Error("Need at least 2 active players");
    }

    // For 2 players, dealer is small blind, other player is big blind
    if (activePlayers.length === 2) {
      game.smallBlindPosition = game.dealerPosition;
      game.bigBlindPosition = this.getNextActivePlayerIndex(
        game,
        game.dealerPosition
      );
      return;
    }

    // For 3+ players, small blind is next to dealer, big blind follows
    game.smallBlindPosition = this.getNextActivePlayerIndex(
      game,
      game.dealerPosition
    );
    game.bigBlindPosition = this.getNextActivePlayerIndex(
      game,
      game.smallBlindPosition
    );
  },

  // Get the next active player index
  getNextActivePlayerIndex(game, currentIndex) {
    let nextIndex = (currentIndex + 1) % game.players.length;

    // Skip players who are not active or have no chips
    while (
      !game.players[nextIndex].isActive ||
      game.players[nextIndex].totalChips <= 0
    ) {
      nextIndex = (nextIndex + 1) % game.players.length;

      // Safety check to avoid infinite loop
      if (nextIndex === currentIndex) {
        throw new Error("No active players with chips found");
      }
    }

    return nextIndex;
  },

  // Get the next active player ID after a position
  getNextActivePlayerAfter(game, currentIndex) {
    const nextIndex = this.getNextActivePlayerIndex(game, currentIndex);
    return game.players[nextIndex].user;
  },

  // Start a betting round
  async startBettingRound(game) {
    // Reset player actions
    game.players.forEach((player) => {
      if (!player.hasFolded && player.isActive && !player.isAllIn) {
        player.hasActed = false;
      }
    });

    // Reset current bet for new round (except preflop where blinds set it)
    if (game.bettingRound !== "preflop") {
      game.currentBet = 0;
    }

    // First to act depends on the round
    // In preflop, action starts after the big blind
    // In other rounds, action starts with first active player after dealer
    let startPos;
    if (game.bettingRound === "preflop") {
      startPos = game.bigBlindPosition;
    } else {
      startPos = game.dealerPosition;
    }

    // Find the next active player who hasn't folded and isn't all-in
    try {
      game.currentTurn = this.getNextPlayerToAct(game, startPos);
    } catch (error) {
      // If no player needs to act, betting round is complete
      console.log("No players need to act, betting round complete");
      return game;
    }

    // Save the updated game
    await game.save();
    return game;
  },

  // Get the next player who needs to act (not folded, not all-in, not already acted)
  getNextPlayerToAct(game, startPos) {
    let currentIndex = startPos;

    for (let i = 0; i < game.players.length; i++) {
      const nextIndex = (currentIndex + 1) % game.players.length;
      const player = game.players[nextIndex];

      if (
        player.isActive &&
        !player.hasFolded &&
        !player.isAllIn &&
        !player.hasActed
      ) {
        return player.user;
      }

      currentIndex = nextIndex;
    }

    throw new Error("No players need to act");
  },

  // Process a player's action
  async processPlayerAction(game, playerId, action, amount = 0) {
    const player = this.getPlayerById(game, playerId);
    const result = {
      success: true,
      roundEnded: false,
      handEnded: false,
      nextPhase: null,
      message: "",
    };

    // Validate that it's this player's turn
    if (game.currentTurn.toString() !== playerId) {
      throw new Error("Not your turn");
    }

    // Validate that it's this player's turn
    if (game.currentTurn.toString() !== playerId) {
      throw new Error("Not your turn");
    }

    // Get valid options for this player
    const validOptions = this.getPlayerOptions(game, playerId);
    console.log(
      `Valid options for ${player.username}: ${validOptions.join(", ")}`
    );

    // Check if the action is valid
    if (!validOptions.includes(action)) {
      throw new Error(
        `Invalid action: ${action}. Valid options are: ${validOptions.join(
          ", "
        )}`
      );
    }

    // Process the action
    switch (action) {
      case "fold":
        player.hasFolded = true;
        player.hasActed = true;

        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: "fold",
          amount: 0,
          timestamp: Date.now(),
        });

        // Check if only one player remains
        const activePlayers = game.players.filter(
          (p) => p.isActive && !p.hasFolded
        );
        if (activePlayers.length === 1) {
          // Hand ends, remaining player wins
          result.handEnded = true;
          result.roundEnded = true;
          result.winners = [activePlayers[0].user.toString()];

          // Award pot to winner
          await this.awardPot(game, [activePlayers[0]]);

          result.message = `${activePlayers[0].username} wins the pot of ${game.pot} chips`;
          return result;
        }
        break;

      case "check":
        // Can only check if current bet is 0 or player has already matched it
        if (game.currentBet > player.chips) {
          throw new Error("Cannot check, must call or fold");
        }
        player.hasActed = true;

        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: "check",
          amount: 0,
          timestamp: Date.now(),
        });
        break;

      case "call":
        // Match the current bet
        const callAmount = game.currentBet - player.chips;
        if (callAmount > 0) {
          if (callAmount >= player.totalChips) {
            // Player is going all-in with a call
            await this.placeAllIn(game, playerId);
          } else {
            await this.placeBet(game, playerId, callAmount);
          }
        }
        player.hasActed = true;

        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: "call",
          amount: callAmount,
          timestamp: Date.now(),
        });
        break;

      case "bet":
        // Place a new bet (when current bet is 0)
        if (game.currentBet > 0) {
          throw new Error("Cannot bet, must raise instead");
        }

        if (amount < game.minBet) {
          throw new Error(`Bet must be at least ${game.minBet} chips`);
        }

        if (amount >= player.totalChips) {
          // Player is going all-in with a bet
          await this.placeAllIn(game, playerId);
        } else {
          await this.placeBet(game, playerId, amount);
        }
        player.hasActed = true;

        // Reset other players' acted status since they need to respond to the bet
        game.players.forEach((p) => {
          if (
            p.user.toString() !== playerId &&
            p.isActive &&
            !p.hasFolded &&
            !p.isAllIn
          ) {
            p.hasActed = false;
          }
        });

        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: "bet",
          amount: amount,
          timestamp: Date.now(),
        });
        break;

      case "raise":
        // Increase the current bet
        if (game.currentBet === 0) {
          throw new Error("Cannot raise, must bet instead");
        }

        // Minimum raise is current bet + previous raise amount (or min bet if first raise)
        const minRaise = game.currentBet * 2;
        if (amount < minRaise) {
          throw new Error(`Raise must be at least ${minRaise} chips`);
        }

        if (amount >= player.totalChips + player.chips) {
          // Player is going all-in with a raise
          await this.placeAllIn(game, playerId);
        } else {
          // Calculate additional amount to add to player's current bet
          const additionalAmount = amount - player.chips;
          await this.placeBet(game, playerId, additionalAmount);
        }
        player.hasActed = true;

        // Reset other players' acted status since they need to respond to the raise
        game.players.forEach((p) => {
          if (
            p.user.toString() !== playerId &&
            p.isActive &&
            !p.hasFolded &&
            !p.isAllIn
          ) {
            p.hasActed = false;
          }
        });

        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: "raise",
          amount: amount,
          timestamp: Date.now(),
        });
        break;

      case "allIn":
        await this.placeAllIn(game, playerId);
        player.hasActed = true;

        // If player's all-in amount is greater than current bet, reset other players' acted status
        if (player.chips > game.currentBet) {
          game.players.forEach((p) => {
            if (
              p.user.toString() !== playerId &&
              p.isActive &&
              !p.hasFolded &&
              !p.isAllIn
            ) {
              p.hasActed = false;
            }
          });
        }

        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: "allIn",
          amount: player.chips,
          timestamp: Date.now(),
        });
        break;

      default:
        throw new Error("Invalid action");
    }

    // Move to next player if hand is still active
    if (!result.handEnded) {
      try {
        game.currentTurn = this.getNextPlayerToAct(
          game,
          game.players.findIndex((p) => p.user.toString() === playerId)
        );
      } catch (error) {
        // If no more players need to act, betting round is complete
        result.roundEnded = true;

        // Determine the next phase based on current betting round
        if (game.bettingRound === "preflop") {
          result.nextPhase = "flop";
        } else if (game.bettingRound === "flop") {
          result.nextPhase = "turn";
        } else if (game.bettingRound === "turn") {
          result.nextPhase = "river";
        } else if (game.bettingRound === "river") {
          result.nextPhase = "showdown";
        }
      }
    }

    await game.save();
    return result;
  },

  /**
   * Place a bet for a player with atomic updates to avoid version conflicts
   * @param {Object} game - Game document
   * @param {string} playerId - Player ID
   * @param {number} amount - Bet amount
   */
  async placeBet(game, playerId, amount) {
    try {
      // Validate before processing
      const player = this.getPlayerById(game, playerId);

      // Check if player has enough chips
      if (player.totalChips < amount) {
        throw new Error("Not enough chips");
      }

      // Use atomic updates instead of saving the whole document
      const mongooseHelpers = require("./mongoose-helpers");
      const Game = require("../models/Game");

      console.log(
        `Placing bet of ${amount} chips for player ${player.username}`
      );

      // Find the player index in the array
      const playerIndex = game.players.findIndex(
        (p) => p.user.toString() === playerId.toString()
      );

      if (playerIndex === -1) {
        throw new Error("Player not found");
      }

      // Create update object for atomic operation - this avoids version conflicts
      const updateQuery = {
        $inc: {
          [`players.${playerIndex}.totalChips`]: -amount,
          [`players.${playerIndex}.chips`]: amount,
          pot: amount,
        },
      };

      // If this bet sets a new current bet, update that too
      const newBet = player.chips + amount;
      if (newBet > game.currentBet) {
        updateQuery.$set = { currentBet: newBet };
      }

      // Perform atomic update
      const updatedGame = await mongooseHelpers.atomicGameUpdate(
        Game,
        game.gameId,
        updateQuery
      );

      if (!updatedGame) {
        throw new Error("Failed to update game");
      }

      // Update the original game object with new values to maintain consistency
      player.totalChips -= amount;
      player.chips += amount;
      game.pot += amount;
      if (newBet > game.currentBet) {
        game.currentBet = newBet;
      }

      return updatedGame;
    } catch (error) {
      console.error(`Error in placeBet: ${error.message}`);
      throw error;
    }
  },

  /**
   * Place an all-in bet using atomic updates
   * @param {Object} game - Game document
   * @param {string} playerId - Player ID
   */
  async placeAllIn(game, playerId) {
    try {
      const player = this.getPlayerById(game, playerId);

      // Get all-in amount
      const allInAmount = player.totalChips;
      if (allInAmount <= 0) {
        throw new Error("No chips left to go all-in");
      }

      // Use atomic updates
      const mongooseHelpers = require("./mongoose-helpers");
      const Game = require("../models/Game");

      console.log(
        `Player ${player.username} going all-in with ${allInAmount} chips`
      );

      // Find the player index in the array
      const playerIndex = game.players.findIndex(
        (p) => p.user.toString() === playerId.toString()
      );

      if (playerIndex === -1) {
        throw new Error("Player not found");
      }

      // Create update object for atomic operation
      const updateQuery = {
        $inc: {
          [`players.${playerIndex}.chips`]: allInAmount,
          pot: allInAmount,
        },
        $set: {
          [`players.${playerIndex}.totalChips`]: 0,
          [`players.${playerIndex}.isAllIn`]: true,
        },
      };

      // If this all-in sets a new current bet, update that too
      const newBet = player.chips + allInAmount;
      if (newBet > game.currentBet) {
        updateQuery.$set.currentBet = newBet;
      }

      // Perform atomic update
      const updatedGame = await mongooseHelpers.atomicGameUpdate(
        Game,
        game.gameId,
        updateQuery
      );

      if (!updatedGame) {
        throw new Error("Failed to update game");
      }

      // Update the original game object
      player.totalChips = 0;
      player.chips += allInAmount;
      player.isAllIn = true;
      game.pot += allInAmount;
      if (newBet > game.currentBet) {
        game.currentBet = newBet;
      }

      return updatedGame;
    } catch (error) {
      console.error(`Error in placeAllIn: ${error.message}`);
      throw error;
    }
  },

  /**
   * Award the pot to winner(s) with improved database updates
   * @param {Object} game - Game document
   * @param {Array} winners - Array of winning player objects
   */
  async awardPot(game, winners) {
    if (!winners || winners.length === 0) {
      throw new Error("No winners provided");
    }

    // Split the pot evenly among winners
    const splitAmount = Math.floor(game.pot / winners.length);
    const remainder = game.pot % winners.length;

    // Keep track of user balances to update in the database
    const userUpdates = [];

    console.log(
      `Awarding pot of ${game.pot} chips to ${winners.length} winner(s)`
    );

    // Award chips to winners
    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      let winAmount = splitAmount;

      // Add remainder to first winner (if any)
      if (i === 0) {
        winAmount += remainder;
      }

      // Update player's chips in the game
      winner.totalChips += winAmount;

      // Add to list of user balances to update
      userUpdates.push({
        userId: winner.user.toString(),
        newBalance: winner.totalChips,
        username: winner.username,
        winAmount: winAmount,
      });

      console.log(
        `Winner ${winner.username} receives ${winAmount} chips, new total: ${winner.totalChips}`
      );
    }

    // Get the user model
    const User = require("../models/User");

    // Update all user balances in the database
    // This ensures the correct balances are stored in the database
    try {
      // For each player in the game, update their balance to match their totalChips
      for (const player of game.players) {
        const userId = player.user.toString();

        try {
          // Find the player in the user database
          const user = await User.findById(userId);
          if (!user) {
            console.error(`Could not find user ${userId} in database`);
            continue;
          }

          // Update the user's balance to match their totalChips
          user.balance = player.totalChips;

          // If this is a winner, also increment their gamesWon counter
          if (winners.some((w) => w.user.toString() === userId)) {
            user.gamesWon += 1;
          }

          // Save the updated user
          await user.save();

          console.log(
            `Updated user ${player.username} balance to ${player.totalChips}`
          );
        } catch (userError) {
          console.error(`Error updating user ${player.username}:`, userError);
        }
      }
    } catch (error) {
      console.error("Error updating user balances:", error);
    }

    // Reset pot
    game.pot = 0;

    // Return the updated winners for chaining
    return winners;
  },

  // Update user balance in database
  async updateUserBalance(userId, newBalance) {
    try {
      await User.findByIdAndUpdate(userId, { balance: newBalance });
    } catch (error) {
      console.error("Error updating user balance:", error);
    }
  },

  // Update games won count
  async updateGamesWon(userId) {
    try {
      const user = await User.findById(userId);
      user.gamesWon += 1;
      await user.save();
    } catch (error) {
      console.error("Error updating games won:", error);
    }
  },

  // Deal the flop (first three community cards)
  async dealFlop(game) {
    try {
      // Use our mongoose helpers for atomic updates
      const mongooseHelpers = require("./mongoose-helpers");
      const Game = require("../models/Game");

      // Get a fresh copy of the game to avoid version conflicts
      return await mongooseHelpers.withFreshGame(
        game.gameId,
        async (freshGame) => {
          // Update betting round
          freshGame.bettingRound = "flop";

          // Burn a card
          cardDeck.drawCard(freshGame.deck);

          // Deal three unique cards
          for (let i = 0; i < 3; i++) {
            const card = cardDeck.drawCard(freshGame.deck);
            freshGame.communityCards.push(card);
          }

          // Add to game history
          freshGame.actionHistory.push({
            player: "Dealer",
            action: "dealFlop",
            timestamp: Date.now(),
          });

          // Save the updated game - don't use the original game
          await freshGame.save();

          // Return the updated game
          return freshGame;
        }
      );
    } catch (error) {
      console.error(`Error in dealFlop: ${error.message}`);

      // Fallback to atomic update if with fresh game fails
      const mongooseHelpers = require("./mongoose-helpers");
      const Game = require("../models/Game");

      // Create a new deck to ensure we have enough cards
      const freshDeck = cardDeck.createDeck();

      // Burn one card
      const burnCard = freshDeck.pop();

      // Get three new cards
      const flopCards = [freshDeck.pop(), freshDeck.pop(), freshDeck.pop()];

      // Perform atomic update
      return await mongooseHelpers.atomicGameUpdate(Game, game.gameId, {
        $set: {
          bettingRound: "flop",
          deck: freshDeck,
          communityCards: flopCards,
        },
        $push: {
          actionHistory: {
            player: "Dealer",
            action: "dealFlop",
            timestamp: Date.now(),
          },
        },
      });
    }
  },

  // Deal the turn (fourth community card)
  async dealTurn(game) {
    try {
      // Use our mongoose helpers for atomic updates
      const mongooseHelpers = require("./mongoose-helpers");
      const Game = require("../models/Game");

      // Get a fresh copy of the game to avoid version conflicts
      return await mongooseHelpers.withFreshGame(
        game.gameId,
        async (freshGame) => {
          // Update betting round
          freshGame.bettingRound = "turn";

          // Burn a card
          cardDeck.drawCard(freshGame.deck);

          // Deal one unique card
          const card = cardDeck.drawCard(freshGame.deck);
          freshGame.communityCards.push(card);

          // Add to game history
          freshGame.actionHistory.push({
            player: "Dealer",
            action: "dealTurn",
            timestamp: Date.now(),
          });

          // Save the updated game - don't use the original game
          await freshGame.save();

          // Return the updated game
          return freshGame;
        }
      );
    } catch (error) {
      console.error(`Error in dealTurn: ${error.message}`);

      // Fallback to atomic update if with fresh game fails
      const mongooseHelpers = require("./mongoose-helpers");
      const Game = require("../models/Game");

      // Get current community cards
      const existingCards = game.communityCards || [];

      // Create a new card for the turn
      const turnCard = cardDeck.getFreshShuffledDeck()[0]; // get a random card

      // Perform atomic update
      return await mongooseHelpers.atomicGameUpdate(Game, game.gameId, {
        $set: {
          bettingRound: "turn",
        },
        $push: {
          communityCards: turnCard,
          actionHistory: {
            player: "Dealer",
            action: "dealTurn",
            timestamp: Date.now(),
          },
        },
      });
    }
  },

  // Deal the river (fifth community card)
  async dealRiver(game) {
    try {
      // Use our mongoose helpers for atomic updates
      const mongooseHelpers = require("./mongoose-helpers");
      const Game = require("../models/Game");

      // Get a fresh copy of the game to avoid version conflicts
      return await mongooseHelpers.withFreshGame(
        game.gameId,
        async (freshGame) => {
          // Update betting round
          freshGame.bettingRound = "river";

          // Burn a card
          cardDeck.drawCard(freshGame.deck);

          // Deal one unique card
          const card = cardDeck.drawCard(freshGame.deck);
          freshGame.communityCards.push(card);

          // Add to game history
          freshGame.actionHistory.push({
            player: "Dealer",
            action: "dealRiver",
            timestamp: Date.now(),
          });

          // Save the updated game - don't use the original game
          await freshGame.save();

          // Return the updated game
          return freshGame;
        }
      );
    } catch (error) {
      console.error(`Error in dealRiver: ${error.message}`);

      // Fallback to atomic update if with fresh game fails
      const mongooseHelpers = require("./mongoose-helpers");
      const Game = require("../models/Game");

      // Get current community cards
      const existingCards = game.communityCards || [];

      // Create a new card for the river
      const riverCard = cardDeck.getFreshShuffledDeck()[0]; // get a random card

      // Perform atomic update
      return await mongooseHelpers.atomicGameUpdate(Game, game.gameId, {
        $set: {
          bettingRound: "river",
        },
        $push: {
          communityCards: riverCard,
          actionHistory: {
            player: "Dealer",
            action: "dealRiver",
            timestamp: Date.now(),
          },
        },
      });
    }
  },

  /**
   * Process the showdown (compare hands) with enhanced balance updates
   * @param {Object} game - Game document
   * @returns {Object} Showdown results
   */
  async processShowdown(game) {
    try {
      // Get players who haven't folded
      const activePlayers = game.players.filter(
        (p) => p.isActive && !p.hasFolded
      );

      // Prepare hands for evaluation
      const playerHands = activePlayers.map((player) => ({
        playerId: player.user.toString(),
        username: player.username,
        holeCards: player.hand,
        communityCards: game.communityCards,
      }));

      // Determine winner(s)
      const result = handEvaluator.determineWinners(playerHands);

      // Store hand results in game history
      game.handResults.push({
        winners: result.winners.map((w) => w.playerId),
        pot: game.pot,
        hands: result.allHands.map((h) => ({
          player: h.username,
          cards: h.hand,
          handName: h.handName,
        })),
        communityCards: game.communityCards,
        timestamp: Date.now(),
      });

      // Award pot to winner(s) - this handles database updates too
      const winnerPlayers = result.winners.map((w) =>
        this.getPlayerById(game, w.playerId)
      );

      await this.awardPot(game, winnerPlayers);

      // Also update all other players' balances to the database
      for (const player of game.players) {
        // Skip winners as they've already been updated
        if (
          winnerPlayers.some(
            (w) => w.user.toString() === player.user.toString()
          )
        ) {
          continue;
        }

        try {
          // Update the loser's balance in the database
          await User.findByIdAndUpdate(
            player.user,
            { $set: { balance: player.totalChips } },
            { new: true }
          );

          console.log(
            `Updated database balance for loser ${player.username} to ${player.totalChips}`
          );
        } catch (error) {
          console.error(
            `Error updating balance for player ${player.username}:`,
            error
          );
        }
      }

      return {
        winners: result.winners.map((w) => ({
          playerId: w.playerId,
          username: w.username,
          handName: w.handName,
        })),
        hands: result.allHands.map((h) => ({
          playerId: h.playerId,
          username: h.username,
          handName: h.handName,
        })),
      };
    } catch (error) {
      console.error("Error in processShowdown:", error);
      throw error;
    }
  },

  // Check if betting round is complete
  isBettingRoundComplete(game) {
    // All active players should have either folded, gone all-in, or acted
    // And all players who have acted should have the same amount in the pot
    const activePlayers = game.players.filter(
      (p) => p.isActive && !p.hasFolded && !p.isAllIn
    );

    // If no active players (all folded or all-in), round is complete
    if (activePlayers.length === 0) {
      return true;
    }

    // Check if all active players have acted
    const allActed = activePlayers.every((p) => p.hasActed);
    if (!allActed) {
      return false;
    }

    // All players have acted, now check if they've all matched the bet
    return activePlayers.every((p) => p.chips === game.currentBet);
  },

  /**
   * Prepare the game for the next hand - Fix for Mongoose versioning error and card shuffling
   * @param {Object} game - Game document
   * @returns {Promise<Object>} Updated game
   */
  async prepareNextHand(game) {
    try {
      console.log(`Preparing next hand for game ${game.gameId}`);

      // Reset necessary game state
      game.bettingRound = "preflop";
      game.pot = 0;
      game.currentBet = 0;
      game.communityCards = [];

      // IMPORTANT FIX: Create a completely new shuffled deck for the next hand
      const cardDeck = require("./cardDeck");
      game.deck = cardDeck.createDeck(); // This creates a fresh, shuffled deck

      // Reset player states but keep their total chips
      game.players.forEach((player) => {
        player.hand = [];
        player.chips = 0;
        player.hasFolded = false;
        player.hasActed = false;
        player.isAllIn = false;
      });

      // Check which players have zero chips
      const playersToRemove = [];
      game.players = game.players.filter((player, index) => {
        if (player.totalChips <= 0) {
          player.isActive = false;
          playersToRemove.push(index);
          return false;
        }
        return true;
      });

      // Check if there are enough players to continue
      if (game.players.filter((p) => p.isActive).length < 2) {
        game.status = "completed";
        game.actionHistory.push({
          player: "System",
          action: "gameCompleted",
          timestamp: Date.now(),
        });
      } else {
        // Continue with next hand
        game.actionHistory.push({
          player: "System",
          action: "nextHand",
          timestamp: Date.now(),
        });
      }

      // Instead of using save directly, use findOneAndUpdate to avoid version conflicts
      try {
        const mongooseHelpers = require("./mongoose-helpers");
        const Game = require("../models/Game");

        // Use our helper function
        const updatedGame = await mongooseHelpers.updateWithRetry(
          Game,
          { gameId: game.gameId },
          {
            $set: {
              bettingRound: game.bettingRound,
              pot: game.pot,
              currentBet: game.currentBet,
              communityCards: game.communityCards,
              players: game.players,
              status: game.status,
              actionHistory: game.actionHistory,
              deck: game.deck,
            },
          },
          {
            new: true,
            runValidators: false,
            maxAttempts: 5,
            verbose: true,
          }
        );

        console.log(
          `Game ${updatedGame.gameId} prepared for next hand with new deck containing ${updatedGame.deck.length} cards`
        );
        return updatedGame;
      } catch (updateError) {
        console.error(
          `Error updating game for next hand: ${updateError.message}`
        );

        // Use Model.findOne().then() pattern as a last resort
        return Game.findOne({ gameId: game.gameId }).then((freshGame) => {
          if (!freshGame) {
            throw new Error(`Game ${game.gameId} not found`);
          }

          // Apply our changes to the fresh document
          freshGame.bettingRound = "preflop";
          freshGame.pot = 0;
          freshGame.currentBet = 0;
          freshGame.communityCards = [];

          // Create a completely new deck
          freshGame.deck = cardDeck.getFreshShuffledDeck();

          // Reset player states
          freshGame.players.forEach((player) => {
            player.hand = [];
            player.chips = 0;
            player.hasFolded = false;
            player.hasActed = false;
            player.isAllIn = false;
          });

          // Set game status
          if (freshGame.players.filter((p) => p.isActive).length < 2) {
            freshGame.status = "completed";
          }

          // Skip validation for this operation
          freshGame._skipValidation = true;

          // Save with retry logic
          return freshGame.save().then(() => freshGame);
        });
      }
    } catch (error) {
      console.error(`Critical error in prepareNextHand: ${error.message}`);
      // As a last resort, create a new Game object
      const Game = require("../models/Game");
      const freshGame = await Game.findOne({ gameId: game.gameId });

      if (!freshGame) {
        throw new Error(`Game ${game.gameId} not found during error recovery`);
      }

      console.log(`Using complete refresh approach for game ${game.gameId}`);
      return freshGame;
    }
  },

  // Get player by ID
  getPlayerById(game, playerId) {
    if (!game || !game.players || !Array.isArray(game.players)) {
      throw new Error("Invalid game object");
    }

    if (!playerId) {
      throw new Error("Player ID is required");
    }

    // Convert to string for comparison
    const playerIdStr = playerId.toString();

    // Find the player with safer comparison
    const player = game.players.find((p) => {
      // Handle various formats of the user ID
      if (!p || !p.user) return false;

      if (typeof p.user === "string") {
        return p.user === playerIdStr;
      }

      if (typeof p.user === "object" && p.user.$oid) {
        return p.user.$oid === playerIdStr;
      }

      return p.user.toString() === playerIdStr;
    });

    if (!player) {
      // Add more diagnostic information to help debug
      console.error(
        `Player not found. PlayerId: ${playerId}, Game ID: ${game.gameId}`
      );
      console.error(
        `Available players: ${game.players
          .map((p) => p.user?.toString())
          .join(", ")}`
      );

      throw new Error("Player not found");
    }

    return player;
  },

  // Get available options for a player
  getPlayerOptions(game, playerId) {
    try {
      const player = this.getPlayerById(game, playerId);
      const options = [];
  
      // Player can't act if they've folded or are all-in
      if (player.hasFolded || player.isAllIn) {
        return options;
      }
  
      // Always can fold
      options.push("fold");
  
      // Check if player can check or call
      const playerInPot = player.chips || 0;
      const currentBet = game.currentBet || 0;
  
      // Player can check if there's no current bet or they've already matched it exactly
      if (currentBet === 0 || playerInPot === currentBet) {
        options.push("check");
      } else {
        // Player needs to call if there's a bet they haven't matched
        // This was the missing part in the original code
        options.push("call");
      }
  
      // Bet option - only if no current bet exists
      if (currentBet === 0 && player.totalChips > 0) {
        options.push("bet");
      }
  
      // Raise option - if there's a current bet and player has enough chips to raise
      if (currentBet > 0 && player.totalChips + playerInPot > currentBet) {
        options.push("raise");
      }
  
      // All-in option is always available if player has chips
      if (player.totalChips > 0) {
        options.push("allIn");
      }
  
      // Log the calculated options
      console.log(`Calculated options for ${player.username}: ${options.join(", ")}`);
      
      return options;
    } catch (error) {
      console.error(`Error determining player options: ${error.message}`);
      // Return minimal safe options on error
      return ["fold"];
    }
  },

  /**
   * Deduplicate players in game state before sending to clients
   * @param {Object} sanitizedGame - The sanitized game state
   * @returns {Object} - Deduplicated game state
   */
  deduplicatePlayers(sanitizedGame) {
    if (
      !sanitizedGame ||
      !sanitizedGame.players ||
      !Array.isArray(sanitizedGame.players)
    ) {
      return sanitizedGame;
    }

    // Track seen player IDs
    const seenPlayers = new Set();
    const uniquePlayers = [];

    // Only keep the first occurrence of each player
    for (const player of sanitizedGame.players) {
      if (!player || !player.id) continue;

      const playerId = player.id.toString();

      if (!seenPlayers.has(playerId)) {
        seenPlayers.add(playerId);
        uniquePlayers.push(player);
      } else {
        console.log(
          `Found duplicate player in game state: ${player.username} (${playerId})`
        );
      }
    }

    // If we found duplicates, update the game state
    if (uniquePlayers.length < sanitizedGame.players.length) {
      console.log(
        `Deduplicated players: ${sanitizedGame.players.length} -> ${uniquePlayers.length}`
      );

      // Create a new sanitized game with unique players
      return {
        ...sanitizedGame,
        players: uniquePlayers,
      };
    }

    // No duplicates found
    return sanitizedGame;
  },

  // Get sanitized game state (for sending to clients)
  getSanitizedGameState(game) {
    if (!game) {
      console.warn('Attempted to sanitize null or undefined game');
      return {
        status: 'error',
        message: 'Game not found',
        players: [],
        communityCards: []
      };
    }
    
    try {
      // First ensure all player IDs are properly formatted as strings
      const sanitizedPlayers = (game.players || []).map((player) => {
        // Skip invalid players
        if (!player || !player.user) return null;
    
        // Extract the player ID based on its type
        let playerId;
        if (typeof player.user === 'string') {
          playerId = player.user;
        } else if (typeof player.user === 'object' && player.user.$oid) {
          playerId = player.user.$oid;
        } else if (typeof player.user.toString === 'function') {
          playerId = player.user.toString();
        } else {
          playerId = String(player.user);
        }
    
        return {
          id: playerId,
          username: player.username || 'Unknown Player',
          chips: player.chips || 0,
          totalChips: player.totalChips || 0,
          hasCards: player.hand && player.hand.length > 0,
          hasFolded: !!player.hasFolded,
          hasActed: !!player.hasActed,
          isAllIn: !!player.isAllIn,
          isActive: !!player.isActive,
          position: player.position || 0,
        };
      })
      .filter(player => player !== null); // Remove any invalid players
      
      // Create a separate allPlayers array that includes all players
      const allPlayers = sanitizedPlayers.map(player => ({
        id: player.id,
        username: player.username,
        isActive: player.isActive,
        position: player.position || 0,
        hasCards: player.hasCards
      }));
      
      // Format the current turn ID consistently
      let currentTurnId = null;
      if (game.currentTurn) {
        if (typeof game.currentTurn === 'string') {
          currentTurnId = game.currentTurn;
        } else if (typeof game.currentTurn === 'object' && game.currentTurn.$oid) {
          currentTurnId = game.currentTurn.$oid;
        } else if (typeof game.currentTurn.toString === 'function') {
          currentTurnId = game.currentTurn.toString();
        } else {
          currentTurnId = String(game.currentTurn);
        }
      }
    
      // Format creator info
      let creator = null;
      if (game.creator && game.creator.user) {
        const creatorId = typeof game.creator.user === 'string' 
          ? game.creator.user 
          : (game.creator.user.$oid || game.creator.user.toString());
        
        creator = {
          user: creatorId,
          username: game.creator.username || 'Unknown Creator'
        };
      }
    
      // Create and return the sanitized game state
      return {
        id: game.gameId,
        status: game.status || 'waiting',
        pot: game.pot || 0,
        communityCards: game.communityCards || [],
        currentTurn: currentTurnId,
        currentBet: game.currentBet || 0,
        dealerPosition: game.dealerPosition || 0,
        smallBlindPosition: game.smallBlindPosition || 0,
        bigBlindPosition: game.bigBlindPosition || 1,
        bettingRound: game.bettingRound || 'preflop',
        creator: creator,
        players: sanitizedPlayers,
        // Always include allPlayers in the state to ensure all clients know about all players
        allPlayers: allPlayers, 
        actionHistory: (game.actionHistory || []).slice(-10), // Last 10 actions
        lastUpdated: new Date().toISOString() // Add a timestamp to help with debugging
      };
    } catch (error) {
      console.error('Error sanitizing game state:', error);
      // Return minimal valid state in case of error
      return {
        id: game.gameId || 'unknown',
        status: game.status || 'error',
        message: 'Error processing game state',
        players: [],
        communityCards: []
      };
    }
  },

  // Process a full hand from start to finish
  async processFullHand(game) {
    // 1. Start new hand (already dealt cards and set blinds)
    await this.startNewHand(game);

    // Keep track of remaining players
    let activePlayers = game.players.filter((p) => p.isActive && !p.hasFolded);

    // If only one player remains active after blinds, they win automatically
    if (activePlayers.length === 1) {
      await this.awardPot(game, activePlayers);
      return this.prepareNextHand(game);
    }

    // 2. Pre-flop betting round
    await this.startBettingRound(game);

    // Continue through betting rounds until showdown or winner determined
    let currentRound = "preflop";
    const rounds = ["preflop", "flop", "turn", "river", "showdown"];

    // Proceed through rounds until showdown or only one player remains
    for (let i = 0; i < rounds.length; i++) {
      currentRound = rounds[i];

      // Skip betting if only one player remains
      activePlayers = game.players.filter((p) => p.isActive && !p.hasFolded);
      if (activePlayers.length === 1) {
        await this.awardPot(game, activePlayers);
        return this.prepareNextHand(game);
      }

      // Skip to showdown if all players are all-in
      const notAllInPlayers = activePlayers.filter((p) => !p.isAllIn);
      if (notAllInPlayers.length === 0 && currentRound !== "showdown") {
        // Deal remaining community cards and proceed to showdown
        if (game.communityCards.length === 0) {
          await this.dealFlop(game);
          await this.dealTurn(game);
          await this.dealRiver(game);
        } else if (game.communityCards.length === 3) {
          await this.dealTurn(game);
          await this.dealRiver(game);
        } else if (game.communityCards.length === 4) {
          await this.dealRiver(game);
        }

        // Process showdown
        await this.processShowdown(game);
        return this.prepareNextHand(game);
      }

      // Process the current round
      if (currentRound === "flop") {
        await this.dealFlop(game);
        await this.startBettingRound(game);
      } else if (currentRound === "turn") {
        await this.dealTurn(game);
        await this.startBettingRound(game);
      } else if (currentRound === "river") {
        await this.dealRiver(game);
        await this.startBettingRound(game);
      } else if (currentRound === "showdown") {
        await this.processShowdown(game);
        return this.prepareNextHand(game);
      }
    }

    // Should never reach here, but just in case
    return game;
  },

  // Add a new validation function to check for duplicates in the deck
  validateGameCards(game) {
    // Gather all cards in play
    const allCards = [...game.communityCards];

    // Add player cards
    game.players.forEach((player) => {
      if (player.hand && player.hand.length) {
        allCards.push(...player.hand);
      }
    });

    // Check for duplicates
    const duplicates = cardDeck.checkForDuplicates(allCards);

    if (duplicates.length > 0) {
      console.error(`DUPLICATE CARDS DETECTED: ${duplicates.join(", ")}`);
      throw new Error(
        `Duplicate cards detected in the game: ${duplicates.join(", ")}`
      );
    }

    return true;
  },

  /**
   * Force a completely new deck for a game
   * This helps solve issues with Mongoose serialization and reference problems
   * @param {Object} game - The game document
   * @returns {Array} The new deck
   */
};

module.exports = gameLogic;
