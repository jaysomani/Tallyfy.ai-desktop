// src/main/license.js

const { getDbConnection } = require('./db');
const Store = require('electron-store');
const { machineIdSync } = require('node-machine-id');

const authStore = new Store({
  name: 'tallyfy-auth',
  encryptionKey: 'tallyfy-app-secure-key'
});

/**
 * Returns the unique hardware ID for the current machine.
 * Uses the original ID.
 */
function getHardwareId() {
  return machineIdSync({ original: true });
}

/**
 * Update the detected hardware ID for a user.
 * (E.g., store the hardware id detected at login.)
 */
async function updateDetectedHardware(userEmail, newHwid) {
  try {
    const userData = authStore.get('userData');
    const userTier = (userData && userData.tier) ? userData.tier : 'GOLD';
    const client = await getDbConnection(userTier);
    if (userTier === 'SILVER') {
      return new Promise((resolve, reject) => {
        client.run(
          'UPDATE licenses SET detectedhardwareid = ?, updatedAt = datetime("now") WHERE userId = ?',
          [newHwid, userEmail],
          function (err) {
            if (err) {
              reject(err);
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    } else {
      await client.query(
        'UPDATE licenses SET "detectedhardwareid" = $1, "updatedAt" = NOW() WHERE "userId" = $2',
        [newHwid, userEmail]
      );
      await client.end();
      return { success: true };
    }
  } catch (error) {
    console.error('Error in updateDetectedHardware:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update the registered hardware ID for a user.
 */
async function updateLicenseHardware(userEmail, hardwareId) {
  try {
    const userData = authStore.get('userData');
    const userTier = (userData && userData.tier) ? userData.tier : 'GOLD';
    const client = await getDbConnection(userTier);
    if (userTier === 'SILVER') {
      return new Promise((resolve, reject) => {
        client.run(
          'UPDATE licenses SET hardwareId = ?, updatedAt = datetime("now") WHERE userId = ?',
          [hardwareId, userEmail],
          function (err) {
            if (err) {
              reject(err);
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    } else {
      await client.query(
        'UPDATE licenses SET "hardwareId" = $1, "updatedAt" = NOW() WHERE "userId" = $2',
        [hardwareId, userEmail]
      );
      await client.end();
      return { success: true };
    }
  } catch (error) {
    console.error('Error in updateLicenseHardware:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieve the license hardware IDs for a user.
 */
async function getLicenseHardware(userEmail) {
  try {
    const userData = authStore.get('userData');
    const userTier = (userData && userData.tier) ? userData.tier : 'GOLD';
    const client = await getDbConnection(userTier);
    if (userTier === 'SILVER') {
      return new Promise((resolve, reject) => {
        client.all(
          'SELECT hardwareId, detectedhardwareid FROM licenses WHERE userId = ?',
          [userEmail],
          (err, rows) => {
            if (err) {
              reject(err);
            } else if (rows.length > 0) {
              resolve({ hardwareId: rows[0].hardwareId, detectedhardwareid: rows[0].detectedhardwareid });
            } else {
              resolve({ hardwareId: null, detectedhardwareid: null });
            }
          }
        );
      });
    } else {
      const result = await client.query(
        'SELECT "hardwareId", "detectedhardwareid" FROM licenses WHERE "userId" = $1',
        [userEmail]
      );
      await client.end();
      if (result.rows.length > 0) {
        return { hardwareId: result.rows[0].hardwareId, detectedhardwareid: result.rows[0].detectedhardwareid };
      }
      return { hardwareId: null, detectedhardwareid: null };
    }
  } catch (error) {
    console.error('Error in getLicenseHardware:', error);
    return { hardwareId: null, detectedhardwareid: null, error: error.message };
  }
}

/**
 * Create a new license record for a user.
 * Sets a default license key, a validity of one year, and stores the provided hardware ID.
 */
async function createLicenseRecord(userEmail, hardwareId) {
  try {
    const now = new Date();
    const validTill = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year validity
    const defaultLicenseKey = "default_key"; // Adjust as needed
    const userData = authStore.get('userData');
    const userTier = (userData && userData.tier) ? userData.tier : 'GOLD';
    const client = await getDbConnection(userTier);
    if (userTier === 'SILVER') {
      return new Promise((resolve, reject) => {
        client.run(
          `INSERT INTO licenses 
          (licenseKey, userId, validTill, status, hardwareId, detectedhardwareid, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, datetime("now"), datetime("now"))`,
          [defaultLicenseKey, userEmail, validTill, "active", hardwareId, null],
          function (err) {
            if (err) {
              reject(err);
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    } else {
      await client.query(
        `INSERT INTO licenses 
         ("licenseKey", "userId", "validTill", status, "hardwareId", "detectedhardwareid", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [defaultLicenseKey, userEmail, validTill, "active", hardwareId, null]
      );
      await client.end();
      return { success: true };
    }
  } catch (error) {
    console.error('Error in createLicenseRecord:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getHardwareId,
  updateDetectedHardware,
  updateLicenseHardware,
  getLicenseHardware,
  createLicenseRecord
};