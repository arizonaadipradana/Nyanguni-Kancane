// server/server.js (updated version with better ngrok integration)
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const config = require('config');
const dotenv = require('dotenv');
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
  origin: ['http://localhost:8080'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};

// Add ngrok to allowed origins if NGROK_URL is set later
app.use((req, res, next) => {
  if (global.ngrokUrl && !corsOptions.origin.includes(global.ngrokUrl)) {
    corsOptions.origin.push(global.ngrokUrl);
  }
  next();
});

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));
app.use('/api/config', require('./routes/config'));

// Socket.io setup
const io = socketIO(server, {
  cors: corsOptions
});

// Initialize sockets
const socketModule = require('./sockets');
socketModule(io);

// Default route
app.get('/', (req, res) => {
  res.send('Nyanguni Kancane API is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Server setup
const PORT = process.env.PORT || config.get('port') || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start ngrok if enabled
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