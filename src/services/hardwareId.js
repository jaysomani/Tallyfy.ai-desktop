/**
 * Hardware ID service
 * Provides functions for retrieving and validating hardware IDs
 */
const { machineIdSync } = require('node-machine-id');
const crypto = require('crypto');
const os = require('os');
const { Client } = require('pg');
require('dotenv').config();

/**
 * Get the raw hardware ID from the machine
 * @returns {string} The machine's hardware ID
 */
function getRawHardwareId() {
  try {
    // Get the machine ID using node-machine-id package
    return machineIdSync(true);
  } catch (error) {
    console.error('Error getting machine ID:', error);
    // Use fallback mechanism if machine ID retrieval fails
    return getFallbackHardwareId();
  }
}

/**
 * Get a fallback hardware ID based on system information
 * @returns {string} A fallback hardware ID
 */
function getFallbackHardwareId() {
  // Use system information to create a fallback ID
  const hostname = os.hostname();
  const architecture = os.arch();
  const cpuModel = os.cpus()[0]?.model || 'unknown';
  const totalMemory = os.totalmem();
  
  // Combine system information to create a unique ID
  return `${hostname}-${architecture}-${cpuModel}-${totalMemory}`;
}

/**
 * Get a hashed version of the hardware ID
 * @returns {string} SHA-256 hash of the hardware ID
 */
function getHashedHardwareId() {
  const rawId = getRawHardwareId();
  return crypto.createHash('sha256').update(rawId).digest('hex');
}

/**
 * Verify if the current machine's hardware ID matches the stored one
 * @param {string} storedHashedId - The stored hashed hardware ID to compare against
 * @returns {boolean} True if the IDs match, false otherwise
 */
function verifyHardwareId(storedHashedId) {
  if (!storedHashedId) return false;
  
  const currentHashedId = getHashedHardwareId();
  return currentHashedId === storedHashedId;
}

/**
 * Check hardware ID for Silver users against the online AWS database
 * @param {string} userEmail - Email of the user to check
 * @returns {Promise<Object>} Object indicating if hardware ID is valid and a message
 */
async function checkHardwareIdOnline(userEmail) {
  try {
    // Connect to AWS PostgreSQL regardless of the user tier
    const client = new Client({
      host: process.env.AWS_DB_HOST,    
      port: process.env.AWS_DB_PORT,
      database: process.env.AWS_DB_NAME,
      user: process.env.AWS_DB_USER,
      password: process.env.AWS_DB_PASSWORD,
      ssl: process.env.AWS_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    
    await client.connect();
    console.log("Connected to AWS PostgreSQL for hardware ID verification");

    // Get the hardware ID for the user from the licenses table
    const result = await client.query(
      'SELECT "hardwareId", "detectedhardwareid" FROM licenses WHERE "userId" = $1',
      [userEmail]
    );
    
    // Close the connection
    await client.end();

    const licenseRecord = result.rows.length > 0 ? result.rows[0] : null;
    const storedHardwareId = licenseRecord?.hardwareId;
    const currentHardwareId = getHashedHardwareId();

    // If no record exists
    if (!licenseRecord) {
      console.warn(`No license record found for user: ${userEmail}`);
      return { 
        valid: false, 
        message: "No hardware license record found. Please contact support." 
      };
    }

    // If no hardware ID is stored (first login on this system)
    if (!storedHardwareId) {
      console.log(`No hardware ID stored for user: ${userEmail}. First-time login detected.`);
      
      // Update the hardware ID in the online database
      await updateLicenseHardware(userEmail, currentHardwareId);
      
      return { 
        valid: true, 
        message: "Hardware ID registered successfully." 
      };
    }

    // Compare the stored hardware ID with the current one
    if (storedHardwareId !== currentHardwareId) {
      console.warn(`Hardware ID mismatch for user: ${userEmail}`);
      
      // Update the detected hardware ID (for auditing purposes)
      await updateDetectedHardware(userEmail, currentHardwareId);
      
      return { 
        valid: false, 
        message: "This license is linked to a different computer. Please contact support." 
      };
    }

    // If everything checks out
    console.log(`Hardware ID verified for user: ${userEmail}`);
    return { 
      valid: true, 
      message: "Hardware ID verified successfully." 
    };
  } catch (error) {
    console.error("Error checking hardware ID online:", error);
    return { 
      valid: false, 
      message: `Hardware verification error: ${error.message}. Please try again or contact support.` 
    };
  }
}

/**
 * Update the detected hardware ID for a user
 * @param {string} userEmail - Email of the user
 * @param {string} newHardwareId - New hardware ID to store
 * @returns {Promise<void>}
 */
async function updateDetectedHardware(userEmail, newHardwareId) {
  try {
    const client = new Client({
      host: process.env.AWS_DB_HOST,    
      port: process.env.AWS_DB_PORT,
      database: process.env.AWS_DB_NAME,
      user: process.env.AWS_DB_USER,
      password: process.env.AWS_DB_PASSWORD,
      ssl: process.env.AWS_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    
    await client.connect();
    
    // Update the detected hardware ID
    await client.query(
      'UPDATE licenses SET "detectedhardwareid" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2',
      [newHardwareId, userEmail]
    );
    
    await client.end();
    console.log(`Detected hardware ID updated for user: ${userEmail}`);
  } catch (error) {
    console.error("Error updating detected hardware ID:", error);
    throw error;
  }
}

/**
 * Update the license hardware ID for a user
 * @param {string} userEmail - Email of the user
 * @param {string} hardwareId - Hardware ID to store
 * @returns {Promise<void>}
 */
async function updateLicenseHardware(userEmail, hardwareId) {
  try {
    const client = new Client({
      host: process.env.AWS_DB_HOST,    
      port: process.env.AWS_DB_PORT,
      database: process.env.AWS_DB_NAME,
      user: process.env.AWS_DB_USER,
      password: process.env.AWS_DB_PASSWORD,
      ssl: process.env.AWS_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    
    await client.connect();
    
    // Check if the user has a license record
    const checkResult = await client.query(
      'SELECT id FROM licenses WHERE "userId" = $1',
      [userEmail]
    );
    
    if (checkResult.rows.length === 0) {
      // Create a new license record if none exists
      await client.query(
        'INSERT INTO licenses ("licenseKey", "userId", "validTill", status, "hardwareId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [`SLV-${Date.now()}-${Math.floor(Math.random() * 1000)}`, userEmail, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), 'ACTIVE', hardwareId]
      );
    } else {
      // Update the existing license record
      await client.query(
        'UPDATE licenses SET "hardwareId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2',
        [hardwareId, userEmail]
      );
    }
    
    await client.end();
    console.log(`License hardware ID updated for user: ${userEmail}`);
  } catch (error) {
    console.error("Error updating license hardware ID:", error);
    throw error;
  }
}

module.exports = {
  getRawHardwareId,
  getHashedHardwareId,
  verifyHardwareId,
  checkHardwareIdOnline,
  updateDetectedHardware,
  updateLicenseHardware
};