// server/routes/games.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const gameController = require('../controllers/gameController');

// @route   GET api/games
// @desc    Get all active games
// @access  Private
router.get('/', auth, gameController.getActiveGames);

// @route   GET api/games/user
// @desc    Get user's games
// @access  Private
router.get('/user', auth, gameController.getUserGames);

// @route   POST api/games
// @desc    Create a new game
// @access  Private
router.post('/', auth, gameController.createGame);

// @route   GET api/games/:id
// @desc    Get game details
// @access  Private
router.get('/:id', auth, gameController.getGame);

// @route   POST api/games/join/:id
// @desc    Join an existing game
// @access  Private
router.post('/join/:id', auth, gameController.joinGame);

// @route   POST api/games/start/:id
// @desc    Start a game
// @access  Private
router.post('/start/:id', auth, gameController.startGame);

// @route   PUT api/games/end/:id
// @desc    End a game
// @access  Private
router.put('/end/:id', auth, gameController.endGame);

// @route   GET api/games/results/:id
// @desc    Get game results
// @access  Private
router.get('/results/:id', auth, gameController.getGameResults);

//@route   POST api/games/clean-all
//@desc    Clean duplicate players from all active games
//@access  Private/Admin
router.post('/clean-all', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    
    // Clean all games
    const debugging = require('../utils/debugging');
    const result = await debugging.cleanAllGames();
    
    // Return the result
    res.json(result);
  } catch (err) {
    console.error('Clean all games error:', err.message);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;