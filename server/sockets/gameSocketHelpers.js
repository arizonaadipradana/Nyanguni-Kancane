// server/sockets/gameSocketHelpers.js
const gameLogic = require('../utils/gameLogic');

/**
 * Send cards to a player with consistent format
 * @param {Object} io - Socket.io instance
 * @param {string} socketId - Player's socket ID
 * @param {Array} cards - Cards to send
 * @param {Object} options - Additional options
 */
exports.sendCardsToPlayer = (io, socketId, cards, options = {}) => {
  if (!socketId || !cards || !Array.isArray(cards)) {
    console.error('Invalid parameters for sendCardsToPlayer');
    return false;
  }
  
  // Create clean copies of cards to avoid reference issues
  const cleanCards = cards.map(card => ({
    suit: card.suit,
    rank: card.rank,
    value: card.value,
    code: card.code,
    _timestamp: Date.now() // Add timestamp to force reactivity
  }));
  
  // Log what we're sending
  console.log(`Sending ${cleanCards.length} cards to socket ${socketId}:`,
    cleanCards.map(c => `${c.rank} of ${c.suit}`).join(', '));
    
  // Send the cards with enough metadata to ensure client processes them
  io.to(socketId).emit('dealCards', {
    hand: cleanCards,
    newHand: options.newHand || false,
    timestamp: Date.now(),
    ...options
  });
  
  return true;
};