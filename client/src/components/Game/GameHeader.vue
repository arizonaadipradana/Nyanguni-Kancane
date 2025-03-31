<!-- client/src/components/Game/GameHeader.vue -->
<template>
    <div class="game-header">
      <h2>Nyanguni Kancane - Game #{{ gameId }}</h2>
      <div class="game-info">
        <span>Pot: {{ currentGame ? currentGame.pot : 0 }} chips</span>
        <button @click="$emit('copyGameId')" class="btn-secondary btn-sm">
          Share Game ID
        </button>
        <button @click="$emit('leaveGame')" class="btn-danger btn-sm">
          Leave Game
        </button>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'GameHeader',
    
    props: {
      gameId: {
        type: String,
        required: true
      },
      currentGame: {
        type: Object,
        default: null
      }
    }
  };
  </script>
  
  <style scoped>
  .game-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .game-header h2 {
    margin: 0;
    color: #3f8c6e;
  }
  
  .game-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  .btn-sm {
    padding: 5px 10px;
    font-size: 12px;
  }
  
  .btn-secondary {
    background-color: #555;
  }
  
  .btn-secondary:hover {
    background-color: #444;
  }
  
  .btn-danger {
    background-color: #e74c3c;
  }
  
  .btn-danger:hover {
    background-color: #c0392b;
  }
  </style>