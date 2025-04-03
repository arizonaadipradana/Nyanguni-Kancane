// client/src/utils/PokerHandEvaluator.js

/**
 * Utility for evaluating poker hands
 */

// Card ranks in ascending order of value
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];

// Map ranks to numeric values
const RANK_VALUES = {};
RANKS.forEach((rank, index) => {
  RANK_VALUES[rank] = index + 2;
});

/**
 * Evaluates a poker hand and returns the hand type and value
 * @param {Array} playerCards - Player's hole cards
 * @param {Array} communityCards - Community cards on the table
 * @returns {Object} The hand evaluation result
 */
export function evaluateHand(playerCards, communityCards) {
  if (!playerCards || !Array.isArray(playerCards) || playerCards.length === 0) {
    return { type: 'Unknown Hand', value: 0, description: 'Unknown Hand' };
  }

  // Combine player cards and community cards
  const allCards = [...playerCards, ...(communityCards || [])];
  
  // Check if the player folded
  if (playerCards.length === 0 || playerCards[0].rank === 'Folded') {
    return { type: 'Folded', value: 0, description: 'Folded' };
  }

  // Get all possible 5-card combinations
  const combinations = getCombinations(allCards, 5);
  
  // Evaluate each combination
  const evaluations = combinations.map(combo => {
    return analyzeHand(combo);
  });
  
  // Sort evaluations by hand strength (highest first)
  evaluations.sort((a, b) => b.value - a.value);
  
  // Return the best hand
  return evaluations[0];
}

/**
 * Get all possible combinations of r elements from array
 * @param {Array} array - Source array
 * @param {Number} r - Size of each combination
 * @returns {Array} Array of combinations
 */
function getCombinations(array, r) {
  const result = [];
  
  // Return empty array for edge cases
  if (r > array.length || r <= 0 || array.length === 0) {
    return result;
  }
  
  // For small arrays and r=5, we can just return all cards if there are exactly 5
  if (array.length === 5 && r === 5) {
    return [array];
  }
  
  // Generate combinations using recursive helper
  function generateCombinations(combination, index) {
    if (combination.length === r) {
      result.push([...combination]);
      return;
    }
    
    for (let i = index; i < array.length; i++) {
      combination.push(array[i]);
      generateCombinations(combination, i + 1);
      combination.pop();
    }
  }
  
  generateCombinations([], 0);
  return result;
}

/**
 * Analyze a 5-card hand and determine its type and value
 * @param {Array} cards - Array of 5 card objects
 * @returns {Object} Hand evaluation result
 */
function analyzeHand(cards) {
  if (!cards || !Array.isArray(cards) || cards.length !== 5) {
    return { type: 'Invalid Hand', value: 0, description: 'Invalid Hand' };
  }
  
  // Get rank counts
  const rankCounts = {};
  cards.forEach(card => {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
  });
  
  // Get suit counts
  const suitCounts = {};
  cards.forEach(card => {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  });
  
  // Check if it's a flush (all same suit)
  const isFlush = Object.values(suitCounts).some(count => count === 5);
  
  // Check if it's a straight (5 consecutive ranks)
  const sortedRanks = cards
    .map(card => RANK_VALUES[card.rank])
    .sort((a, b) => a - b);
  
  let isStraight = true;
  for (let i = 1; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== sortedRanks[i-1] + 1) {
      isStraight = false;
      break;
    }
  }
  
  // Special case for A-5 straight
  const isLowStraight = 
    sortedRanks[0] === 2 && 
    sortedRanks[1] === 3 && 
    sortedRanks[2] === 4 && 
    sortedRanks[3] === 5 && 
    sortedRanks[4] === 14; // Ace
  
  if (isLowStraight) {
    isStraight = true;
  }
  
  // Get rank distribution (for pairs, three of a kind, etc.)
  const rankDistribution = Object.values(rankCounts).sort((a, b) => b - a);
  
  // Determine hand type
  let handType = '';
  let handValue = 0;
  let handDescription = '';
  
  // Royal Flush
  if (isFlush && isStraight && sortedRanks[4] === 14 && sortedRanks[0] === 10) {
    handType = 'Royal Flush';
    handValue = 9000;
    handDescription = 'Royal Flush';
  }
  // Straight Flush
  else if (isFlush && isStraight) {
    handType = 'Straight Flush';
    handValue = 8000 + sortedRanks[4];
    handDescription = `Straight Flush, ${RANKS[sortedRanks[4]-2]} high`;
  }
  // Four of a Kind
  else if (rankDistribution[0] === 4) {
    const quadsRank = Object.keys(rankCounts).find(rank => rankCounts[rank] === 4);
    handType = 'Four of a Kind';
    handValue = 7000 + RANK_VALUES[quadsRank];
    handDescription = `Four of a Kind, ${quadsRank}s`;
  }
  // Full House
  else if (rankDistribution[0] === 3 && rankDistribution[1] === 2) {
    const tripsRank = Object.keys(rankCounts).find(rank => rankCounts[rank] === 3);
    handType = 'Full House';
    handValue = 6000 + RANK_VALUES[tripsRank];
    handDescription = `Full House, ${tripsRank}s full`;
  }
  // Flush
  else if (isFlush) {
    handType = 'Flush';
    handValue = 5000 + sortedRanks[4];
    handDescription = `Flush, ${RANKS[sortedRanks[4]-2]} high`;
  }
  // Straight
  else if (isStraight) {
    handType = 'Straight';
    handValue = 4000 + (isLowStraight ? 5 : sortedRanks[4]);
    handDescription = `Straight, ${isLowStraight ? '5' : RANKS[sortedRanks[4]-2]} high`;
  }
  // Three of a Kind
  else if (rankDistribution[0] === 3) {
    const tripsRank = Object.keys(rankCounts).find(rank => rankCounts[rank] === 3);
    handType = 'Three of a Kind';
    handValue = 3000 + RANK_VALUES[tripsRank];
    handDescription = `Three of a Kind, ${tripsRank}s`;
  }
  // Two Pair
  else if (rankDistribution[0] === 2 && rankDistribution[1] === 2) {
    const pairRanks = Object.keys(rankCounts)
      .filter(rank => rankCounts[rank] === 2)
      .sort((a, b) => RANK_VALUES[b] - RANK_VALUES[a]);
    
    handType = 'Two Pair';
    handValue = 2000 + RANK_VALUES[pairRanks[0]] * 10 + RANK_VALUES[pairRanks[1]];
    handDescription = `Two Pair, ${pairRanks[0]}s and ${pairRanks[1]}s`;
  }
  // One Pair
  else if (rankDistribution[0] === 2) {
    const pairRank = Object.keys(rankCounts).find(rank => rankCounts[rank] === 2);
    handType = 'One Pair';
    handValue = 1000 + RANK_VALUES[pairRank];
    handDescription = `One Pair, ${pairRank}s`;
  }
  // High Card
  else {
    handType = 'High Card';
    handValue = sortedRanks[4];
    handDescription = `High Card ${RANKS[sortedRanks[4]-2]}`;
  }
  
  return {
    type: handType,
    value: handValue,
    description: handDescription
  };
}

/**
 * Create a readable description of a hand
 * @param {Array} hand - Player's hole cards
 * @param {Array} communityCards - Community cards
 * @returns {String} Human-readable description
 */
export function getHandDescription(playerCards, communityCards) {
  const evaluation = evaluateHand(playerCards, communityCards);
  return evaluation.description;
}

export default {
  evaluateHand,
  getHandDescription
};