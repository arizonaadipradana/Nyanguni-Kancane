// server/utils/handEvaluator.js
const { RANK_VALUES } = require('./cardDeck');

// Hand ranking values (higher is better)
const HAND_RANKS = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

// Get the hand rank name based on the rank value
function getHandName(rank) {
  const names = {
    1: 'High Card',
    2: 'One Pair',
    3: 'Two Pair',
    4: 'Three of a Kind',
    5: 'Straight',
    6: 'Flush',
    7: 'Full House',
    8: 'Four of a Kind',
    9: 'Straight Flush',
    10: 'Royal Flush'
  };
  return names[rank] || 'Unknown';
}

// Evaluates a hand of 5-7 cards and returns the best 5-card hand with rank
function evaluateHand(cards) {
  // Ensure we have enough cards
  if (!cards || cards.length < 5) {
    throw new Error('Need at least 5 cards to evaluate a hand');
  }

  // Get all possible 5-card combinations if more than 5 cards are provided
  const combinations = getCombinations(cards, 5);
  
  // Evaluate each combination and find the best hand
  const evaluatedHands = combinations.map(combo => {
    const result = evaluateSingleHand(combo);
    return {
      cards: combo,
      ...result
    };
  });
  
  // Sort hands by rank (highest first), then by kickers
  evaluatedHands.sort((a, b) => {
    // First, compare hand ranks
    if (b.rank !== a.rank) {
      return b.rank - a.rank;
    }
    
    // If ranks are the same, compare kickers
    for (let i = 0; i < a.kickers.length; i++) {
      if (b.kickers[i] !== a.kickers[i]) {
        return b.kickers[i] - a.kickers[i];
      }
    }
    
    return 0; // Completely equal hands
  });
  
  // Return the best hand
  return evaluatedHands[0];
}

// Evaluate a single 5-card hand
function evaluateSingleHand(cards) {
  if (cards.length !== 5) {
    throw new Error('evaluateSingleHand requires exactly 5 cards');
  }
  
  // Sort cards by value (high to low)
  const sortedCards = [...cards].sort((a, b) => b.value - a.value);
  
  // Check for flush (all same suit)
  const isFlush = isHandFlush(sortedCards);
  
  // Check for straight (sequential values)
  const isStraight = isHandStraight(sortedCards);
  
  // Check for Royal Flush
  if (isFlush && isStraight && sortedCards[0].value === RANK_VALUES['A'] && sortedCards[4].value === RANK_VALUES['10']) {
    return {
      rank: HAND_RANKS.ROYAL_FLUSH,
      handName: getHandName(HAND_RANKS.ROYAL_FLUSH),
      kickers: [sortedCards[0].value]
    };
  }
  
  // Check for Straight Flush
  if (isFlush && isStraight) {
    return {
      rank: HAND_RANKS.STRAIGHT_FLUSH,
      handName: getHandName(HAND_RANKS.STRAIGHT_FLUSH),
      kickers: [sortedCards[0].value]
    };
  }
  
  // Count cards by their values
  const cardCounts = {};
  for (const card of sortedCards) {
    cardCounts[card.value] = (cardCounts[card.value] || 0) + 1;
  }
  
  // Create arrays of card values grouped by count
  const quads = []; // Four of a kind
  const trips = []; // Three of a kind
  const pairs = []; // Pairs
  const singles = []; // Singles
  
  for (const value in cardCounts) {
    const count = cardCounts[value];
    const numValue = parseInt(value, 10);
    
    if (count === 4) quads.push(numValue);
    else if (count === 3) trips.push(numValue);
    else if (count === 2) pairs.push(numValue);
    else singles.push(numValue);
  }
  
  // Sort the arrays (high to low)
  quads.sort((a, b) => b - a);
  trips.sort((a, b) => b - a);
  pairs.sort((a, b) => b - a);
  singles.sort((a, b) => b - a);
  
  // Check for Four of a Kind
  if (quads.length > 0) {
    return {
      rank: HAND_RANKS.FOUR_OF_A_KIND,
      handName: getHandName(HAND_RANKS.FOUR_OF_A_KIND),
      kickers: [...quads, ...singles]
    };
  }
  
  // Check for Full House
  if (trips.length > 0 && pairs.length > 0) {
    return {
      rank: HAND_RANKS.FULL_HOUSE,
      handName: getHandName(HAND_RANKS.FULL_HOUSE),
      kickers: [trips[0], pairs[0]]
    };
  }
  
  // Check for Flush
  if (isFlush) {
    return {
      rank: HAND_RANKS.FLUSH,
      handName: getHandName(HAND_RANKS.FLUSH),
      kickers: sortedCards.map(card => card.value)
    };
  }
  
  // Check for Straight
  if (isStraight) {
    return {
      rank: HAND_RANKS.STRAIGHT,
      handName: getHandName(HAND_RANKS.STRAIGHT),
      kickers: [sortedCards[0].value]
    };
  }
  
  // Check for Three of a Kind
  if (trips.length > 0) {
    return {
      rank: HAND_RANKS.THREE_OF_A_KIND,
      handName: getHandName(HAND_RANKS.THREE_OF_A_KIND),
      kickers: [trips[0], ...singles]
    };
  }
  
  // Check for Two Pair
  if (pairs.length >= 2) {
    return {
      rank: HAND_RANKS.TWO_PAIR,
      handName: getHandName(HAND_RANKS.TWO_PAIR),
      kickers: [pairs[0], pairs[1], ...singles]
    };
  }
  
  // Check for One Pair
  if (pairs.length === 1) {
    return {
      rank: HAND_RANKS.ONE_PAIR,
      handName: getHandName(HAND_RANKS.ONE_PAIR),
      kickers: [pairs[0], ...singles]
    };
  }
  
  // High Card
  return {
    rank: HAND_RANKS.HIGH_CARD,
    handName: getHandName(HAND_RANKS.HIGH_CARD),
    kickers: sortedCards.map(card => card.value)
  };
}

// Check if the hand is a flush
function isHandFlush(cards) {
  const firstSuit = cards[0].suit;
  return cards.every(card => card.suit === firstSuit);
}

// Check if the hand is a straight
function isHandStraight(cards) {
  // Special case for A-5-4-3-2 straight (Ace is low)
  if (
    cards[0].value === RANK_VALUES['A'] &&
    cards[1].value === RANK_VALUES['5'] &&
    cards[2].value === RANK_VALUES['4'] &&
    cards[3].value === RANK_VALUES['3'] &&
    cards[4].value === RANK_VALUES['2']
  ) {
    return true;
  }
  
  // Regular straight check
  for (let i = 0; i < cards.length - 1; i++) {
    if (cards[i].value !== cards[i + 1].value + 1) {
      return false;
    }
  }
  
  return true;
}

// Get all combinations of r elements from array
function getCombinations(array, r) {
  function helper(start, result) {
    if (result.length === r) {
      combinations.push([...result]);
      return;
    }
    
    for (let i = start; i < array.length; i++) {
      result.push(array[i]);
      helper(i + 1, result);
      result.pop();
    }
  }
  
  const combinations = [];
  helper(0, []);
  return combinations;
}

// Compare two evaluated hands to determine the winner
function compareHands(hand1, hand2) {
  // Compare rank first
  if (hand1.rank !== hand2.rank) {
    return hand1.rank - hand2.rank;
  }
  
  // If ranks are equal, compare kickers
  for (let i = 0; i < hand1.kickers.length; i++) {
    if (hand1.kickers[i] !== hand2.kickers[i]) {
      return hand1.kickers[i] - hand2.kickers[i];
    }
  }
  
  // Hands are equal
  return 0;
}

// Determine winner(s) from multiple player hands
function determineWinners(playerHands) {
  // Evaluate each player's hand
  const evaluatedHands = playerHands.map(ph => ({
    playerId: ph.playerId,
    username: ph.username,
    evaluatedHand: evaluateHand([...ph.holeCards, ...ph.communityCards])
  }));
  
  // Sort by hand strength (highest first)
  evaluatedHands.sort((a, b) => compareHands(a.evaluatedHand, b.evaluatedHand)).reverse();
  
  // The first hand is the strongest
  const bestHand = evaluatedHands[0].evaluatedHand;
  
  // Find all players with the same hand strength (in case of a tie)
  const winners = evaluatedHands.filter(h => compareHands(h.evaluatedHand, bestHand) === 0);
  
  return {
    winners: winners.map(w => ({
      playerId: w.playerId,
      username: w.username,
      hand: w.evaluatedHand.cards,
      handName: w.evaluatedHand.handName
    })),
    allHands: evaluatedHands.map(h => ({
      playerId: h.playerId,
      username: h.username,
      hand: h.evaluatedHand.cards,
      handRank: h.evaluatedHand.rank,
      handName: h.evaluatedHand.handName
    }))
  };
}

module.exports = {
  evaluateHand,
  getHandName,
  determineWinners,
  HAND_RANKS
};