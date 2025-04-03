<!-- client/src/components/Game/WinnerDisplay.vue -->
<template>
  <div class="winner-display" v-if="visible">
    <div class="winner-overlay"></div>
    <div class="winner-content">
      <h2 class="winner-title">
        <span v-if="winners.length === 1">Winner!</span>
        <span v-else>Split Pot!</span>
      </h2>
      
      <div class="winner-info" v-for="(winner, index) in winners" :key="index">
        <div class="winner-name">{{ winner.username }}</div>
        <div class="winner-hand-name">{{ winner.handName }}</div>
        
        <div class="winner-cards">
          <div 
            v-for="(card, cardIndex) in getWinnerCards(winner)" 
            :key="cardIndex" 
            class="card-display"
          >
            {{ formatCard(card) }}
          </div>
        </div>
      </div>
      
      <div class="countdown">
        Next hand in {{ timeRemaining }} seconds
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WinnerDisplay',
  
  props: {
    winners: {
      type: Array,
      default: () => []
    },
    pot: {
      type: Number,
      default: 0
    },
    visible: {
      type: Boolean,
      default: false
    },
    formatCard: {
      type: Function,
      required: true
    }
  },
  
  data() {
    return {
      timeRemaining: 15,
      countdownInterval: null
    };
  },
  
  watch: {
    visible(newValue) {
      if (newValue) {
        this.startCountdown();
      } else {
        this.stopCountdown();
      }
    }
  },
  
  mounted() {
    if (this.visible) {
      this.startCountdown();
    }
  },
  
  beforeDestroy() {
    this.stopCountdown();
  },
  
  methods: {
    // Safely get the winner's cards with fallbacks
    getWinnerCards(winner) {
      // Check if winner has hand property
      if (!winner || !winner.hand) {
        return [];
      }
      
      // Add extra check to make sure all cards have rank and suit
      return winner.hand.filter(card => card && card.rank && card.suit);
    },
    
    startCountdown() {
      this.stopCountdown(); // Clear any existing countdown
      this.timeRemaining = 15;
      
      this.countdownInterval = setInterval(() => {
        if (this.timeRemaining > 0) {
          this.timeRemaining--;
        } else {
          this.stopCountdown();
          this.$emit('countdownComplete');
        }
      }, 1000);
    },
    
    stopCountdown() {
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    }
  }
}
</script>

<style scoped>
.winner-display {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.winner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
}

.winner-content {
  position: relative;
  background-color: #1c4e38;
  border: 2px solid #3f8c6e;
  border-radius: 10px;
  padding: 20px;
  min-width: 300px;
  max-width: 800px;
  text-align: center;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  animation: scale-in 0.3s ease-out;
}

.winner-title {
  color: #f1c40f;
  font-size: 32px;
  margin-top: 0;
  margin-bottom: 20px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.winner-info {
  margin-bottom: 20px;
  padding: 15px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}

.winner-name {
  font-size: 24px;
  font-weight: bold;
  color: white;
  margin-bottom: 5px;
}

.winner-hand-name {
  font-size: 20px;
  color: #3f8c6e;
  margin-bottom: 15px;
}

.winner-cards {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 15px;
}

.card-display {
  width: 60px;
  height: 85px;
  background-color: white;
  color: black;
  border-radius: 5px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  font-weight: bold;
}

.countdown {
  margin-top: 20px;
  font-size: 18px;
  color: #f39c12;
}

@keyframes scale-in {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (max-width: 600px) {
  .winner-content {
    width: 90%;
    padding: 15px;
  }
  
  .winner-title {
    font-size: 24px;
  }
  
  .winner-name {
    font-size: 20px;
  }
  
  .winner-hand-name {
    font-size: 16px;
  }
  
  .card-display {
    width: 40px;
    height: 60px;
    font-size: 16px;
  }
}
</style>