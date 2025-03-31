// server/controllers/authController.js
const jwt = require('jsonwebtoken');
const config = require('config');
const User = require('../models/User');
const Game = require('../models/Game');

// Register a new user
exports.registerUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({ msg: 'Please provide username and password' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ msg: 'Username must be between 3 and 20 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create new user
    user = new User({
      username,
      password,
      balance: 1000, // Start with 1000 chips (500,000 rupiah)
      gamesPlayed: 0,
      gamesWon: 0
    });

    // Save user to database
    await user.save();

    // Create JWT payload
    const payload = {
      user: {
        id: user.id
      }
    };

    // Sign the JWT
    jwt.sign(
      payload,
      config.get('jwtSecret'),
      { expiresIn: '7d' }, // Tokens valid for 7 days
      (err, token) => {
        if (err) throw err;
        res.json({ 
          token, 
          user: {
            id: user.id,
            username: user.username,
            balance: user.balance
          } 
        });
      }
    );
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Login user
exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({ msg: 'Please provide username and password' });
    }

    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Create JWT payload
    const payload = {
      user: {
        id: user.id
      }
    };

    // Sign the JWT
    jwt.sign(
      payload,
      config.get('jwtSecret'),
      { expiresIn: '7d' }, // Tokens valid for 7 days
      (err, token) => {
        if (err) throw err;
        res.json({ 
          token, 
          user: {
            id: user.id,
            username: user.username,
            balance: user.balance,
            gamesPlayed: user.gamesPlayed,
            gamesWon: user.gamesWon
          } 
        });
      }
    );
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get user data
exports.getUser = async (req, res) => {
  try {
    // Find user by ID and exclude password
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Return user data
    res.json({
      id: user.id,
      username: user.username,
      balance: user.balance,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      createdAt: user.createdAt
    });
  } catch (err) {
    console.error('Get user error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Update user balance
exports.updateBalance = async (req, res) => {
  try {
    const { balance } = req.body;
    
    // Validate input
    if (balance === undefined || typeof balance !== 'number') {
      return res.status(400).json({ msg: 'Valid balance is required' });
    }
    
    // Find and update user
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { balance },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      balance: user.balance,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon
    });
  } catch (err) {
    console.error('Update balance error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    const updates = {};
    
    // Find the user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Update username if provided
    if (username && username !== user.username) {
      // Check if username already exists
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ msg: 'Username already in use' });
      }
      
      // Validate username
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ msg: 'Username must be between 3 and 20 characters' });
      }
      
      updates.username = username;
    }
    
    // Update password if provided
    if (newPassword) {
      // Verify current password
      if (!currentPassword) {
        return res.status(400).json({ msg: 'Current password is required' });
      }
      
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ msg: 'Current password is incorrect' });
      }
      
      // Validate new password
      if (newPassword.length < 6) {
        return res.status(400).json({ msg: 'New password must be at least 6 characters' });
      }
      
      user.password = newPassword;
      await user.save(); // Need to save to trigger password hashing middleware
    }
    
    // Apply other updates if any
    if (Object.keys(updates).length > 0) {
      Object.assign(user, updates);
      await user.save();
    }
    
    // Return updated user data
    res.json({
      id: user.id,
      username: user.username,
      balance: user.balance,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Calculate win rate
    const winRate = user.gamesPlayed > 0 
      ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1) 
      : 0;
      
    // Get last 10 games (could expand this to add more detailed stats)
    const recentGames = await Game.find({ 
      'players.user': req.user.id 
    })
    .select('gameId status handResults players createdAt')
    .sort({ createdAt: -1 })
    .limit(10);
    
    // Process recent games to extract results
    const gameResults = recentGames.map(game => {
      const player = game.players.find(p => p.user.toString() === req.user.id);
      const initialChips = 1000; // Assuming starting chips is 1000
      
      return {
        gameId: game.gameId,
        status: game.status,
        createdAt: game.createdAt,
        endedAt: game.status === 'completed' ? game.updatedAt : null,
        finalChips: player ? player.totalChips : 0,
        profit: player ? player.totalChips - initialChips : -initialChips,
        handsPlayed: game.handResults.length,
        handsWon: game.handResults.filter(hr => 
          hr.winners.some(w => w.toString() === req.user.id)
        ).length
      };
    });
    
    // Return stats
    res.json({
      username: user.username,
      balance: user.balance,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      winRate: `${winRate}%`,
      recentGames: gameResults
    });
  } catch (err) {
    console.error('Get user stats error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};