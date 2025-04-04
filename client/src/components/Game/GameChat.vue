// client/src/components/Game/GameChat.vue
<template>
  <div class="game-chat">
    <div class="chat-header">
      <h3>Game Chat</h3>
      <div class="chat-controls">
        <button @click="toggleChat" class="toggle-btn">
          {{ chatMinimized ? 'Show Chat' : 'Hide Chat' }}
        </button>
      </div>
    </div>
    
    <div v-if="!chatMinimized" class="chat-content">
      <div class="messages-container" ref="messagesContainer">
        <div v-for="(message, index) in chatMessages" :key="index" 
             class="message" :class="{
               'system-message': message.type === 'system',
               'own-message': message.userId === currentUser.id,
               'player-message': message.type !== 'system'
             }">
          <div class="message-header">
            <span class="username">{{ message.username }}</span>
            <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
          </div>
          <div class="message-content">{{ message.message }}</div>
        </div>
      </div>
      
      <div class="message-input">
        <input 
          type="text" 
          v-model="newMessage" 
          @keyup.enter="sendMessage"
          placeholder="Type a message..."
          :disabled="inputDisabled"
        />
        <button 
          @click="sendMessage" 
          class="send-btn"
          :disabled="inputDisabled"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import SocketService from '@/services/SocketService';

export default {
  name: 'GameChat',
  
  props: {
    gameId: {
      type: String,
      required: true
    },
    currentUser: {
      type: Object,
      required: true
    }
  },
  
  data() {
    return {
      chatMessages: [],
      newMessage: '',
      chatMinimized: false,
      inputDisabled: false,
      // For duplicate prevention
      recentMessages: new Map(), // userId -> {message, timestamp}
      messageDedupeTime: 3000, // 3 seconds threshold
      rateLimit: {
        messageCount: 0,
        lastResetTime: Date.now(),
        timeout: null,
        waiting: false
      },
      messageRateLimit: 3, // Max 3 messages per 5 seconds
      rateLimitResetTime: 5000 // 5 seconds
    };
  },
  
  mounted() {
    this.setupChatListeners();
    this.scrollToBottom();
  },
  
  methods: {
    setupChatListeners() {
      // Listen for chat messages
      SocketService.on('chatMessage', this.handleChatMessage);
      
      // Listen for game updates that might be relevant (like player join/leave)
      SocketService.on('playerJoined', this.handlePlayerJoined);
      SocketService.on('playerLeft', this.handlePlayerLeft);
      
      // Listen for game state changes
      SocketService.on('gameStarted', this.handleGameStarted);
      SocketService.on('gameEnded', this.handleGameEnded);
      SocketService.on('handResult', this.handleHandResult);
    },
    
    // Socket event handlers
    handleChatMessage(data) {
      // Only add message if it's not a duplicate
      if (!this.isDuplicateMessage(data)) {
        this.chatMessages.push(data);
        this.scrollToBottom();
        
        // For system message type, we don't need to track for deduplication
        if (data.type !== 'system') {
          // Add to recent messages map for deduplication checks
          this.recentMessages.set(data.userId, {
            message: data.message,
            timestamp: Date.now()
          });
        }
      }
    },
    
    handlePlayerJoined(data) {
      // Add a system message
      this.chatMessages.push({
        type: 'system',
        username: 'System',
        message: `${data.username} has joined the game`,
        timestamp: Date.now()
      });
      this.scrollToBottom();
    },
    
    handlePlayerLeft(data) {
      // Add a system message
      this.chatMessages.push({
        type: 'system',
        username: 'System',
        message: `${data.username} has left the game`,
        timestamp: Date.now()
      });
      this.scrollToBottom();
    },
    
    handleGameStarted() {
      this.chatMessages.push({
        type: 'system',
        username: 'System',
        message: 'The game has started!',
        timestamp: Date.now()
      });
      this.scrollToBottom();
    },
    
    handleGameEnded(data) {
      this.chatMessages.push({
        type: 'system',
        username: 'System',
        message: `Game ended: ${data.message || 'Game completed'}`,
        timestamp: Date.now()
      });
      this.scrollToBottom();
    },
    
    handleHandResult(data) {
      // Format winners for chat message
      let winnerNames = 'Unknown';
      
      if (data.winners && data.winners.length) {
        winnerNames = data.winners.map(w => w.username).join(', ');
      }
      
      const message = data.isFoldWin 
        ? `${winnerNames} won by fold` 
        : `Hand complete. Winner(s): ${winnerNames}`;
        
      this.chatMessages.push({
        type: 'system',
        username: 'System',
        message: message,
        timestamp: Date.now()
      });
      this.scrollToBottom();
    },
    
    // Check if a message is a duplicate
    isDuplicateMessage(message) {
      // System messages are always shown
      if (message.type === 'system') {
        return false;
      }
      
      // Check if this user has sent a recent message
      if (this.recentMessages.has(message.userId)) {
        const recentMsg = this.recentMessages.get(message.userId);
        const timeDiff = Date.now() - recentMsg.timestamp;
        
        // If it's the same message content within the dedupe time window
        if (
          recentMsg.message === message.message && 
          timeDiff < this.messageDedupeTime
        ) {
          console.log(`Duplicate message suppressed: ${message.message}`);
          return true;
        }
      }
      
      return false;
    },
    
    // Send a message
    sendMessage() {
      // Don't send empty messages
      if (!this.newMessage.trim()) {
        return;
      }
      
      // Check for rate limiting
      if (this.isRateLimited()) {
        // Show a warning in the chat
        this.chatMessages.push({
          type: 'system',
          username: 'System',
          message: 'Please wait a moment before sending more messages',
          timestamp: Date.now()
        });
        this.scrollToBottom();
        return;
      }
      
      // Check for duplicate message from self
      const myRecentMessage = this.recentMessages.get(this.currentUser.id);
      if (myRecentMessage && 
          myRecentMessage.message === this.newMessage && 
          Date.now() - myRecentMessage.timestamp < this.messageDedupeTime) {
        // Show a warning in the chat
        this.chatMessages.push({
          type: 'system',
          username: 'System',
          message: 'Duplicate message not sent',
          timestamp: Date.now()
        });
        this.scrollToBottom();
        return;
      }
      
      // Increment rate limit counter
      this.incrementRateLimit();
      
      // Store this message for deduplication
      this.recentMessages.set(this.currentUser.id, {
        message: this.newMessage,
        timestamp: Date.now()
      });
      
      // Send message to server
      SocketService.sendChatMessage(
        this.gameId,
        this.currentUser.id,
        this.currentUser.username,
        this.newMessage
      );
      
      // Add to local messages immediately for responsive UI
      this.chatMessages.push({
        type: 'user',
        userId: this.currentUser.id,
        username: this.currentUser.username,
        message: this.newMessage,
        timestamp: Date.now()
      });
      
      // Clear input and scroll to bottom
      this.newMessage = '';
      this.scrollToBottom();
    },
    
    // Rate limiting logic
    isRateLimited() {
      const now = Date.now();
      
      // Reset counter if enough time has passed
      if (now - this.rateLimit.lastResetTime > this.rateLimitResetTime) {
        this.rateLimit.messageCount = 0;
        this.rateLimit.lastResetTime = now;
        this.rateLimit.waiting = false;
      }
      
      return this.rateLimit.waiting || this.rateLimit.messageCount >= this.messageRateLimit;
    },
    
    incrementRateLimit() {
      this.rateLimit.messageCount++;
      
      // If we've hit the limit, disable input for the reset time
      if (this.rateLimit.messageCount >= this.messageRateLimit) {
        this.rateLimit.waiting = true;
        this.inputDisabled = true;
        
        // Clear any existing timeout
        if (this.rateLimit.timeout) {
          clearTimeout(this.rateLimit.timeout);
        }
        
        // Set timeout to re-enable input
        this.rateLimit.timeout = setTimeout(() => {
          this.rateLimit.messageCount = 0;
          this.rateLimit.lastResetTime = Date.now();
          this.rateLimit.waiting = false;
          this.inputDisabled = false;
        }, this.rateLimitResetTime);
      }
    },
    
    // UI helpers
    toggleChat() {
      this.chatMinimized = !this.chatMinimized;
      if (!this.chatMinimized) {
        // When showing chat, scroll to bottom
        this.$nextTick(() => {
          this.scrollToBottom();
        });
      }
    },
    
    scrollToBottom() {
      this.$nextTick(() => {
        if (this.$refs.messagesContainer) {
          this.$refs.messagesContainer.scrollTop = this.$refs.messagesContainer.scrollHeight;
        }
      });
    },
    
    formatTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  },
  
  beforeDestroy() {
    // Clean up event listeners
    SocketService.off('chatMessage', this.handleChatMessage);
    SocketService.off('playerJoined', this.handlePlayerJoined);
    SocketService.off('playerLeft', this.handlePlayerLeft);
    SocketService.off('gameStarted', this.handleGameStarted);
    SocketService.off('gameEnded', this.handleGameEnded);
    SocketService.off('handResult', this.handleHandResult);
    
    // Clear any timeouts
    if (this.rateLimit.timeout) {
      clearTimeout(this.rateLimit.timeout);
    }
  }
};
</script>

<style scoped>
.game-chat {
  max-height: 500px; /* Keep consistent height */
  overflow-y: auto;
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 15px;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: rgba(63, 140, 110, 0.2);
  border-bottom: 1px solid rgba(63, 140, 110, 0.3);
}

.chat-header h3 {
  margin: 0;
  color: #3f8c6e;
  font-size: 16px;
}

.toggle-btn {
  background-color: rgba(0, 0, 0, 0.3);
  color: #ccc;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.toggle-btn:hover {
  background-color: rgba(0, 0, 0, 0.5);
}

.chat-content {
  display: flex;
  flex-direction: column;
  height: 300px;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.message {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  max-width: 80%;
  word-break: break-word;
}

.system-message {
  background-color: rgba(0, 0, 0, 0.3);
  color: #aaa;
  font-style: italic;
  align-self: center;
  text-align: center;
  max-width: 90%;
}

.player-message {
  background-color: rgba(255, 255, 255, 0.1);
  align-self: flex-start;
}

.own-message {
  background-color: rgba(63, 140, 110, 0.3);
  align-self: flex-end;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
  font-size: 12px;
}

.username {
  font-weight: bold;
  color: #3f8c6e;
}

.timestamp {
  color: #777;
}

.message-content {
  font-size: 14px;
}

.message-input {
  display: flex;
  padding: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.message-input input {
  flex: 1;
  background-color: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: white;
  padding: 8px 10px;
  margin-right: 8px;
}

.message-input input:focus {
  outline: none;
  border-color: rgba(63, 140, 110, 0.5);
}

.send-btn {
  background-color: #3f8c6e;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  cursor: pointer;
}

.send-btn:hover {
  background-color: #2c664e;
}

.send-btn:disabled,
.message-input input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .chat-content {
    height: 250px;
  }
  
  .message {
    max-width: 90%;
  }
}
</style>