// server/utils/ngrok-setup.js
const ngrok = require('ngrok');
const fs = require('fs');
const path = require('path');

/**
 * Initialize ngrok tunnel with better error handling and configuration
 * @param {number} port - The port to expose
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - The public URL
 */
async function setupNgrok(port, options = {}) {
  try {
    // Default options
    const ngrokOptions = {
      addr: port,
      region: 'us', // Default region
      ...options
    };

    // Add authtoken if available
    if (process.env.NGROK_AUTHTOKEN) {
      console.log('Using ngrok with auth token');
      ngrokOptions.authtoken = process.env.NGROK_AUTHTOKEN;
    } else {
      console.log('Running ngrok without auth token (limited to 1 session and 2 hours)');
    }

    // Set up basic auth if credentials provided
    if (process.env.NGROK_USERNAME && process.env.NGROK_PASSWORD) {
      ngrokOptions.auth = `${process.env.NGROK_USERNAME}:${process.env.NGROK_PASSWORD}`;
      console.log('ngrok basic authentication enabled');
    }

    // Start ngrok with improved error handling
    console.log('Starting ngrok tunnel...');
    const url = await ngrok.connect(ngrokOptions);
    
    // Success
    console.log(`
    ================================================
      NGROK TUNNEL ACTIVE
    ------------------------------------------------
      ✅ Public URL: ${url}
      ✅ Local port: ${port}
    ================================================
    `);

    // Save URL to a file for reference and for the client
    const infoPath = path.join(__dirname, '..', 'ngrok-info.json');
    fs.writeFileSync(infoPath, JSON.stringify({
      url,
      started: new Date().toISOString()
    }, null, 2));

    // Store URL globally for other parts of the application to use
    global.ngrokUrl = url;
    
    // Create a config endpoint file that the client can fetch
    const configPath = path.join(__dirname, '..', 'public', 'config.json');
    const configData = {
      apiUrl: url,
      socketUrl: url,
      env: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
    
    // Ensure the public directory exists
    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    console.log('Configuration written to public/config.json for client access');
    
    return url;
  } catch (error) {
    console.error('Failed to start ngrok tunnel:', error);
    throw error;
  }
}

/**
 * Setup ngrok tunnel and make it available globally
 * @param {number} port - Port to expose
 * @returns {Promise<string>} The public ngrok URL
 */
exports.setupNgrok = async (port) => {
  try {
    // Connect to ngrok
    const url = await ngrok.connect({
      proto: 'http',
      addr: port,
      region: 'us', // Choose your region
      // Add your authtoken if you have one
      // authtoken: process.env.NGROK_AUTH_TOKEN,
      onStatusChange: status => {
        console.log(`Ngrok status changed: ${status}`);
      },
      onLogEvent: log => {
        if (log.includes('error') || log.includes('warn')) {
          console.log(`Ngrok log: ${log}`);
        }
      }
    });

    // Store URL globally so other modules can access it
    global.ngrokUrl = url;
    console.log(`Ngrok tunnel established: ${url}`);

    // Create a file that stores the ngrok URL for the client to read
    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const ngrokInfoPath = path.join(publicDir, 'ngrok-info.json');
    fs.writeFileSync(
      ngrokInfoPath,
      JSON.stringify({ 
        url, 
        timestamp: new Date().toISOString() 
      }, null, 2)
    );

    // Update the static config file
    updateStaticConfig(url);

    return url;
  } catch (error) {
    console.error('Error setting up ngrok:', error);
    throw error;
  }
};

/**
 * Close the ngrok tunnel
 */
async function closeNgrok() {
  try {
    await ngrok.kill();
    console.log('Ngrok tunnel closed');
    global.ngrokUrl = null;
  } catch (error) {
    console.error('Error closing ngrok tunnel:', error);
  }
}

// Register graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down ngrok tunnel...');
  await closeNgrok();
  process.exit(0);
});

module.exports = {
  setupNgrok,
  closeNgrok
};