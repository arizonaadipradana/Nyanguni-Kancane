// client/src/store/index.js
import Vue from "vue";
import Vuex from "vuex";
import axios from "axios";
import router from "../router";

Vue.use(Vuex);

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
      if (user._id && !user.id) {
        user.id = user._id;
      }
      state.user = user;
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
      state.playerHand = cards;
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
        const response = await axios.post("/api/auth/login", credentials);
        const { token, user } = response.data;

        if (!token) {
          commit("SET_ERROR_MESSAGE", "No token received from server");
          return { success: false, error: "Authentication failed" };
        }

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
          commit("SET_ERROR_MESSAGE", "No authentication token");
          return { success: false, error: "No authentication token" };
        }

        const response = await axios.get("/api/auth/user", {
          headers: {
            "x-auth-token": state.token,
          },
        });

        const userData = response.data;

        // Validate the user data
        if (!userData || !userData.id || !userData.username) {
          console.error("Incomplete user data received:", userData);
          commit(
            "SET_ERROR_MESSAGE",
            "Received incomplete user data from server"
          );
          return { success: false, error: "Incomplete user data" };
        }

        commit("SET_USER", userData);
        return { success: true };
      } catch (error) {
        console.error("Failed to fetch user data:", error);

        // Handle token expiration
        if (error.response && error.response.status === 401) {
          dispatch("logout");
          router.push("/login");
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

        // Use Promise.race with a timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("Create game request timed out")),
            8000
          );
        });

        const requestPromise = axios.post(
          "/api/games",
          {
            creatorId: userId,
            creatorName: username,
          },
          {
            headers: { "x-auth-token": state.token },
          }
        );

        const response = await Promise.race([requestPromise, timeoutPromise]);

        if (response.data && response.data.gameId) {
          commit("SET_CURRENT_GAME_ID", response.data.gameId);
          return { success: true, gameId: response.data.gameId };
        } else {
          commit("SET_ERROR_MESSAGE", "Invalid server response");
          return { success: false, error: "Invalid server response" };
        }
      } catch (error) {
        console.error("Create game error:", error);
        const errorMsg =
          error.message === "Create game request timed out"
            ? "Request timed out. Please try again."
            : error.response?.data?.msg || "Failed to create game";
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
    updateGameState({ commit }, gameState) {
      if (!gameState) return;
      console.log("Updating game state:", gameState);
      commit("SET_CURRENT_GAME", gameState);
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
  },
});
