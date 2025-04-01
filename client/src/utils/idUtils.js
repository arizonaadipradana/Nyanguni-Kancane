// client/src/utils/idUtils.js - Complete replacement

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
  
  // Case 2: MongoDB { $oid: "..." } format from JSON
  if (typeof id === 'object' && id.$oid) return id.$oid;
  
  // Case 3: MongoDB ObjectId that has toString method
  if (typeof id === 'object' && typeof id.toString === 'function') {
    return id.toString();
  }
  
  // Case 4: Otherwise convert to string
  return String(id);
}

/**
 * Compare two MongoDB IDs for equality
 * This is useful when you need to directly compare two IDs that might be in different formats
 * @param {any} id1 - First ID
 * @param {any} id2 - Second ID
 * @returns {boolean} Whether IDs match
 */
// Commented out to avoid linting warnings until needed
// export function compareIds(id1, id2) {
//   return extractMongoId(id1) === extractMongoId(id2);
// }

/**
 * Extract ID from an object that might have id, _id, or another field
 * @param {Object} obj - Object containing ID
 * @param {Array<string>} fields - Fields to check in priority order
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