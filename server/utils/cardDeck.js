// server/utils/cardDeck.js

// Card suits and ranks
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Create a new deck of cards
function createDeck() {
  const deck = [];
  
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        code: `${rank}${suit.charAt(0).toUpperCase()}`
      });
    }
  }
  
  // Shuffle the deck
  return shuffleDeck(deck);
}

// Fisher-Yates shuffle algorithm
function shuffleDeck(deck) {
  const shuffled = [...deck];
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

// Draw a card from the deck
function drawCard(deck) {
  if (deck.length === 0) {
    throw new Error('Deck is empty');
  }
  
  return deck.pop();
}

module.exports = {
  createDeck,
  shuffleDeck,
  drawCard
};