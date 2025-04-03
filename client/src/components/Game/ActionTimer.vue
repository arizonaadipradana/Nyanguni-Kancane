<!-- client/src/components/Game/ActionTimer.vue -->
<template>
  <div class="action-timer" v-if="isGameActive && timeRemaining > 0">
    <div class="timer-bar">
      <div 
        class="timer-progress" 
        :style="{ width: progressPercentage + '%', backgroundColor: timerColor }"
      ></div>
    </div>
    <div class="timer-text">
      {{ timeRemaining }} seconds to act
    </div>
  </div>
</template>

<script>
export default {
  name: 'ActionTimer',
  
  props: {
    initialTime: {
      type: Number,
      default: 60
    },
    isActive: {
      type: Boolean,
      default: false
    },
    currentGame: {
      type: Object,
      required: true
    }
  },
  
  data() {
    return {
      timeRemaining: 0,
      timerInterval: null
    };
  },
  
  computed: {
    progressPercentage() {
      return (this.timeRemaining / this.initialTime) * 100;
    },
    
    timerColor() {
      if (this.timeRemaining <= 10) {
        return '#e74c3c'; // Red for last 10 seconds
      } else if (this.timeRemaining <= 20) {
        return '#f39c12'; // Orange for 11-20 seconds
      } else {
        return '#2ecc71'; // Green for remaining time
      }
    },
    
    isGameActive() {
      return this.currentGame && this.currentGame.status === 'active';
    }
  },
  
  watch: {
    isActive(newValue) {
      if (newValue && this.isGameActive) {
        this.startTimer();
      } else {
        this.stopTimer();
      }
    },
    
    initialTime(newValue) {
      if (this.isActive && this.isGameActive) {
        this.timeRemaining = newValue;
        this.restartTimer();
      }
    },
    
    'currentGame.status'(newStatus) {
      if (newStatus !== 'active') {
        this.stopTimer();
      } else if (this.isActive) {
        this.startTimer();
      }
    }
  },
  
  mounted() {
    if (this.isActive && this.isGameActive) {
      this.startTimer();
    }
  },
  
  beforeDestroy() {
    this.stopTimer();
  },
  
  methods: {
    startTimer() {
      this.stopTimer(); // Clear any existing timer
      
      if (!this.isGameActive) {
        console.log('Cannot start timer - game is not active');
        return;
      }
      
      this.timeRemaining = this.initialTime;
      
      this.timerInterval = setInterval(() => {
        if (this.timeRemaining > 0) {
          this.timeRemaining--;
        } else {
          this.stopTimer();
          this.$emit('timerComplete');
        }
      }, 1000);
    },
    
    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    },
    
    restartTimer() {
      this.stopTimer();
      if (this.isGameActive) {
        this.startTimer();
      }
    },
    
    resetTimer() {
      this.timeRemaining = this.initialTime;
    }
  }
}
</script>

<style scoped>
.action-timer {
  width: 100%;
  max-width: 300px;
  margin: 0 auto 10px;
}

.timer-bar {
  height: 8px;
  background-color: #333;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 5px;
}

.timer-progress {
  height: 100%;
  transition: width 1s linear, background-color 1s;
}

.timer-text {
  font-size: 14px;
  color: white;
  text-align: center;
}
</style>