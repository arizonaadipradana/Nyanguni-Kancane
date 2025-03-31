// server/routes/config.js
const express = require('express');
const router = express.Router();
const config = require('config');
const path = require('path');
const fs = require('fs');

/**
 * @route   GET api/config
 * @desc    Get application configuration with dynamic URL support
 * @access  Public
 */
router.get('/', (req, res) => {
  // First, check if we have a ngrok URL set globally
  const serverUrl = global.ngrokUrl || 
                    process.env.SERVER_URL || 
                    config.get('serverUrl') || 
                    'http://localhost:3000';
  
  // Determine the client URL
  const clientUrl = process.env.CLIENT_URL || 
                   config.get('clientUrl') || 
                   'http://localhost:8080';
  
  // Get client origin from request headers for CORS support
  const clientOrigin = req.headers.origin || clientUrl;
  
  // Game rules
  const rules = {
    minPlayers: 2,
    maxPlayers: 8,
    startingChips: 1000,
    chipValue: 500, // rupiah per chip
    minBet: 1
  };
  
  // Log the source of the request
  console.log(`Config requested from: ${clientOrigin}`);
  
  // Return configuration to the client
  const configData = {
    apiUrl: serverUrl,
    socketUrl: serverUrl,
    clientUrl: clientUrl,
    requestedFrom: clientOrigin,
    isNgrok: !!global.ngrokUrl,
    env: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    rules: rules,
    timestamp: new Date().toISOString()
  };
  
  // Log the configuration being sent
  console.log('Sending config:', {
    apiUrl: configData.apiUrl,
    socketUrl: configData.socketUrl,
    isNgrok: configData.isNgrok,
    env: configData.env
  });
  
  res.json(configData);
});

// Also add a static config endpoint for initial loading
const staticConfigPath = path.join(__dirname, '..', 'public', 'config.json');

/**
 * Update the static config file
 * @param {Object} configData - Configuration data to write
 */
function updateStaticConfig(configData) {
  try {
    // Ensure the public directory exists
    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    fs.writeFileSync(staticConfigPath, JSON.stringify(configData, null, 2));
    console.log('Static configuration updated');
  } catch (error) {
    console.error('Failed to update static config:', error);
  }
}

// Update static config on server start with current settings
const serverUrl = global.ngrokUrl || 
                  process.env.SERVER_URL || 
                  config.get('serverUrl') || 
                  'http://localhost:3000';

updateStaticConfig({
  apiUrl: serverUrl,
  socketUrl: serverUrl,
  env: process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '1.0.0',
  timestamp: new Date().toISOString()
});

module.exports = router;