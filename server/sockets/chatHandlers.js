// server/sockets/chatHandlers.js
/**
 * Chat handlers for socket.io integration
 */

// Map to store recent messages for deduplication
// Structure: { userId: { message, timestamp } }
const recentMessages = new Map();
const MESSAGE_DEDUPE_TIME = 3000; // 3 seconds

// Rate limiting map
// Structure: { userId: { count, lastReset } }
const rateLimits = new Map();
const RATE_LIMIT = {
  maxMessages: 5,   // Maximum messages per window
  windowMs: 10000,  // 10 seconds window
  lockoutTime: 30000 // 30 seconds lockout for repeated violations
};

// Keep track of user violations
const userViolations = new Map();

/**
 * Check if a message is a duplicate
 * @param {string} userId - User ID
 * @param {string} message - Message content
 * @returns {boolean} True if duplicate
 */
function isDuplicateMessage(userId, message) {
  if (!userId || !message) return false;
  
  // Check if user has sent a message recently
  if (recentMessages.has(userId)) {
    const recentMsg = recentMessages.get(userId);
    const timeDiff = Date.now() - recentMsg.timestamp;
    
    // If message content is the same and sent within dedupe window
    if (recentMsg.message === message && timeDiff < MESSAGE_DEDUPE_TIME) {
      console.log(`Duplicate message suppressed from user ${userId}: "${message}"`);
      return true;
    }
  }
  
  return false;
}

/**
 * Update recent messages for a user
 * @param {string} userId - User ID
 * @param {string} message - Message content
 */
function trackRecentMessage(userId, message) {
  recentMessages.set(userId, {
    message,
    timestamp: Date.now()
  });
}

/**
 * Check if a user is rate limited
 * @param {string} userId - User ID
 * @returns {Object} Result with isLimited flag and remaining time
 */
function checkRateLimit(userId) {
  const now = Date.now();
  
  // Initialize rate limit data if not exists
  if (!rateLimits.has(userId)) {
    rateLimits.set(userId, {
      count: 0,
      lastReset: now,
      isLocked: false,
      lockUntil: 0
    });
  }
  
  const userLimit = rateLimits.get(userId);
  
  // Check if user is in lockout period
  if (userLimit.isLocked && now < userLimit.lockUntil) {
    const remainingTime = Math.ceil((userLimit.lockUntil - now) / 1000);
    return { isLimited: true, remainingTime };
  }
  
  // Reset count if window has passed
  if (now - userLimit.lastReset > RATE_LIMIT.windowMs) {
    userLimit.count = 0;
    userLimit.lastReset = now;
    userLimit.isLocked = false;
  }
  
  // Check if user has exceeded rate limit
  if (userLimit.count >= RATE_LIMIT.maxMessages) {
    // Track violation
    if (!userViolations.has(userId)) {
      userViolations.set(userId, { count: 0, lastViolation: now });
    }
    
    const violation = userViolations.get(userId);
    
    // Reset violation count if it's been a while
    if (now - violation.lastViolation > 5 * 60 * 1000) { // 5 minutes
      violation.count = 0;
    }
    
    violation.count++;
    violation.lastViolation = now;
    
    // Apply lockout for repeat offenders
    if (violation.count >= 3) {
      userLimit.isLocked = true;
      userLimit.lockUntil = now + RATE_LIMIT.lockoutTime;
      console.log(`User ${userId} has been locked out for ${RATE_LIMIT.lockoutTime/1000} seconds`);
      
      const remainingTime = Math.ceil(RATE_LIMIT.lockoutTime / 1000);
      return { isLimited: true, remainingTime, isLockout: true };
    }
    
    return { isLimited: true, remainingTime: Math.ceil(RATE_LIMIT.windowMs / 1000) };
  }
  
  return { isLimited: false };
}

/**
 * Increment message count for rate limiting
 * @param {string} userId - User ID
 */
function incrementMessageCount(userId) {
  if (!rateLimits.has(userId)) {
    rateLimits.set(userId, {
      count: 0,
      lastReset: Date.now(),
      isLocked: false,
      lockUntil: 0
    });
  }
  
  const userLimit = rateLimits.get(userId);
  userLimit.count++;
}

/**
 * Clean up old data (call periodically)
 */
function cleanupOldData() {
  const now = Date.now();
  
  // Clean up old messages
  for (const [userId, data] of recentMessages.entries()) {
    if (now - data.timestamp > MESSAGE_DEDUPE_TIME * 2) {
      recentMessages.delete(userId);
    }
  }
  
  // Clean up expired rate limits
  for (const [userId, data] of rateLimits.entries()) {
    if (!data.isLocked && now - data.lastReset > RATE_LIMIT.windowMs * 2) {
      rateLimits.delete(userId);
    }
  }
  
  // Clean up old violations
  for (const [userId, data] of userViolations.entries()) {
    if (now - data.lastViolation > 24 * 60 * 60 * 1000) { // 24 hours
      userViolations.delete(userId);
    }
  }
}

// Run cleanup every few minutes
setInterval(cleanupOldData, 5 * 60 * 1000);

/**
 * Register chat handlers to socket.io instance
 * @param {Object} io - Socket.io instance
 */
function registerChatHandlers(io) {
  // Game namespace
  const gameIo = io.of('/game');
  
  gameIo.on('connection', (socket) => {
    // Handle chat messages
    socket.on('sendMessage', async ({ gameId, userId, username, message }) => {
      try {
        // Basic validation
        if (!gameId || !userId || !username || !message) {
          return socket.emit('gameError', {
            message: 'Missing required fields for chat message'
          });
        }
        
        // Filter message content
        const cleanedMessage = filterMessage(message);
        
        // Check for duplicate message
        if (isDuplicateMessage(userId, cleanedMessage)) {
          // Silently ignore duplicate
          return;
        }
        
        // Check for rate limiting
        const rateCheck = checkRateLimit(userId);
        if (rateCheck.isLimited) {
          // Notify user they're being rate limited
          const remainingTimeText = rateCheck.remainingTime ? ` Please try again in ${rateCheck.remainingTime} seconds.` : '';
          const limitMessage = rateCheck.isLockout 
            ? `You have been temporarily muted due to spamming.${remainingTimeText}`
            : `You're sending messages too quickly.${remainingTimeText}`;
          
          return socket.emit('chatError', {
            message: limitMessage
          });
        }
        
        // All checks passed, increment rate limit and track message
        incrementMessageCount(userId);
        trackRecentMessage(userId, cleanedMessage);
        
        // Create chat message object
        const chatMessage = {
          type: 'user',
          userId,
          username,
          message: cleanedMessage,
          timestamp: Date.now()
        };
        
        // Broadcast to all users in the game room
        gameIo.to(gameId).emit('chatMessage', chatMessage);
        
        // Also log to game history if needed
        // This could be added if you want to persist chat messages
      } catch (error) {
        console.error('Chat message error:', error);
        socket.emit('gameError', {
          message: 'Error processing chat message'
        });
      }
    });
    
    // Handle whisper/private messages if needed
    socket.on('sendWhisper', ({ gameId, fromUserId, toUserId, fromUsername, toUsername, message }) => {
      try {
        // Basic validation
        if (!gameId || !fromUserId || !toUserId || !fromUsername || !toUsername || !message) {
          return socket.emit('gameError', {
            message: 'Missing required fields for whisper'
          });
        }
        
        // Clean and check the message
        const cleanedMessage = filterMessage(message);
        
        // Check for rate limiting
        const rateCheck = checkRateLimit(fromUserId);
        if (rateCheck.isLimited) {
          return socket.emit('chatError', {
            message: `You're sending messages too quickly. Please try again in ${rateCheck.remainingTime} seconds.`
          });
        }
        
        // Create whisper message
        const whisperMessage = {
          type: 'whisper',
          fromUserId,
          toUserId,
          fromUsername,
          toUsername,
          message: cleanedMessage,
          timestamp: Date.now()
        };
        
        // Get the socket IDs for sender and recipient
        // Note: You'll need to maintain a mapping of user IDs to socket IDs
        const fromSocketId = getUserSocketId(fromUserId); // You need to implement this
        const toSocketId = getUserSocketId(toUserId);     // You need to implement this
        
        // Send to recipient
        if (toSocketId) {
          gameIo.to(toSocketId).emit('whisperReceived', whisperMessage);
        }
        
        // Send confirmation to sender
        if (fromSocketId) {
          gameIo.to(fromSocketId).emit('whisperSent', whisperMessage);
        }
        
        // Track rate limit
        incrementMessageCount(fromUserId);
      } catch (error) {
        console.error('Whisper error:', error);
        socket.emit('gameError', {
          message: 'Error sending whisper'
        });
      }
    });
  });
}

/**
 * Filter message content (remove offensive content, trim, etc.)
 * @param {string} message - Raw message
 * @returns {string} Cleaned message
 */
function filterMessage(message) {
  if (!message) return '';
  
  // Trim whitespace
  let cleaned = message.trim();
  
  // Limit message length
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 500) + '...';
  }
  
  // Filter offensive words (basic implementation)
  const offensiveWords = [
    'offensive1', 'offensive2', 'offensive3'
    // Add more words to filter
  ];
  
  offensiveWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '*'.repeat(word.length));
  });
  
  return cleaned;
}

/**
 * Get a user's socket ID (example implementation)
 * Note: In a real app, you need to maintain a mapping of user IDs to socket IDs
 * @param {string} userId - User ID
 * @returns {string|null} Socket ID or null
 */
function getUserSocketId(userId) {
  // This is a placeholder. You need to implement this based on your app's architecture
  // Usually, you would maintain a Map of user IDs to socket IDs
  return null;
}

module.exports = {
  registerChatHandlers,
  isDuplicateMessage,
  checkRateLimit,
  filterMessage
};