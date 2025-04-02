// server/tests/cardDealing.test.js
/**
 * Card Dealing Test Suite
 * 
 * This test file checks for various card dealing issues:
 * - Ensures the deck is properly created with 52 unique cards
 * - Tests that cards are properly removed from the deck when dealt
 * - Verifies no duplicate cards occur during a game
 * 
 * Run with: npm test
 */

const cardDeck = require('../utils/cardDeck');
const Game = require('../models/Game');
const mongoose = require('mongoose');
const gameLogic = require('../utils/gameLogic');
const debugging = require('../utils/debugging');

// Mock game object for testing
const createMockGame = () => {
  return {
    gameId: 'TEST01',
    status: 'active',
    bettingRound: 'preflop',
    communityCards: [],
    players: [
      {
        username: 'Player1',
        hand: [],
        isActive: true,
        totalChips: 1000
      },
      {
        username: 'Player2',
        hand: [],
        isActive: true,
        totalChips: 1000
      },
      {
        username: 'Player3',
        hand: [],
        isActive: true,
        totalChips: 1000
      }
    ],
    deck: cardDeck.createDeck(),
    pot: 0,
    dealerPosition: 0,
    smallBlindPosition: 1,
    bigBlindPosition: 2,
    currentBet: 0
  };
};

describe('Card Deck Creation and Management', () => {
  test('Creates a deck with 52 unique cards', () => {
    const deck = cardDeck.createDeck();
    
    // Check deck size
    expect(deck.length).toBe(52);
    
    // Check for uniqueness
    const cardSet = new Set();
    deck.forEach(card => {
      const cardKey = `${card.rank}-${card.suit}`;
      cardSet.add(cardKey);
    });
    
    expect(cardSet.size).toBe(52);
  });
  
  test('Draws cards correctly from the deck', () => {
    const deck = cardDeck.createDeck();
    const initialSize = deck.length;
    
    // Draw a card
    const card1 = cardDeck.drawCard(deck);
    expect(deck.length).toBe(initialSize - 1);
    
    // Draw another card
    const card2 = cardDeck.drawCard(deck);
    expect(deck.length).toBe(initialSize - 2);
    
    // Ensure the cards are different
    expect(card1.rank === card2.rank && card1.suit === card2.suit).toBe(false);
  });
  
  test('Detects duplicate cards', () => {
    // Create some test cards
    const cards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'clubs' },
      { rank: 'A', suit: 'hearts' }, // Duplicate
      { rank: 'Q', suit: 'diamonds' }
    ];
    
    const duplicates = cardDeck.checkForDuplicates(cards);
    expect(duplicates.length).toBe(1);
    expect(duplicates[0]).toBe('Ahearts');
  });
});

describe('Game Card Dealing Process', () => {
  test('Deals unique cards to players', () => {
    const mockGame = createMockGame();
    const initialDeckSize = mockGame.deck.length;
    
    // Deal 2 cards to each player
    mockGame.players.forEach(player => {
      for (let i = 0; i < 2; i++) {
        player.hand.push(cardDeck.drawCard(mockGame.deck));
      }
    });
    
    // Check deck size after dealing
    expect(mockGame.deck.length).toBe(initialDeckSize - (mockGame.players.length * 2));
    
    // Collect all dealt cards
    const dealtCards = [];
    mockGame.players.forEach(player => {
      dealtCards.push(...player.hand);
    });
    
    // Check for duplicates
    const cardSet = new Set();
    dealtCards.forEach(card => {
      const cardKey = `${card.rank}-${card.suit}`;
      cardSet.add(cardKey);
    });
    
    expect(cardSet.size).toBe(dealtCards.length);
  });
  
  test('Deals unique community cards', () => {
    const mockGame = createMockGame();
    const initialDeckSize = mockGame.deck.length;
    
    // Deal 2 cards to each player
    mockGame.players.forEach(player => {
      for (let i = 0; i < 2; i++) {
        player.hand.push(cardDeck.drawCard(mockGame.deck));
      }
    });
    
    // Deal 5 community cards (flop, turn, river)
    // Burn 1 card before flop
    cardDeck.drawCard(mockGame.deck);
    
    // Deal flop (3 cards)
    for (let i = 0; i < 3; i++) {
      mockGame.communityCards.push(cardDeck.drawCard(mockGame.deck));
    }
    
    // Burn 1 card before turn
    cardDeck.drawCard(mockGame.deck);
    
    // Deal turn (1 card)
    mockGame.communityCards.push(cardDeck.drawCard(mockGame.deck));
    
    // Burn 1 card before river
    cardDeck.drawCard(mockGame.deck);
    
    // Deal river (1 card)
    mockGame.communityCards.push(cardDeck.drawCard(mockGame.deck));
    
    // Check deck size after dealing
    const expectedRemainingCards = initialDeckSize - 
      (mockGame.players.length * 2) - // Player cards
      5 - // Community cards
      3; // Burned cards
    
    expect(mockGame.deck.length).toBe(expectedRemainingCards);
    
    // Collect all dealt cards
    const allCards = [...mockGame.communityCards];
    mockGame.players.forEach(player => {
      allCards.push(...player.hand);
    });
    
    // Check for duplicates
    const cardSet = new Set();
    allCards.forEach(card => {
      const cardKey = `${card.rank}-${card.suit}`;
      cardSet.add(cardKey);
    });
    
    expect(cardSet.size).toBe(allCards.length);
  });
  
  test('No duplicate cards between players and community cards', () => {
    const mockGame = createMockGame();
    
    // Deal 2 cards to each player
    mockGame.players.forEach(player => {
      for (let i = 0; i < 2; i++) {
        player.hand.push(cardDeck.drawCard(mockGame.deck));
      }
    });
    
    // Deal 5 community cards
    for (let i = 0; i < 5; i++) {
      // Burn a card before each community card (except for flop)
      if (i === 0 || i === 3 || i === 4) {
        cardDeck.drawCard(mockGame.deck);
      }
      mockGame.communityCards.push(cardDeck.drawCard(mockGame.deck));
    }
    
    // Check for duplicates using the debugging utility
    const result = debugging.checkGameForDuplicates(mockGame);
    expect(result.hasDuplicates).toBe(false);
    
    // The total number of unique cards should be:
    // 3 players × 2 cards each + 5 community cards = 11
    expect(result.totalCards).toBe(11);
    expect(result.uniqueCards).toBe(11);
  });
});

// Run these tests with jest or another testing framework
// npm install jest --save-dev
// Add to package.json scripts: "test": "jest"