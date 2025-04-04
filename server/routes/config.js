// server/routes/config.js
const express = require('express');
const router = express.Router();
const config = require('config');
const path = require('path');
const fs = require('fs');

/**
 * @route   GET api/config
 * @desc    Get application configuration
 * @access  Public
 */
router.get('/', (req, res) => {
  // Check if ngrok URL is available globally from ngrok-setup.js
  const ngrokUrl = global.ngrokUrl;
  
  // Get client origin from request headers for CORS support
  const clientOrigin = req.headers.origin || '';
  const isClientOnNgrok = clientOrigin.includes('ngrok-free.app');
  
  // Use appropriate server and client URLs based on the environment
  let serverUrl, clientUrl;
  
  if (ngrokUrl) {
    // If we have an ngrok URL, use it
    serverUrl = ngrokUrl;
    clientUrl = ngrokUrl;
  } else if (isClientOnNgrok) {
    // If client is on ngrok but we don't have an ngrok URL, use client origin
    serverUrl = clientOrigin;
    clientUrl = clientOrigin;
  } else {
    // Fallback to localhost URLs
    serverUrl = 'http://localhost:5000';
    clientUrl = 'http://localhost:8080';
  }
  
  // Log the source of the request
  console.log(`Config requested from: ${clientOrigin}`);
  
  // Return configuration to the client
  const configData = {
    apiUrl: serverUrl,
    socketUrl: serverUrl,
    clientUrl: clientUrl,
    requestedFrom: clientOrigin,
    isNgrok: !!ngrokUrl || isClientOnNgrok,
    env: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    rules: {
      minPlayers: 2,
      maxPlayers: 8,
      startingChips: 1000,
      chipValue: 500,
      minBet: 1
    },
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

/**
 * @route   GET api/config/test-connection
 * @desc    Test connection and CORS configuration
 * @access  Public
 */
router.get('/test-connection', (req, res) => {
  // Capture all request details for diagnostics
  const requestInfo = {
    headers: req.headers,
    origin: req.headers.origin || 'Unknown',
    host: req.headers.host,
    protocol: req.protocol,
    method: req.method,
    path: req.path,
    ngrokUrl: global.ngrokUrl || 'Not configured',
    serverTime: new Date().toISOString(),
    corsEnabled: true
  };
  
  console.log('Connection test request from:', requestInfo.origin);
  
  res.json({
    success: true,
    message: 'Connection test successful',
    serverInfo: {
      environment: process.env.NODE_ENV || 'development',
      ngrokEnabled: !!global.ngrokUrl,
      ngrokUrl: global.ngrokUrl
    },
    clientInfo: requestInfo
  });
});

// Update static config file for initial loading
const staticConfigPath = path.join(__dirname, '..', 'public', 'config.json');

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

// Update static config with local settings & ngrok if available
updateStaticConfig({
  apiUrl: global.ngrokUrl || 'http://localhost:5000',
  socketUrl: global.ngrokUrl || 'http://localhost:5000',
  env: process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '1.0.0',
  isNgrok: !!global.ngrokUrl,
  timestamp: new Date().toISOString()
});

// Add watcher to update static config when ngrok URL changes
if (process.env.NODE_ENV !== 'production') {
  // Check every 10 seconds if ngrok URL has changed and update static config
  setInterval(() => {
    if (global.ngrokUrl) {
      updateStaticConfig({
        apiUrl: global.ngrokUrl,
        socketUrl: global.ngrokUrl,
        env: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        isNgrok: true,
        timestamp: new Date().toISOString()
      });
    }
  }, 10000);
}

module.exports = router;