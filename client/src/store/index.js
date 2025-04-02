// client/src/store/index.js
import Vue from "vue";
import Vuex from "vuex";
import axios from "axios";
import router from "../router";

Vue.use(Vuex);

// Utility to throttle updates to avoid excessive re-renders
const throttle = (callback, delay) => {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return callback.apply(this, args);
    }
  };
};

export default new Vuex.Store({
  state: {
    user: null,
    token: localStorage.getItem("token") || "",
    currentGame: null,
    currentGameId: null,
    playerHand: [],
    errorMessage: "",
    isYourTurn: false,
    availableActions: [],
    isLoading: false,
    gamesList: [],
    userGames: [],
  },

  getters: {
    isAuthenticated: (state) => !!state.token,
    currentUser: (state) => state.user,
    currentGameId: (state) => state.currentGameId,
    currentGame: (state) => state.currentGame,
    playerHand: (state) => state.playerHand,
    errorMessage: (state) => state.errorMessage,
    isYourTurn: (state) => state.isYourTurn,
    availableActions: (state) => state.availableActions,
    isLoading: (state) => state.isLoading,
    gamesList: (state) => state.gamesList,
    userGames: (state) => state.userGames,
  },

  mutations: {
    SET_LOADING(state, isLoading) {
      state.isLoading = isLoading;
    },

    SET_TOKEN(state, token) {
      state.token = token;
    },

    SET_USER(state, user) {
      // Handle both id and _id (MongoDB uses _id)
      if (user) {
        // Create a new object to avoid mutation issues
        const standardizedUser = { ...user };

        // Make sure we have an id property, copying from _id if needed
        if (!standardizedUser.id && standardizedUser._id) {
          standardizedUser.id = standardizedUser._id;
        }

        // Also do the reverse - ensure _id exists if we have id
        if (standardizedUser.id && !standardizedUser._id) {
          standardizedUser._id = standardizedUser.id;
        }

        // Handle MongoDB $oid format if present
        if (
          typeof standardizedUser.id === "object" &&
          standardizedUser.id?.$oid
        ) {
          standardizedUser.id = standardizedUser.id.$oid;
        }
        if (
          typeof standardizedUser._id === "object" &&
          standardizedUser._id?.$oid
        ) {
          standardizedUser._id = standardizedUser._id.$oid;
        }

        // Handle objects with toString method (like MongoDB ObjectID)
        if (
          typeof standardizedUser.id === "object" &&
          typeof standardizedUser.id?.toString === "function"
        ) {
          standardizedUser.id = standardizedUser.id.toString();
        }
        if (
          typeof standardizedUser._id === "object" &&
          typeof standardizedUser._id?.toString === "function"
        ) {
          standardizedUser._id = standardizedUser._id.toString();
        }

        // Ensure both are strings to make comparison easier
        if (standardizedUser.id)
          standardizedUser.id = String(standardizedUser.id);
        if (standardizedUser._id)
          standardizedUser._id = String(standardizedUser._id);

        // Set the standardized user in state
        state.user = standardizedUser;

        console.log(
          "User data standardized and stored in state:",
          standardizedUser
        );
      } else {
        state.user = null;
      }
    },

    CLEAR_AUTH(state) {
      state.token = "";
      state.user = null;
    },

    SET_CURRENT_GAME(state, game) {
      state.currentGame = game;
    },

    SET_CURRENT_GAME_ID(state, gameId) {
      state.currentGameId = gameId;
    },

    SET_PLAYER_HAND(state, cards) {
      if (!cards || !Array.isArray(cards)) {
        console.warn("Invalid cards array passed to SET_PLAYER_HAND");
        state.playerHand = [];
        return;
      }

      // Make a deep copy of the cards to avoid reference issues
      const cardsCopy = cards.map((card) => ({
        ...card,
        _updated: Date.now(), // Add timestamp to force reactivity
      }));

      // Log for debugging
      console.log(
        "Setting player hand with cards:",
        cardsCopy.map((c) => `${c.rank} of ${c.suit}`).join(", ")
      );

      // Assign the new array to trigger reactivity
      state.playerHand = cardsCopy;
    },

    FORCE_UPDATE_CARDS(state, cards) {
      if (!cards || !Array.isArray(cards)) return;

      console.log(
        "FORCE_UPDATE_CARDS called with:",
        cards.map((c) => `${c.rank} of ${c.suit}`).join(", ")
      );

      // Reset the array
      state.playerHand.length = 0;

      // Add the cards one by one to ensure Vue reactivity
      cards.forEach((card) => {
        state.playerHand.push({
          ...card, // Create new object to avoid reference issues
          _updated: Date.now(), // Add timestamp to force reactivity
        });
      });

      console.log(
        "Vuex store FORCE updated player hand:",
        state.playerHand.map((c) => `${c.rank} of ${c.suit}`).join(", ")
      );
    },

    SET_ERROR_MESSAGE(state, message) {
      state.errorMessage = message;
    },

    CLEAR_ERROR_MESSAGE(state) {
      state.errorMessage = "";
    },

    SET_YOUR_TURN(state, isTurn) {
      state.isYourTurn = isTurn;
    },

    SET_AVAILABLE_ACTIONS(state, actions) {
      state.availableActions = actions;
    },

    SET_GAMES_LIST(state, games) {
      state.gamesList = games;
    },

    SET_USER_GAMES(state, games) {
      state.userGames = games;
    },

    UPDATE_USER_BALANCE(state, balance) {
      if (state.user) {
        state.user.balance = balance;
      }
    },
  },

  actions: {
    // Authentication
    async login({ commit, dispatch }, credentials) {
      commit("SET_LOADING", true);
      commit("CLEAR_ERROR_MESSAGE");

      try {
        console.log("Sending login request with credentials:", {
          username: credentials.username,
          password: "***HIDDEN***",
        });

        const response = await axios.post("/api/auth/login", credentials);
        console.log("Login response received:", response);

        const { token, user } = response.data;

        if (!token) {
          commit("SET_ERROR_MESSAGE", "No token received from server");
          return { success: false, error: "Authentication failed" };
        }

        // Store token in localStorage and state
        localStorage.setItem("token", token);
        commit("SET_TOKEN", token);

        // Set up auth header for axios
        axios.defaults.headers.common["x-auth-token"] = token;

        // If the server returns user data with the token, use it
        if (user && user.id && user.username) {
          commit("SET_USER", user);
          return { success: true, token };
        } else {
          // Otherwise fetch user data
          const userData = await dispatch("fetchUserData");
          return { success: userData.success, token };
        }
      } catch (error) {
        console.error("Login error full details:", error);
        const errorMsg = error.response?.data?.msg || "Login failed";
        commit("SET_ERROR_MESSAGE", errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    async register({ commit, dispatch }, credentials) {
      commit("SET_LOADING", true);
      commit("CLEAR_ERROR_MESSAGE");

      try {
        const response = await axios.post("/api/auth/register", credentials);
        const { token, user } = response.data;

        localStorage.setItem("token", token);
        commit("SET_TOKEN", token);

        // If the server returns user data with the token, use it
        if (user && user.id && user.username) {
          commit("SET_USER", user);
          return { success: true };
        } else {
          // Otherwise fetch user data
          return await dispatch("fetchUserData");
        }
      } catch (error) {
        const errorMsg = error.response?.data?.msg || "Registration failed";
        commit("SET_ERROR_MESSAGE", errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    async fetchUserData({ commit, state, dispatch }) {
      commit("SET_LOADING", true);

      try {
        // Make sure we have a token
        if (!state.token) {
          const token = localStorage.getItem("token");
          if (!token) {
            commit("SET_ERROR_MESSAGE", "No authentication token");
            return { success: false, error: "No authentication token" };
          }
          commit("SET_TOKEN", token);
          axios.defaults.headers.common["x-auth-token"] = token;
        }

        const response = await axios.get("/api/auth/user", {
          headers: {
            "x-auth-token": state.token,
          },
          timeout: 8000, // Increase timeout for slower networks
        });

        const userData = response.data;

        // Validate the user data
        if (
          !userData ||
          (!userData.id && !userData._id) ||
          !userData.username
        ) {
          console.error("Incomplete user data received:", userData);
          commit(
            "SET_ERROR_MESSAGE",
            "Received incomplete user data from server"
          );
          return { success: false, error: "Incomplete user data" };
        }

        // Create a standardized user object
        const standardizedUser = {
          ...userData,
          id: userData.id || userData._id,
          _id: userData._id || userData.id,
        };

        // Store both id and _id to prevent issues
        if (
          typeof standardizedUser.id === "object" &&
          standardizedUser.id.$oid
        ) {
          standardizedUser.id = standardizedUser.id.$oid;
        }
        if (
          typeof standardizedUser._id === "object" &&
          standardizedUser._id.$oid
        ) {
          standardizedUser._id = standardizedUser._id.$oid;
        }

        // Ensure both are strings
        standardizedUser.id = String(standardizedUser.id);
        standardizedUser._id = String(standardizedUser._id);

        commit("SET_USER", standardizedUser);
        console.log("User data fetched successfully:", standardizedUser);
        return { success: true, user: standardizedUser };
      } catch (error) {
        console.error("Failed to fetch user data:", error);

        // Handle token expiration
        if (error.response && error.response.status === 401) {
          console.log("Authentication token expired. Logging out...");
          dispatch("logout");
        }

        commit("SET_ERROR_MESSAGE", "Failed to fetch user data");
        return { success: false, error: "Failed to fetch user data" };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    logout({ commit }) {
      localStorage.removeItem("token");
      commit("CLEAR_AUTH");
      router.push("/login");
    },

    // Game management
    async fetchGames({ commit, state }) {
      commit("SET_LOADING", true);

      try {
        const response = await axios.get("/api/games", {
          headers: { "x-auth-token": state.token },
        });

        commit("SET_GAMES_LIST", response.data);
        return { success: true, games: response.data };
      } catch (error) {
        console.error("Fetch games error:", error);
        return { success: false, error: "Failed to fetch games" };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    async fetchUserGames({ commit, state }) {
      commit("SET_LOADING", true);

      try {
        const response = await axios.get("/api/games/user", {
          headers: { "x-auth-token": state.token },
        });

        commit("SET_USER_GAMES", response.data);
        return { success: true, games: response.data };
      } catch (error) {
        console.error("Fetch user games error:", error);
        return { success: false, error: "Failed to fetch your games" };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    // UPDATED: Create game with timeout handling
    async createGame({ commit, state }) {
      commit("SET_LOADING", true);
      commit("CLEAR_ERROR_MESSAGE");

      try {
        // Make sure the user is authenticated
        if (!state.user || !state.token) {
          commit("SET_ERROR_MESSAGE", "User not authenticated");
          return { success: false, error: "User not authenticated" };
        }

        // Ensure we have a valid user ID and username
        const userId = state.user.id;
        const username = state.user.username;

        if (!userId || !username) {
          commit("SET_ERROR_MESSAGE", "User information incomplete");
          return { success: false, error: "User information incomplete" };
        }

        console.log(
          "Creating game with user ID:",
          userId,
          "and username:",
          username
        );

        // Use a more robust approach with explicit error handling
        try {
          const response = await axios.post(
            "/api/games",
            {
              creatorId: userId,
              creatorName: username,
            },
            {
              headers: { "x-auth-token": state.token },
              timeout: 10000, // 10 second timeout
            }
          );

          console.log("Game creation API response:", response.data);

          if (response.data && response.data.gameId) {
            commit("SET_CURRENT_GAME_ID", response.data.gameId);
            return { success: true, gameId: response.data.gameId };
          } else {
            console.error("Invalid server response format:", response.data);
            commit("SET_ERROR_MESSAGE", "Invalid server response format");
            return { success: false, error: "Invalid server response" };
          }
        } catch (axiosError) {
          console.error("Axios error during game creation:", axiosError);

          if (axiosError.response) {
            // The server responded with an error
            const errorMsg =
              axiosError.response.data?.msg ||
              `Server error: ${axiosError.response.status}`;
            commit("SET_ERROR_MESSAGE", errorMsg);
            return { success: false, error: errorMsg };
          } else if (axiosError.request) {
            // The request was made but no response was received
            commit(
              "SET_ERROR_MESSAGE",
              "No response from server. Check your connection."
            );
            return { success: false, error: "Network error - no response" };
          } else {
            // Something else happened
            commit(
              "SET_ERROR_MESSAGE",
              axiosError.message || "Request setup error"
            );
            return {
              success: false,
              error: axiosError.message || "Unknown error",
            };
          }
        }
      } catch (error) {
        console.error("Create game error:", error);
        const errorMsg = error.message || "Failed to create game";
        commit("SET_ERROR_MESSAGE", errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    // UPDATED: Join game with timeout handling
    async joinGame({ commit, state }, gameId) {
      commit("SET_LOADING", true);
      commit("CLEAR_ERROR_MESSAGE");

      try {
        // Make sure we have user data
        if (!state.user || !state.user.id || !state.user.username) {
          commit("SET_ERROR_MESSAGE", "User information incomplete");
          return { success: false, error: "User information incomplete" };
        }

        // Use Promise.race with a timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("Join game request timed out")),
            8000
          );
        });

        const requestPromise = axios.post(
          `/api/games/join/${gameId}`,
          {
            playerId: state.user.id,
            playerName: state.user.username,
          },
          {
            headers: { "x-auth-token": state.token },
          }
        );

        await Promise.race([requestPromise, timeoutPromise]);

        commit("SET_CURRENT_GAME_ID", gameId);
        return { success: true };
      } catch (error) {
        console.error("Join game error:", error);
        const errorMsg =
          error.message === "Join game request timed out"
            ? "Request timed out. Please try again."
            : error.response?.data?.msg || "Failed to join game";
        commit("SET_ERROR_MESSAGE", errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    async fetchGame({ commit, state }, gameId) {
      commit("SET_LOADING", true);

      try {
        const response = await axios.get(`/api/games/${gameId}`, {
          headers: { "x-auth-token": state.token },
        });

        commit("SET_CURRENT_GAME", response.data);
        commit("SET_CURRENT_GAME_ID", gameId);
        return { success: true, game: response.data };
      } catch (error) {
        const errorMsg =
          error.response?.data?.msg || "Failed to fetch game data";
        commit("SET_ERROR_MESSAGE", errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    // In your store's actions section

    async startGame({ commit, state }, gameId) {
      commit("SET_LOADING", true);
      console.log("Store startGame action called with gameId:", gameId);
      console.log("Current user in store:", state.user);

      try {
        console.log("Making start game API request...");
        const response = await axios.post(
          `/api/games/start/${gameId}`,
          {
            playerId: state.user.id,
          },
          {
            headers: { "x-auth-token": state.token },
          }
        );

        console.log("Start game API response:", response.data);

        if (response.data && response.data.success) {
          console.log("Game started successfully through API");
          return { success: true };
        } else {
          console.error("API response did not indicate success");
          return { success: false, error: "Server did not report success" };
        }
      } catch (error) {
        console.error("Start game API error details:", error);
        const errorMsg = error.response?.data?.msg || "Failed to start game";
        commit("SET_ERROR_MESSAGE", errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    // Socket event handlers
    updateGameState(state, gameState) {
      if (!gameState) return;

      // Log detailed game state for debugging
      console.log("Updating game state with data:", {
        id: gameState.id,
        status: gameState.status,
        currentTurn: gameState.currentTurn,
        playerCount: gameState.players?.length || 0,
        bettingRound: gameState.bettingRound,
      });

      // Create a modified game state object
      const enhancedGameState = { ...gameState };

      // Ensure players is always a valid array
      if (
        !enhancedGameState.players ||
        !Array.isArray(enhancedGameState.players)
      ) {
        enhancedGameState.players = [];
      }

      // Handle allPlayers field if present (special field for improved visibility)
      if (
        enhancedGameState.allPlayers &&
        Array.isArray(enhancedGameState.allPlayers)
      ) {
        console.log(
          `Found ${enhancedGameState.allPlayers.length} players in allPlayers array`
        );

        // If players array is empty or smaller than allPlayers, use allPlayers instead
        if (
          enhancedGameState.players.length < enhancedGameState.allPlayers.length
        ) {
          console.log("Using allPlayers array to enhance player visibility");

          // Convert allPlayers to full player objects
          const fullPlayers = enhancedGameState.allPlayers.map((player) => ({
            id: player.id,
            username: player.username,
            chips: player.chips || 0,
            totalChips: player.totalChips || 0,
            hasCards: player.hasCards || false,
            hasFolded: player.hasFolded || false,
            hasActed: player.hasActed || false,
            isAllIn: player.isAllIn || false,
            isActive: player.isActive !== undefined ? player.isActive : true,
            position: player.position || 0,
          }));

          // Merge with existing players to preserve detailed info
          const existingPlayerMap = new Map();
          enhancedGameState.players.forEach((player) => {
            if (player && player.id) {
              existingPlayerMap.set(player.id, player);
            }
          });

          // Create the merged player list
          enhancedGameState.players = fullPlayers.map((player) => {
            // Use existing player data if available, otherwise use the basic player
            return existingPlayerMap.has(player.id)
              ? { ...player, ...existingPlayerMap.get(player.id) }
              : player;
          });

          console.log(
            `Enhanced player list now has ${enhancedGameState.players.length} players`
          );
        }
      }

      // IMPORTANT: Check if it's no longer the current user's turn - if so, clear turn state
      if (
        state.isYourTurn &&
        state.user &&
        enhancedGameState.currentTurn &&
        enhancedGameState.currentTurn !== String(state.user.id)
      ) {
        console.log(
          "Game state indicates it is no longer your turn, updating UI"
        );
        state.isYourTurn = false;
        state.availableActions = [];
      }

      // Update the game state in store
      state.currentGame = enhancedGameState;

      // If this update includes turn info and it's the current user's turn,
      // make sure the isYourTurn flag is set
      if (
        state.user &&
        enhancedGameState.currentTurn &&
        String(enhancedGameState.currentTurn) === String(state.user.id) &&
        !state.isYourTurn
      ) {
        console.log(
          "Game state shows it is your turn, updating isYourTurn flag"
        );
        state.isYourTurn = true;
        state.availableActions = ["fold", "check", "call", "bet", "raise"];
      }
    },

    receiveCards({ commit }, { hand }) {
      if (!hand) return;
      commit("SET_PLAYER_HAND", hand);
    },

    yourTurn({ commit }, { options }) {
      commit("SET_YOUR_TURN", true);
      commit("SET_AVAILABLE_ACTIONS", options || []);
    },

    endTurn({ commit }) {
      commit("SET_YOUR_TURN", false);
      commit("SET_AVAILABLE_ACTIONS", []);
    },

    // Player actions
    async performAction({ commit }, { action, amount }) {
      try {
        commit("SET_YOUR_TURN", false);
        return { success: true, action, amount };
      } catch (error) {
        commit("SET_ERROR_MESSAGE", "Failed to perform action");
        return { success: false, error: "Failed to perform action" };
      }
    },

    clearErrorMessage({ commit }) {
      commit("CLEAR_ERROR_MESSAGE");
    },

    // User profile
    async updateProfile({ commit, state }, userData) {
      commit("SET_LOADING", true);

      try {
        const response = await axios.put("/api/auth/profile", userData, {
          headers: { "x-auth-token": state.token },
        });

        commit("SET_USER", response.data);
        return { success: true, user: response.data };
      } catch (error) {
        const errorMsg =
          error.response?.data?.msg || "Failed to update profile";
        commit("SET_ERROR_MESSAGE", errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        commit("SET_LOADING", false);
      }
    },

    async fetchUserStats({ commit, state }) {
      commit("SET_LOADING", true);

      try {
        const response = await axios.get("/api/auth/stats", {
          headers: { "x-auth-token": state.token },
        });

        return { success: true, stats: response.data };
      } catch (error) {
        console.error("Fetch user stats error:", error);
        return { success: false, error: "Failed to fetch user statistics" };
      } finally {
        commit("SET_LOADING", false);
      }
    },
    forceUpdatePlayerHand({ commit }, cards) {
      commit("FORCE_UPDATE_CARDS", cards);
      return { success: true };
    },
  },
});
