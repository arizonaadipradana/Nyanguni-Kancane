// server/utils/mongoose-helpers.js
const mongoose = require('mongoose');

/**
 * Save a mongoose document with retry logic for version conflicts
 * @param {Document} doc - Mongoose document to save
 * @param {Object} options - Options
 * @returns {Promise<Document>} Saved document
 */
exports.saveWithRetry = async function(doc, options = {}) {
    const maxAttempts = options.maxAttempts || 3;
    const delay = options.delay || 100; // ms
    const verbose = options.verbose || false;
    
    let attempts = 0;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        const result = await doc.save();
        if (verbose && attempts > 0) {
          console.log(`Document saved successfully after ${attempts + 1} attempts`);
        }
        return result;
      } catch (error) {
        attempts++;
        lastError = error;
        
        // Only retry version errors
        if (error.name !== 'VersionError') {
          throw error;
        }
        
        if (verbose) {
          console.log(`Version conflict detected (attempt ${attempts}/${maxAttempts})`);
        }
        
        if (attempts >= maxAttempts) {
          break;
        }
        
        // Get a fresh copy of the document if refreshCallback is provided
        if (options.refreshCallback) {
          try {
            doc = await options.refreshCallback(doc, error);
            if (!doc) {
              throw new Error('Document refresh failed');
            }
          } catch (refreshError) {
            console.error('Error refreshing document:', refreshError);
            throw refreshError;
          }
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * attempts));
      }
    }
    
    // If we get here, we've exhausted our retries
    throw lastError;
  };
  
  /**
   * Update a document with retry logic
   * @param {Model} model - Mongoose model
   * @param {Object|string} query - Query to find document
   * @param {Object} update - Update to apply
   * @param {Object} options - Options for the update
   * @returns {Promise<Document>} Updated document
   */
  exports.updateWithRetry = async function(model, query, update, options = {}) {
    const maxAttempts = options.maxAttempts || 3;
    const delay = options.delay || 100; // ms
    const verbose = options.verbose || false;
    
    // Make sure we get the updated document
    options.new = true;
    
    let attempts = 0;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        const result = await model.findOneAndUpdate(query, update, options);
        if (verbose && attempts > 0) {
          console.log(`Document updated successfully after ${attempts + 1} attempts`);
        }
        return result;
      } catch (error) {
        attempts++;
        lastError = error;
        
        if (verbose) {
          console.log(`Update conflict detected (attempt ${attempts}/${maxAttempts}): ${error.message}`);
        }
        
        if (attempts >= maxAttempts) {
          break;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * attempts));
      }
    }
    
    // If we get here, we've exhausted our retries
    throw lastError;
  };
  
  /**
   * Find a document by ID or query and apply the callback to update it
   * This approach is more reliable than findOneAndUpdate for complex updates
   * @param {Model} model - Mongoose model
   * @param {Object|string} query - Query or ID to find document
   * @param {Function} updateCallback - Function that receives the document and updates it
   * @param {Object} options - Options
   * @returns {Promise<Document>} Updated document
   */
  exports.findAndModify = async function(model, query, updateCallback, options = {}) {
    const maxAttempts = options.maxAttempts || 3;
    const delay = options.delay || 100; // ms
    const verbose = options.verbose || false;
    
    let attempts = 0;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        // Find the document
        const doc = await (typeof query === 'string' || query instanceof mongoose.Types.ObjectId
          ? model.findById(query)
          : model.findOne(query));
        
        if (!doc) {
          return null; // Document not found
        }
        
        // Apply the update callback
        await updateCallback(doc);
        
        // Save the document
        await doc.save();
        
        if (verbose && attempts > 0) {
          console.log(`Document modified successfully after ${attempts + 1} attempts`);
        }
        
        return doc;
      } catch (error) {
        attempts++;
        lastError = error;
        
        // Only retry version errors
        if (error.name !== 'VersionError') {
          throw error;
        }
        
        if (verbose) {
          console.log(`Version conflict detected (attempt ${attempts}/${maxAttempts})`);
        }
        
        if (attempts >= maxAttempts) {
          break;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * attempts));
      }
    }
    
    // If we get here, we've exhausted our retries
    throw lastError;
  };

  /**
 * Find document by gameId and atomically update it to bypass version conflicts
 * @param {Model} model - Mongoose model (Game)
 * @param {String} gameId - Game ID to find
 * @param {Object} update - Update operations ($set, etc)
 * @returns {Promise<Document>} Updated document
 */
exports.atomicGameUpdate = async function(model, gameId, update) {
  try {
    // Use findOneAndUpdate with the raw gameId field, not _id
    // This bypasses version checks completely
    const updated = await model.findOneAndUpdate(
      { gameId: gameId },
      update,
      { 
        new: true, // Return updated document
        runValidators: false, // Skip validation for performance
        versionKey: false, // Ignore version key
      }
    );
    
    return updated;
  } catch (error) {
    console.error(`Atomic update error for game ${gameId}:`, error);
    throw error;
  }
};

/**
 * Perform an operation with a fresh instance of the game document
 * This helps avoid version conflicts by always working with the latest version
 * @param {String} gameId - Game ID
 * @param {Function} operation - Function to perform on the fresh document
 * @returns {Promise<Document>} Result of the operation
 */
exports.withFreshGame = async function(gameId, operation) {
  const Game = require('../models/Game');
  
  try {
    // Get a fresh copy of the game
    const game = await Game.findOne({ gameId });
    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }
    
    // Skip validation for this operation
    game._skipValidation = true;
    
    // Perform the operation
    return await operation(game);
  } catch (error) {
    console.error(`Error in withFreshGame for ${gameId}:`, error);
    throw error;
  }
};

/**
 * Perform a direct atomic update bypassing versioning
 * Handles player addition to games safely with ID consistency
 * @param {Model} model - Mongoose model (Game)
 * @param {String} gameId - Game ID to find
 * @param {Object} update - Update operations ($set, $push, etc)
 * @param {Object} options - Additional options
 * @returns {Promise<Document>} Updated document
 */
exports.safeAtomicUpdate = async function(model, gameId, update, options = {}) {
  const mongoose = require('mongoose');
  
  try {
    // Special handling for player additions to ensure consistent ObjectIDs
    if (update.$push && update.$push.players && update.$push.players.user) {
      // Ensure player.user is a valid ObjectId if possible
      const userId = update.$push.players.user;
      if (mongoose.Types.ObjectId.isValid(userId)) {
        update.$push.players.user = mongoose.Types.ObjectId(userId);
      }
    }
    
    // Use findOneAndUpdate with the raw gameId field, not _id
    // This bypasses version checks completely
    const updated = await model.findOneAndUpdate(
      { gameId: gameId },
      update,
      { 
        new: true, // Return updated document
        runValidators: false, // Skip validation for performance
        versionKey: false, // Ignore version key
        ...options
      }
    );
    
    if (!updated) {
      throw new Error(`Game ${gameId} not found during atomic update`);
    }
    
    return updated;
  } catch (error) {
    console.error(`Atomic update error for game ${gameId}:`, error);
    throw error;
  }
};

/**
 * Fix player data in a game to ensure consistent IDs
 * @param {String} gameId - Game ID
 * @returns {Promise<Object>} Result of the operation
 */
exports.fixPlayerData = async function(gameId) {
  const Game = require('../models/Game');
  const mongoose = require('mongoose');
  
  try {
    // Get the game
    const game = await Game.findOne({ gameId });
    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }
    
    let updated = false;
    
    // Check each player for ID consistency
    game.players.forEach(player => {
      // Make sure player has a valid user ID
      if (player.user) {
        const userId = player.user.toString();
        
        // Convert to ObjectId if valid
        if (mongoose.Types.ObjectId.isValid(userId)) {
          const objectId = mongoose.Types.ObjectId(userId);
          
          // If the ID format changed, update the player
          if (objectId.toString() !== player.user.toString()) {
            player.user = objectId;
            updated = true;
            console.log(`Fixed player ID format: ${userId} -> ${objectId}`);
          }
        }
      }
    });
    
    // Only save if changes were made
    if (updated) {
      await game.save();
      console.log(`Fixed player data in game ${gameId}`);
    }
    
    return { 
      success: true, 
      updated,
      playerCount: game.players.length
    };
  } catch (error) {
    console.error(`Error fixing player data for game ${gameId}:`, error);
    throw error;
  }
};