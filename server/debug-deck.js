// server/debug-deck.js
// Run this file to test deck shuffling: node debug-deck.js

const cardDeck = require('./utils/cardDeck');

console.log('Testing card deck functions...');

// Create a new deck
console.log('Creating a new deck...');
const deck = cardDeck.createDeck();

// Get deck stats
const stats = cardDeck.getDeckStats(deck);
console.log('Initial deck stats:', stats);

// Test for duplicate cards
const duplicates = cardDeck.checkForDuplicates(deck);
console.log('Any duplicates?', duplicates.length > 0 ? 'YES' : 'NO');
if (duplicates.length > 0) {
  console.log('Duplicates found:', duplicates);
}

// Test is deck well shuffled
const isShuffled = cardDeck.isWellShuffled(deck);
console.log('Is deck well shuffled?', isShuffled ? 'YES' : 'NO');

// Test drawing cards
console.log('\nDrawing 10 cards:');
const drawnCards = [];
for (let i = 0; i < 10; i++) {
  const card = cardDeck.drawCard(deck);
  drawnCards.push(card);
  console.log(`  ${i+1}. ${card.rank} of ${card.suit}`);
}

console.log(`\nDeck now has ${deck.length} cards left`);

// Create a completely fresh deck
console.log('\nCreating a fresh shuffled deck with enhanced algorithm:');
const freshDeck = cardDeck.getFreshShuffledDeck();
const freshStats = cardDeck.getDeckStats(freshDeck);
console.log('Fresh deck stats:', freshStats);

// Check distribution of cards
console.log('\nChecking card distribution:');
const suitDistribution = {};
const rankDistribution = {};

let prevSuit = null;
let suitRuns = 0;
let rankRuns = 0;

freshDeck.forEach((card, index) => {
  // Count suits
  suitDistribution[card.suit] = (suitDistribution[card.suit] || 0) + 1;
  
  // Count ranks
  rankDistribution[card.rank] = (rankDistribution[card.rank] || 0) + 1;
  
  // Count suit runs
  if (prevSuit === card.suit) {
    suitRuns++;
  }
  prevSuit = card.suit;
  
  // Check for sequential cards
  if (index > 0) {
    const prevCard = freshDeck[index - 1];
    const prevValue = cardDeck.RANK_VALUES[prevCard.rank];
    const currValue = cardDeck.RANK_VALUES[card.rank];
    
    if (Math.abs(prevValue - currValue) === 1) {
      rankRuns++;
    }
  }
});

console.log('Suit distribution:', suitDistribution);
console.log('Rank distribution:', rankDistribution);
console.log('Suit runs:', suitRuns);
console.log('Rank runs:', rankRuns);

// Test dealing hands to players
console.log('\nSimulating dealing cards to 4 players:');

const players = [
  { name: 'Player 1', hand: [] },
  { name: 'Player 2', hand: [] },
  { name: 'Player 3', hand: [] },
  { name: 'Player 4', hand: [] }
];

// Deal 2 cards to each player
const testDeck = cardDeck.getFreshShuffledDeck();
for (let i = 0; i < 2; i++) {
  for (const player of players) {
    const card = cardDeck.drawCard(testDeck);
    player.hand.push(card);
  }
}

// Print player hands
console.log('Player hands:');
players.forEach(player => {
  console.log(`${player.name}: ${player.hand.map(c => `${c.rank} of ${c.suit}`).join(', ')}`);
});

// Check for any duplicates across all hands
const allDealtCards = [];
players.forEach(player => {
  allDealtCards.push(...player.hand);
});

const handDuplicates = cardDeck.checkForDuplicates(allDealtCards);
console.log(`\nAny duplicates in dealt hands? ${handDuplicates.length > 0 ? 'YES' : 'NO'}`);
if (handDuplicates.length > 0) {
  console.log('Duplicates found:', handDuplicates);
}

// Now simulate a full poker hand including community cards
console.log('\nSimulating a full poker hand:');

// Burn a card before the flop
console.log('Burning a card before flop');
cardDeck.drawCard(testDeck);

// Deal the flop (3 cards)
const flop = [];
console.log('Dealing flop:');
for (let i = 0; i < 3; i++) {
  const card = cardDeck.drawCard(testDeck);
  flop.push(card);
  console.log(`  ${card.rank} of ${card.suit}`);
}

// Burn a card before the turn
console.log('Burning a card before turn');
cardDeck.drawCard(testDeck);

// Deal the turn
const turn = cardDeck.drawCard(testDeck);
console.log(`Turn: ${turn.rank} of ${turn.suit}`);

// Burn a card before the river
console.log('Burning a card before river');
cardDeck.drawCard(testDeck);

// Deal the river
const river = cardDeck.drawCard(testDeck);
console.log(`River: ${river.rank} of ${river.suit}`);

// Check for duplicates in the entire round
const allCards = [...allDealtCards, ...flop, turn, river];
const roundDuplicates = cardDeck.checkForDuplicates(allCards);
console.log(`\nAny duplicates in the entire round? ${roundDuplicates.length > 0 ? 'YES' : 'NO'}`);
if (roundDuplicates.length > 0) {
  console.log('Duplicates found:', roundDuplicates);
}

// Create multiple decks and check for identical patterns
console.log('\nTesting multiple deck creations for patterns:');
const decks = [];
for (let i = 0; i < 5; i++) {
  decks.push(cardDeck.getFreshShuffledDeck());
}

// Check if the first 5 cards of each deck are identical
const firstFiveCards = decks.map(d => d.slice(0, 5).map(c => `${c.rank}${c.suit[0]}`).join(','));
console.log('First 5 cards of each deck:');
firstFiveCards.forEach((cards, i) => {
  console.log(`  Deck ${i+1}: ${cards}`);
});

// Check for patterns between decks
let identicalDecks = 0;
for (let i = 0; i < decks.length; i++) {
  for (let j = i + 1; j < decks.length; j++) {
    let identicalCards = 0;
    for (let k = 0; k < 10; k++) { // Check first 10 cards
      if (decks[i][k].rank === decks[j][k].rank && decks[i][k].suit === decks[j][k].suit) {
        identicalCards++;
      }
    }
    if (identicalCards > 2) {
      identicalDecks++;
      console.log(`WARNING: Decks ${i+1} and ${j+1} have ${identicalCards} identical cards in the same positions`);
    }
  }
}

if (identicalDecks === 0) {
  console.log('No identical patterns found across decks - shuffling looks good!');
}

console.log('\nDeck testing complete.');