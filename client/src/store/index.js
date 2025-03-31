// client/src/store/index.js
import Vue from 'vue'
import Vuex from 'vuex'
import axios from 'axios'

Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    user: null,
    token: localStorage.getItem('token') || '',
    currentGame: null,
    currentGameId: null,
    playerHand: [],
    errorMessage: '',
    isYourTurn: false,
    availableActions: []
  },
  
  getters: {
    isAuthenticated: state => !!state.token,
    currentUser: state => state.user,
    currentGameId: state => state.currentGameId,
    currentGame: state => state.currentGame,
    playerHand: state => state.playerHand,
    errorMessage: state => state.errorMessage,
    isYourTurn: state => state.isYourTurn,
    availableActions: state => state.availableActions
  },
  
  mutations: {
    SET_TOKEN(state, token) {
      state.token = token
    },
    SET_USER(state, user) {
      // Handle both id and _id (MongoDB uses _id)
      if (user._id && !user.id) {
        user.id = user._id;
      }
      state.user = user;
    },
    CLEAR_AUTH(state) {
      state.token = ''
      state.user = null
    },
    SET_CURRENT_GAME(state, game) {
      state.currentGame = game
    },
    SET_CURRENT_GAME_ID(state, gameId) {
      state.currentGameId = gameId
    },
    SET_PLAYER_HAND(state, cards) {
      state.playerHand = cards
    },
    SET_ERROR_MESSAGE(state, message) {
      state.errorMessage = message
    },
    CLEAR_ERROR_MESSAGE(state) {
      state.errorMessage = ''
    },
    SET_YOUR_TURN(state, isTurn) {
      state.isYourTurn = isTurn
    },
    SET_AVAILABLE_ACTIONS(state, actions) {
      state.availableActions = actions
    }
  },
  
  actions: {
    // Authentication
    async login({ commit, dispatch }, credentials) {
      try {
        const response = await axios.post('/api/auth/login', credentials);
        const { token, user } = response.data;
        
        if (!token) {
          commit('SET_ERROR_MESSAGE', 'No token received from server');
          return { success: false, error: 'Authentication failed' };
        }
        
        localStorage.setItem('token', token);
        commit('SET_TOKEN', token);
        
        // If the server returns user data with the token, use it
        if (user && user.id && user.username) {
          commit('SET_USER', user);
          return { success: true };
        } else {
          // Otherwise fetch user data
          return await dispatch('fetchUserData');
        }
      } catch (error) {
        commit('SET_ERROR_MESSAGE', error.response?.data?.msg || 'Login failed');
        return { success: false, error: error.response?.data?.msg || 'Login failed' };
      }
    },    
    
    async register({ commit, dispatch }, credentials) {
      try {
        const response = await axios.post('/api/auth/register', credentials)
        const token = response.data.token
        
        localStorage.setItem('token', token)
        commit('SET_TOKEN', token)
        
        await dispatch('fetchUserData')
        
        return { success: true }
      } catch (error) {
        commit('SET_ERROR_MESSAGE', error.response?.data?.msg || 'Registration failed')
        return { success: false, error: error.response?.data?.msg || 'Registration failed' }
      }
    },
    
    async fetchUserData({ commit, state }) {
      try {
        // Make sure we have a token
        if (!state.token) {
          commit('SET_ERROR_MESSAGE', 'No authentication token');
          return { success: false, error: 'No authentication token' };
        }
        
        const response = await axios.get('/api/auth/user', {
          headers: {
            'x-auth-token': state.token
          }
        });
        
        const userData = response.data;
        
        // Validate the user data
        if (!userData || !userData.id || !userData.username) {
          console.error('Incomplete user data received:', userData);
          commit('SET_ERROR_MESSAGE', 'Received incomplete user data from server');
          return { success: false, error: 'Incomplete user data' };
        }
        
        commit('SET_USER', userData);
        return { success: true };
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        commit('SET_ERROR_MESSAGE', 'Failed to fetch user data');
        return { success: false, error: 'Failed to fetch user data' };
      }
    },
    
    logout({ commit }) {
      localStorage.removeItem('token')
      commit('CLEAR_AUTH')
    },
    
    // Game management
    async createGame({ commit, state }) {
      try {
        // Make sure the user is authenticated
        if (!state.user || !state.token) {
          commit('SET_ERROR_MESSAGE', 'User not authenticated');
          return { success: false, error: 'User not authenticated' };
        }
    
        // Ensure we have a valid user ID and username
        const userId = state.user.id;
        const username = state.user.username;
    
        if (!userId || !username) {
          commit('SET_ERROR_MESSAGE', 'User information incomplete');
          return { success: false, error: 'User information incomplete' };
        }
    
        // Add debug logging
        console.log('Creating game with:', { creatorId: userId, creatorName: username });
    
        const response = await axios.post('/api/games', {
          creatorId: userId,
          creatorName: username
        }, {
          headers: { 'x-auth-token': state.token }
        });
        
        if (response.data && response.data.gameId) {
          commit('SET_CURRENT_GAME_ID', response.data.gameId);
          return { success: true, gameId: response.data.gameId };
        } else {
          commit('SET_ERROR_MESSAGE', 'Invalid server response');
          return { success: false, error: 'Invalid server response' };
        }
      } catch (error) {
        console.error('Create game error:', error);
        const errorMsg = error.response?.data?.msg || 'Failed to create game';
        commit('SET_ERROR_MESSAGE', errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    
    async joinGame({ commit, state }, gameId) {
      try {
        await axios.post(`/api/games/join/${gameId}`, {
          playerId: state.user.id,
          playerName: state.user.username
        }, {
          headers: { 'x-auth-token': state.token }
        })
        
        commit('SET_CURRENT_GAME_ID', gameId)
        return { success: true }
      } catch (error) {
        commit('SET_ERROR_MESSAGE', error.response?.data?.msg || 'Failed to join game')
        return { success: false, error: error.response?.data?.msg || 'Failed to join game' }
      }
    },
    
    async fetchGame({ commit, state }, gameId) {
      try {
        const response = await axios.get(`/api/games/${gameId}`, {
          headers: { 'x-auth-token': state.token }
        })
        
        commit('SET_CURRENT_GAME', response.data)
        return { success: true, game: response.data }
      } catch (error) {
        commit('SET_ERROR_MESSAGE', 'Failed to fetch game data')
        return { success: false, error: 'Failed to fetch game data' }
      }
    },
    
    async startGame({ commit, state }, gameId) {
      try {
        await axios.post(`/api/games/start/${gameId}`, {
          playerId: state.user.id
        }, {
          headers: { 'x-auth-token': state.token }
        })
        
        return { success: true }
      } catch (error) {
        commit('SET_ERROR_MESSAGE', error.response?.data?.msg || 'Failed to start game')
        return { success: false, error: error.response?.data?.msg || 'Failed to start game' }
      }
    },
    
    // Socket event handlers
    updateGameState({ commit }, gameState) {
      commit('SET_CURRENT_GAME', gameState)
    },
    
    receiveCards({ commit }, { hand }) {
      commit('SET_PLAYER_HAND', hand)
    },
    
    yourTurn({ commit }, { options }) {
      commit('SET_YOUR_TURN', true)
      commit('SET_AVAILABLE_ACTIONS', options)
    },
    
    endTurn({ commit }) {
      commit('SET_YOUR_TURN', false)
      commit('SET_AVAILABLE_ACTIONS', [])
    },
    
    // Player actions
    async performAction({ commit }, { action, amount }) {
      try {
        commit('SET_YOUR_TURN', false)
        return { success: true, action, amount }
      } catch (error) {
        commit('SET_ERROR_MESSAGE', 'Failed to perform action')
        return { success: false, error: 'Failed to perform action' }
      }
    },
    
    clearErrorMessage({ commit }) {
      commit('CLEAR_ERROR_MESSAGE')
    }
  },
  
  modules: {
  }
})