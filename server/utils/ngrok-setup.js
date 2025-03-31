// server/utils/ngrok-setup.js
// This is a utility file to handle ngrok setup and configuration

const ngrok = require('ngrok');
const fs = require('fs');
const path = require('path');

/**
 * Initialize ngrok tunnel
 * @param {number} port - The port to expose
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - The public URL
 */
async function setupNgrok(port, options = {}) {
  try {
    // Default options
    const ngrokOptions = {
      addr: port,
      ...options
    };

    // Add authtoken if available
    if (process.env.NGROK_AUTHTOKEN) {
      ngrokOptions.authtoken = process.env.NGROK_AUTHTOKEN;
    }

    // Configure region if specified
    if (process.env.NGROK_REGION) {
      ngrokOptions.region = process.env.NGROK_REGION;
    }

    // Set up basic auth if credentials provided
    if (process.env.NGROK_USERNAME && process.env.NGROK_PASSWORD) {
      ngrokOptions.auth = `${process.env.NGROK_USERNAME}:${process.env.NGROK_PASSWORD}`;
    }

    // Start ngrok
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

    // Save URL to a file for reference
    const infoPath = path.join(__dirname, '..', 'ngrok-info.json');
    fs.writeFileSync(infoPath, JSON.stringify({
      url,
      started: new Date().toISOString()
    }, null, 2));

    // Store URL globally for other parts of the application
    global.ngrokUrl = url;
    
    return url;
  } catch (error) {
    console.error('Failed to start ngrok tunnel:', error);
    throw error;
  }
}

/**
 * Close the ngrok tunnel
 */
async function closeNgrok() {
  try {
    await ngrok.kill();
    console.log('Ngrok tunnel closed');
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