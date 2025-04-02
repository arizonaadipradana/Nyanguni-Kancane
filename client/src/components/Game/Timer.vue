<!-- client/src/components/Game/TurnTimer.vue -->
<template>
  <div class="turn-timer" v-if="isActive">
    <div class="timer-bar-container">
      <div 
        class="timer-bar" 
        :style="{ width: timerPercentage + '%', backgroundColor: timerColor }"
      ></div>
    </div>
    <div class="timer-text">
      {{ timeRemaining }}s
    </div>
  </div>
</template>

<script>
export default {
  name: 'TurnTimer',
  
  props: {
    initialTime: {
      type: Number,
      default: 60 // Default to 60 seconds
    },
    isActive: {
      type: Boolean,
      default: false
    }
  },
  
  data() {
    return {
      timeRemaining: this.initialTime,
      timerInterval: null,
      warningThreshold: 15, // Show yellow at 15 seconds
      dangerThreshold: 5   // Show red at 5 seconds
    };
  },
  
  computed: {
    timerPercentage() {
      return (this.timeRemaining / this.initialTime) * 100;
    },
    
    timerColor() {
      if (this.timeRemaining <= this.dangerThreshold) {
        return '#e74c3c'; // Red
      } else if (this.timeRemaining <= this.warningThreshold) {
        return '#f39c12'; // Yellow/Orange
      } else {
        return '#2ecc71'; // Green
      }
    }
  },
  
  watch: {
    isActive(newValue) {
      if (newValue) {
        this.startTimer();
      } else {
        this.stopTimer();
      }
    },
    
    initialTime(newValue) {
      // Reset timer if the initial time changes
      this.timeRemaining = newValue;
      if (this.isActive) {
        this.stopTimer();
        this.startTimer();
      }
    }
  },
  
  mounted() {
    if (this.isActive) {
      this.startTimer();
    }
  },
  
  methods: {
    startTimer() {
      // Reset the timer
      this.timeRemaining = this.initialTime;
      
      // Clear any existing interval
      this.stopTimer();
      
      // Start a new interval
      this.timerInterval = setInterval(() => {
        if (this.timeRemaining > 0) {
          this.timeRemaining--;
          
          // Emit events for specific thresholds
          if (this.timeRemaining === this.warningThreshold) {
            this.$emit('warning');
          } else if (this.timeRemaining === this.dangerThreshold) {
            this.$emit('danger');
          }
        } else {
          // Time is up
          this.$emit('timeout');
          this.stopTimer();
        }
      }, 1000);
    },
    
    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    },
    
    resetTimer(newTime = null) {
      this.timeRemaining = newTime || this.initialTime;
      if (this.isActive) {
        this.stopTimer();
        this.startTimer();
      }
    }
  },
  
  beforeDestroy() {
    this.stopTimer();
  }
};
</script>

<style scoped>
.turn-timer {
  margin: 10px 0;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.timer-bar-container {
  flex: 1;
  height: 10px;
  background-color: #333;
  border-radius: 5px;
  overflow: hidden;
}

.timer-bar {
  height: 100%;
  transition: width 1s linear, background-color 0.5s;
}

.timer-text {
  width: 40px;
  text-align: right;
  font-weight: bold;
  font-family: monospace;
}
</style>