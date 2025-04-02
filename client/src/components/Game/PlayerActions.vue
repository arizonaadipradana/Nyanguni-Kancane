<!-- client/src/components/Game/PlayerActions.vue -->
<template>
  <div class="player-actions">
    <h3>Your Turn</h3>

    <TurnTimer v-if="isYourTurn" :isActive="isYourTurn" :initialTime="actionTimeLimit" @timeout="handleTimeout"
      @warning="handleTimeWarning" ref="turnTimer" />

    <div class="action-buttons">
      <button v-if="availableActions.includes('fold')" @click="$emit('handleAction', 'fold')" class="btn btn-danger">
        Fold
      </button>

      <button v-if="availableActions.includes('check')" @click="$emit('handleAction', 'check')" class="btn">
        Check
      </button>

      <button v-if="availableActions.includes('call')" @click="$emit('handleAction', 'call', getCallAmount())"
        class="btn">
        Call {{ formattedCallAmount }} chips
      </button>

      <div v-if="availableActions.includes('bet')" class="bet-action">
        <div class="bet-input-group">
          <label for="betAmount">Bet Amount:</label>
          <div class="input-with-controls">
            <button type="button" @click="decrementBet" class="amount-btn">-</button>
            <input type="number" id="betAmount" v-model.number="internalBetAmount" @change="updateLocalBetAmount"
              @blur="validateBetAmount" :min="1" :max="getMaxBetAmount()" class="amount-input" />
            <button type="button" @click="incrementBet" class="amount-btn">+</button>
          </div>
        </div>
        <button @click="handleBet" class="btn">
          Bet {{ internalBetAmount }} chips
        </button>
      </div>

      <div v-if="availableActions.includes('raise')" class="bet-action">
        <div class="bet-input-group">
          <label for="raiseAmount">Raise Amount:</label>
          <div class="input-with-controls">
            <button type="button" @click="decrementRaise" class="amount-btn">-</button>
            <input type="number" id="raiseAmount" v-model.number="internalRaiseAmount" @change="updateLocalRaiseAmount"
              @blur="validateRaiseAmount" :min="getMinRaiseAmount()" :max="getMaxRaiseAmount()" class="amount-input" />
            <button type="button" @click="incrementRaise" class="amount-btn">+</button>
          </div>
        </div>
        <button @click="handleRaise" class="btn">
          Raise to {{ internalRaiseAmount }} chips
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import TurnTimer from './Timer.vue';

export default {
  name: 'PlayerActions',

  components: {
    TurnTimer
  },

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
    },
    actionTimeLimit: {
      type: Number,
      default: 60
    },
  },

  data() {
    return {
      internalBetAmount: 1,
      internalRaiseAmount: 2,
      actionTimeLimit: 60,
    };
  },

  computed: {
    formattedCallAmount() {
      const amount = this.getCallAmount();
      return isNaN(amount) ? 0 : amount;
    }
  },

  created() {
    // Initialize internal values from props
    this.internalBetAmount = this.betAmount || 1;
    this.internalRaiseAmount = this.raiseAmount || this.getMinRaiseAmount();
  },

  methods: {
    // Helpers
    getCurrentPlayer() {
      // This returns the player directly
      const player = this.currentGame.players.find(
        p => p.id === this.$store.getters.currentUser.id
      );
      return player;
    },

    getPlayerChipsInPot() {
      const player = this.getCurrentPlayer();
      return player ? (player.chips || 0) : 0;
    },

    getCallAmount() {
      const currentBet = this.currentGame ? (this.currentGame.currentBet || 0) : 0;
      const playerChips = this.getPlayerChipsInPot();
      const callAmount = currentBet - playerChips;
      return Math.max(0, callAmount);
    },

    getMaxBetAmount() {
      const player = this.getCurrentPlayer();
      return player ? (player.totalChips || 1) : 1;
    },

    getMinRaiseAmount() {
      const currentBet = this.currentGame ? (this.currentGame.currentBet || 0) : 0;
      return Math.max(currentBet * 2, 2); // Minimum raise is at least double the current bet
    },

    getMaxRaiseAmount() {
      const player = this.getCurrentPlayer();
      if (!player) return 2;

      const totalChips = player.totalChips || 0;
      const chipsInPot = player.chips || 0;
      return totalChips + chipsInPot;
    },

    // UI Events
    handleBet() {
      this.validateBetAmount();
      this.$emit('handleAction', 'bet', this.internalBetAmount);
    },

    handleRaise() {
      this.validateRaiseAmount();
      this.$emit('handleAction', 'raise', this.internalRaiseAmount);
    },

    updateLocalBetAmount() {
      this.validateBetAmount();
      this.$emit('updateBetAmount', this.internalBetAmount);
    },

    updateLocalRaiseAmount() {
      this.validateRaiseAmount();
      this.$emit('updateRaiseAmount', this.internalRaiseAmount);
    },

    // Validation
    validateBetAmount() {
      let value = parseInt(this.internalBetAmount);

      // Handle NaN and validation
      if (isNaN(value) || value < 1) {
        value = 1;
      }

      // Check max
      const maxBet = this.getMaxBetAmount();
      if (value > maxBet) {
        value = maxBet;
      }

      // Update the model with valid value
      this.internalBetAmount = value;
    },

    validateRaiseAmount() {
      let value = parseInt(this.internalRaiseAmount);
      const minRaise = this.getMinRaiseAmount();

      // Handle NaN and validation
      if (isNaN(value) || value < minRaise) {
        value = minRaise;
      }

      // Check max
      const maxRaise = this.getMaxRaiseAmount();
      if (value > maxRaise) {
        value = maxRaise;
      }

      // Update the model with valid value
      this.internalRaiseAmount = value;
    },

    // Increment/Decrement
    incrementBet() {
      // Make sure we have a valid value first
      this.validateBetAmount();
      // Then increment
      const newValue = Math.min(this.internalBetAmount + 1, this.getMaxBetAmount());
      this.internalBetAmount = newValue;
      this.updateLocalBetAmount();
    },

    decrementBet() {
      // Make sure we have a valid value first
      this.validateBetAmount();
      // Then decrement
      const newValue = Math.max(this.internalBetAmount - 1, 1);
      this.internalBetAmount = newValue;
      this.updateLocalBetAmount();
    },

    incrementRaise() {
      // Make sure we have a valid value first
      this.validateRaiseAmount();
      // Then increment
      const newValue = Math.min(this.internalRaiseAmount + 1, this.getMaxRaiseAmount());
      this.internalRaiseAmount = newValue;
      this.updateLocalRaiseAmount();
    },

    decrementRaise() {
      // Make sure we have a valid value first
      this.validateRaiseAmount();
      // Then decrement
      const newValue = Math.max(this.internalRaiseAmount - 1, this.getMinRaiseAmount());
      this.internalRaiseAmount = newValue;
      this.updateLocalRaiseAmount();
    },

    handleTimeout() {
      // Auto-fold when time runs out
      if (this.isYourTurn) {
        this.$emit('handleAction', 'fold');
        this.$emit('log', 'Time expired - auto folding');
      }
    },
    handleTimeWarning() {
      // Emit a time warning event - parent component can display a notification
      this.$emit('timeWarning');
    },
  },

  watch: {
    // Watch for external changes
    betAmount: {
      handler(newVal) {
        if (newVal !== this.internalBetAmount) {
          this.internalBetAmount = newVal;
        }
      },
      immediate: true
    },

    raiseAmount: {
      handler(newVal) {
        if (newVal !== this.internalRaiseAmount) {
          this.internalRaiseAmount = newVal;
        }
      },
      immediate: true
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
  gap: 10px;
  min-width: 200px;
}

.bet-input-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.bet-input-group label {
  color: #ccc;
  font-size: 14px;
  text-align: left;
}

.input-with-controls {
  display: flex;
  align-items: center;
  width: 100%;
}

.amount-input {
  flex: 1;
  background-color: #333;
  color: white;
  border: 1px solid #555;
  border-radius: 0;
  padding: 8px;
  text-align: center;
  -moz-appearance: textfield;
  /* Remove arrows in Firefox */
}

/* Remove arrows in Chrome, Safari, Edge, Opera */
.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.amount-btn {
  background-color: #555;
  border: 1px solid #666;
  color: white;
  width: 30px;
  height: 36px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.amount-btn:first-child {
  border-radius: 4px 0 0 4px;
}

.amount-btn:last-child {
  border-radius: 0 4px 4px 0;
}

.amount-btn:hover {
  background-color: #666;
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
  min-width: 100px;
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

@media (max-width: 480px) {
  .action-buttons {
    flex-direction: column;
    align-items: center;
  }

  .bet-action {
    width: 100%;
  }
}
</style>