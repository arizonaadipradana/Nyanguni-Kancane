const Game = require("../models/Game");
const mongoose = require("mongoose");
const mongooseHelpers = require("./mongoose-helpers");
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

/**
 * Clean up duplicate players in a game
 * Add this function to a utility file (e.g., debugging.js)
 * @param {Game} game - The game document to clean
 * @returns {Promise<Object>} Result of the cleanup
 */
/**
 * Clean up duplicate players in a game
 * @param {string} gameId - The game ID to clean
 * @returns {Promise<Object>} Result of the cleanup
 */
exports.cleanDuplicatePlayers = async function (gameId) {
  try {
    // Find the game using a new query to get a fresh version
    const game = await Game.findOne({ gameId });

    if (!game || !game.players) {
      return { success: false, message: "Game not found or invalid" };
    }

    // Track unique player IDs
    const playerMap = new Map();
    const duplicates = [];

    // Find duplicate players
    for (const player of game.players) {
      const playerId = player.user.toString();

      if (!playerMap.has(playerId)) {
        // First occurrence of this player
        playerMap.set(playerId, {
          index: playerMap.size,
          player,
        });
      } else {
        // Duplicate player found - keep the original and mark this one for removal
        duplicates.push({
          userId: playerId,
          username: player.username,
          position: player.position,
        });
      }
    }

    // If no duplicates found, return early
    if (duplicates.length === 0) {
      return {
        success: true,
        message: "No duplicate players found",
        playerCount: game.players.length,
      };
    }

    console.log(
      `Found ${duplicates.length} duplicate players in game ${gameId}`
    );

    // Create a new players array with only unique players
    const uniquePlayers = Array.from(playerMap.values())
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.player);

    // Use our mongoose helper to safely update the game with retries
    return await mongooseHelpers
      .findAndModify(
        Game,
        { gameId },
        async (freshGame) => {
          // Update players array with unique players only
          freshGame.players = uniquePlayers;

          // Fix player positions (in case duplicates changed the order)
          for (let i = 0; i < freshGame.players.length; i++) {
            freshGame.players[i].position = i;
          }
        },
        { verbose: true, maxAttempts: 5 }
      )
      .then(() => {
        return {
          success: true,
          message: "Duplicate players removed",
          removed: duplicates,
          newPlayerCount: uniquePlayers.length,
        };
      });
  } catch (error) {
    console.error("Error cleaning duplicate players:", error);
    return {
      success: false,
      message: error.message,
      error,
    };
  }
};

/**
 * Clean up all games by removing duplicate players
 * @returns {Promise<Object>} Result of the cleanup operation
 */
exports.cleanAllGames = async function () {
  try {
    // Find all active games
    const games = await Game.find({ status: { $in: ["waiting", "active"] } });

    if (!games || games.length === 0) {
      return {
        success: true,
        message: "No active games found",
        gamesChecked: 0,
      };
    }

    console.log(`Checking ${games.length} active games for duplicate players`);

    // Process each game
    const results = [];
    for (const game of games) {
      try {
        const result = await exports.cleanDuplicatePlayers(game.gameId);
        results.push({
          gameId: game.gameId,
          ...result,
        });
      } catch (gameError) {
        console.error(`Error cleaning game ${game.gameId}:`, gameError);
        results.push({
          gameId: game.gameId,
          success: false,
          error: gameError.message,
        });
      }
    }

    // Count successes and failures
    const cleanedGames = results.filter(
      (r) => r.success && r.removed && r.removed.length > 0
    ).length;
    const failedGames = results.filter((r) => !r.success).length;

    return {
      success: true,
      message: `Cleaned ${cleanedGames} games with duplicates, ${failedGames} failed`,
      gamesChecked: games.length,
      cleanedGames,
      failedGames,
      results,
    };
  } catch (error) {
    console.error("Error cleaning all games:", error);
    return {
      success: false,
      message: error.message,
      error,
    };
  }
};

/**
 * @route   POST api/games/clean/:id
 * @desc    Clean duplicate players from a game
 * @access  Private
 */
router.post("/clean/:id", auth, async (req, res) => {
  try {
    const gameId = req.params.id;

    // Find the game
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ msg: "Game not found" });
    }

    // Check if user is the creator
    if (game.creator.user.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ msg: "Only the creator can clean the game" });
    }

    // Clean duplicate players
    const debugging = require("../utils/debugging");
    const result = await debugging.cleanDuplicatePlayers(game);

    // Return the result
    res.json(result);
  } catch (err) {
    console.error("Clean game error:", err.message);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
});

function logCardsInPlay(game) {
  if (!game) {
    console.error("Cannot log cards: Game object is null or undefined");
    return;
  }

  console.log(`\n========== CARDS IN PLAY (Game ${game.gameId}) ==========`);

  // Log community cards
  console.log("\nCOMMUNITY CARDS:");
  if (game.communityCards && game.communityCards.length) {
    game.communityCards.forEach((card, i) => {
      console.log(`[${i}] ${card.rank} of ${card.suit} (${card.code})`);
    });
  } else {
    console.log("No community cards dealt yet");
  }

  // Log player cards
  console.log("\nPLAYER CARDS:");
  if (game.players && game.players.length) {
    game.players.forEach((player) => {
      console.log(`\nPlayer: ${player.username}`);
      if (player.hand && player.hand.length) {
        player.hand.forEach((card, i) => {
          console.log(`[${i}] ${card.rank} of ${card.suit} (${card.code})`);
        });
      } else {
        console.log("No cards or player has folded");
      }
    });
  } else {
    console.log("No players in game");
  }

  // Log remaining deck info
  console.log("\nDECK STATUS:");
  if (game.deck) {
    console.log(`Cards remaining in deck: ${game.deck.length}`);
  } else {
    console.log("Deck is undefined or null");
  }

  console.log("\n=======================================================\n");
}

// Check for duplicate cards in a game
function checkGameForDuplicates(game) {
  if (!game) {
    return { hasDuplicates: false, error: "Game object is null or undefined" };
  }

  // Collect all cards in play
  const allCards = [];

  // Add community cards
  if (game.communityCards && game.communityCards.length) {
    allCards.push(...game.communityCards);
  }

  // Add player cards
  if (game.players && game.players.length) {
    game.players.forEach((player) => {
      if (player.hand && player.hand.length) {
        allCards.push(...player.hand);
      }
    });
  }

  // Check for duplicates
  const cardMap = new Map();
  const duplicates = [];

  for (const card of allCards) {
    if (!card.rank || !card.suit) {
      continue; // Skip invalid cards
    }

    const cardKey = `${card.rank}-${card.suit}`;

    if (cardMap.has(cardKey)) {
      duplicates.push({ rank: card.rank, suit: card.suit, code: card.code });
    } else {
      cardMap.set(cardKey, true);
    }
  }

  return {
    hasDuplicates: duplicates.length > 0,
    duplicates: duplicates,
    totalCards: allCards.length,
    uniqueCards: cardMap.size,
  };
}

// Fix duplicate cards by replacing them with new ones from the deck
async function fixDuplicateCards(game) {
  if (!game || !game.deck) {
    return { success: false, error: "Game or deck is undefined" };
  }

  const cardDeck = require("./cardDeck");

  // If deck is almost empty, reset it
  if (game.deck.length < 10) {
    console.log("Deck nearly empty, resetting deck");
    game.deck = cardDeck.createDeck();
  }

  // First, collect all cards in play and find duplicates
  const allCards = [];
  const cardUsage = new Map();
  const duplicateCards = [];

  // Track which cards belong to community and players
  const communityCardIndices = [];
  const playerCardMappings = [];

  // Process community cards
  if (game.communityCards && game.communityCards.length) {
    game.communityCards.forEach((card, index) => {
      const cardKey = `${card.rank}-${card.suit}`;

      if (cardUsage.has(cardKey)) {
        duplicateCards.push({
          card,
          location: "community",
          index,
          originalIndex: cardUsage.get(cardKey).index,
          originalLocation: cardUsage.get(cardKey).location,
        });
      } else {
        cardUsage.set(cardKey, { location: "community", index });
      }

      allCards.push(card);
      communityCardIndices.push(index);
    });
  }

  // Process player cards
  if (game.players && game.players.length) {
    game.players.forEach((player, playerIndex) => {
      if (player.hand && player.hand.length) {
        player.hand.forEach((card, cardIndex) => {
          const cardKey = `${card.rank}-${card.suit}`;

          if (cardUsage.has(cardKey)) {
            duplicateCards.push({
              card,
              location: "player",
              playerIndex,
              cardIndex,
              originalIndex: cardUsage.get(cardKey).index,
              originalLocation: cardUsage.get(cardKey).location,
            });
          } else {
            cardUsage.set(cardKey, {
              location: "player",
              playerIndex,
              cardIndex,
              index: cardIndex,
            });
          }

          allCards.push(card);
          playerCardMappings.push({ playerIndex, cardIndex });
        });
      }
    });
  }

  // Replace duplicate cards
  for (const duplicate of duplicateCards) {
    // Draw a new card from the deck
    let newCard;
    let attempts = 0;
    const maxAttempts = 5;

    // Try several times to get a unique card
    while (attempts < maxAttempts) {
      newCard = cardDeck.drawCard(game.deck);
      const newCardKey = `${newCard.rank}-${newCard.suit}`;

      if (!cardUsage.has(newCardKey)) {
        // Found a unique card
        cardUsage.set(newCardKey, {
          location: duplicate.location,
          playerIndex: duplicate.playerIndex,
          cardIndex: duplicate.cardIndex,
          index: duplicate.index,
        });
        break;
      }

      // Put the card back and try again
      game.deck.unshift(newCard);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      // Couldn't find a unique card, create a new deck
      console.log("Could not find unique card, resetting deck");
      game.deck = cardDeck.createDeck();

      // Remove all cards already in play from the new deck
      for (const [key] of cardUsage) {
        const [rank, suit] = key.split("-");
        const indexToRemove = game.deck.findIndex(
          (c) => c.rank === rank && c.suit === suit
        );
        if (indexToRemove !== -1) {
          game.deck.splice(indexToRemove, 1);
        }
      }

      // Try again with the new deck
      newCard = cardDeck.drawCard(game.deck);
    }

    // Replace the duplicate card
    if (duplicate.location === "community") {
      game.communityCards[duplicate.index] = newCard;
      console.log(
        `Replaced duplicate community card: ${duplicate.card.rank} of ${duplicate.card.suit} with ${newCard.rank} of ${newCard.suit}`
      );
    } else if (duplicate.location === "player") {
      game.players[duplicate.playerIndex].hand[duplicate.cardIndex] = newCard;
      console.log(
        `Replaced duplicate player card: ${duplicate.card.rank} of ${
          duplicate.card.suit
        } with ${newCard.rank} of ${newCard.suit} for player ${
          game.players[duplicate.playerIndex].username
        }`
      );
    }
  }

  // Save the game with validation skipped for this operation
  game._skipValidation = true;
  await game.save();

  return {
    success: true,
    duplicatesFound: duplicateCards.length,
    duplicatesFixed: duplicateCards.length,
    remainingCards: game.deck.length,
  };
}

module.exports = {
  logCardsInPlay,
  checkGameForDuplicates,
  fixDuplicateCards,
};
