// client/src/utils/idUtils.js

/**
 * Extract MongoDB ID from various formats
 * @param {any} id - ID to extract
 * @returns {string} Extracted ID string
 */
export function extractMongoId(id) {
  // If null or undefined, return empty string
  if (id == null) return '';
  
  // Case 1: id is already a string
  if (typeof id === 'string') return id;
  
  // Case 2: MongoDB { $oid: "..." } format
  if (typeof id === 'object' && id.$oid) return id.$oid;
  
  // Case 3: object with toString method (like MongoDB ObjectId)
  if (typeof id === 'object' && typeof id.toString === 'function') {
    return id.toString();
  }
  
  // Default: convert to string
  return String(id);
}

/**
 * Compare two IDs for equality
 * @param {any} id1 - First ID
 * @param {any} id2 - Second ID
 * @returns {boolean} Whether IDs match
 */
export function compareIds(id1, id2) {
  return extractMongoId(id1) === extractMongoId(id2);
}

/**
 * Extract ID from an object
 * @param {Object} obj - Object containing ID
 * @param {Array<string>} fields - Fields to check
 * @returns {string} Extracted ID
 */
export function extractId(obj, fields = ['id', '_id', 'user']) {
  if (!obj) return '';
  
  for (const field of fields) {
    if (obj[field] !== undefined) {
      return extractMongoId(obj[field]);
    }
  }
  
  return '';
}