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
    // Reset game state for new hand
    game.pot = 0;
    game.communityCards = [];

    // CRITICAL: Make sure all player chips committed to pot are reset
    game.players.forEach((player) => {
      player.chips = 0;
      // Other resets remain the same...
    });

    // CRITICAL FIX: Always create a completely new, properly shuffled deck
    const cardDeck = require("./cardDeck");

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

    //Clear game.players[].hand before dealing
    game.players.forEach((player) => {
      player.hand = []; // Ensure we start with an empty hand
    });

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

    // IMPORTANT: Log the final deal to verify
    console.log("FINAL DEALT HANDS:");
    game.players.forEach((player) => {
      if (player.hand && player.hand.length) {
        console.log(
          `Player ${player.username}: ${player.hand
            .map((c) => `${c.rank} of ${c.suit}`)
            .join(", ")}`
        );
      }
    });

    // Save the updated game with the skipValidation flag to avoid mongoose validation issues
    game._skipValidation = true;
    await game.save();

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

  // Process a player's action with improved pot handling
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

    // Log the action for debugging
    console.log(
      `Processing player action: ${player.username} ${action} ${amount}`
    );
    console.log(`Current pot: ${game.pot}, currentBet: ${game.currentBet}`);
    console.log(
      `Player has ${player.totalChips} total chips and ${player.chips} in pot`
    );

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

          // Make sure pot is correct before awarding
          const totalChipsInPot = game.players.reduce(
            (sum, p) => sum + p.chips,
            0
          );
          if (game.pot !== totalChipsInPot) {
            console.log(
              `Correcting pot from ${game.pot} to ${totalChipsInPot} based on player chips`
            );
            game.pot = totalChipsInPot;
          }

          // IMPORTANT FIX: Store the pot value before it's reset by awardPot
          result.potAmount = game.pot;
          console.log(
            `Storing pot amount ${result.potAmount} in result for handResult event`
          );

          // Award pot to winner
          await this.awardPot(game, [activePlayers[0]]);

          // Set game status to 'waiting' after fold win
          game.status = "waiting";

          result.message = `${activePlayers[0].username} wins the pot of ${result.potAmount} chips`;
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

        // BUGFIX: Check if the player has enough chips to call
        if (callAmount > player.totalChips) {
          console.log(
            `Player ${player.username} doesn't have enough chips to call, converting to all-in`
          );
          // Player doesn't have enough chips to call, convert this to an all-in
          await gameLogic.placeAllIn(game, playerId);
        } else {
          // Player has enough chips to call
          await gameLogic.placeBet(game, playerId, callAmount);
        }

        player.hasActed = true;

        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: callAmount > player.totalChips ? "allIn" : "call",
          amount:
            callAmount > player.totalChips ? player.totalChips : callAmount,
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

        // Calculate the minimum raise amount properly
        const callProvidedAmount = Math.max(0, game.currentBet - player.chips);
        const minRaiseAmount = game.currentBet + Math.max(game.minBet, 1); // Min raise is at least current bet + min bet
        const totalMinAmount =
          callProvidedAmount + (minRaiseAmount - game.currentBet);

        if (amount < minRaiseAmount) {
          throw new Error(
            `Raise must be at least ${minRaiseAmount} chips (${totalMinAmount} more chips)`
          );
        }

        // Check if player has enough chips for the raise
        const totalNeeded = amount - player.chips;

        if (totalNeeded >= player.totalChips) {
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
        // Get the player's actual maximum chips
        const maxPlayerChips = player.totalChips;

        // Limit the amount to what the player actually has
        if (amount > maxPlayerChips) {
          console.log(
            `Limiting all-in amount from ${amount} to ${maxPlayerChips} for player ${player.username}`
          );
          amount = maxPlayerChips;
        }

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
          amount: player.chips, // Use the actual amount in the pot
          timestamp: Date.now(),
        });
        break;

      default:
        throw new Error("Invalid action");
    }

    // Move to next player if hand is still active
    if (!result.handEnded) {
      // Check if all remaining active players are all-in
      const activePlayers = game.players.filter(
        (p) => p.isActive && !p.hasFolded
      );
      const allInPlayers = activePlayers.filter((p) => p.isAllIn);

      // If all active players are all-in, deal remaining cards and go to showdown
      if (
        activePlayers.length > 1 &&
        allInPlayers.length === activePlayers.length
      ) {
        console.log(
          "All remaining players are all-in, proceeding directly to showdown"
        );
        result.handEnded = false;
        result.roundEnded = true;
        result.nextPhase = "showdown";

        // Deal any missing community cards
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
      } else {
        // Not all players are all-in, proceed with normal turn sequence
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
    }

    // Log the state after the action
    console.log(`After action: pot=${game.pot}, currentBet=${game.currentBet}`);
    game.players.forEach((p) => {
      console.log(
        `Player ${p.username}: totalChips=${p.totalChips}, chipsInPot=${p.chips}`
      );
    });

    await game.save();
    return result;
  },

  // Place a bet for a player
  async placeBet(game, playerId, amount) {
    const player = this.getPlayerById(game, playerId);

    // Validate amount is a positive number
    if (typeof amount !== "number" || amount <= 0) {
      console.error(`Invalid bet amount: ${amount}`);
      throw new Error("Bet amount must be a positive number");
    }

    // Check if player has enough chips
    if (player.totalChips < amount) {
      console.error(
        `Player ${player.username} doesn't have enough chips: has ${player.totalChips}, trying to bet ${amount}`
      );
      throw new Error("Not enough chips");
    }

    // Log before state
    console.log(
      `Before bet: Player ${player.username} has ${player.totalChips} total chips and ${player.chips} in pot`
    );
    console.log(`Placing bet of ${amount} chips`);

    // Update player chips
    player.totalChips -= amount;
    player.chips += amount;

    // Update pot and current bet
    game.pot += amount;
    game.currentBet = Math.max(game.currentBet, player.chips);

    // Log after state
    console.log(
      `After bet: Player ${player.username} has ${player.totalChips} total chips and ${player.chips} in pot`
    );
    console.log(`Game pot is now ${game.pot}`);

    await game.save();
    return true;
  },

  /**
   * Place an all-in bet with improved side pot tracking
   * @param {Object} game - Game document
   * @param {String} playerId - Player ID
   * @returns {Boolean} Success status
   */
  async placeAllIn(game, playerId) {
    const player = this.getPlayerById(game, playerId);

    // Put all remaining chips in the pot
    const allInAmount = player.totalChips;
    if (allInAmount <= 0) {
      throw new Error("No chips left to go all-in");
    }

    // Log before state
    console.log(
      `Before all-in: Player ${player.username} has ${player.totalChips} total chips and ${player.chips} in pot`
    );
    console.log(`Going all-in with ${allInAmount} chips`);

    // Update player chips
    player.totalChips = 0;
    player.chips += allInAmount; // Add to current chips in pot
    player.isAllIn = true;

    // Update pot
    game.pot += allInAmount;

    // Update current bet only if this all-in raises the current bet
    if (player.chips > game.currentBet) {
      game.currentBet = player.chips;
    }

    // Log after state
    console.log(
      `After all-in: Player ${player.username} has 0 total chips and ${player.chips} in pot`
    );
    console.log(`Game pot is now ${game.pot}`);

    // Save the game
    await game.save();
    return true;
  },

  /**
   * Award the pot to winner(s) with improved side pot handling
   * @param {Object} game - Game document
   * @param {Array} winners - Array of winning player objects
   */
  async awardPot(game, winners) {
    if (!winners || winners.length === 0) {
      throw new Error("No winners provided");
    }

    // Make sure there's a valid pot
    if (game.pot <= 0) {
      console.warn("Zero or negative pot detected, checking player chips");
      // Recalculate the pot based on player chips
      const calculatedPot = game.players.reduce((sum, p) => sum + p.chips, 0);
      if (calculatedPot > 0) {
        console.log(
          `Corrected pot value to ${calculatedPot} based on player chips`
        );
        game.pot = calculatedPot;
      } else {
        console.log(
          `No chips in pot, this might be normal for the current game state`
        );
        game.pot = 0;
      }
    }

    // Store the original pot amount for logging
    const originalPot = game.pot;
    console.log(`Original pot for award: ${originalPot}`);

    // Get all active players and their contributions
    const activePlayers = game.players.filter((p) => p.isActive);
    console.log(
      `Active players: ${activePlayers
        .map((p) => `${p.username}:${p.chips}`)
        .join(", ")}`
    );

    // If we have an all-in situation, we need to handle side pots
    if (activePlayers.some((p) => p.isAllIn)) {
      console.log("All-in players detected, processing side pots correctly");

      // 1. Get all players who contributed to the pot (including folded players)
      const contributingPlayers = game.players.filter((p) => p.chips > 0);

      // 2. Sort by the amount contributed (from lowest to highest)
      contributingPlayers.sort((a, b) => a.chips - b.chips);
      console.log(
        `Sorted contributing players: ${contributingPlayers
          .map((p) => `${p.username}:${p.chips}`)
          .join(", ")}`
      );

      // 3. Calculate side pots properly
      const sidePots = [];
      let previousAmount = 0;

      for (let i = 0; i < contributingPlayers.length; i++) {
        const player = contributingPlayers[i];
        if (player.chips > previousAmount) {
          // Create a new side pot level
          const contribution = player.chips - previousAmount;

          // Find all players who contributed at least this much
          const eligiblePlayerIds = contributingPlayers
            .filter((p) => p.chips >= player.chips)
            .map((p) => p.user.toString());

          // Count how many players contributed to this level
          const contributorCount = contributingPlayers.length - i;

          // Calculate the total at this level = (current player's contribution) * (number of players who contributed at least this much)
          const totalAtThisLevel = contribution * contributorCount;

          sidePots.push({
            amount: contribution,
            total: totalAtThisLevel,
            eligiblePlayerIds: eligiblePlayerIds,
          });

          previousAmount = player.chips;
        }
      }

      console.log(`Created ${sidePots.length} side pots:`);
      sidePots.forEach((pot, i) => {
        console.log(
          `Side pot ${i + 1}: ${pot.total} chips, ${
            pot.eligiblePlayerIds.length
          } eligible players`
        );
      });

      // 4. Award each side pot to eligible winners
      let totalAwarded = 0;

      for (const sidePot of sidePots) {
        // Find winners eligible for this side pot
        const eligibleWinners = winners.filter((winner) =>
          sidePot.eligiblePlayerIds.includes(winner.user.toString())
        );

        if (eligibleWinners.length > 0) {
          // Split this side pot evenly among eligible winners
          const amountPerWinner = Math.floor(
            sidePot.total / eligibleWinners.length
          );
          const remainder = sidePot.total % eligibleWinners.length;

          console.log(
            `Side pot of ${sidePot.total} chips split among ${eligibleWinners.length} eligible winners`
          );

          // Award chips to each eligible winner
          for (let i = 0; i < eligibleWinners.length; i++) {
            const winner = eligibleWinners[i];
            let amount = amountPerWinner;

            // Add remainder to first winner
            if (i === 0) {
              amount += remainder;
            }

            winner.totalChips += amount;
            totalAwarded += amount;

            console.log(
              `Winner ${winner.username} awarded ${amount} chips from side pot, new total: ${winner.totalChips}`
            );

            // Update user balance in database
            try {
              await User.findByIdAndUpdate(winner.user, {
                balance: winner.totalChips,
              });
            } catch (error) {
              console.error(
                `Error updating balance for ${winner.username}:`,
                error
              );
            }
          }
        } else {
          // This is a special case where no eligible winners for this side pot
          // This can happen if all eligible players fold - return chips to players proportionally
          console.log(
            `No eligible winners for side pot of ${sidePot.total} chips`
          );

          // Find players who contributed to this level
          const contributors = contributingPlayers.filter((p) =>
            sidePot.eligiblePlayerIds.includes(p.user.toString())
          );

          if (contributors.length > 0) {
            const refundPerPlayer = Math.floor(
              sidePot.total / contributors.length
            );
            const refundRemainder = sidePot.total % contributors.length;

            for (let i = 0; i < contributors.length; i++) {
              const player = contributors[i];
              let refund = refundPerPlayer;

              if (i === 0) {
                refund += refundRemainder;
              }

              player.totalChips += refund;
              totalAwarded += refund;

              console.log(
                `Returning ${refund} chips to ${player.username}, new total: ${player.totalChips}`
              );

              try {
                await User.findByIdAndUpdate(player.user, {
                  balance: player.totalChips,
                });
              } catch (error) {
                console.error(
                  `Error updating balance for ${player.username}:`,
                  error
                );
              }
            }
          }
        }
      }

      // Verify all chips are accounted for
      if (totalAwarded !== originalPot) {
        console.error(
          `ACCOUNTING ERROR: Awarded ${totalAwarded} chips but pot was ${originalPot}`
        );
      } else {
        console.log(
          `Successfully awarded all ${totalAwarded} chips from the pot`
        );
      }
    } else {
      // Simple case - no all-ins, just split the pot among winners
      console.log("No all-in players, distributing pot normally");
      const splitAmount = Math.floor(game.pot / winners.length);
      const remainder = game.pot % winners.length;

      for (let i = 0; i < winners.length; i++) {
        const winner = winners[i];
        let winAmount = splitAmount;

        // Add remainder to first winner (if any)
        if (i === 0) {
          winAmount += remainder;
        }

        winner.totalChips += winAmount;
        console.log(
          `Winner ${winner.username} receives ${winAmount} chips, new total: ${winner.totalChips}`
        );

        // Update user balance in database
        try {
          await User.findByIdAndUpdate(winner.user, {
            balance: winner.totalChips,
          });
        } catch (error) {
          console.error(
            `Error updating balance for ${winner.username}:`,
            error
          );
        }
      }
    }

    // Reset pot and all player chips committed to pot
    game.pot = 0;
    game.sidePots = [];

    game.players.forEach((player) => {
      player.chips = 0;
    });

    // Save the updated game
    await game.save();

    // Return the updated winners and the original pot
    return {
      winners,
      originalPot,
    };
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
    // Update betting round
    game.bettingRound = "flop";

    // Burn a card
    cardDeck.drawCard(game.deck);

    // Deal three unique cards
    for (let i = 0; i < 3; i++) {
      const card = cardDeck.drawCard(game.deck);
      game.communityCards.push(card);
    }

    // Add to game history
    game.actionHistory.push({
      player: "Dealer",
      action: "dealFlop",
      timestamp: Date.now(),
    });

    await game.save();
    return game;
  },

  // Deal the turn (fourth community card)
  async dealTurn(game) {
    // Update betting round
    game.bettingRound = "turn";

    // Burn a card
    cardDeck.drawCard(game.deck);

    // Deal one unique card
    const card = cardDeck.drawCard(game.deck);
    game.communityCards.push(card);

    // Add to game history
    game.actionHistory.push({
      player: "Dealer",
      action: "dealTurn",
      timestamp: Date.now(),
    });

    await game.save();
    return game;
  },

  // Deal the river (fifth community card)
  async dealRiver(game) {
    // Update betting round
    game.bettingRound = "river";

    // Burn a card
    cardDeck.drawCard(game.deck);

    // Deal one unique card
    const card = cardDeck.drawCard(game.deck);
    game.communityCards.push(card);

    // Add to game history
    game.actionHistory.push({
      player: "Dealer",
      action: "dealRiver",
      timestamp: Date.now(),
    });

    await game.save();
    return game;
  },

  /**
   * Process the showdown with correct side pot handling
   * @param {Object} game - Game document
   * @returns {Object} Showdown results
   */
  async processShowdown(game) {
    try {
      // Store the current pot value before any processing
      const originalPot = game.pot;
      console.log(`Original pot before showdown processing: ${originalPot}`);

      // Make sure pot is calculated correctly
      const totalChipsCommitted = game.players.reduce(
        (sum, p) => sum + p.chips,
        0
      );

      if (game.pot !== totalChipsCommitted) {
        console.log(
          `Correcting pot amount from ${game.pot} to ${totalChipsCommitted} based on player chips`
        );
        game.pot = totalChipsCommitted;
      }

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

      // Log detailed results for debugging
      console.log("Showdown results determined:");
      console.log(
        `- Winners: ${result.winners.map((w) => w.username).join(", ")}`
      );
      console.log(
        `- Hand types: ${result.winners.map((w) => w.handName).join(", ")}`
      );

      // Store the pot value for the result BEFORE it gets reset by awardPot
      const potForResult = game.pot;
      console.log(`Pot value for result before awarding: ${potForResult}`);

      // Store hand results in game history
      game.handResults.push({
        winners: result.winners.map((w) => w.playerId),
        pot: potForResult, // Use the correct pot value
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

      // Use our improved awardPot function that correctly handles side pots
      await this.awardPot(game, winnerPlayers);

      // Make sure to save the game after awarding pot
      await game.save();

      // Prepare detailed winner data with proper error handling
      const safeWinners = result.winners.map((w) => {
        const player = this.getPlayerById(game, w.playerId);
        return {
          playerId: w.playerId,
          username: w.username || "Unknown Player",
          hand: player && Array.isArray(player.hand) ? player.hand : [],
          handName: w.handName || "Unknown Hand",
        };
      });

      // Prepare data for all players' cards (including losers)
      const allPlayersCards = activePlayers.map((player) => ({
        playerId: player.user.toString(),
        username: player.username || "Unknown Player",
        hand: Array.isArray(player.hand) ? player.hand : [],
        isWinner: result.winners.some(
          (w) => w.playerId === player.user.toString()
        ),
        handName:
          result.allHands.find((h) => h.playerId === player.user.toString())
            ?.handName || "Unknown Hand",
      }));

      // Return processed result with all players' cards and the correct pot value
      return {
        winners: safeWinners,
        hands: result.allHands.map((h) => ({
          playerId: h.playerId,
          username: h.username || "Unknown Player",
          hand: h.hand || [],
          handName: h.handName || "Unknown Hand",
        })),
        allPlayersCards: allPlayersCards,
        communityCards: game.communityCards,
        pot: potForResult, // Use the stored pot value instead of the current game.pot
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
      // Reset necessary game state
      game.bettingRound = "preflop";
      game.pot = 0;
      game.currentBet = 0;
      game.communityCards = [];

      // Ensure game status is set to 'waiting'
      game.status = "waiting";

      // Clear current turn to prevent any lingering turn signals
      game.currentTurn = undefined;

      // IMPORTANT FIX: Create a completely new shuffled deck for the next hand
      const cardDeck = require("./cardDeck");
      game.deck = cardDeck.createDeck(); // This creates a fresh, shuffled deck

      // Reset player states but keep their total chips
      game.players.forEach((player) => {
        player.hand = [];
        player.chips = 0; // Reset chips committed to pot
        player.hasFolded = false;
        player.hasActed = false;
        player.isAllIn = false;
        player.isReady = false; // Reset ready status for next hand
      });

      // Important: Remove players with zero chips
      await this.checkAndRemoveBankruptPlayers(game);

      // Sync player balances with database (important fix)
      for (const player of game.players) {
        try {
          if (player.isActive) {
            // Make sure database reflects the current game state
            await User.findByIdAndUpdate(
              player.user,
              { $set: { balance: player.totalChips } },
              { new: true }
            );

            console.log(
              `Updated ${player.username}'s database balance to ${player.totalChips}`
            );
          }
        } catch (err) {
          console.error(
            `Error updating database for player ${player.username}:`,
            err
          );
        }
      }

      // Check if there are enough players to continue
      const activePlayers = game.players.filter(
        (p) => p.isActive && p.totalChips > 0
      );

      if (activePlayers.length < 2) {
        // Mark game as completed if we don't have enough players with chips
        game.status = "completed";
        game.actionHistory.push({
          player: "System",
          action: "gameCompleted",
          message: "Chip e entek", // Updated message
          timestamp: Date.now(),
        });
      } else {
        // Set status to 'waiting' to require players to ready up again
        game.status = "waiting";

        // Add to action history
        game.actionHistory.push({
          player: "System",
          action: "nextHand",
          message: "Waiting for players to ready up for next hand",
          timestamp: Date.now(),
        });
      }

      // Use findByIdAndUpdate instead of direct save to avoid versioning conflicts
      try {
        // Create a clean object for update to avoid mongoose versioning issues
        const updateData = {
          bettingRound: game.bettingRound,
          pot: game.pot,
          currentBet: game.currentBet,
          communityCards: game.communityCards,
          players: game.players,
          status: game.status,
          actionHistory: game.actionHistory,
          deck: game.deck, // Include the fresh deck in the update
          creator: game.creator, // Include updated creator info
        };

        // Update the game in the database using findByIdAndUpdate
        const updatedGame = await Game.findByIdAndUpdate(
          game._id,
          { $set: updateData },
          { new: true, runValidators: true }
        );

        if (!updatedGame) {
          throw new Error(`Game with ID ${game._id} not found during update`);
        }

        console.log(
          `Game ${updatedGame.gameId} prepared for next hand with a fresh deck of ${updatedGame.deck.length} cards`
        );
        console.log(
          `Game status set to ${updatedGame.status} - waiting for players to ready up`
        );

        return updatedGame;
      } catch (updateError) {
        console.error("Error updating game for next hand:", updateError);

        // Fallback: Try to fetch a fresh copy of the game
        const freshGame = await Game.findById(game._id);
        if (!freshGame) {
          throw new Error(`Could not find game with ID ${game._id}`);
        }

        // Apply our changes to the fresh copy
        freshGame.bettingRound = "preflop";
        freshGame.pot = 0;
        freshGame.currentBet = 0;
        freshGame.communityCards = [];
        freshGame.players = game.players;
        freshGame.status = game.status; // This should be 'waiting' or 'completed'
        freshGame.deck = cardDeck.createDeck(); // Create a fresh deck here too
        freshGame.creator = game.creator; // Include updated creator info

        // Reset ready status in the fresh copy
        freshGame.players.forEach((player) => {
          player.isReady = false;
        });

        // Add our history entry to the fresh copy
        if (game.status === "completed") {
          freshGame.actionHistory.push({
            player: "System",
            action: "gameCompleted",
            message: "Chip e entek", // Updated message
            timestamp: Date.now(),
          });
        } else {
          freshGame.actionHistory.push({
            player: "System",
            action: "nextHand",
            message: "Waiting for players to ready up for next hand",
            timestamp: Date.now(),
          });
        }

        // Save the fresh copy
        await freshGame.save();
        console.log(
          `Game ${freshGame.gameId} prepared for next hand using fallback method with a fresh deck of ${freshGame.deck.length} cards`
        );
        return freshGame;
      }
    } catch (error) {
      console.error("Error in prepareNextHand:", error);
      throw error;
    }
  },

  /**
   * Check for and remove players with insufficient chips
   * @param {Object} game - Game document
   * @param {Object} socketIo - Socket.io instance (optional)
   * @param {String} gameId - Game ID (optional)
   * @returns {Array} Array of removed players
   */
  checkAndRemoveBankruptPlayers: async function (
    game,
    socketIo = null,
    gameId = null
  ) {
    let playersRemoved = false;
    const removedPlayers = []; // Track removed players to emit events

    // Check each player for having less than 1 chip
    for (let i = game.players.length - 1; i >= 0; i--) {
      const player = game.players[i];

      if (player.isActive && player.totalChips < 1) {
        console.log(
          `Player ${player.username} has insufficient chips (${player.totalChips}), removing from game`
        );

        // Mark player as inactive
        player.isActive = false;

        // Add to game history
        game.actionHistory.push({
          player: player.username,
          action: "playerRemoved",
          message: "Insufficient chips to continue",
          timestamp: Date.now(),
        });

        // Add to list of removed players
        removedPlayers.push({
          userId: player.user.toString(),
          username: player.username,
        });

        // If this player was the creator, transfer creator status to the next active player
        if (
          game.creator &&
          game.creator.user.toString() === player.user.toString()
        ) {
          // Find next active player to make the new creator
          const activePlayers = game.players.filter(
            (p) => p.isActive && p.totalChips > 0
          );

          if (activePlayers.length > 0) {
            // Find the player who joined earliest (lowest position value)
            const nextCreator = activePlayers.reduce((earliest, current) => {
              return current.position < earliest.position ? current : earliest;
            }, activePlayers[0]);

            console.log(
              `Transferring creator status from ${player.username} to ${nextCreator.username}`
            );

            // Update creator information
            game.creator = {
              user: nextCreator.user,
              username: nextCreator.username,
            };

            // Emit notification about creator change if socket is provided
            if (socketIo && gameId) {
              socketIo.to(gameId).emit("creatorChanged", {
                previousCreator: {
                  userId: player.user.toString(),
                  username: player.username,
                },
                newCreator: {
                  userId: nextCreator.user.toString(),
                  username: nextCreator.username,
                },
                reason: "Previous creator has insufficient chips",
              });

              // Send a personal message to the new creator
              const socketId = this.getUserSocketId(
                nextCreator.user.toString()
              );
              if (socketId) {
                socketIo.to(socketId).emit("becameCreator", {
                  message:
                    "You are now the game creator because the previous creator has insufficient chips",
                });
              }
            }
          }
        }

        playersRemoved = true;
      }
    }

    // Count active players with chips
    const activePlayers = game.players.filter(
      (p) => p.isActive && p.totalChips > 0
    );

    // If there aren't enough players to continue, mark game as completed
    if (activePlayers.length < 2) {
      // Mark game as completed
      game.status = "completed";

      // Create a detailed message about why the game ended
      const message = "Chip e entek";

      // Add to game history
      game.actionHistory.push({
        player: "System",
        action: "gameCompleted",
        message: message,
        timestamp: Date.now(),
      });

      // If socketIo and gameId are provided, emit the event
      if (socketIo && gameId) {
        // Emit a specific event for game ended with this message
        socketIo.to(gameId).emit("gameEnded", {
          message: message,
          reason: "insufficientChips",
          playersWithChips: activePlayers.map((p) => ({
            id: p.user.toString(),
            username: p.username,
            chips: p.totalChips,
          })),
        });
      }
    }

    if (playersRemoved) {
      // Save the updated game
      await game.save();
    }

    // Return the list of removed players
    return removedPlayers;
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

      // Check current bet and player's chips in pot
      const currentBet = game.currentBet || 0;
      const playerChipsInPot = player.chips || 0;
      const playerRemainingChips = player.totalChips || 0;

      // Check if player can check (when current bet is 0 or player has matched it)
      if (currentBet === 0 || playerChipsInPot === currentBet) {
        options.push("check");
      }

      // Call option (when there's a bet to match and player hasn't matched it yet)
      if (currentBet > 0 && playerChipsInPot < currentBet) {
        options.push("call");
      }

      // Bet option (only when there's no current bet and player has chips)
      if (currentBet === 0 && playerRemainingChips > 0) {
        options.push("bet");
      }

      // Raise option (only when there IS a current bet and player has enough chips to raise)
      if (currentBet > 0 && playerRemainingChips > 0) {
        // Make sure player has enough chips to make at least a min raise
        const minRaiseAmount = currentBet * 2 - playerChipsInPot;
        if (playerRemainingChips >= minRaiseAmount) {
          options.push("raise");
        }
      }

      // All-in option always available if player has chips
      if (playerRemainingChips > 0) {
        options.push("allIn");
      }

      return options;
    } catch (error) {
      console.error(`Error getting player options: ${error.message}`);
      // Return basic options as fallback
      return ["fold", "check", "call"];
    }
  },

  // Get sanitized game state (for sending to clients)
  getSanitizedGameState(game) {
    return {
      id: game.gameId,
      status: game.status,
      pot: game.pot,
      communityCards: game.communityCards,
      currentTurn: game.currentTurn,
      currentBet: game.currentBet,
      dealerPosition: game.dealerPosition,
      smallBlindPosition: game.smallBlindPosition,
      bigBlindPosition: game.bigBlindPosition,
      bettingRound: game.bettingRound,
      creator: game.creator,
      players: game.players.map((player) => ({
        id: player.user.toString(),
        username: player.username,
        chips: player.chips,
        totalChips: player.totalChips,
        hasCards: player.hand.length > 0,
        hasFolded: player.hasFolded,
        hasActed: player.hasActed,
        isAllIn: player.isAllIn,
        isActive: player.isActive,
        position: player.position,
        isReady: player.isReady,
      })),
      actionHistory: game.actionHistory.slice(-10), // Last 10 actions
      // Add readiness summary for easier client-side access
      readySummary: {
        readyCount: game.players.filter((p) => p.isReady).length,
        totalPlayers: game.players.length,
        allReady:
          game.players.length > 0 && game.players.every((p) => p.isReady),
      },
    };
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
};

module.exports = gameLogic;
