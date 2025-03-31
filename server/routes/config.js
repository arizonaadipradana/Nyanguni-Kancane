// server/routes/config.js
const express = require('express');
const router = express.Router();
const config = require('config');

/**
 * @route   GET api/config
 * @desc    Get application configuration
 * @access  Public
 */
router.get('/', (req, res) => {
  // Determine the base server URL
  const serverUrl = global.ngrokUrl || 
                    process.env.SERVER_URL || 
                    config.get('serverUrl') || 
                    'http://localhost:3000';
  
  // Determine the client URL
  const clientUrl = process.env.CLIENT_URL || 
                   config.get('clientUrl') || 
                   'http://localhost:8080';
  
  // Game rules
  const rules = {
    minPlayers: 2,
    maxPlayers: 8,
    startingChips: 1000,
    chipValue: 500, // rupiah per chip
    minBet: 1
  };
  
  // Return configuration to the client
  res.json({
    apiUrl: serverUrl,
    socketUrl: serverUrl,
    clientUrl: clientUrl,
    env: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    rules: rules
  });
});

module.exports = router;