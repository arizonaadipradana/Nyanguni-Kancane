<!-- client/src/views/Lobby.vue -->
<template>
    <div class="container">
      <div class="lobby">
        <h2>Game Lobby</h2>
        
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>
        
        <div class="user-info card">
          <h3>Welcome, {{ currentUser ? currentUser.username : 'Player' }}</h3>
          <p>Balance: {{ currentUser ? currentUser.balance : 0 }} chips ({{ formatRupiah(currentUser ? currentUser.balance * 500 : 0) }})</p>
        </div>
        
        <div class="lobby-actions">
          <div class="card">
            <h3>Create New Game</h3>
            <p>Start a new poker table and invite other players</p>
            <button @click="handleCreateGame" class="btn" :disabled="isCreating">
              {{ isCreating ? 'Creating...' : 'Create Game' }}
            </button>
          </div>
          
          <div class="card">
            <h3>Join Existing Game</h3>
            <p>Enter a 6-character game ID to join</p>
            <div class="form-group">
              <input 
                type="text" 
                v-model="gameIdInput" 
                placeholder="Enter Game ID" 
                maxlength="6"
                class="form-control"
              />
            </div>
            <button 
              @click="handleJoinGame" 
              class="btn" 
              :disabled="!isValidGameId || isJoining"
            >
              {{ isJoining ? 'Joining...' : 'Join Game' }}
            </button>
          </div>
        </div>
        
        <div class="lobby-footer">
          <button @click="logout" class="btn btn-secondary">Logout</button>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import { mapGetters, mapActions } from 'vuex'
  
  export default {
    name: 'Lobby',
    
    data() {
      return {
        gameIdInput: '',
        isCreating: false,
        isJoining: false
      }
    },
    
    computed: {
      ...mapGetters(['currentUser', 'errorMessage']),
      
      isValidGameId() {
        return this.gameIdInput.length === 6 && /^[0-9a-f]{6}$/.test(this.gameIdInput)
      }
    },
    
    methods: {
      ...mapActions(['createGame', 'joinGame', 'clearErrorMessage', 'logout']),
      
      formatRupiah(amount) {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          minimumFractionDigits: 0
        }).format(amount)
      },
      
      async handleCreateGame() {
        this.isCreating = true
        
        try {
          const result = await this.createGame()
          
          if (result.success) {
            this.$router.push(`/game/${result.gameId}`)
          }
        } catch (error) {
          console.error('Error creating game:', error)
        } finally {
          this.isCreating = false
        }
      },
      
      async handleJoinGame() {
        if (!this.isValidGameId) {
          return
        }
        
        this.isJoining = true
        
        try {
          const result = await this.joinGame(this.gameIdInput)
          
          if (result.success) {
            this.$router.push(`/game/${this.gameIdInput}`)
          }
        } catch (error) {
          console.error('Error joining game:', error)
        } finally {
          this.isJoining = false
        }
      }
    },
    
    beforeUnmount() {
      this.clearErrorMessage()
    }
  }
  </script>
  
  <style scoped>
  .lobby {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  
  h2 {
    text-align: center;
    margin-bottom: 20px;
    color: #3f8c6e;
  }
  
  .error-message {
    background-color: #e74c3c;
    color: white;
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 15px;
  }
  
  .user-info {
    text-align: center;
    margin-bottom: 30px;
  }
  
  .user-info h3 {
    margin-top: 0;
    margin-bottom: 10px;
  }
  
  .lobby-actions {
    display: flex;
    gap: 20px;
    margin-bottom: 30px;
  }
  
  @media (max-width: 600px) {
    .lobby-actions {
      flex-direction: column;
    }
  }
  
  .lobby-actions .card {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  
  .lobby-actions h3 {
    margin-top: 0;
    margin-bottom: 10px;
    color: #3f8c6e;
  }
  
  .lobby-actions p {
    margin-bottom: 15px;
    flex-grow: 1;
  }
  
  .lobby-actions button {
    width: 100%;
  }
  
  .lobby-footer {
    display: flex;
    justify-content: center;
  }
  </style>