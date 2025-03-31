<!-- client/src/components/Game/SocketDebugTool.vue -->
<template>
    <div class="socket-debug-tool">
      <div class="debug-header">
        <h3>Socket Debug Tool</h3>
        <button @click="$emit('close')" class="close-btn">×</button>
      </div>
      
      <div class="debug-body">
        <div class="socket-status">
          <span class="status-label">Socket Status:</span>
          <span class="status-indicator" :class="{ connected: isConnected }">
            {{ isConnected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
        
        <div class="form-group">
          <label>Direct Event Emission</label>
          <div class="input-group">
            <select v-model="selectedEvent" class="event-select">
              <option value="requestGameUpdate">Request Game Update</option>
              <option value="startGame">Start Game</option>
              <option value="joinGame">Join Game</option>
              <option value="register">Register User</option>
            </select>
            <button @click="emitEvent" class="emit-btn" :disabled="!isConnected">Emit</button>
          </div>
        </div>
        
        <div class="form-group">
          <label>Event Payload (JSON)</label>
          <textarea 
            v-model="eventPayload" 
            class="payload-input" 
            placeholder="{}"
            rows="5"
          ></textarea>
        </div>
        
        <div class="form-group">
          <label>Response</label>
          <div class="response-area">
            <pre>{{ response || 'No response yet' }}</pre>
          </div>
        </div>
        
        <div class="action-buttons">
          <button @click="reconnectSocket" class="action-btn">Reconnect Socket</button>
          <button @click="applyDefaultPayload" class="action-btn">Apply Default Payload</button>
          <button @click="clearResponse" class="action-btn">Clear Response</button>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import SocketService from '@/services/SocketService';
  
  export default {
    name: 'SocketDebugTool',
    
    props: {
      gameId: {
        type: String,
        required: true
      },
      userId: {
        type: String,
        required: true
      },
      username: {
        type: String,
        required: true
      }
    },
    
    data() {
      return {
        isConnected: false,
        selectedEvent: 'requestGameUpdate',
        eventPayload: '{}',
        response: '',
        eventListeners: []
      };
    },
    
    mounted() {
      this.checkSocketStatus();
      this.setupSocketListeners();
      this.applyDefaultPayload();
    },
    
    methods: {
      checkSocketStatus() {
        this.isConnected = SocketService.isSocketConnected();
      },
      
      setupSocketListeners() {
        // Add listener for socket connection events
        SocketService.gameSocket?.on('connect', () => {
          this.isConnected = true;
          this.addToResponse('Socket connected');
        });
        
        SocketService.gameSocket?.on('disconnect', () => {
          this.isConnected = false;
          this.addToResponse('Socket disconnected');
        });
        
        // Add generic response handlers
        const handlers = [
          'gameUpdate', 'gameStarted', 'gameError', 'error'
        ];
        
        handlers.forEach(event => {
          const handler = (data) => {
            this.addToResponse(`Received ${event}:\n${JSON.stringify(data, null, 2)}`);
          };
          
          SocketService.on(event, handler);
          this.eventListeners.push({ event, handler });
        });
      },
      
      async emitEvent() {
        try {
          this.addToResponse(`Emitting ${this.selectedEvent}...`);
          let payload = {};
          
          try {
            payload = JSON.parse(this.eventPayload);
          } catch (e) {
            this.addToResponse(`Warning: Invalid JSON payload. Using empty object.`);
          }
          
          switch (this.selectedEvent) {
            case 'requestGameUpdate':
              if (!payload.gameId) payload.gameId = this.gameId;
              if (!payload.userId) payload.userId = this.userId;
              
              SocketService.gameSocket?.emit('requestGameUpdate', payload);
              break;
              
            case 'startGame':
              if (!payload.gameId) payload.gameId = this.gameId;
              if (!payload.userId) payload.userId = this.userId;
              
              SocketService.gameSocket?.emit('startGame', payload);
              break;
              
            case 'joinGame':
              if (!payload.gameId) payload.gameId = this.gameId;
              if (!payload.userId) payload.userId = this.userId;
              if (!payload.username) payload.username = this.username;
              
              SocketService.gameSocket?.emit('joinGame', payload);
              break;
              
            case 'register':
              if (!payload.userId) payload.userId = this.userId;
              
              SocketService.gameSocket?.emit('register', payload);
              break;
          }
          
          this.addToResponse(`Sent payload:\n${JSON.stringify(payload, null, 2)}`);
        } catch (error) {
          this.addToResponse(`Error: ${error.message}`);
        }
      },
      
      applyDefaultPayload() {
        let defaultPayload = {};
        
        switch (this.selectedEvent) {
          case 'requestGameUpdate':
            defaultPayload = { 
              gameId: this.gameId, 
              userId: this.userId 
            };
            break;
            
          case 'startGame':
            defaultPayload = { 
              gameId: this.gameId, 
              userId: this.userId
            };
            break;
            
          case 'joinGame':
            defaultPayload = { 
              gameId: this.gameId, 
              userId: this.userId, 
              username: this.username 
            };
            break;
            
          case 'register':
            defaultPayload = { 
              userId: this.userId 
            };
            break;
        }
        
        this.eventPayload = JSON.stringify(defaultPayload, null, 2);
      },
      
      async reconnectSocket() {
        this.addToResponse('Reconnecting socket...');
        
        // First disconnect
        SocketService.disconnect();
        this.isConnected = false;
        
        // Then try to reconnect
        try {
          await SocketService.init();
          this.checkSocketStatus();
          this.addToResponse('Socket reconnected successfully');
        } catch (error) {
          this.addToResponse(`Reconnection error: ${error.message}`);
        }
      },
      
      addToResponse(text) {
        const timestamp = new Date().toLocaleTimeString();
        this.response = `[${timestamp}] ${text}\n\n${this.response}`;
      },
      
      clearResponse() {
        this.response = '';
      }
    },
    
    beforeDestroy() {
      // Remove all event listeners we added
      this.eventListeners.forEach(({ event, handler }) => {
        SocketService.off(event, handler);
      });
    }
  };
  </script>
  
  <style scoped>
  .socket-debug-tool {
    background-color: #1e1e1e;
    border: 1px solid #333;
    border-radius: 8px;
    width: 100%;
    max-width: 500px;
    margin: 20px auto;
    color: #ddd;
    font-family: monospace;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  }
  
  .debug-header {
    background-color: #333;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    padding: 10px 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .debug-header h3 {
    margin: 0;
    color: #3f8c6e;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: #ddd;
    font-size: 20px;
    cursor: pointer;
  }
  
  .debug-body {
    padding: 15px;
  }
  
  .socket-status {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
  }
  
  .status-label {
    font-weight: bold;
    margin-right: 10px;
  }
  
  .status-indicator {
    padding: 4px 8px;
    border-radius: 4px;
    background-color: #f44336;
    color: white;
  }
  
  .status-indicator.connected {
    background-color: #4caf50;
  }
  
  .form-group {
    margin-bottom: 15px;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
  }
  
  .input-group {
    display: flex;
  }
  
  .event-select {
    flex: 1;
    background-color: #333;
    color: #ddd;
    border: 1px solid #555;
    border-radius: 4px 0 0 4px;
    padding: 8px;
  }
  
  .emit-btn {
    background-color: #3f8c6e;
    color: white;
    border: none;
    border-radius: 0 4px 4px 0;
    padding: 8px 15px;
    cursor: pointer;
  }
  
  .emit-btn:disabled {
    background-color: #555;
    cursor: not-allowed;
  }
  
  .payload-input {
    width: 100%;
    background-color: #333;
    color: #ddd;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 8px;
    font-family: monospace;
    resize: vertical;
  }
  
  .response-area {
    background-color: #333;
    color: #ddd;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 8px;
    height: 150px;
    overflow-y: auto;
  }
  
  .response-area pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  .action-buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  
  .action-btn {
    background-color: #555;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 12px;
  }
  
  .action-btn:hover {
    background-color: #666;
  }
  </style>