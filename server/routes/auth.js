// server/routes/auth.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

// @route   POST api/auth/register
// @desc    Register a user
// @access  Public
router.post('/register', authController.registerUser);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', authController.loginUser);

// @route   GET api/auth/user
// @desc    Get user data
// @access  Private
router.get('/user', auth, authController.getUser);

// @route   PUT api/auth/balance
// @desc    Update user balance
// @access  Private
router.put('/balance', auth, authController.updateBalance);

// @route   PUT api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, authController.updateProfile);

// @route   GET api/auth/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', auth, authController.getUserStats);

module.exports = router;