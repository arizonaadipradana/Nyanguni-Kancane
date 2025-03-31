<!-- client/src/views/Home.vue -->
<template>
    <div class="container">
      <div class="home">
        <h1>Nyanguni Kancane</h1>
        <h2>Texas Hold'em Poker</h2>
        
        <div class="card">
          <p>Welcome to Nyanguni Kancane, a simple Texas Hold'em poker game.</p>
          <p>1 chip = 500 rupiah</p>
          
          <div class="action-buttons" v-if="!isAuthenticated">
            <router-link to="/login" class="btn">Login</router-link>
            <router-link to="/register" class="btn btn-secondary">Register</router-link>
          </div>
          
          <div class="action-buttons" v-else>
            <router-link to="/lobby" class="btn">Enter Lobby</router-link>
            <button @click="logout" class="btn btn-secondary">Logout</button>
          </div>
        </div>
        
        <div class="card rules">
          <h3>Game Rules</h3>
          
          <h4>1. The Basics:</h4>
          <ul>
            <li><strong>Hole Cards:</strong> Each player is dealt two private cards, which they keep hidden from other players.</li>
            <li><strong>Community Cards:</strong> Five cards are dealt face-up on the table, known as the "board".</li>
            <li><strong>Hand Formation:</strong> Players combine their two hole cards with any combination of the five community cards to create their best five-card poker hand.</li>
          </ul>
          
          <h4>2. The Game Flow:</h4>
          <ul>
            <li><strong>Blinds:</strong> Before any cards are dealt, two players (the "small blind" and "big blind") are required to place compulsory bets.</li>
            <li><strong>Pre-Flop Betting:</strong> A round of betting occurs (players bet 1 chip into the pot) before the first three community cards (the "flop") are dealt.</li>
            <li><strong>The Flop:</strong> Three community cards are dealt face-up, followed by another round of betting.</li>
            <li><strong>The Turn:</strong> A fourth community card (the "turn") is dealt face-up, followed by another round of betting.</li>
            <li><strong>The River:</strong> A fifth and final community card (the "river") is dealt face-up, followed by the final round of betting.</li>
            <li><strong>Showdown:</strong> If multiple players remain in the hand after the final betting round, they reveal their hole cards, and the player with the best five-card poker hand wins the pot.</li>
          </ul>
          
          <h4>3. Betting Options:</h4>
          <ul>
            <li><strong>Check:</strong> To pass the betting action to the next player without placing a bet.</li>
            <li><strong>Bet:</strong> To place a bet, requiring other players to match the bet or fold.</li>
            <li><strong>Call:</strong> To match the current bet.</li>
            <li><strong>Raise:</strong> To increase the current bet.</li>
            <li><strong>Fold:</strong> To discard your hand and forfeit your chips for that hand.</li>
          </ul>
          
          <h4>4. Poker Hand Rankings (from highest to lowest):</h4>
          <ul>
            <li><strong>Royal Flush:</strong> Ace, King, Queen, Jack, and Ten of the same suit.</li>
            <li><strong>Straight Flush:</strong> Five consecutive cards of the same suit.</li>
            <li><strong>Four of a Kind:</strong> Four cards of the same rank.</li>
            <li><strong>Full House:</strong> Three of a kind and a pair.</li>
            <li><strong>Flush:</strong> Five cards of the same suit, not necessarily in sequence.</li>
            <li><strong>Straight:</strong> Five consecutive cards, not necessarily of the same suit.</li>
            <li><strong>Three of a Kind:</strong> Three cards of the same rank.</li>
            <li><strong>Two Pair:</strong> Two different pairs of cards.</li>
            <li><strong>One Pair:</strong> A pair of cards of the same rank.</li>
            <li><strong>High Card:</strong> If no other hand is formed, the highest card in the hand determines the winner.</li>
          </ul>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import { mapGetters, mapActions } from 'vuex'
  
  export default {
    name: 'Home',
    
    computed: {
      ...mapGetters(['isAuthenticated'])
    },
    
    methods: {
      ...mapActions(['logout'])
    }
  }
  </script>
  
  <style scoped>
  .home {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  
  h1 {
    color: #3f8c6e;
    text-align: center;
    font-size: 2.5em;
    margin-bottom: 5px;
  }
  
  h2 {
    color: #999;
    text-align: center;
    font-size: 1.5em;
    margin-top: 0;
    margin-bottom: 30px;
  }
  
  .action-buttons {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 20px;
  }
  
  .rules {
    margin-top: 30px;
    text-align: left;
  }
  
  .rules h3 {
    color: #3f8c6e;
    text-align: center;
    margin-bottom: 20px;
  }
  
  .rules h4 {
    margin-top: 20px;
    margin-bottom: 10px;
    color: #3f8c6e;
  }
  
  .rules ul {
    margin-top: 10px;
    padding-left: 20px;
  }
  
  .rules li {
    margin-bottom: 5px;
  }
  </style>