// server/controllers/gameController.js
const crypto = require('crypto');
const Game = require('../models/Game');
const User = require('../models/User');
const gameLogic = require('../utils/gameLogic');

// Generate a random 6-character game ID
const generateGameId = () => {
  return crypto.randomBytes(3).toString('hex');
};

// Create a new game
exports.createGame = async (req, res) => {
  try {
    console.log('Create game request received:', req.body);
    
    const { creatorId, creatorName } = req.body;
    
    // Validate required input
    if (!creatorId || !creatorName) {
      console.log('Create game error: Missing required fields', { creatorId, creatorName });
      return res.status(400).json({ msg: 'Creator ID and name are required' });
    }

    // Ensure the creator ID matches the authenticated user
    if (creatorId !== req.user.id) {
      console.log('Create game error: Creator ID mismatch', { 
        creatorId, 
        userId: req.user.id,
        requestUser: req.user
      });
      return res.status(403).json({ msg: 'Creator ID does not match authenticated user' });
    }

    // Find the creator user - do this first to fail early if user not found
    const user = await User.findById(creatorId);
    if (!user) {
      console.log('Create game error: User not found', { creatorId });
      return res.status(404).json({ msg: 'User not found' });
    }

    // Generate a unique game ID
    let gameId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (!isUnique && attempts < maxAttempts) {
      gameId = generateGameId();
      
      // Check if game ID is already in use
      const existingGame = await Game.findOne({ gameId }).lean();
      if (!existingGame) {
        isUnique = true;
      }
      attempts++;
    }
    
    if (!isUnique) {
      console.log('Create game error: Failed to generate unique game ID');
      return res.status(500).json({ msg: 'Failed to generate unique game ID' });
    }

    // Create new game document
    const newGame = new Game({
      gameId,
      creator: {
        user: creatorId,
        username: creatorName
      },
      players: [{
        user: creatorId,
        username: creatorName,
        position: 0,
        chips: 0,
        totalChips: Math.min(user.balance, 1000),
        hand: [],
        isActive: true,
        hasFolded: false,
        hasActed: false,
        isAllIn: false
      }],
      status: 'waiting',
      pot: 0,
      deck: [],
      communityCards: [],
      dealerPosition: 0,
      smallBlindPosition: 0,
      bigBlindPosition: 1,
      currentBet: 0,
      minBet: 1, // 1 chip = 500 rupiah
      bettingRound: 'preflop',
      handNumber: 0,
      actionHistory: [],
      handResults: []
    });

    // Save the game
    console.log('Saving new game:', { gameId, creatorId, creatorName });
    await newGame.save();

    // Return the game ID
    console.log('Game created successfully:', gameId);
    res.json({ gameId });
  } catch (err) {
    console.error('Create game error:', err);
    console.error(err.stack);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Get a game by ID
exports.getGame = async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Find the game with better projection to fetch only necessary fields
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }

    // Return a sanitized version of the game (without cards)
    const sanitizedGame = gameLogic.getSanitizedGameState(game);
    res.json(sanitizedGame);
  } catch (err) {
    console.error('Get game error:', err.message);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Join a game
exports.joinGame = async (req, res) => {
  try {
    const gameId = req.params.id;
    const { playerId, playerName } = req.body;

    // Ensure the player ID matches the authenticated user
    if (playerId !== req.user.id) {
      return res.status(403).json({ msg: 'Player ID does not match authenticated user' });
    }

    // Find the game - with better projection to fetch only necessary fields
    const game = await Game.findOne(
      { gameId },
      'gameId status players creator'
    );
    
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }

    // Quick validation checks
    if (game.status !== 'waiting') {
      return res.status(400).json({ msg: 'Game already started' });
    }

    if (game.players.some(player => player.user.toString() === playerId)) {
      // Player already joined - return success instead of error to avoid issues
      return res.json({ success: true, alreadyJoined: true });
    }

    if (game.players.length >= 8) {
      return res.status(400).json({ msg: 'Game is full' });
    }

    // Find the user with minimal projection
    const user = await User.findById(playerId, 'balance');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Add player to the game
    game.players.push({
      user: playerId,
      username: playerName,
      position: game.players.length,
      chips: 0,
      totalChips: Math.min(user.balance, 1000), // Cap at 1000 chips
      hand: [],
      isActive: true,
      hasFolded: false,
      hasActed: false,
      isAllIn: false
    });

    // Save the updated game
    await game.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Join game error:', err.message);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Start a game
exports.startGame = async (req, res) => {
  try {
    const gameId = req.params.id;
    const { playerId } = req.body;

    // Ensure the player ID matches the authenticated user
    if (playerId !== req.user.id) {
      return res.status(403).json({ msg: 'Player ID does not match authenticated user' });
    }

    // Find the game
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }

    // Check if player is the creator
    if (game.creator.user.toString() !== playerId) {
      return res.status(403).json({ msg: 'Only the creator can start the game' });
    }

    // Check if enough players (at least 2)
    if (game.players.length < 2) {
      return res.status(400).json({ msg: 'Need at least 2 players to start' });
    }

    // Update game status
    game.status = 'active';
    game.bettingRound = 'preflop';
    game.dealerPosition = 0; // First player is dealer for first hand
    
    // Save the updated game
    await game.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Start game error:', err.message);
    res.status(500).send('Server error');
  }
};

// Get all active games
exports.getActiveGames = async (req, res) => {
  try {
    // Find all active games
    const games = await Game.find({ status: { $in: ['waiting', 'active'] } })
      .select('gameId creator players status createdAt')
      .sort({ createdAt: -1 });
      
    // Return a sanitized list
    const sanitizedGames = games.map(game => ({
      id: game.gameId,
      creator: game.creator.username,
      playerCount: game.players.length,
      status: game.status,
      createdAt: game.createdAt
    }));
      
    res.json(sanitizedGames);
  } catch (err) {
    console.error('Get active games error:', err.message);
    res.status(500).send('Server error');
  }
};

// Get user's games
exports.getUserGames = async (req, res) => {
  try {
    // Find games where user is a player
    const games = await Game.find({ 
      'players.user': req.user.id 
    })
    .select('gameId creator players status createdAt updatedAt');
    
    // Return sanitized list
    const sanitizedGames = games.map(game => {
      // Find the user's player object in this game
      const player = game.players.find(p => p.user.toString() === req.user.id);
      
      return {
        id: game.gameId,
        creator: game.creator.username,
        playerCount: game.players.length,
        status: game.status,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        yourChips: player ? player.totalChips : 0,
        isCreator: game.creator.user.toString() === req.user.id
      };
    });
    
    res.json(sanitizedGames);
  } catch (err) {
    console.error('Get user games error:', err.message);
    res.status(500).send('Server error');
  }
};

// End a game
exports.endGame = async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Find the game
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }
    
    // Check if player is the creator
    if (game.creator.user.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Only the creator can end the game' });
    }
    
    // Update game status
    game.status = 'completed';
    
    // Update player balances based on current chips
    for (const player of game.players) {
      // Skip inactive players
      if (!player.isActive) continue;
      
      try {
        await User.findByIdAndUpdate(player.user, {
          $inc: { balance: player.totalChips }
        });
      } catch (error) {
        console.error(`Error updating balance for player ${player.username}:`, error);
      }
    }
    
    // Save the updated game
    await game.save();
    
    res.json({ success: true });
  } catch (err) {
    console.error('End game error:', err.message);
    res.status(500).send('Server error');
  }
};

// Get game results
exports.getGameResults = async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Find the game
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }
    
    // Check if player is in the game
    const isPlayerInGame = game.players.some(p => p.user.toString() === req.user.id);
    if (!isPlayerInGame) {
      return res.status(403).json({ msg: 'You are not a player in this game' });
    }
    
    // Return game results
    const results = {
      gameId: game.gameId,
      status: game.status,
      handResults: game.handResults,
      players: game.players.map(player => ({
        id: player.user,
        username: player.username,
        finalChips: player.totalChips,
        isActive: player.isActive
      }))
    };
    
    res.json(results);
  } catch (err) {
    console.error('Get game results error:', err.message);
    res.status(500).send('Server error');
  }
};