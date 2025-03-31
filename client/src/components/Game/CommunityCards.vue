<!-- client/src/components/Game/CommunityCards.vue -->
<template>
    <div class="community-cards">
      <h3>Community Cards</h3>
      <div class="cards-container">
        <div v-for="(card, index) in communityCards" :key="index" class="card-display">
          {{ formatCard(card) }}
        </div>
        <div v-for="i in (5 - communityCards.length)" :key="`empty-${i}`" class="card-display empty">
          ?
        </div>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'CommunityCards',
    
    props: {
      communityCards: {
        type: Array,
        default: () => []
      },
      formatCard: {
        type: Function,
        required: true
      }
    }
  };
  </script>
  
  <style scoped>
  .community-cards {
    text-align: center;
    margin-bottom: 30px;
  }
  
  .community-cards h3 {
    color: white;
    margin-top: 0;
    margin-bottom: 10px;
  }
  
  .cards-container {
    display: flex;
    justify-content: center;
    gap: 10px;
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
  
  .card-display.empty {
    background-color: #333;
    color: #555;
  }
  
  @media (max-width: 768px) {
    .card-display {
      width: 40px;
      height: 60px;
      font-size: 16px;
    }
  }
  </style>