// Updated server/utils/db.js

const mongoose = require('mongoose');
const config = require('config');

// Get MongoDB connection string from config or environment variable
const mongoURI = process.env.MONGO_URI || config.get('mongoURI');

// Connect to MongoDB with improved error handling
const connectDB = async () => {
  try {
    // These options fix deprecation warnings in newer versions of MongoDB
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    };

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoURI, options);
    console.log('MongoDB Connected Successfully');
    
    // Set up connection error handlers
    mongoose.connection.on('error', err => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed due to app termination');
      process.exit(0);
    });
    
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
    
    // Additional diagnostic information
    if (err.name === 'MongooseServerSelectionError') {
      console.error('MongoDB server selection failed. Check your connection string and ensure MongoDB is running.');
    }
    
    // Exit process with failure
    process.exit(1);
  }
};

module.exports = connectDB;