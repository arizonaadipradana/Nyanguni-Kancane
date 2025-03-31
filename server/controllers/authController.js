// server/controllers/authController.js
const jwt = require('jsonwebtoken');
const config = require('config');
const User = require('../models/User');

exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

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
      { expiresIn: '1d' },
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
    console.error('Login error:', err.message);
    res.status(500).send('Server error');
  }
};


// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.registerUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user already exists
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create new user
    user = new User({
      username,
      password
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
      { expiresIn: '1d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

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
      { expiresIn: '1d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Get user data
// @route   GET /api/auth/user
// @access  Private
exports.getUser = async (req, res) => {
  try {
    // Find user by ID and exclude password
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Make sure we send a well-structured user object
    res.json({
      id: user._id,
      username: user.username,
      balance: user.balance,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      createdAt: user.createdAt
    });
  } catch (err) {
    console.error('Get user error:', err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Update user balance
// @route   PUT /api/auth/balance
// @access  Private
exports.updateBalance = async (req, res) => {
  try {
    const { balance } = req.body;
    
    // Find and update user
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { balance },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Update balance error:', err.message);
    res.status(500).send('Server error');
  }
};