<!-- client/src/components/Game/GameLog.vue -->
<template>
    <div class="game-log">
      <h3>Game Log</h3>
      <div class="log-entries">
        <div v-for="(entry, index) in gameLog" :key="index" class="log-entry">
          {{ entry }}
        </div>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'GameLog',
    
    props: {
      gameLog: {
        type: Array,
        default: () => []
      }
    }
  };
  </script>
  
  <style scoped>
  .game-log {
    grid-area: log;
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 15px;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .game-log h3 {
    margin-top: 0;
    margin-bottom: 10px;
    color: #3f8c6e;
  }
  
  .log-entries {
    max-height: 150px;
    overflow-y: auto;
  }
  
  .log-entry {
    padding: 5px 0;
    border-bottom: 1px solid #444;
    font-size: 14px;
  }
  </style>