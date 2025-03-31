// server/server.js
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

// CORS configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:8080',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};

// Add ngrok to allowed origins if NGROK_URL is set later
app.use((req, res, next) => {
  if (global.ngrokUrl && !corsOptions.origin.includes(global.ngrokUrl)) {
    if (Array.isArray(corsOptions.origin)) {
      corsOptions.origin.push(global.ngrokUrl);
    } else {
      corsOptions.origin = [corsOptions.origin, global.ngrokUrl];
    }
  }
  next();
});

// Apply middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));
app.use('/api/config', require('./routes/config'));

// Socket.io setup
const io = socketIO(server, {
  cors: corsOptions
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

// Default route for API check
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Nyanguni Kancane API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
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