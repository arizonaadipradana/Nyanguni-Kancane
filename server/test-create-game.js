const axios = require('axios');
const mongoose = require('mongoose');
const config = require('config');
require('dotenv').config();

// Get MongoDB connection string
const mongoURI = process.env.MONGO_URI || config.get('mongoURI');

// Get JWT token for testing (you'll need to get this from your browser)
const token = 'YOUR_JWT_TOKEN_HERE'; // Replace with a valid token

// API URL
const API_URL = 'http://localhost:3000';

// Test function
async function testCreateGame() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoURI, { 
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false
    });
    console.log('MongoDB Connected');
    
    // Get user from database to use real IDs
    const User = mongoose.model('User');
    const users = await User.find({}).limit(1);
    
    if (users.length === 0) {
      console.error('No users found in database');
      return;
    }
    
    const user = users[0];
    console.log('Using user:', {
      id: user._id,
      username: user.username
    });
    
    // Make API request to create game
    console.log('Making create game request...');
    const response = await axios.post(`${API_URL}/api/games`, {
      creatorId: user._id.toString(),
      creatorName: user.username
    }, {
      headers: {
        'x-auth-token': token,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('API Response:', response.data);
    console.log('Game created successfully!');
  } catch (error) {
    console.error('Test failed with error:', error.message);
    
    if (error.response) {
      console.error('API Error Response:', error.response.data);
      console.error('Status:', error.response.status);
    } else if (error.request) {
      console.error('No response received from API');
    }
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB Disconnected');
  }
}

// Run the test
testCreateGame();