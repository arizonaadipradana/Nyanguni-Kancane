// client/src/services/SocketService.js
import io from "socket.io-client";
import store from "../store";
import { loadConfig } from "./config";

/**
 * Service for handling Socket.IO connections
 */
// Define a map to track the last update time for each game
const lastUpdateTime = {};

class SocketService {
  constructor() {
    this.socket = null;
    this.gameSocket = null;
    this.isConnected = false;
    this.events = {};
    this.connectionPromise = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.connectionTimeout = null;
    this.reconnectInfo = null;
  }

  /**
   * Initialize and connect to socket server
   * @returns {Promise} Promise that resolves when connected
   */
  /**
   * Initialize and connect to socket server with improved error handling
   * @returns {Promise} Promise that resolves when connected
   */
  async init() {
    // Clear any existing timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // If we already have a connection promise, return it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // If we're already connected, resolve immediately
    if (this.isConnected && this.gameSocket) {
      return Promise.resolve(this.gameSocket);
    }

    // Create a connection promise with timeout handling
    this.connectionPromise = new Promise((resolve, reject) => {
      // Set a timeout to prevent hanging connections
      this.connectionTimeout = setTimeout(() => {
        console.error("Socket connection timeout after 10 seconds");
        this.connectionPromise = null;
        reject(new Error("Connection timeout"));
      }, 10000);

      const setupConnection = async () => {
        try {
          // Load configuration to get the socket URL
          const config = await loadConfig();

          // Get the socket URL from config
          const socketUrl = config.socketUrl || window.location.origin;
          console.log("Connecting to socket server at:", socketUrl);

          // If there's an existing socket, disconnect it
          if (this.gameSocket) {
            this.gameSocket.disconnect();
            this.gameSocket = null;
          }

          // Try to determine if browser supports websockets
          const supportsWebsockets =
            "WebSocket" in window && window.WebSocket.CLOSING === 2;

          // Connect to game namespace with optimized settings based on browser support
          this.gameSocket = io(`${socketUrl}/game`, {
            transports: supportsWebsockets
              ? ["websocket"]
              : ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 8000,
            autoConnect: true,
            withCredentials: true,
            forceNew: true,
          });

          // Add connection event listener
          this.gameSocket.on("connect", () => {
            console.log(
              "Connected to game socket with ID:",
              this.gameSocket.id
            );
            console.log(
              "Using transport:",
              this.gameSocket.io.engine.transport.name
            );
            this.isConnected = true;
            this.connectionAttempts = 0;

            // Clear the connection timeout
            if (this.connectionTimeout) {
              clearTimeout(this.connectionTimeout);
              this.connectionTimeout = null;
            }

            // Register user if available
            const user = store.getters.currentUser;
            if (user && user.id) {
              this.registerUser(user.id);
            }

            resolve(this.gameSocket);
          });

          // Add connection error listener with more details
          this.gameSocket.on("connect_error", (error) => {
            console.error("Socket connection error:", error);

            // Increment connection attempts
            this.connectionAttempts++;

            if (this.connectionAttempts >= this.maxConnectionAttempts) {
              if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
              }
              this.connectionPromise = null;
              reject(
                new Error(
                  `Failed to connect after ${this.maxConnectionAttempts} attempts`
                )
              );
            }
          });

          // Add disconnect listener
          this.gameSocket.on("disconnect", (reason) => {
            console.log("Disconnected from game socket. Reason:", reason);
            this.isConnected = false;

            // Reset connection promise if disconnected permanently
            if (
              reason === "io server disconnect" ||
              reason === "transport close"
            ) {
              this.connectionPromise = null;
            }
          });

          // Set up game event listeners
          this.setupGameListeners();
        } catch (error) {
          console.error("Error during socket setup:", error);

          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }

          this.connectionPromise = null;
          reject(error);
        }
      };

      // Execute the setup function
      setupConnection();
    });

    return this.connectionPromise;
  }

  /**
   * Register user with socket
   * @param {string} userId - User ID
   */
  registerUser(userId) {
    if (!userId) {
      console.warn("Cannot register user - no userId provided");
      return;
    }

    if (!this.gameSocket) {
      console.warn("Cannot register user - socket not initialized");
      return this.init().then(() => this.registerUser(userId));
    }

    if (!this.isConnected) {
      console.warn("Socket not connected, will register when connected");

      // Add a one-time connect listener to register when connected
      this.gameSocket.once("connect", () => {
        this.registerUser(userId);
      });

      return;
    }

    this.gameSocket.emit("register", { userId });
    console.log(`Registered user ${userId} with socket`);
  }

  /**
   * Join a game room
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @returns {Promise} Promise that resolves when joined
   */
  async joinGame(gameId, userId, username) {
    if (!gameId || !userId || !username) {
      throw new Error("Missing required parameters for joinGame");
    }

    // Make sure socket is initialized and connected with timeout
    try {
      // First initialize socket connection
      await this.init();

      // Then create promise for game joining
      const joinPromise = new Promise((resolve, reject) => {
        // Set a timeout for the join operation
        const joinTimeout = setTimeout(() => {
          reject(new Error("Join game timeout after 8 seconds"));
        }, 8000);

        // Set up a one-time event listener for join confirmation
        this.gameSocket.once("gameUpdate", () => {
          clearTimeout(joinTimeout);
          resolve(true);
        });

        // Also listen for errors
        const errorHandler = (error) => {
          clearTimeout(joinTimeout);
          reject(error);
        };

        this.gameSocket.once("gameError", errorHandler);

        console.log(`Joining game ${gameId} as ${username} (${userId})`);

        // Join the game room
        this.gameSocket.emit("joinGame", {
          gameId,
          userId,
          username,
        });

        // Request game state update as a backup
        setTimeout(() => {
          this.requestGameUpdate(gameId, userId);
        }, 500);
      });

      return await joinPromise;
    } catch (error) {
      console.error("Error joining game:", error);
      throw error;
    }
  }

  /**
   * Start a game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise} Promise that resolves when game starts
   */
  startGame(gameId, userId) {
    // First initialize the socket, then handle the game start
    return this.init()
      .then(() => {
        return new Promise((resolve, reject) => {
          if (!gameId || !userId) {
            return reject(
              new Error("Missing required parameters for startGame")
            );
          }

          if (!this.gameSocket || !this.isConnected) {
            return reject(new Error("Socket not connected"));
          }

          console.log(`Emitting startGame event for game ${gameId}`);

          // Set a timeout for the operation
          const startTimeout = setTimeout(() => {
            reject(new Error("Start game timeout after 10 seconds"));
          }, 10000);

          // Set up a one-time event listener for confirmation
          this.gameSocket.once("gameStarted", (data) => {
            console.log("Received gameStarted event:", data);
            clearTimeout(startTimeout);
            resolve(data);
          });

          // Also listen for errors
          const errorHandler = (error) => {
            console.error("Game error during start:", error);
            clearTimeout(startTimeout);
            reject(error);
          };

          this.gameSocket.once("gameError", errorHandler);

          // Emit the start game event
          this.gameSocket.emit("startGame", {
            gameId,
            userId,
          });

          // Also emit a simple log message for debugging
          this.gameSocket.emit("chatMessage", {
            gameId,
            userId,
            username: "System",
            message: "Starting game...",
          });
        });
      })
      .catch((error) => {
        console.error("Error in startGame:", error);
        throw error;
      });
  }

  /**
   * Leave a game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   */
  leaveGame(gameId, userId) {
    if (!gameId || !userId) {
      console.warn("Cannot leave game - missing required parameters");
      return;
    }

    if (!this.gameSocket || !this.isConnected) {
      console.warn("Cannot leave game - socket not connected");
      return;
    }

    console.log(`Leaving game ${gameId}`);

    this.gameSocket.emit("leaveGame", {
      gameId,
      userId,
    });
  }

  /**
   * Request game state update with improved error handling
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise} Promise that resolves when update is received
   */
  requestGameUpdate(gameId, userId) {
    return new Promise((resolve) => {
      if (!gameId) {
        console.warn("Cannot request game update - gameId is required");
        resolve(false);
        return;
      }

      if (!this.gameSocket || !this.isConnected) {
        console.warn("Cannot request game update - socket not connected");

        // Try to reconnect
        this.init()
          .then(() => {
            console.log("Reconnected, now requesting game update");
            this.requestGameUpdate(gameId, userId).then(resolve);
          })
          .catch((err) => {
            console.error("Failed to reconnect:", err);
            resolve(false);
          });

        return;
      }

      // Throttle requests - don't send if recent request was made
      const now = Date.now();
      const lastUpdate = lastUpdateTime[gameId] || 0;

      if (now - lastUpdate < 2000) {
        console.log("Throttling game update request");
        resolve(false);
        return;
      }

      console.log(`Requesting game update for ${gameId}`);
      lastUpdateTime[gameId] = now;

      // Set up a one-time listener for game update events
      const onGameUpdate = () => {
        // Removed unused 'data' parameter
        console.log("Received game update after request");
        resolve(true);

        // Remove the one-time listener
        this.gameSocket.off("gameUpdate", onGameUpdate);
      };

      // Add a timeout for the request
      const timeoutId = setTimeout(() => {
        // Renamed to timeoutId to make clear we're using it
        console.log("Game update request timed out");
        this.gameSocket.off("gameUpdate", onGameUpdate);
        resolve(false);
      }, 5000);

      // Listen for the game update event
      this.gameSocket.once("gameUpdate", onGameUpdate);

      // Send the request
      this.gameSocket.emit("requestGameUpdate", {
        gameId,
        userId,
      });

      // Return a cleanup function for clearing the timeout if needed
      return () => {
        clearTimeout(timeoutId);
        this.gameSocket.off("gameUpdate", onGameUpdate);
      };
    });
  }

  /**
   * Send a player action
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} action - Action type
   * @param {number} amount - Bet amount
   */
  /**
   * Send a player action - Enhanced with better error handling
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} action - Action type
   * @param {number} amount - Bet amount
   */
  sendPlayerAction(gameId, userId, action, amount = 0) {
    if (!gameId || !userId || !action) {
      console.warn("Cannot send player action - missing required parameters");
      return;
    }

    if (!this.gameSocket || !this.isConnected) {
      console.warn("Cannot send player action - socket not connected");
      return;
    }

    // Ensure amount is a valid number
    if (action === "bet" || action === "raise" || action === "call") {
      // Convert to number and handle NaN
      amount = parseFloat(amount);
      if (isNaN(amount)) {
        console.error(`Invalid amount for ${action}: ${amount}`);
        amount = 0; // Set a default to prevent NaN errors
      }
    }

    console.log(`Sending player action: ${action} with amount: ${amount}`);

    this.gameSocket.emit("playerAction", {
      gameId,
      userId,
      action,
      amount,
    });
  }

  /**
   * Send a chat message
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {string} message - Chat message
   */
  sendChatMessage(gameId, userId, username, message) {
    if (!gameId || !userId || !username || !message) {
      console.warn("Cannot send chat message - missing required parameters");
      return;
    }

    if (!this.gameSocket || !this.isConnected) {
      console.warn("Cannot send chat message - socket not connected");
      return;
    }

    // Add a unique ID to each message to prevent duplicates
    const messageId =
      Date.now() + "-" + Math.random().toString(36).substr(2, 9);

    this.gameSocket.emit("sendMessage", {
      gameId,
      userId,
      username,
      message,
      messageId, // Add this to help identify duplicates
    });
  }

  /**
   * Setup game event listeners
   */
  setupGameListeners() {
    if (!this.gameSocket) return;

    // Track message IDs to prevent duplicates
    const processedMessageIds = new Set();

    // Define events to listen for
    const events = [
      "gameUpdate",
      "gameStarted",
      "playerJoined",
      "playerLeft",
      "chatMessage",
      "dealCards",
      "yourTurn",
      "turnChanged",
      "actionTaken",
      "dealFlop",
      "dealTurn",
      "dealRiver",
      "handResult",
      "newHand",
      "gameEnded",
      "gameError",
      "playerConnectionChange",
    ];

    // Register listeners for each event
    events.forEach((event) => {
      // Remove any existing listeners to prevent duplicates
      this.gameSocket.off(event);

      // Add new listener that will emit to our own events system
      this.gameSocket.on(event, (data) => {
        // Special handling for chat messages to prevent duplicates
        if (event === "chatMessage" && data.messageId) {
          if (processedMessageIds.has(data.messageId)) {
            console.log(
              "Duplicate chat message detected, ignoring:",
              data.messageId
            );
            return;
          }

          // Add to processed set and limit its size
          processedMessageIds.add(data.messageId);
          if (processedMessageIds.size > 100) {
            // Keep the set from growing too large by removing oldest entries
            const iterator = processedMessageIds.values();
            processedMessageIds.delete(iterator.next().value);
          }
        }

        this.emit(event, data);
      });
    });
  }

  /**
   * Disconnect from socket
   */
  disconnect() {
    if (this.gameSocket) {
      this.gameSocket.disconnect();
      this.gameSocket = null;
    }

    this.isConnected = false;
    this.connectionPromise = null;
    this.connectionAttempts = 0;
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback to remove
   */
  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter((cb) => cb !== callback);
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach((callback) => callback(data));
  }

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  isSocketConnected() {
    return this.isConnected && this.gameSocket && this.gameSocket.connected;
  }

  /**
   * Debug information about socket state
   */
  debug() {
    console.group("Socket Debug Info");
    console.log("Is Connected:", this.isConnected);
    console.log("Socket ID:", this.gameSocket?.id || "none");
    console.log("Socket Connected:", this.gameSocket?.connected || false);
    console.log("Connection Attempts:", this.connectionAttempts);

    // List all event listeners
    console.log("Registered Event Handlers:");
    const events = Object.keys(this.events);
    events.forEach((event) => {
      console.log(`- ${event}: ${this.events[event].length} handlers`);
    });
    console.groupEnd();

    return {
      connected: this.isConnected,
      socketId: this.gameSocket?.id,
      handlers: events.length,
    };
  }

  async joinGameWithRetry(gameId, userId, username, maxRetries = 3) {
    let retries = 0;

    while (retries < maxRetries) {
      try {
        console.log(`Attempt ${retries + 1} to join game ${gameId}`);

        // Make sure we're connected
        if (!this.isConnected || !this.gameSocket) {
          await this.init();
        }

        // Join the game room
        await this.joinGame(gameId, userId, username);

        console.log(
          `Successfully joined game ${gameId} on attempt ${retries + 1}`
        );

        // Request immediate game update to ensure current state
        this.requestGameUpdate(gameId, userId);

        return true;
      } catch (error) {
        console.error(`Join game attempt ${retries + 1} failed:`, error);
        retries++;

        if (retries >= maxRetries) {
          console.error(`Failed to join game after ${maxRetries} attempts`);
          throw error;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // Add this method to ensure reliable game updates
  ensureGameUpdate(gameId, userId, intervalMs = 5000, duration = 20000) {
    console.log(`Setting up game update polling for game ${gameId}`);

    // Request initial update if enough time has passed since last update
    const now = Date.now();
    const lastUpdate = lastUpdateTime[gameId] || 0;

    if (now - lastUpdate > 2000) {
      this.requestGameUpdate(gameId, userId);
      lastUpdateTime[gameId] = now;
    } else {
      console.log("Skipping immediate update due to recent request");
    }

    // Set up interval for periodic updates with throttling
    const intervalId = setInterval(() => {
      if (!this.isConnected) return;

      const currentTime = Date.now();
      const lastUpdate = lastUpdateTime[gameId] || 0;

      // Only request update if enough time has passed
      if (currentTime - lastUpdate > 2000) {
        this.requestGameUpdate(gameId, userId);
        lastUpdateTime[gameId] = currentTime;
      }
    }, intervalMs);

    // Clear interval after duration
    setTimeout(() => {
      clearInterval(intervalId);
      console.log("Stopped game update polling");
    }, duration);

    return intervalId;
  }
  async reconnectToGame(gameId, userId, username, maxRetries = 3) {
    console.log(`Attempting to reconnect to game ${gameId} as ${username}`);

    // Store reconnection info
    this.reconnectInfo = { gameId, userId, username };
    localStorage.setItem("reconnectInfo", JSON.stringify(this.reconnectInfo));

    let retries = 0;
    let connected = false;

    while (!connected && retries < maxRetries) {
      try {
        // Initialize socket first
        await this.init();

        // Then attempt to reconnect
        await new Promise((resolve, reject) => {
          if (!this.gameSocket || !this.isConnected) {
            reject(new Error("Socket not connected"));
            return;
          }

          console.log(`Sending reconnect event for game ${gameId}`);

          // Use the reconnect event
          this.gameSocket.emit("reconnect", {
            userId,
            gameId,
            username,
          });

          // Set up a listener for reconnect confirmation
          const confirmHandler = (data) => {
            console.log("Reconnection confirmed:", data);
            this.gameSocket.off("reconnectConfirmed", confirmHandler);
            resolve(true);
          };

          // Listen for confirmation
          this.gameSocket.once("reconnectConfirmed", confirmHandler);

          // Set a timeout
          setTimeout(() => {
            this.gameSocket.off("reconnectConfirmed", confirmHandler);
            reject(new Error("Reconnection confirmation timeout"));
          }, 5000);
        });

        // If we get here, reconnection was successful
        connected = true;
        console.log(`Successfully reconnected to game ${gameId}`);

        // Request an immediate game state update
        this.requestGameUpdate(gameId, userId);

        return true;
      } catch (error) {
        console.error(`Reconnection attempt ${retries + 1} failed:`, error);
        retries++;

        // Wait before retry
        if (retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    if (!connected) {
      console.error(`Failed to reconnect after ${maxRetries} attempts`);
      return false;
    }

    return true;
  }

  /**
   * Check if there's a pending reconnection
   * @returns {Object|null} Reconnection info or null if none
   */
  checkForPendingReconnection() {
    try {
      const savedInfo = localStorage.getItem("reconnectInfo");
      if (savedInfo) {
        return JSON.parse(savedInfo);
      }
    } catch (error) {
      console.error("Error checking for reconnection:", error);
    }
    return null;
  }

  /**
   * Clear reconnection information
   */
  clearReconnectionInfo() {
    localStorage.removeItem("reconnectInfo");
    this.reconnectInfo = null;
  }

  /**
   * Handle automatic reconnection attempts
   * This should be called when a socket disconnects
   */
  handleDisconnect() {
    if (!this.reconnectInfo || !this.reconnectInfo.gameId) return;

    console.log("Socket disconnected, attempting to reconnect automatically");

    // Attempt to reconnect after a short delay
    setTimeout(() => {
      this.reconnectToGame(
        this.reconnectInfo.gameId,
        this.reconnectInfo.userId,
        this.reconnectInfo.username
      );
    }, 1000);
  }
  setupReconnectionHandlers() {
    if (!this.gameSocket) return;

    this.gameSocket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${reason}`);
      this.isConnected = false;

      // Only attempt automatic reconnection for certain disconnect reasons
      if (reason === "transport close" || reason === "ping timeout") {
        this.handleDisconnect();
      }
    });
  }

  /**
   * Enhanced diagnostic logging for socket connection
   */
  /**
   * Enhanced diagnostic logging for socket connection
   */
  async diagnoseSockets() {
    console.group("Socket Connection Diagnostics");

    try {
      // Log current state
      console.log("Socket initialized:", !!this.gameSocket);
      console.log("Socket connected:", this.isConnected);

      if (this.gameSocket) {
        console.log("Socket ID:", this.gameSocket.id);
        console.log("Socket namespace:", this.gameSocket.nsp);
        console.log("Connected:", this.gameSocket.connected);
        console.log("Transport:", this.gameSocket.io.engine?.transport?.name);
      }

      // Try to connect with more debug info
      console.log("Attempting test connection...");

      // Load config to get socket URL - use the imported loadConfig function
      // Import the config service if needed
      const { loadConfig } = require("./config");
      const config = await loadConfig();
      console.log("Socket URL from config:", config.socketUrl);

      // Or use a direct URL if loadConfig isn't available
      const socketUrl = config?.socketUrl || "http://localhost:5000";

      // Check browser WebSocket support
      console.log("Browser supports WebSocket:", "WebSocket" in window);

      // Check if the socket endpoint is reachable via fetch
      try {
        const response = await fetch(
          `${socketUrl}/socket.io/?EIO=4&transport=polling`
        );
        console.log(
          "Socket.IO endpoint reachable:",
          response.status,
          response.statusText
        );
        const text = await response.text();
        console.log("Socket.IO response:", text);
      } catch (fetchError) {
        console.error("Socket.IO endpoint fetch error:", fetchError);
      }
    } catch (error) {
      console.error("Diagnostic error:", error);
    }

    console.groupEnd();

    // Return test result
    return {
      isSocketInitialized: !!this.gameSocket,
      isConnected: this.isConnected,
      socketId: this.gameSocket?.id,
      transport: this.gameSocket?.io?.engine?.transport?.name,
    };
  }

  /**
   * Try all possible connection methods to see what works
   */
  async forceConnection(gameId, userId, username) {
    console.log("Attempting force connection with all transport methods...");

    try {
      // Clear any existing socket
      this.disconnect();

      // Get socket URL without relying on loadConfig
      let socketUrl = "http://localhost:5000"; // Default fallback

      // Try to load config if available, otherwise use the default
      try {
        // Use dynamic import to get config
        const { loadConfig } = await import("./config");
        const config = await loadConfig();
        if (config && config.socketUrl) {
          socketUrl = config.socketUrl;
        }
      } catch (configError) {
        console.warn("Could not load config, using default URL:", socketUrl);
      }

      console.log("Using socket URL:", socketUrl);

      // Try polling first, which works in almost all environments
      const pollingSocket = io(`${socketUrl}/game`, {
        transports: ["polling"],
        reconnection: true,
        timeout: 10000,
        forceNew: true,
      });

      this.gameSocket = pollingSocket;

      // Set up connection events
      return new Promise((resolve, reject) => {
        pollingSocket.on("connect", () => {
          console.log("Connected using polling transport");
          this.isConnected = true;

          // Register and join game
          if (userId) {
            this.registerUser(userId);

            if (gameId) {
              pollingSocket.emit("joinGame", {
                gameId,
                userId,
                username: username || userId,
              });
            }
          }

          resolve(true);
        });

        pollingSocket.on("connect_error", (error) => {
          console.error("Polling connection error:", error);

          // Try websocket as fallback
          pollingSocket.disconnect();

          console.log("Trying WebSocket transport as fallback...");
          const websocketSocket = io(`${socketUrl}/game`, {
            transports: ["websocket"],
            reconnection: true,
            timeout: 10000,
            forceNew: true,
          });

          this.gameSocket = websocketSocket;

          websocketSocket.on("connect", () => {
            console.log("Connected using WebSocket transport");
            this.isConnected = true;

            // Register and join
            if (userId) {
              this.registerUser(userId);

              if (gameId) {
                websocketSocket.emit("joinGame", {
                  gameId,
                  userId,
                  username: username || userId,
                });
              }
            }

            resolve(true);
          });

          websocketSocket.on("connect_error", (wsError) => {
            console.error("WebSocket connection error:", wsError);
            reject(
              new Error("Failed to connect with both polling and WebSocket")
            );
          });
        });

        // Set timeout for the whole operation
        setTimeout(() => {
          reject(new Error("Connection attempt timed out after 15 seconds"));
        }, 15000);
      });
    } catch (error) {
      console.error("Force connection error:", error);
      throw error;
    }
  }
}

export { io };

// Create and export singleton instance
export default new SocketService();
