// client/src/utils/gameUtils.js
/**
 * Utility functions for the game functionality
 */

/**
 * Format a card for display
 * @param {Object} card - Card object with suit and rank
 * @returns {String} Formatted card representation
 */
export const formatCard = (card) => {
    if (!card) return '?';
  
    const suitSymbols = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠'
    };
  
    return `${card.rank}${suitSymbols[card.suit]}`;
  };
  
  /**
   * Generate default player options
   * @returns {Array} Default player action options
   */
  export const getDefaultOptions = () => {
    // Return the basic actions a player might have
    return ['fold', 'check', 'call', 'bet', 'raise'];
  };
  
  /**
   * De-duplicate log messages within a timeframe
   * @param {Array} lastLogMessages - Array of recent messages
   * @param {String} message - New message to check
   * @param {Number} dedupeTime - Time window for deduplication in ms
   * @returns {Boolean} True if message is a duplicate
   */
  export const isDuplicateLogMessage = (lastLogMessages, message, dedupeTime) => {
    const now = Date.now();
    return lastLogMessages.some(item =>
      item.message === message && (now - item.time < dedupeTime)
    );
  };
  
  /**
   * Add a message to the game log with timestamp and deduplication
   * @param {Array} gameLog - Game log array
   * @param {Array} lastLogMessages - Array for tracking recent messages
   * @param {String} message - Message to add to log
   * @param {Number} messageDedupeTime - Time window for deduplication
   * @returns {Object} Updated log data
   */
  export const addToGameLog = (gameLog, lastLogMessages, message, messageDedupeTime) => {
    const timestamp = new Date().toLocaleTimeString();
    const now = Date.now();
  
    // Initialize tracking array if needed
    const logTracking = lastLogMessages || [];
  
    // Don't add the exact same message within the deduplication window
    const isDuplicate = isDuplicateLogMessage(logTracking, message, messageDedupeTime);
  
    if (isDuplicate) {
      console.log(`Suppressed duplicate log message: ${message}`);
      return { gameLog, lastLogMessages: logTracking };
    }
  
    // Add to tracking list for deduplication
    logTracking.push({
      message,
      time: now
    });
  
    // Maintain the tracking list size
    if (logTracking.length > 10) {
      logTracking.shift();
    }
  
    // Add the message to the actual log
    const updatedLog = [`[${timestamp}] ${message}`, ...gameLog];
  
    // Keep log at reasonable size
    if (updatedLog.length > 50) {
      updatedLog.pop();
    }
  
    return {
      gameLog: updatedLog,
      lastLogMessages: logTracking
    };
  };