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
app.use(cors({
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));
app.use('/api/config', require('./routes/config'));

// Socket.io setup with simplified CORS
const io = socketIO(server, {
  cors: {
    origin: true, // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  }
});

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

// Default route for API check
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Nyanguni Kancane API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
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

// Error handling middleware
app.use(errorHandler);

// Server setup
const PORT = process.env.PORT || config.get('port') || 3000;

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