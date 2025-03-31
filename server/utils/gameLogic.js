// server/utils/gameLogic.js
const cardDeck = require('./cardDeck');
const User = require('../models/User');

// Game logic for Texas Hold'em
const gameLogic = {
  // Start a new game
  async startGame(game) {
    game.status = 'active';
    return await this.startNewHand(game);
  },

  // Start a new hand
  async startNewHand(game) {
    // Reset game state for new hand
    game.pot = 0;
    game.communityCards = [];
    game.deck = cardDeck.createDeck();
    game.currentBet = 0;
    game.handNumber += 1;

    // Reset player states
    game.players.forEach(player => {
      player.hand = [];
      player.chips = 0;
      player.hasFolded = false;
      player.hasActed = false;
    });

    // Rotate dealer position (small blind)
    game.smallBlindPosition = (game.smallBlindPosition + 1) % game.players.length;
    game.bigBlindPosition = (game.smallBlindPosition + 1) % game.players.length;

    // Deal two cards to each player
    for (let i = 0; i < 2; i++) {
      game.players.forEach(player => {
        player.hand.push(cardDeck.drawCard(game.deck));
      });
    }

    // Set blinds
    const smallBlindPlayer = game.players[game.smallBlindPosition];
    const bigBlindPlayer = game.players[game.bigBlindPosition];

    // Small blind is 0.5 chips, big blind is 1 chip
    await this.placeBet(game, smallBlindPlayer.user.toString(), 0.5);
    await this.placeBet(game, bigBlindPlayer.user.toString(), 1);

    // Set first player to act (after big blind)
    game.currentTurn = game.players[(game.bigBlindPosition + 1) % game.players.length].user;

    // Save the updated game
    await game.save();
    return game;
  },

  // Start a betting round
  async startBettingRound(game) {
    // Reset player actions
    game.players.forEach(player => {
      if (!player.hasFolded) {
        player.hasActed = false;
      }
    });

    // Small blind acts first in subsequent rounds (after pre-flop)
    if (game.communityCards.length > 0) {
      game.currentTurn = game.players[game.smallBlindPosition].user;
      
      // Skip players who have folded
      while (this.getPlayerById(game, game.currentTurn.toString()).hasFolded) {
        this.moveToNextPlayer(game);
      }
    }

    // Save the updated game
    await game.save();
    return game;
  },

  // Process a player's action
  async processPlayerAction(game, playerId, action, amount) {
    const player = this.getPlayerById(game, playerId);
    const result = {
      roundEnded: false,
      handEnded: false,
      nextPhase: null
    };

    switch (action) {
      case 'fold':
        player.hasFolded = true;
        player.hasActed = true;
        
        // Check if only one player remains
        const activePlayers = game.players.filter(p => !p.hasFolded);
        if (activePlayers.length === 1) {
          // Hand ends, remaining player wins
          result.handEnded = true;
          result.roundEnded = true;
          result.winners = [activePlayers[0].user];
          
          // Award pot to winner
          activePlayers[0].totalChips += game.pot;
          
          // Update user's balance
          await this.updateUserBalance(activePlayers[0].user.toString(), activePlayers[0].totalChips);
          
          await game.save();
          return result;
        }
        break;
        
      case 'check':
        // Can only check if current bet is 0 or player has already matched it
        if (game.currentBet > player.chips) {
          throw new Error('Cannot check, must call or fold');
        }
        player.hasActed = true;
        break;
        
      case 'call':
        // Match the current bet
        const callAmount = game.currentBet - player.chips;
        if (callAmount > 0) {
          await this.placeBet(game, playerId, callAmount);
        }
        player.hasActed = true;
        break;
        
      case 'bet':
        // Place a new bet (when current bet is 0)
        if (game.currentBet > 0) {
          throw new Error('Cannot bet, must raise instead');
        }
        if (amount < game.minBet) {
          throw new Error(`Bet must be at least ${game.minBet} chips`);
        }
        await this.placeBet(game, playerId, amount);
        player.hasActed = true;
        
        // Reset other players' acted status since they need to respond to the bet
        game.players.forEach(p => {
          if (p.user.toString() !== playerId && !p.hasFolded) {
            p.hasActed = false;
          }
        });
        break;
        
      case 'raise':
        // Increase the current bet
        if (game.currentBet === 0) {
          throw new Error('Cannot raise, must bet instead');
        }
        if (amount < game.currentBet * 2) {
          throw new Error(`Raise must be at least ${game.currentBet * 2} chips`);
        }
        
        // First match the current bet, then add the raise
        const raiseAmount = amount - player.chips;
        await this.placeBet(game, playerId, raiseAmount);
        player.hasActed = true;
        
        // Reset other players' acted status since they need to respond to the raise
        game.players.forEach(p => {
          if (p.user.toString() !== playerId && !p.hasFolded) {
            p.hasActed = false;
          }
        });
        break;
        
      default:
        throw new Error('Invalid action');
    }

    // Move to next player
    this.moveToNextPlayer(game);
    
    // Check if betting round is complete
    if (this.isBettingRoundComplete(game)) {
      result.roundEnded = true;
      
      // Determine the next phase
      if (game.communityCards.length === 0) {
        result.nextPhase = 'flop';
      } else if (game.communityCards.length === 3) {
        result.nextPhase = 'turn';
      } else if (game.communityCards.length === 4) {
        result.nextPhase = 'river';
      } else {
        result.nextPhase = 'showdown';
      }
    }
    
    await game.save();
    return result;
  },
  
  // Place a bet for a player
  async placeBet(game, playerId, amount) {
    const player = this.getPlayerById(game, playerId);
    
    // Check if player has enough chips
    if (player.totalChips < amount) {
      throw new Error('Not enough chips');
    }
    
    // Update player chips
    player.totalChips -= amount;
    player.chips += amount;
    
    // Update pot and current bet
    game.pot += amount;
    game.currentBet = Math.max(game.currentBet, player.chips);
    
    await game.save();
  },
  
  // Move to the next active player
  moveToNextPlayer(game) {
    const currentIndex = game.players.findIndex(p => p.user.toString() === game.currentTurn.toString());
    let nextIndex = (currentIndex + 1) % game.players.length;
    
    // Skip players who have folded or already acted
    while (
      (game.players[nextIndex].hasFolded || game.players[nextIndex].hasActed) &&
      nextIndex !== currentIndex
    ) {
      nextIndex = (nextIndex + 1) % game.players.length;
    }
    
    // If we've looped back to the current player, all players have acted
    if (nextIndex === currentIndex) {
      // All players have acted, betting round is complete
      return;
    }
    
    game.currentTurn = game.players[nextIndex].user;
  },
  
  // Check if betting round is complete
  isBettingRoundComplete(game) {
    // All active players should have the same amount of chips in the pot,
    // or have folded, and all should have acted
    const activePlayers = game.players.filter(p => !p.hasFolded);
    
    // If only one player remains, round is complete
    if (activePlayers.length === 1) {
      return true;
    }
    
    // Check if all active players have acted and have matched the bet
    return activePlayers.every(p => 
      p.hasActed && (p.chips === game.currentBet || p.totalChips === 0)
    );
  },
  
  // Deal the flop (first three community cards)
  async dealFlop(game) {
    // Burn a card
    cardDeck.drawCard(game.deck);
    
    // Deal three cards
    for (let i = 0; i < 3; i++) {
      game.communityCards.push(cardDeck.drawCard(game.deck));
    }
    
    await game.save();
    return game;
  },
  
  // Deal the turn (fourth community card)
  async dealTurn(game) {
    // Burn a card
    cardDeck.drawCard(game.deck);
    
    // Deal one card
    game.communityCards.push(cardDeck.drawCard(game.deck));
    
    await game.save();
    return game;
  },
  
  // Deal the river (fifth community card)
  async dealRiver(game) {
    // Burn a card
    cardDeck.drawCard(game.deck);
    
    // Deal one card
    game.communityCards.push(cardDeck.drawCard(game.deck));
    
    await game.save();
    return game;
  },
  
  // Process the showdown (compare hands)
  async processShowdown(game) {
    const activePlayers = game.players.filter(p => !p.hasFolded);
    const result = {
      winners: []
    };
    
    // Evaluate each player's hand
    const handsWithRanks = activePlayers.map(player => {
      const allCards = [...player.hand, ...game.communityCards];
      const handRank = this.evaluateHand(allCards);
      // Store hand name for history
      player.handName = handRank.handName;
      return {
        playerId: player.user,
        handRank
      };
    });
    
    // Find the highest rank
    const maxRank = Math.max(...handsWithRanks.map(h => h.handRank.rank));
    
    // Find all players with the highest rank
    const winners = handsWithRanks.filter(h => h.handRank.rank === maxRank);
    
    // In case of a tie, use kickers to determine winner
    if (winners.length > 1) {
      // For simplicity, let's just split the pot evenly
      result.winners = winners.map(w => w.playerId);
      
      // Award split pot to winners
      const splitAmount = Math.floor(game.pot / winners.length);
      for (const winner of winners) {
        const player = this.getPlayerById(game, winner.playerId.toString());
        player.totalChips += splitAmount;
        
        // Update user's balance in database
        await this.updateUserBalance(winner.playerId.toString(), player.totalChips);
        
        // Update games won count
        await this.updateGamesWon(winner.playerId.toString());
      }
    } else {
      result.winners = [winners[0].playerId];
      
      // Award pot to winner
      const winner = this.getPlayerById(game, winners[0].playerId.toString());
      winner.totalChips += game.pot;
      
      // Update user's balance in database
      await this.updateUserBalance(winners[0].playerId.toString(), winner.totalChips);
      
      // Update games won count
      await this.updateGamesWon(winners[0].playerId.toString());
    }
    
    await game.save();
    return result;
  },
  
  // Update user balance in database
  async updateUserBalance(userId, newBalance) {
    try {
      await User.findByIdAndUpdate(userId, { balance: newBalance });
    } catch (error) {
      console.error('Error updating user balance:', error);
    }
  },
  
  // Update games won count
  async updateGamesWon(userId) {
    try {
      const user = await User.findById(userId);
      user.gamesWon += 1;
      await user.save();
    } catch (error) {
      console.error('Error updating games won:', error);
    }
  },
  
  // Evaluate a poker hand
  evaluateHand(cards) {
    // This is a simplified hand evaluator
    // In a real implementation, you would use a more sophisticated algorithm
    
    // For simplicity, let's just return a random rank
    // In reality, you'd evaluate the hand properly
    return {
      rank: Math.floor(Math.random() * 9),
      handName: this.getHandName(Math.floor(Math.random() * 9))
    };
  },
  
  // Get hand name from rank
  getHandName(rank) {
    const handNames = [
      'High Card',
      'One Pair',
      'Two Pair',
      'Three of a Kind',
      'Straight',
      'Flush',
      'Full House',
      'Four of a Kind',
      'Straight Flush',
      'Royal Flush'
    ];
    return handNames[rank];
  },
  
  // Get player by ID
  getPlayerById(game, playerId) {
    const player = game.players.find(p => p.user.toString() === playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    return player;
  },
  
  // Get available options for a player
  getPlayerOptions(game, playerId) {
    const player = this.getPlayerById(game, playerId.toString());
    const options = [];
    
    // Always can fold
    options.push('fold');
    
    // Check if player can check
    if (game.currentBet === 0 || player.chips === game.currentBet) {
      options.push('check');
    }
    
    // Call option
    if (game.currentBet > 0 && player.chips < game.currentBet) {
      options.push('call');
    }
    
    // Bet option
    if (game.currentBet === 0 && player.totalChips > 0) {
      options.push('bet');
    }
    
    // Raise option
    if (game.currentBet > 0 && player.totalChips > 0) {
      options.push('raise');
    }
    
    return options;
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
      players: game.players.map(player => ({
        id: player.user.toString(),
        username: player.username,
        chips: player.chips,
        totalChips: player.totalChips,
        hasCards: player.hand.length > 0,
        hasFolded: player.hasFolded,
        hasActed: player.hasActed
      }))
    };
  }
};

module.exports = gameLogic;