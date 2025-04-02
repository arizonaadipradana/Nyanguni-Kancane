// server/utils/mongoose-helpers.js
// Create this file to add utilities for handling mongoose version conflicts

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