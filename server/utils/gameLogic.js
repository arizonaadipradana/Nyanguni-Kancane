// server/utils/gameLogic.js
const cardDeck = require('./cardDeck');
const handEvaluator = require('./handEvaluator');
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
    game.bettingRound = 'preflop';

    // Reset player states
    game.players.forEach(player => {
      player.hand = [];
      player.chips = 0;
      player.hasFolded = false;
      player.hasActed = false;
      player.isAllIn = false;
    });

    // Rotate dealer position (button)
    if (game.handNumber > 1) {
      game.dealerPosition = (game.dealerPosition + 1) % game.players.length;
      
      // Make sure the dealer position is on an active player
      while (!game.players[game.dealerPosition].isActive) {
        game.dealerPosition = (game.dealerPosition + 1) % game.players.length;
      }
    } else {
      // First hand, dealer can be random or position 0
      game.dealerPosition = 0;
    }

    // Set blinds positions (relative to dealer)
    this.setBlindPositions(game);

    // Deal two cards to each active player
    for (let i = 0; i < 2; i++) {
      game.players.forEach(player => {
        if (player.isActive && player.totalChips > 0) {
          player.hand.push(cardDeck.drawCard(game.deck));
        }
      });
    }

    // Set blinds
    const smallBlindPlayer = game.players[game.smallBlindPosition];
    const bigBlindPlayer = game.players[game.bigBlindPosition];

    // Small blind is half the minimum bet, big blind is the minimum bet
    await this.placeBet(game, smallBlindPlayer.user.toString(), game.minBet / 2);
    await this.placeBet(game, bigBlindPlayer.user.toString(), game.minBet);

    // Set first player to act (after big blind)
    game.currentTurn = this.getNextActivePlayerAfter(game, game.bigBlindPosition);

    // Update game history
    game.actionHistory.push({
      player: smallBlindPlayer.username,
      action: 'smallBlind',
      amount: game.minBet / 2,
      timestamp: Date.now()
    });
    
    game.actionHistory.push({
      player: bigBlindPlayer.username,
      action: 'bigBlind',
      amount: game.minBet,
      timestamp: Date.now()
    });

    // Save the updated game
    await game.save();
    return game;
  },

  // Set the small and big blind positions relative to the dealer
  setBlindPositions(game) {
    const activePlayers = game.players.filter(p => p.isActive && p.totalChips > 0);
    
    if (activePlayers.length <= 1) {
      // Not enough players to play
      throw new Error('Need at least 2 active players');
    }
    
    // For 2 players, dealer is small blind, other player is big blind
    if (activePlayers.length === 2) {
      game.smallBlindPosition = game.dealerPosition;
      game.bigBlindPosition = this.getNextActivePlayerIndex(game, game.dealerPosition);
      return;
    }
    
    // For 3+ players, small blind is next to dealer, big blind follows
    game.smallBlindPosition = this.getNextActivePlayerIndex(game, game.dealerPosition);
    game.bigBlindPosition = this.getNextActivePlayerIndex(game, game.smallBlindPosition);
  },

  // Get the next active player index
  getNextActivePlayerIndex(game, currentIndex) {
    let nextIndex = (currentIndex + 1) % game.players.length;
    
    // Skip players who are not active or have no chips
    while (!game.players[nextIndex].isActive || game.players[nextIndex].totalChips <= 0) {
      nextIndex = (nextIndex + 1) % game.players.length;
      
      // Safety check to avoid infinite loop
      if (nextIndex === currentIndex) {
        throw new Error('No active players with chips found');
      }
    }
    
    return nextIndex;
  },

  // Get the next active player ID after a position
  getNextActivePlayerAfter(game, currentIndex) {
    const nextIndex = this.getNextActivePlayerIndex(game, currentIndex);
    return game.players[nextIndex].user;
  },

  // Start a betting round
  async startBettingRound(game) {
    // Reset player actions
    game.players.forEach(player => {
      if (!player.hasFolded && player.isActive && !player.isAllIn) {
        player.hasActed = false;
      }
    });

    // Reset current bet for new round (except preflop where blinds set it)
    if (game.bettingRound !== 'preflop') {
      game.currentBet = 0;
    }

    // First to act depends on the round
    // In preflop, action starts after the big blind
    // In other rounds, action starts with first active player after dealer
    let startPos;
    if (game.bettingRound === 'preflop') {
      startPos = game.bigBlindPosition;
    } else {
      startPos = game.dealerPosition;
    }

    // Find the next active player who hasn't folded and isn't all-in
    try {
      game.currentTurn = this.getNextPlayerToAct(game, startPos);
    } catch (error) {
      // If no player needs to act, betting round is complete
      console.log('No players need to act, betting round complete');
      return game;
    }

    // Save the updated game
    await game.save();
    return game;
  },

  // Get the next player who needs to act (not folded, not all-in, not already acted)
  getNextPlayerToAct(game, startPos) {
    let currentIndex = startPos;
    
    for (let i = 0; i < game.players.length; i++) {
      const nextIndex = (currentIndex + 1) % game.players.length;
      const player = game.players[nextIndex];
      
      if (player.isActive && !player.hasFolded && !player.isAllIn && !player.hasActed) {
        return player.user;
      }
      
      currentIndex = nextIndex;
    }
    
    throw new Error('No players need to act');
  },

  // Process a player's action
  async processPlayerAction(game, playerId, action, amount = 0) {
    const player = this.getPlayerById(game, playerId);
    const result = {
      success: true,
      roundEnded: false,
      handEnded: false,
      nextPhase: null,
      message: ''
    };

    // Validate that it's this player's turn
    if (game.currentTurn.toString() !== playerId) {
      throw new Error('Not your turn');
    }

    // Process the action
    switch (action) {
      case 'fold':
        player.hasFolded = true;
        player.hasActed = true;
        
        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: 'fold',
          amount: 0,
          timestamp: Date.now()
        });
        
        // Check if only one player remains
        const activePlayers = game.players.filter(p => p.isActive && !p.hasFolded);
        if (activePlayers.length === 1) {
          // Hand ends, remaining player wins
          result.handEnded = true;
          result.roundEnded = true;
          result.winners = [activePlayers[0].user.toString()];
          
          // Award pot to winner
          await this.awardPot(game, [activePlayers[0]]);
          
          result.message = `${activePlayers[0].username} wins the pot of ${game.pot} chips`;
          return result;
        }
        break;
        
      case 'check':
        // Can only check if current bet is 0 or player has already matched it
        if (game.currentBet > player.chips) {
          throw new Error('Cannot check, must call or fold');
        }
        player.hasActed = true;
        
        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: 'check',
          amount: 0,
          timestamp: Date.now()
        });
        break;
        
      case 'call':
        // Match the current bet
        const callAmount = game.currentBet - player.chips;
        if (callAmount > 0) {
          if (callAmount >= player.totalChips) {
            // Player is going all-in with a call
            await this.placeAllIn(game, playerId);
          } else {
            await this.placeBet(game, playerId, callAmount);
          }
        }
        player.hasActed = true;
        
        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: 'call',
          amount: callAmount,
          timestamp: Date.now()
        });
        break;
        
      case 'bet':
        // Place a new bet (when current bet is 0)
        if (game.currentBet > 0) {
          throw new Error('Cannot bet, must raise instead');
        }
        
        if (amount < game.minBet) {
          throw new Error(`Bet must be at least ${game.minBet} chips`);
        }
        
        if (amount >= player.totalChips) {
          // Player is going all-in with a bet
          await this.placeAllIn(game, playerId);
        } else {
          await this.placeBet(game, playerId, amount);
        }
        player.hasActed = true;
        
        // Reset other players' acted status since they need to respond to the bet
        game.players.forEach(p => {
          if (p.user.toString() !== playerId && p.isActive && !p.hasFolded && !p.isAllIn) {
            p.hasActed = false;
          }
        });
        
        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: 'bet',
          amount: amount,
          timestamp: Date.now()
        });
        break;
        
      case 'raise':
        // Increase the current bet
        if (game.currentBet === 0) {
          throw new Error('Cannot raise, must bet instead');
        }
        
        // Minimum raise is current bet + previous raise amount (or min bet if first raise)
        const minRaise = game.currentBet * 2;
        if (amount < minRaise) {
          throw new Error(`Raise must be at least ${minRaise} chips`);
        }
        
        if (amount >= player.totalChips + player.chips) {
          // Player is going all-in with a raise
          await this.placeAllIn(game, playerId);
        } else {
          // Calculate additional amount to add to player's current bet
          const additionalAmount = amount - player.chips;
          await this.placeBet(game, playerId, additionalAmount);
        }
        player.hasActed = true;
        
        // Reset other players' acted status since they need to respond to the raise
        game.players.forEach(p => {
          if (p.user.toString() !== playerId && p.isActive && !p.hasFolded && !p.isAllIn) {
            p.hasActed = false;
          }
        });
        
        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: 'raise',
          amount: amount,
          timestamp: Date.now()
        });
        break;
        
      case 'allIn':
        await this.placeAllIn(game, playerId);
        player.hasActed = true;
        
        // If player's all-in amount is greater than current bet, reset other players' acted status
        if (player.chips > game.currentBet) {
          game.players.forEach(p => {
            if (p.user.toString() !== playerId && p.isActive && !p.hasFolded && !p.isAllIn) {
              p.hasActed = false;
            }
          });
        }
        
        // Add to action history
        game.actionHistory.push({
          player: player.username,
          action: 'allIn',
          amount: player.chips,
          timestamp: Date.now()
        });
        break;
        
      default:
        throw new Error('Invalid action');
    }

    // Move to next player if hand is still active
    if (!result.handEnded) {
      try {
        game.currentTurn = this.getNextPlayerToAct(game, game.players.findIndex(p => 
          p.user.toString() === playerId));
      } catch (error) {
        // If no more players need to act, betting round is complete
        result.roundEnded = true;
        
        // Determine the next phase based on current betting round
        if (game.bettingRound === 'preflop') {
          result.nextPhase = 'flop';
        } else if (game.bettingRound === 'flop') {
          result.nextPhase = 'turn';
        } else if (game.bettingRound === 'turn') {
          result.nextPhase = 'river';
        } else if (game.bettingRound === 'river') {
          result.nextPhase = 'showdown';
        }
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
  
  // Place an all-in bet
  async placeAllIn(game, playerId) {
    const player = this.getPlayerById(game, playerId);
    
    // Put all remaining chips in the pot
    const allInAmount = player.totalChips;
    if (allInAmount <= 0) {
      throw new Error('No chips left to go all-in');
    }
    
    // Update player chips
    player.totalChips = 0;
    player.chips += allInAmount;
    player.isAllIn = true;
    
    // Update pot and possibly current bet
    game.pot += allInAmount;
    if (player.chips > game.currentBet) {
      game.currentBet = player.chips;
    }
    
    await game.save();
  },
  
  // Award the pot to winner(s)
  async awardPot(game, winners) {
    if (!winners || winners.length === 0) {
      throw new Error('No winners provided');
    }
    
    // Split the pot evenly among winners
    const splitAmount = Math.floor(game.pot / winners.length);
    const remainder = game.pot % winners.length;
    
    // Award chips to winners
    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      let winAmount = splitAmount;
      
      // Add remainder to first winner (if any)
      if (i === 0) {
        winAmount += remainder;
      }
      
      winner.totalChips += winAmount;
      
      // Update user's balance in database
      await this.updateUserBalance(winner.user.toString(), winner.totalChips);
      
      // Update games won count for the user
      await this.updateGamesWon(winner.user.toString());
    }
    
    // Reset pot
    game.pot = 0;
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
  
  // Deal the flop (first three community cards)
  async dealFlop(game) {
    // Update betting round
    game.bettingRound = 'flop';
    
    // Burn a card
    cardDeck.drawCard(game.deck);
    
    // Deal three cards
    for (let i = 0; i < 3; i++) {
      game.communityCards.push(cardDeck.drawCard(game.deck));
    }
    
    // Add to game history
    game.actionHistory.push({
      player: 'Dealer',
      action: 'dealFlop',
      timestamp: Date.now()
    });
    
    await game.save();
    return game;
  },
  
  // Deal the turn (fourth community card)
  async dealTurn(game) {
    // Update betting round
    game.bettingRound = 'turn';
    
    // Burn a card
    cardDeck.drawCard(game.deck);
    
    // Deal one card
    game.communityCards.push(cardDeck.drawCard(game.deck));
    
    // Add to game history
    game.actionHistory.push({
      player: 'Dealer',
      action: 'dealTurn',
      timestamp: Date.now()
    });
    
    await game.save();
    return game;
  },
  
  // Deal the river (fifth community card)
  async dealRiver(game) {
    // Update betting round
    game.bettingRound = 'river';
    
    // Burn a card
    cardDeck.drawCard(game.deck);
    
    // Deal one card
    game.communityCards.push(cardDeck.drawCard(game.deck));
    
    // Add to game history
    game.actionHistory.push({
      player: 'Dealer',
      action: 'dealRiver',
      timestamp: Date.now()
    });
    
    await game.save();
    return game;
  },
  
  // Process the showdown (compare hands)
  async processShowdown(game) {
    // Get players who haven't folded
    const activePlayers = game.players.filter(p => p.isActive && !p.hasFolded);
    
    // Prepare hands for evaluation
    const playerHands = activePlayers.map(player => ({
      playerId: player.user.toString(),
      username: player.username,
      holeCards: player.hand,
      communityCards: game.communityCards
    }));
    
    // Determine winner(s)
    const result = handEvaluator.determineWinners(playerHands);
    
    // Store hand results in game history
    game.handResults.push({
      winners: result.winners.map(w => w.playerId),
      pot: game.pot,
      hands: result.allHands.map(h => ({
        player: h.username,
        cards: h.hand,
        handName: h.handName
      })),
      communityCards: game.communityCards,
      timestamp: Date.now()
    });
    
    // Award pot to winner(s)
    const winnerPlayers = result.winners.map(w => 
      this.getPlayerById(game, w.playerId)
    );
    
    await this.awardPot(game, winnerPlayers);
    
    return {
      winners: result.winners.map(w => ({
        playerId: w.playerId,
        username: w.username,
        handName: w.handName
      })),
      hands: result.allHands.map(h => ({
        playerId: h.playerId,
        username: h.username,
        handName: h.handName
      }))
    };
  },
  
  // Check if betting round is complete
  isBettingRoundComplete(game) {
    // All active players should have either folded, gone all-in, or acted
    // And all players who have acted should have the same amount in the pot
    const activePlayers = game.players.filter(p => p.isActive && !p.hasFolded && !p.isAllIn);
    
    // If no active players (all folded or all-in), round is complete
    if (activePlayers.length === 0) {
      return true;
    }
    
    // Check if all active players have acted
    const allActed = activePlayers.every(p => p.hasActed);
    if (!allActed) {
      return false;
    }
    
    // All players have acted, now check if they've all matched the bet
    return activePlayers.every(p => p.chips === game.currentBet);
  },
  
  // Prepare the game for the next hand
  async prepareNextHand(game) {
    // Reset necessary game state
    game.bettingRound = 'preflop';
    game.pot = 0;
    game.currentBet = 0;
    game.communityCards = [];
    
    // Reset player states but keep their total chips
    game.players.forEach(player => {
      player.hand = [];
      player.chips = 0;
      player.hasFolded = false;
      player.hasActed = false;
      player.isAllIn = false;
    });
    
    // Remove players with zero chips
    game.players = game.players.filter(player => {
      if (player.totalChips <= 0) {
        player.isActive = false;
        return false;
      }
      return true;
    });
    
    // Check if there are enough players to continue
    if (game.players.filter(p => p.isActive).length < 2) {
      game.status = 'completed';
      game.actionHistory.push({
        player: 'System',
        action: 'gameCompleted',
        timestamp: Date.now()
      });
    } else {
      // Continue with next hand
      game.actionHistory.push({
        player: 'System',
        action: 'nextHand',
        timestamp: Date.now()
      });
    }
    
    await game.save();
    return game;
  },
  
  // Get player by ID
  getPlayerById(game, playerId) {
    if (!game || !game.players || !Array.isArray(game.players)) {
      throw new Error('Invalid game object');
    }
    
    if (!playerId) {
      throw new Error('Player ID is required');
    }
    
    // Convert to string for comparison
    const playerIdStr = playerId.toString();
    
    // Find the player with safer comparison
    const player = game.players.find(p => {
      // Handle various formats of the user ID
      if (!p || !p.user) return false;
      
      if (typeof p.user === 'string') {
        return p.user === playerIdStr;
      }
      
      if (typeof p.user === 'object' && p.user.$oid) {
        return p.user.$oid === playerIdStr;
      }
      
      return p.user.toString() === playerIdStr;
    });
    
    if (!player) {
      // Add more diagnostic information to help debug
      console.error(`Player not found. PlayerId: ${playerId}, Game ID: ${game.gameId}`);
      console.error(`Available players: ${game.players.map(p => p.user?.toString()).join(', ')}`);
      
      throw new Error('Player not found');
    }
    
    return player;
  },
  
  // Get available options for a player
  getPlayerOptions(game, playerId) {
    const player = this.getPlayerById(game, playerId);
    const options = [];
    
    // Player can't act if they've folded or are all-in
    if (player.hasFolded || player.isAllIn) {
      return options;
    }
    
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
    if (game.currentBet > 0 && player.totalChips > game.currentBet - player.chips) {
      options.push('raise');
    }
    
    // All-in option is always available if player has chips
    if (player.totalChips > 0) {
      options.push('allIn');
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
      dealerPosition: game.dealerPosition,
      smallBlindPosition: game.smallBlindPosition,
      bigBlindPosition: game.bigBlindPosition,
      bettingRound: game.bettingRound,
      creator: game.creator,
      players: game.players.map(player => ({
        id: player.user.toString(),
        username: player.username,
        chips: player.chips,
        totalChips: player.totalChips,
        hasCards: player.hand.length > 0,
        hasFolded: player.hasFolded,
        hasActed: player.hasActed,
        isAllIn: player.isAllIn,
        isActive: player.isActive,
        position: player.position
      })),
      actionHistory: game.actionHistory.slice(-10) // Last 10 actions
    };
  },
  
  // Process a full hand from start to finish
  async processFullHand(game) {
    // 1. Start new hand (already dealt cards and set blinds)
    await this.startNewHand(game);
    
    // Keep track of remaining players
    let activePlayers = game.players.filter(p => p.isActive && !p.hasFolded);
    
    // If only one player remains active after blinds, they win automatically
    if (activePlayers.length === 1) {
      await this.awardPot(game, activePlayers);
      return this.prepareNextHand(game);
    }
    
    // 2. Pre-flop betting round
    await this.startBettingRound(game);
    
    // Continue through betting rounds until showdown or winner determined
    let currentRound = 'preflop';
    const rounds = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    
    // Proceed through rounds until showdown or only one player remains
    for (let i = 0; i < rounds.length; i++) {
      currentRound = rounds[i];
      
      // Skip betting if only one player remains
      activePlayers = game.players.filter(p => p.isActive && !p.hasFolded);
      if (activePlayers.length === 1) {
        await this.awardPot(game, activePlayers);
        return this.prepareNextHand(game);
      }
      
      // Skip to showdown if all players are all-in
      const notAllInPlayers = activePlayers.filter(p => !p.isAllIn);
      if (notAllInPlayers.length === 0 && currentRound !== 'showdown') {
        // Deal remaining community cards and proceed to showdown
        if (game.communityCards.length === 0) {
          await this.dealFlop(game);
          await this.dealTurn(game);
          await this.dealRiver(game);
        } else if (game.communityCards.length === 3) {
          await this.dealTurn(game);
          await this.dealRiver(game);
        } else if (game.communityCards.length === 4) {
          await this.dealRiver(game);
        }
        
        // Process showdown
        await this.processShowdown(game);
        return this.prepareNextHand(game);
      }
      
      // Process the current round
      if (currentRound === 'flop') {
        await this.dealFlop(game);
        await this.startBettingRound(game);
      } else if (currentRound === 'turn') {
        await this.dealTurn(game);
        await this.startBettingRound(game);
      } else if (currentRound === 'river') {
        await this.dealRiver(game);
        await this.startBettingRound(game);
      } else if (currentRound === 'showdown') {
        await this.processShowdown(game);
        return this.prepareNextHand(game);
      }
    }
    
    // Should never reach here, but just in case
    return game;
  }
};

module.exports = gameLogic;