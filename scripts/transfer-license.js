#!/usr/bin/env node

/**
 * License Transfer Utility
 * 
 * This utility helps administrators transfer a Silver tier license from one machine to another
 * by connecting directly to the AWS PostgreSQL database and resetting the hardwareId.
 */

const { Client } = require('pg');
const readline = require('readline');
require('dotenv').config();

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Connect to AWS database
async function connectToDatabase() {
  // Log connection being attempted
  console.log('Connecting to AWS PostgreSQL database...');
  
  // Create client with connection details from environment variables
  const client = new Client({
    host: process.env.AWS_DB_HOST,
    port: process.env.AWS_DB_PORT,
    database: process.env.AWS_DB_NAME,
    user: process.env.AWS_DB_USER,
    password: process.env.AWS_DB_PASSWORD,
    ssl: process.env.AWS_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  
  try {
    await client.connect();
    console.log('Connected to AWS PostgreSQL database successfully');
    return client;
  } catch (error) {
    console.error('Failed to connect to AWS PostgreSQL database:', error.message);
    process.exit(1);
  }
}

// Check if user has a license record
async function checkLicense(client, email) {
  try {
    const result = await client.query(
      'SELECT id, "hardwareId", "detectedhardwareid", status, "validTill" FROM licenses WHERE "userId" = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      console.log(`No license record found for user ${email}`);
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error checking license:', error.message);
    throw error;
  }
}

// Clear the hardware ID for a user's license
async function clearHardwareId(client, email) {
  try {
    const result = await client.query(
      'UPDATE licenses SET "hardwareId" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $1 RETURNING id',
      [email]
    );
    
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error clearing hardware ID:', error.message);
    throw error;
  }
}

// Create a new license record if none exists
async function createLicenseRecord(client, email) {
  try {
    // Generate a new license key
    const licenseKey = `SLV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Set expiration date to 1 year from now
    const validTill = new Date();
    validTill.setFullYear(validTill.getFullYear() + 1);
    
    const result = await client.query(
      'INSERT INTO licenses ("licenseKey", "userId", "validTill", status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id',
      [licenseKey, email, validTill, 'ACTIVE']
    );
    
    return result.rows[0].id;
  } catch (error) {
    console.error('Error creating license record:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  console.log('=== License Transfer Utility ===');
  console.log('This utility resets the hardware ID for a Silver tier user\'s license.\n');
  
  try {
    // Get user email
    const email = await prompt('Enter the user email: ');
    if (!email) {
      console.error('Email is required');
      process.exit(1);
    }
    
    // Connect to the database
    const client = await connectToDatabase();
    
    try {
      // Check if user has a license
      const license = await checkLicense(client, email);
      
      if (license) {
        console.log('\nLicense details:');
        console.log(`License ID: ${license.id}`);
        console.log(`Hardware ID: ${license.hardwareId || 'Not set'}`);
        console.log(`Detected Hardware ID: ${license.detectedhardwareid || 'None'}`);
        console.log(`Status: ${license.status}`);
        console.log(`Valid until: ${license.validTill}`);
        
        // Confirm transfer
        const confirm = await prompt('\nDo you want to reset this hardware ID? This will allow the user to login from a new computer. (yes/no): ');
        
        if (confirm.toLowerCase() === 'yes') {
          const updated = await clearHardwareId(client, email);
          
          if (updated) {
            console.log(`\nSuccess! The hardware ID for ${email} has been reset.`);
            console.log('The user can now login from a new computer, which will register the new hardware ID.');
          } else {
            console.log('\nError: Failed to update the license record.');
          }
        } else {
          console.log('\nOperation canceled.');
        }
      } else {
        // No license record found, ask if one should be created
        const createNew = await prompt('\nNo license record found. Create a new one? (yes/no): ');
        
        if (createNew.toLowerCase() === 'yes') {
          const licenseId = await createLicenseRecord(client, email);
          console.log(`\nSuccess! Created new license for ${email} with ID ${licenseId}.`);
          console.log('The user can now login from any computer, which will register their hardware ID.');
        } else {
          console.log('\nOperation canceled.');
        }
      }
    } finally {
      // Close database connection
      await client.end();
      console.log('\nDatabase connection closed.');
    }
  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});