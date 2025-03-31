// server/middleware/error.js

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
  
    // Default error status and message
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Server Error';
  
    // Mongoose validation error
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        errors: Object.values(err.errors).map(error => error.message)
      });
    }
  
    // Mongoose duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({
        message: 'Duplicate field value entered'
      });
    }
  
    // JWT error
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid token'
      });
    }
  
    // JWT expired error
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expired'
      });
    }
  
    // Send error response
    res.status(statusCode).json({
      message,
      stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    });
  };
  
  module.exports = errorHandler;