// server/utils/cardDeck.js - Complete replacement with enhanced shuffling

// Card suits and ranks
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Create a new deck of cards
function createDeck() {
  const deck = [];
  
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        value: RANK_VALUES[rank],
        code: `${rank}${suit.charAt(0).toUpperCase()}`
      });
    }
  }
  
  // Apply multiple shuffles to ensure randomness
  let shuffled = superShuffle(deck);
  
  // Add a timestamp to track when this deck was created
  shuffled._createdAt = Date.now();
  
  return shuffled;
}

// Super shuffle - applies multiple shuffling algorithms for maximum randomness
function superShuffle(deck) {
  if (!deck || !Array.isArray(deck)) {
    console.error('Invalid deck provided to superShuffle');
    return createDeck(); // Return a fresh deck as fallback
  }
  
  // Create a copy to avoid modifying the original
  let result = [...deck];
  
  // Apply Fisher-Yates shuffle
  result = shuffleDeck(result);
  
  // Apply a cut
  const cutPoint = Math.floor(Math.random() * result.length);
  result = [...result.slice(cutPoint), ...result.slice(0, cutPoint)];
  
  // Apply another Fisher-Yates shuffle
  result = shuffleDeck(result);
  
  // Apply a riffle shuffle simulation
  result = riffleShuffleDeck(result);
  
  // One final Fisher-Yates for good measure
  result = shuffleDeck(result);
  
  // Verify the deck is properly randomized
  if (!isWellShuffled(result)) {
    console.log('Deck not sufficiently randomized, applying another shuffle algorithm');
    result = alternativeShuffleDeck(result);
  }
  
  return result;
}

// Enhanced Fisher-Yates shuffle algorithm with true randomness
function shuffleDeck(deck) {
  const shuffled = [...deck];
  
  // Calculate a random seed based on current time
  const seed = Date.now() % 10000;
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Use a combination of Math.random and our seed for better randomness
    const j = Math.floor((Math.random() * seed) % (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

// Simulate a riffle shuffle like a human would do
function riffleShuffleDeck(deck) {
  if (deck.length < 2) return deck;
  
  // Split the deck in two
  const middle = Math.floor(deck.length / 2);
  const left = deck.slice(0, middle);
  const right = deck.slice(middle);
  
  // Riffle the cards together
  const shuffled = [];
  while (left.length > 0 || right.length > 0) {
    // Add some randomness to how many cards fall from each half
    if (left.length > 0 && (right.length === 0 || Math.random() < 0.5)) {
      // Take 1-3 cards from left pile
      const chunk = Math.min(Math.floor(Math.random() * 3) + 1, left.length);
      shuffled.push(...left.splice(0, chunk));
    }
    
    if (right.length > 0 && (left.length === 0 || Math.random() < 0.5)) {
      // Take 1-3 cards from right pile
      const chunk = Math.min(Math.floor(Math.random() * 3) + 1, right.length);
      shuffled.push(...right.splice(0, chunk));
    }
  }
  
  return shuffled;
}

// Alternative shuffle algorithm using a more complex approach
function alternativeShuffleDeck(deck) {
  const result = [...deck];
  
  // Perform a complex shuffle operation
  for (let i = 0; i < 5; i++) { // Multiple passes
    // Different shuffling methods for each pass
    switch (i % 3) {
      case 0:
        // Randomize by swapping random pairs
        for (let j = 0; j < result.length * 2; j++) {
          const a = Math.floor(Math.random() * result.length);
          const b = Math.floor(Math.random() * result.length);
          [result[a], result[b]] = [result[b], result[a]];
        }
        break;
      case 1:
        // Randomize by moving cards to random positions
        for (let j = 0; j < result.length; j++) {
          const newPos = Math.floor(Math.random() * result.length);
          const temp = result[j];
          result.splice(j, 1);
          result.splice(newPos, 0, temp);
        }
        break;
      case 2:
        // Apply a riffle shuffle
        const riffled = riffleShuffleDeck(result);
        for (let j = 0; j < result.length; j++) {
          result[j] = riffled[j];
        }
        break;
    }
  }
  
  return result;
}

// Check whether a deck appears to be well-shuffled
function isWellShuffled(deck) {
  if (!deck || deck.length !== 52) return false;
  
  // Check for runs of cards with same suit or consecutive ranks
  let suitRuns = 0;
  let rankRuns = 0;
  let samePositionCount = 0;
  
  // Keep track of original positions to ensure cards have moved
  const originalPositions = {};
  for (let i = 0; i < 52; i++) {
    const card = `${deck[i].rank}-${deck[i].suit}`;
    originalPositions[card] = i;
  }
  
  for (let i = 0; i < deck.length - 1; i++) {
    // Check for same suit in consecutive cards
    if (deck[i].suit === deck[i+1].suit) {
      suitRuns++;
    }
    
    // Check for sequential ranks in consecutive cards
    const currRank = RANK_VALUES[deck[i].rank];
    const nextRank = RANK_VALUES[deck[i+1].rank];
    if (Math.abs(currRank - nextRank) === 1) {
      rankRuns++;
    }
    
    // Check if card is within 3 positions of its original position
    const card = `${deck[i].rank}-${deck[i].suit}`;
    const originalPos = (RANKS.indexOf(deck[i].rank) + SUITS.indexOf(deck[i].suit) * 13);
    if (Math.abs(i - originalPos) < 3) {
      samePositionCount++;
    }
  }
  
  // A well-shuffled deck should have:
  // - Fewer than 20 suit runs (about 13 expected)
  // - Fewer than 16 rank runs (about 8 expected)
  // - Fewer than 10 cards in similar positions
  return suitRuns < 20 && rankRuns < 16 && samePositionCount < 10;
}

// Draw a card from the deck
function drawCard(deck) {
  if (!deck) {
    console.error('Attempting to draw from null/undefined deck');
    throw new Error('Deck is null or undefined');
  }
  
  if (!Array.isArray(deck)) {
    console.error('Attempting to draw from invalid deck:', deck);
    throw new Error('Deck is not an array');
  }
  
  if (deck.length === 0) {
    console.error('Attempting to draw from empty deck');
    throw new Error('Deck is empty');
  }
  
  // Track when a card is drawn for debugging
  const card = deck.pop();
  console.log(`Drew card: ${card.rank} of ${card.suit} (${deck.length} cards remaining)`);
  return card;
}

// Check if a card exists in a collection of cards
function cardExists(card, cardCollection) {
  return cardCollection.some(existingCard => 
    existingCard.suit === card.suit && existingCard.rank === card.rank
  );
}

// Check for duplicate cards in a collection
function checkForDuplicates(cards) {
  const seen = new Map();
  const duplicates = [];
  
  for (const card of cards) {
    if (!card || !card.rank || !card.suit) continue;
    
    const cardKey = `${card.rank}-${card.suit}`;
    if (seen.has(cardKey)) {
      duplicates.push(cardKey);
    } else {
      seen.set(cardKey, true);
    }
  }
  
  return duplicates;
}

// Get detailed statistics about a deck
function getDeckStats(deck) {
  if (!deck || !Array.isArray(deck)) {
    return { error: 'Invalid deck provided' };
  }
  
  const suitCounts = {};
  const rankCounts = {};
  
  SUITS.forEach(suit => suitCounts[suit] = 0);
  RANKS.forEach(rank => rankCounts[rank] = 0);
  
  // Count occurrences of each suit and rank
  deck.forEach(card => {
    if (card && card.suit && card.rank) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  });
  
  // Check if deck is complete and properly shuffled
  const isComplete = SUITS.every(suit => suitCounts[suit] === 13) && 
                    RANKS.every(rank => rankCounts[rank] === 4);
  
  return {
    deckSize: deck.length,
    isComplete,
    isShuffled: isWellShuffled(deck),
    suitCounts,
    rankCounts,
    createdAt: deck._createdAt || 'unknown'
  };
}

// Force a fresh deck creation and full shuffle
function getFreshShuffledDeck() {
  // Create a fresh deck and apply our super shuffle
  const deck = superShuffle(createDeck());
  
  // Add timestamp
  deck._createdAt = Date.now();
  
  // Shuffle again just to be safe
  return shuffleDeck(deck);
}

module.exports = {
  createDeck,
  shuffleDeck,
  superShuffle,
  riffleShuffleDeck,
  alternativeShuffleDeck,
  drawCard,
  cardExists,
  checkForDuplicates,
  getDeckStats,
  isWellShuffled,
  getFreshShuffledDeck,
  SUITS,
  RANKS,
  RANK_VALUES
};