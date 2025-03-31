// server/controllers/gameController.js
const crypto = require('crypto');
const Game = require('../models/Game');
const User = require('../models/User');

// Generate a random 6-character game ID
const generateGameId = () => {
  return crypto.randomBytes(3).toString('hex');
};

// @desc    Create a new game
// @route   POST /api/games
// @access  Private
exports.createGame = async (req, res) => {
  try {
    const { creatorId, creatorName } = req.body;
    
    // Validate required input
    if (!creatorId || !creatorName) {
      console.log('Create game error: Missing required fields', { creatorId, creatorName });
      return res.status(400).json({ msg: 'Creator ID and name are required' });
    }

    // Ensure the creator ID matches the authenticated user
    if (creatorId !== req.user.id) {
      console.log('Create game error: Creator ID mismatch', { creatorId, userId: req.user.id });
      return res.status(403).json({ msg: 'Creator ID does not match authenticated user' });
    }

    // Generate a unique game ID
    let gameId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      gameId = generateGameId();
      const existingGame = await Game.findOne({ gameId });
      if (!existingGame) {
        isUnique = true;
      }
      attempts++;
    }
    
    if (!isUnique) {
      console.log('Create game error: Failed to generate unique game ID');
      return res.status(500).json({ msg: 'Failed to generate unique game ID' });
    }
    
    // Find the creator user
    const user = await User.findById(creatorId);
    if (!user) {
      console.log('Create game error: User not found', { creatorId });
      return res.status(404).json({ msg: 'User not found' });
    }

    // Create new game
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
        totalChips: user.balance > 1000 ? 1000 : user.balance,
        hand: [],
        isActive: true,
        hasFolded: false,
        hasActed: false
      }],
      status: 'waiting',
      pot: 0,
      deck: [],
      communityCards: [],
      smallBlindPosition: 0,
      bigBlindPosition: 1,
      currentBet: 0,
      minBet: 1
    });

    // Save the game
    console.log('Saving new game:', { gameId, creatorId, creatorName });
    await newGame.save();

    res.json({ gameId });
  } catch (err) {
    console.error('Create game error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// @desc    Get a game by ID
// @route   GET /api/games/:id
// @access  Private
exports.getGame = async (req, res) => {
  try {
    const gameId = req.params.id;
    
    // Find the game
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }

    // Return a sanitized version of the game (without cards)
    const sanitizedGame = {
      id: game.gameId,
      creator: game.creator,
      players: game.players.map(player => ({
        id: player.user,
        username: player.username,
        chips: player.chips,
        totalChips: player.totalChips,
        isActive: player.isActive,
        hasFolded: player.hasFolded,
        hasActed: player.hasActed,
        hasCards: player.hand.length > 0
      })),
      status: game.status,
      createdAt: game.createdAt,
      pot: game.pot,
      communityCards: game.communityCards,
      currentTurn: game.currentTurn,
      currentBet: game.currentBet
    };

    res.json(sanitizedGame);
  } catch (err) {
    console.error('Get game error:', err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Join a game
// @route   POST /api/games/join/:id
// @access  Private
exports.joinGame = async (req, res) => {
  try {
    const gameId = req.params.id;
    const { playerId, playerName } = req.body;

    // Find the game
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }

    // Check if game is joinable
    if (game.status !== 'waiting') {
      return res.status(400).json({ msg: 'Game already started' });
    }

    // Check if player is already in the game
    if (game.players.some(player => player.user.toString() === playerId)) {
      return res.status(400).json({ msg: 'Already joined this game' });
    }

    // Check if game is full (max 8 players)
    if (game.players.length >= 8) {
      return res.status(400).json({ msg: 'Game is full' });
    }

    // Find the user
    const user = await User.findById(playerId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Add player to the game
    game.players.push({
      user: playerId,
      username: playerName,
      position: game.players.length,
      chips: 0,
      totalChips: user.balance > 1000 ? 1000 : user.balance,
      hand: [],
      isActive: true,
      hasFolded: false,
      hasActed: false
    });

    // Save the updated game
    await game.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Join game error:', err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Start a game
// @route   POST /api/games/start/:id
// @access  Private
exports.startGame = async (req, res) => {
  try {
    const gameId = req.params.id;
    const { playerId } = req.body;

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
    
    // Save the updated game
    await game.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Start game error:', err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Get all active games
// @route   GET /api/games
// @access  Private
exports.getActiveGames = async (req, res) => {
  try {
    // Find all active games
    const games = await Game.find({ status: 'active' })
      .select('gameId creator players status createdAt')
      .sort({ createdAt: -1 });
      
    res.json(games);
  } catch (err) {
    console.error('Get active games error:', err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Get user's games
// @route   GET /api/games/user
// @access  Private
exports.getUserGames = async (req, res) => {
  try {
    // Find games where user is a player
    const games = await Game.find({ 
      'players.user': req.user.id 
    })
    .select('gameId creator players status createdAt')
    .sort({ createdAt: -1 });
    
    res.json(games);
  } catch (err) {
    console.error('Get user games error:', err.message);
    res.status(500).send('Server error');
  }
};

// @desc    End a game
// @route   PUT /api/games/end/:id
// @access  Private
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
    
    // Save the updated game
    await game.save();
    
    res.json({ success: true });
  } catch (err) {
    console.error('End game error:', err.message);
    res.status(500).send('Server error');
  }
};