<!-- client/src/components/Game/WinnerDisplay.vue -->
<template>
    <div v-if="visible" class="winner-display">
      <div class="winner-modal">
        <div class="winner-header">
          <h3>{{ getWinnerTitle() }}</h3>
          <div class="timer">Results closing in {{ timeRemaining }}s</div>
        </div>
        
        <div class="winner-content">
          <div v-for="(winner, index) in result.winners" :key="index" class="winner-row">
            <div class="winner-info">
              <div class="winner-name">{{ winner.username }}</div>
              <div class="hand-name">{{ winner.handName }}</div>
              <div class="pot-amount">Won {{ getPotShare(index) }} chips</div>
            </div>
            
            <div class="winner-cards">
              <div v-for="(card, cardIndex) in winner.hand" :key="cardIndex" class="card-display">
                {{ formatCard(card) }}
              </div>
            </div>
          </div>
        </div>
        
        <div class="community-cards-section" v-if="showCommunityCards">
          <h4>Community Cards</h4>
          <div class="community-cards">
            <div v-for="(card, index) in result.communityCards" :key="index" class="card-display">
              {{ formatCard(card) }}
            </div>
          </div>
        </div>
        
        <div class="all-hands-section" v-if="showAllHands">
          <h4>All Hands</h4>
          <div v-for="(hand, index) in result.hands" :key="index" class="hand-row">
            <div class="player-info">
              <span class="player-name">{{ hand.player }}</span>
              <span class="hand-name">{{ hand.handName }}</span>
            </div>
            <div class="player-cards">
              <div v-for="(card, cardIndex) in hand.cards" :key="cardIndex" class="card-display small">
                {{ formatCard(card) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'WinnerDisplay',
    
    props: {
      result: {
        type: Object,
        default: () => ({
          winners: [],
          hands: [],
          pot: 0,
          communityCards: []
        })
      },
      visible: {
        type: Boolean,
        default: false
      },
      showCommunityCards: {
        type: Boolean,
        default: true
      },
      showAllHands: {
        type: Boolean,
        default: true
      },
      displayTime: {
        type: Number,
        default: 15 // 15 seconds
      },
      formatCard: {
        type: Function,
        required: true
      }
    },
    
    data() {
      return {
        timeRemaining: this.displayTime,
        timer: null
      };
    },
    
    watch: {
      visible(newValue) {
        if (newValue) {
          this.startTimer();
        } else {
          this.stopTimer();
        }
      },
      
      displayTime(newValue) {
        this.timeRemaining = newValue;
      }
    },
    
    methods: {
      getWinnerTitle() {
        const winners = this.result.winners || [];
        
        if (winners.length === 0) {
          return 'Hand Complete';
        } else if (winners.length === 1) {
          return `${winners[0].username} wins the pot!`;
        } else {
          return 'Pot Split Between Winners';
        }
      },
      
      getPotShare(index) {
        const winners = this.result.winners || [];
        if (winners.length === 0 || !this.result.pot) return 0;
        
        const evenShare = Math.floor(this.result.pot / winners.length);
        const remainder = this.result.pot % winners.length;
        
        // Give the remainder to the first winner
        return index === 0 ? evenShare + remainder : evenShare;
      },
      
      startTimer() {
        this.stopTimer();
        this.timeRemaining = this.displayTime;
        
        this.timer = setInterval(() => {
          if (this.timeRemaining > 0) {
            this.timeRemaining--;
          } else {
            this.stopTimer();
            this.$emit('close');
          }
        }, 1000);
      },
      
      stopTimer() {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }
    },
    
    mounted() {
      if (this.visible) {
        this.startTimer();
      }
    },
    
    beforeDestroy() {
      this.stopTimer();
    }
  };
  </script>
  
  <style scoped>
  .winner-display {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .winner-modal {
    background-color: #2a2a2a;
    border-radius: 8px;
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }
  
  .winner-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid #444;
    padding-bottom: 10px;
  }
  
  .winner-header h3 {
    color: #3f8c6e;
    margin: 0;
    font-size: 24px;
  }
  
  .timer {
    background-color: #444;
    padding: 5px 10px;
    border-radius: 15px;
    font-size: 14px;
  }
  
  .winner-content {
    margin-bottom: 20px;
  }
  
  .winner-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding: 15px;
    background-color: rgba(63, 140, 110, 0.2);
    border-radius: 8px;
  }
  
  .winner-info {
    flex: 1;
  }
  
  .winner-name {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .hand-name {
    color: #f39c12;
    margin-bottom: 5px;
  }
  
  .pot-amount {
    font-weight: bold;
    color: #2ecc71;
  }
  
  .winner-cards {
    display: flex;
    gap: 10px;
  }
  
  .community-cards-section, .all-hands-section {
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #444;
  }
  
  .community-cards-section h4, .all-hands-section h4 {
    color: #3f8c6e;
    margin-bottom: 10px;
  }
  
  .community-cards {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  
  .hand-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    margin-bottom: 8px;
    background-color: #333;
    border-radius: 4px;
  }
  
  .player-info {
    flex: 1;
  }
  
  .player-name {
    font-weight: bold;
    margin-right: 10px;
  }
  
  .player-cards {
    display: flex;
    gap: 5px;
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
  
  .card-display.small {
    width: 40px;
    height: 60px;
    font-size: 16px;
  }
  
  @media (max-width: 768px) {
    .winner-row {
      flex-direction: column;
      align-items: flex-start;
    }
    
    .winner-info {
      margin-bottom: 15px;
    }
    
    .hand-row {
      flex-direction: column;
      align-items: flex-start;
    }
    
    .player-info {
      margin-bottom: 10px;
    }
    
    .card-display {
      width: 40px;
      height: 60px;
      font-size: 16px;
    }
  }
  </style>