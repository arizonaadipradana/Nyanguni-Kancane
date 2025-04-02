<!-- client/src/components/Game/GameChat.vue -->
<template>
    <div class="game-chat">
      <h3>Game Chat</h3>
      <div class="chat-messages" ref="chatContainer">
        <div v-for="(message, index) in messages" :key="index" 
             :class="['message', message.type, message.userId === currentUser?.id ? 'own-message' : '']">
          <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
          <span class="username" v-if="message.type !== 'system'">{{ message.username }}:</span>
          <span class="content" v-html="formatMessage(message.content || message.message)"></span>
        </div>
      </div>
      <div class="chat-input">
        <input 
          type="text" 
          v-model="newMessage" 
          @keyup.enter="sendMessage" 
          placeholder="Type a message..." 
          :disabled="!isConnected"
          class="message-input"
        />
        <button @click="sendMessage" class="send-btn" :disabled="!isConnected || !newMessage.trim()">
          Send
        </button>
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
        default: null
      },
      isConnected: {
        type: Boolean,
        default: false
      }
    },
    
    data() {
      return {
        messages: [],
        newMessage: '',
        maxMessages: 50
      };
    },
    
    mounted() {
      this.setupSocketListeners();
      this.scrollToBottom();
    },
  
    updated() {
      this.scrollToBottom();
    },
    
    methods: {
      setupSocketListeners() {
        // Listen for chat messages from the server
        SocketService.on('chatMessage', (message) => {
          // Add the received message to our messages array
          this.addMessage(message);
        });
      },
      
      sendMessage() {
        if (!this.newMessage.trim() || !this.isConnected) return;
        
        if (!this.currentUser) {
          console.error('User not authenticated');
          return;
        }
        
        // Send message to server
        SocketService.sendChatMessage(
          this.gameId,
          this.currentUser.id,
          this.currentUser.username,
          this.newMessage.trim()
        );
        
        // Clear input field
        this.newMessage = '';
      },
      
      addMessage(message) {
        // Format message if needed
        const formattedMessage = {
          ...message,
          timestamp: message.timestamp || new Date()
        };
        
        // Add to messages array
        this.messages.push(formattedMessage);
        
        // Limit the number of messages
        if (this.messages.length > this.maxMessages) {
          this.messages.shift();
        }
        
        // Emit event to parent component
        this.$emit('new-message', formattedMessage);
      },
      
      formatTime(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      },
      
      formatMessage(text) {
        if (!text) return '';
        
        // Convert URLs to links
        return text.replace(
          /(https?:\/\/[^\s]+)/g, 
          '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
      },
      
      scrollToBottom() {
        if (this.$refs.chatContainer) {
          this.$nextTick(() => {
            this.$refs.chatContainer.scrollTop = this.$refs.chatContainer.scrollHeight;
          });
        }
      },
      
      addSystemMessage(text) {
        this.addMessage({
          type: 'system',
          message: text,
          timestamp: new Date()
        });
      }
    },
    
    beforeDestroy() {
      // Clean up listeners
      SocketService.off('chatMessage');
    }
  };
  </script>
  
  <style scoped>
  .game-chat {
    grid-area: chat;
    background-color: #2a2a2a;
    border-radius: 8px;
    padding: 15px;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  .game-chat h3 {
    margin-top: 0;
    margin-bottom: 10px;
    color: #3f8c6e;
  }
  
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    background-color: #222;
    border-radius: 4px;
    margin-bottom: 10px;
    max-height: 300px;
  }
  
  .message {
    margin-bottom: 8px;
    padding: 5px 8px;
    border-radius: 4px;
    word-break: break-word;
  }
  
  .message .timestamp {
    font-size: 10px;
    color: #999;
    margin-right: 5px;
  }
  
  .message .username {
    font-weight: bold;
    margin-right: 5px;
  }
  
  .message.system {
    color: #aaa;
    font-style: italic;
    text-align: center;
  }
  
  .message.user {
    background-color: #333;
  }
  
  .message.own-message {
    background-color: #1c3f30;
  }
  
  .chat-input {
    display: flex;
    gap: 5px;
  }
  
  .message-input {
    flex: 1;
    background-color: #333;
    color: white;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 8px;
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
  
  .send-btn:disabled {
    background-color: #555;
    cursor: not-allowed;
  }
  
  /* Style for links in messages */
  :deep(a) {
    color: #4c9ed9;
    text-decoration: none;
  }
  
  :deep(a:hover) {
    text-decoration: underline;
  }
  </style>