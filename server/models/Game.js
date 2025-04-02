// server/models/Game.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Card schema (used in player hands and community cards)
const CardSchema = new Schema({
  suit: {
    type: String,
    enum: ['hearts', 'diamonds', 'clubs', 'spades'],
    required: true
  },
  rank: {
    type: String,
    enum: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
    required: true
  },
  value: {
    type: Number,
    min: 2,
    max: 14
  },
  code: {
    type: String
  }
});

// Player schema (used within games)
const PlayerSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  chips: {
    type: Number,
    default: 0 // Chips committed to the pot in current hand
  },
  totalChips: {
    type: Number,
    default: 1000 // Total chips available
  },
  hand: [CardSchema], // Player's hole cards
  isActive: {
    type: Boolean,
    default: true
  },
  hasFolded: {
    type: Boolean,
    default: false
  },
  hasActed: {
    type: Boolean,
    default: false
  },
  isAllIn: {
    type: Boolean,
    default: false
  },
  position: {
    type: Number // Player's position at the table
  }
});

// Game history action schema
const ActionSchema = new Schema({
  player: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: ['fold', 'check', 'call', 'bet', 'raise', 'allIn', 'smallBlind', 'bigBlind', 'dealFlop', 'dealTurn', 'dealRiver', 'gameStarted', 'gameCompleted', 'nextHand'],
    required: true
  },
  amount: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Hand result schema
const HandResultSchema = new Schema({
  winners: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  pot: {
    type: Number,
    required: true
  },
  hands: [{
    player: {
      type: String,
      required: true
    },
    cards: [CardSchema],
    handName: String
  }],
  communityCards: [CardSchema],
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Main Game schema
const GameSchema = new Schema({
  gameId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 6,
    maxlength: 6
  },
  creator: {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: {
      type: String,
      required: true
    }
  },
  players: [PlayerSchema],
  status: {
    type: String,
    enum: ['waiting', 'active', 'completed'],
    default: 'waiting'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  pot: {
    type: Number,
    default: 0
  },
  deck: [CardSchema],
  communityCards: [CardSchema],
  currentTurn: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  dealerPosition: {
    type: Number,
    default: 0
  },
  smallBlindPosition: {
    type: Number,
    default: 0
  },
  bigBlindPosition: {
    type: Number,
    default: 1
  },
  currentBet: {
    type: Number,
    default: 0
  },
  minBet: {
    type: Number,
    default: 1 // 1 chip = 500 rupiah
  },
  bettingRound: {
    type: String,
    enum: ['preflop', 'flop', 'turn', 'river', 'showdown'],
    default: 'preflop'
  },
  handNumber: {
    type: Number,
    default: 0
  },
  actionHistory: [ActionSchema],
  handResults: [HandResultSchema]
});

// Update the updatedAt field on save
GameSchema.pre('save', async function(next) {
  try {
    // Update the updatedAt field
    this.updatedAt = Date.now();
    
    // If we're in an active game with cards dealt, validate to ensure no duplicates
    if (this.status === 'active' && this.communityCards && this.communityCards.length > 0) {
      // Skip validation in certain cases to avoid overvalidation
      if (this._skipValidation) {
        delete this._skipValidation;
        return next();
      }
      
      // Collect all cards in play
      const cardsInPlay = [...this.communityCards];
      
      // Add player hole cards
      this.players.forEach(player => {
        if (player.hand && player.hand.length) {
          cardsInPlay.push(...player.hand);
        }
      });
      
      // Check for duplicate cards
      const cardMap = new Map();
      for (const card of cardsInPlay) {
        // Create a unique key for each card
        const cardKey = `${card.rank}-${card.suit}`;
        
        if (cardMap.has(cardKey)) {
          // Duplicate found!
          const error = new Error(`Duplicate card detected: ${card.rank} of ${card.suit}`);
          return next(error);
        }
        
        cardMap.set(cardKey, true);
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

GameSchema.methods.resetDeck = function() {
  const cardDeck = require('../utils/cardDeck');
  this.deck = cardDeck.createDeck();
  return this.deck;
};

// Add instance method to deal a card safely
GameSchema.methods.dealCard = function() {
  const cardDeck = require('../utils/cardDeck');
  
  if (!this.deck || this.deck.length === 0) {
    throw new Error('Cannot deal card: Deck is empty or undefined');
  }
  
  return cardDeck.drawCard(this.deck);
};

// Add method to skip validation for certain operations
GameSchema.methods.skipNextValidation = function() {
  this._skipValidation = true;
  return this;
};

module.exports = mongoose.model('Game', GameSchema);