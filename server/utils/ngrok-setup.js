// server/utils/ngrok-setup.js
const ngrok = require("ngrok");

// Setup ngrok tunnel
async function setupNgrok(port) {
  try {
    console.log(`Setting up ngrok tunnel to port ${port}...`);

    // Set authtoken if provided in environment
    const authtoken = process.env.NGROK_AUTHTOKEN;

    const url = await ngrok.connect({
      proto: "http",
      addr: port,
      authtoken,
      region: "us",
      onStatusChange: (status) => {
        console.log(`Ngrok Status: ${status}`);
      },
      onLogEvent: (logEvent) => {
        if (process.env.DEBUG) {
          console.log(`Ngrok Log: ${logEvent}`);
        }
      },
    });

    console.log(`⭐ Ngrok tunnel established at: ${url}`);
    global.ngrokUrl = url;

    return url;
  } catch (error) {
    console.error("Error setting up ngrok tunnel:", error);
    throw error;
  }
}

// Clean up function to close ngrok when server shuts down
async function closeNgrok() {
  try {
    await ngrok.kill();
    console.log("Ngrok tunnel closed");
  } catch (error) {
    console.error("Error closing ngrok tunnel:", error);
  }
}

module.exports = {
  setupNgrok,
  closeNgrok,
};
