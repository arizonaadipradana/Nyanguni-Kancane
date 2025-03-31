<!-- client/src/components/Game/PlayerActions.vue -->
<template>
    <div class="player-actions">
      <h3>Your Turn</h3>
  
      <div class="action-buttons">
        <button 
          v-if="availableActions.includes('fold')" 
          @click="$emit('handleAction', 'fold')" 
          class="btn btn-danger"
        >
          Fold
        </button>
  
        <button 
          v-if="availableActions.includes('check')" 
          @click="$emit('handleAction', 'check')" 
          class="btn"
        >
          Check
        </button>
  
        <button 
          v-if="availableActions.includes('call')" 
          @click="$emit('handleAction', 'call')" 
          class="btn"
        >
          Call {{ currentGame.currentBet - getPlayerChipsInPot() }} chips
        </button>
  
        <div v-if="availableActions.includes('bet')" class="bet-action">
          <button @click="$emit('handleAction', 'bet', betAmount)" class="btn">
            Bet {{ betAmount }} chips
          </button>
          <input 
            type="range" 
            :value="betAmount"
            @input="updateBetAmount"
            :min="1"
            :max="getCurrentPlayer() ? getCurrentPlayer().totalChips : 1" 
            class="bet-slider"
          />
        </div>
  
        <div v-if="availableActions.includes('raise')" class="bet-action">
          <button @click="$emit('handleAction', 'raise', raiseAmount)" class="btn">
            Raise to {{ raiseAmount }} chips
          </button>
          <input 
            type="range" 
            :value="raiseAmount"
            @input="updateRaiseAmount"
            :min="currentGame.currentBet * 2"
            :max="getCurrentPlayer() ? (getCurrentPlayer().totalChips + getCurrentPlayer().chips) : 1"
            class="bet-slider"
          />
        </div>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'PlayerActions',
    
    props: {
      availableActions: {
        type: Array,
        required: true
      },
      currentGame: {
        type: Object,
        required: true
      },
      betAmount: {
        type: Number,
        required: true
      },
      raiseAmount: {
        type: Number,
        required: true
      }
    },
    
    methods: {
      getPlayerChipsInPot() {
        return this.$emit('getPlayerChipsInPot');
      },
      
      getCurrentPlayer() {
        return this.$emit('getCurrentPlayer');
      },
      
      updateBetAmount(event) {
        this.$emit('updateBetAmount', parseInt(event.target.value));
      },
      
      updateRaiseAmount(event) {
        this.$emit('updateRaiseAmount', parseInt(event.target.value));
      }
    }
  };
  </script>
  
  <style scoped>
  .player-actions {
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    padding: 15px;
    margin-top: 20px;
    text-align: center;
  }
  
  .player-actions h3 {
    color: white;
    margin-top: 0;
    margin-bottom: 15px;
  }
  
  .action-buttons {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  
  .bet-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }
  
  .bet-slider {
    width: 100%;
    margin-top: 5px;
  }
  
  .btn {
    display: inline-block;
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    background-color: #3f8c6e;
    color: white;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  
  .btn:hover {
    background-color: #2c664e;
  }
  
  .btn-danger {
    background-color: #e74c3c;
  }
  
  .btn-danger:hover {
    background-color: #c0392b;
  }
  </style>