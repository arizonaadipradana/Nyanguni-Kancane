// server/server.js
// Replace your ENTIRE server.js file with this content
const fs = require('fs');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const config = require('config');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const errorHandler = require('./middleware/error');
const connectDB = require('./utils/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Create Express app
const app = express();
const server = http.createServer(app);

// CORS middleware - simplified version
// CORS middleware - improved with dynamic origin detection
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Allow all localhost and local network origins
    if (
      origin.startsWith('http://localhost') || 
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('http://192.168.') ||
      origin.startsWith('http://10.') ||
      origin.includes('ngrok-free.app')
    ) {
      return callback(null, true);
    }
    
    // For production
    if (process.env.NODE_ENV === 'production') {
      // Extract hostname from origin
      try {
        const hostname = new URL(origin).hostname;
        
        // Check if origin matches our allowed domains
        if (hostname === 'yourdomain.com' || hostname.endsWith('.yourdomain.com')) {
          return callback(null, true);
        }
      } catch (e) {
        console.error('Error parsing origin URL:', e);
      }
    }
    
    console.log(`CORS blocked request from origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'Cache-Control', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Auth-Token'],
  maxAge: 86400 // 24 hours caching for preflight requests
}));


app.options('*', cors());

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));
app.use('/api/config', require('./routes/config'));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin); // Dynamic based on request
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Socket.io setup with simplified CORS
const io = socketIO(server, {
  cors: {
    origin: '*', // More permissive for development
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
  },
  transports: ['polling', 'websocket'], // Try polling first as it's more reliable
  pingTimeout: 30000, // Increased timeout for better connection stability
  pingInterval: 10000, // More frequent pings
  connectTimeout: 30000, // Longer connection timeout
  allowEIO3: true, // Allow both EIO3 and EIO4 clients
  maxHttpBufferSize: 1e8 // 100MB - larger buffer for game data
});


io.use((socket, next) => {
  console.log(`Socket connection attempt from ${socket.handshake.address} with transport ${socket.conn.transport.name}`);
  
  // Add detailed logs for connection issues
  socket.conn.on('packet', (packet) => {
    if (packet.type === 'error') {
      console.error('Socket packet error:', packet.data);
    }
  });
  
  next();
});

// Log when the socket server is ready
io.on('connection', (socket) => {
  console.log(`Main namespace connection: ${socket.id} from ${socket.handshake.address}`);
  console.log('New socket connection:', socket.id);
  
  // Log disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Socket ${socket.id} disconnected. Reason: ${reason}`);
  });
});

// Add a middleware logger for the game namespace
io.of('/game').use((socket, next) => {
  console.log('New game namespace connection:', socket.id);
  
  // Log disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Game socket ${socket.id} disconnected. Reason: ${reason}`);
  });
  console.log(`Game namespace connection attempt: ${socket.id} from ${socket.handshake.address}`);
  next();
});

try {
  const initializeSocket = require('./sockets');
  initializeSocket(io);
  console.log('Socket.IO initialized successfully');
} catch (error) {
  console.error('Socket initialization error:', error);
}

// Initialize sockets
const initializeSocket = require('./sockets');
initializeSocket(io);

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Set static folder
  app.use(express.static(path.join(__dirname, '../client/dist')));

  // Any route that is not an API route will be served the index.html file
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client/dist', 'index.html'));
  });
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/server-status', (req, res) => {
  // Return server status information
  const socketStatus = {
    server: 'running',
    serverTime: new Date().toISOString(),
    socketServer: io ? 'running' : 'not running',
    gameNamespace: io?.nsps?.get('/game') ? 'available' : 'not available',
    connections: {
      total: io ? Object.keys(io.sockets.sockets).length : 0,
      gameNamespace: io?.nsps?.get('/game') ? io.nsps.get('/game').sockets.size : 0
    },
    config: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  };
  
  res.json(socketStatus);
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API test endpoint working',
    clientOrigin: req.headers.origin || 'Unknown',
    timestamp: new Date().toISOString()
  });
});

// Update the default route to include more diagnostic information
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Nyanguni Kancane API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    clientOrigin: req.headers.origin || 'Unknown',
    allowedOrigins: ['http://localhost:8080', 'http://127.0.0.1:8080'],
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  // Check if we have a client dist folder to serve
  const clientDistPath = path.join(__dirname, '../client/dist');
  const clientExists = fs.existsSync(path.join(clientDistPath, 'index.html'));
  
  if (process.env.NODE_ENV === 'production' && clientExists) {
    // In production, serve the built client app
    res.sendFile(path.join(clientDistPath, 'index.html'));
  } else {
    // In development or if client build not found, show a welcome message
    res.send(`
      <html>
        <head>
          <title>Nyanguni Kancane API</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f5f5f5;
            }
            .container {
              background: white;
              border-radius: 5px;
              padding: 20px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
              color: #3f8c6e;
            }
            hr {
              border: none;
              border-top: 1px solid #ddd;
              margin: 20px 0;
            }
            .api-url {
              background: #f0f0f0;
              padding: 10px;
              border-radius: 4px;
              font-family: monospace;
            }
            .button {
              display: inline-block;
              background: #3f8c6e;
              color: white;
              padding: 10px 15px;
              text-decoration: none;
              border-radius: 4px;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Nyanguni Kancane API Server</h1>
            <p>Welcome to the Nyanguni Kancane Texas Hold'em API server.</p>
            
            <hr>
            
            <h2>Server Information</h2>
            <ul>
              <li><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</li>
              <li><strong>Server URL:</strong> ${global.ngrokUrl || `http://localhost:${PORT}`}</li>
              <li><strong>API Endpoint:</strong> <div class="api-url">${global.ngrokUrl || `http://localhost:${PORT}`}/api</div></li>
            </ul>
            
            <p>To access the game, you need to connect to the client application.</p>
            
            <h2>API Endpoints</h2>
            <ul>
              <li><a href="/api" class="button">API Status</a></li>
              <li><a href="/api/config" class="button">Configuration</a></li>
            </ul>
            
            <hr>
            
            <p><small>Nyanguni Kancane Texas Hold'em Poker Server - Version 1.0.0</small></p>
          </div>
        </body>
      </html>
    `);
  }
});

app.get('/socket-test', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Socket.IO Test</title>
        <script src="https://cdn.socket.io/4.4.1/socket.io.min.js"></script>
        <script>
          document.addEventListener('DOMContentLoaded', () => {
            const log = (msg) => {
              const div = document.createElement('div');
              div.textContent = msg;
              document.getElementById('log').appendChild(div);
            };
            
            log('Testing socket connection...');
            
            // Try to connect to the socket server
            const socket = io(window.location.origin);
            
            socket.on('connect', () => {
              log('✅ Connected to main namespace');
              log('Socket ID: ' + socket.id);
              log('Transport: ' + socket.io.engine.transport.name);
            });
            
            socket.on('connect_error', (error) => {
              log('❌ Connection error: ' + error.message);
            });
            
            // Also try the game namespace
            const gameSocket = io(window.location.origin + '/game');
            
            gameSocket.on('connect', () => {
              log('✅ Connected to game namespace');
              log('Game Socket ID: ' + gameSocket.id);
              log('Game Transport: ' + gameSocket.io.engine.transport.name);
            });
            
            gameSocket.on('connect_error', (error) => {
              log('❌ Game namespace connection error: ' + error.message);
            });
          });
        </script>
      </head>
      <body style="font-family: monospace; padding: 20px;">
        <h1>Socket.IO Test</h1>
        <p>Testing socket connection to server...</p>
        <div id="log" style="background: #f0f0f0; padding: 10px; border-radius: 5px;"></div>
      </body>
    </html>
  `);
});

// Error handling middleware
app.use(errorHandler);

// Server setup
const PORT = process.env.PORT || config.get('port') || 5000;

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Display MongoDB connection status
  const dbStatus = mongoose.connection.readyState;
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  console.log(`MongoDB Status: ${dbStates[dbStatus]}`);
  
  // Start ngrok if enabled in development
  if (process.env.NODE_ENV === 'development' && process.env.USE_NGROK === 'true') {
    try {
      // Use the dedicated setup module for better organization
      const { setupNgrok } = require('./utils/ngrok-setup');
      const url = await setupNgrok(PORT);
      
      // The ngrok URL is now stored in global.ngrokUrl
      // and can be accessed from other parts of the application
      
      // Log additional server information
      console.log(`
      ===============================================
        Server Information
      -----------------------------------------------
        🌐 Public URL: ${url}
        🌐 Local URL: http://localhost:${PORT}
        📁 Environment: ${process.env.NODE_ENV}
        🔌 Socket.IO enabled: Yes
      ===============================================
      `);
    } catch (err) {
      console.error('Error starting ngrok:', err);
      console.log('Continuing without external access URL');
    }
  }
});

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  
  try {
    // Close mongoose connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    
    // Close server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    
    // Force exit after timeout
    setTimeout(() => {
      console.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
});

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});