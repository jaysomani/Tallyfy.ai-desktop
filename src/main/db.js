// db.js
const { Client } = require('pg');
const Database = require('better-sqlite3'); // Using better-sqlite3 (synchronous)
const path = require('path');
const fs = require('fs');
const electron = require('electron');
// Get app from either the main process or the remote module
const app = electron.app || (electron.remote && electron.remote.app);

// -------------------------
// PostgreSQL Functions (for GOLD/Trial users)
// -------------------------
async function initializePostgreSQLTables(client) {
  try {
    // Check if tables already exist
    const tableCheckQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      );
    `;
    const tableExists = await client.query(tableCheckQuery);
    if (tableExists.rows[0].exists) {
      console.log("AWS PostgreSQL tables already exist. Skipping table creation.");
      return client;
    }
    console.log("Creating tables in AWS PostgreSQL database...");
    await client.query('BEGIN');
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        cognitoid TEXT NOT NULL,
        username TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Create companies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        company_id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Create user_companies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_companies (
        id SERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        company_id TEXT NOT NULL,
        role TEXT,
        last_sync_time TIMESTAMP WITH TIME ZONE
      )
    `);
    // Create ledgers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ledgers (
        ledger_id SERIAL PRIMARY KEY,
        company_id TEXT NOT NULL,
        description TEXT NOT NULL,
        closing_balance NUMERIC NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        extra_data JSONB
      )
    `);
    // Create licenses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS licenses (
        id SERIAL PRIMARY KEY,
        "licenseKey" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "validTill" TIMESTAMP WITH TIME ZONE NOT NULL,
        status TEXT NOT NULL,
        "hardwareId" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        detectedhardwareid TEXT
      )
    `);
    // Create temporary_transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS temporary_transactions (
        id SERIAL PRIMARY KEY,
        upload_id TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT NOT NULL,
        bank_account TEXT NOT NULL,
        transaction_date TIMESTAMP WITH TIME ZONE,
        transaction_type TEXT,
        description TEXT NOT NULL,
        amount NUMERIC,
        assigned_ledger TEXT DEFAULT '',
        status TEXT DEFAULT ''
      )
    `);
    // Create user_temp_tables table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_temp_tables (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        company TEXT NOT NULL,
        temp_table TEXT NOT NULL,
        uploaded_file TEXT NOT NULL
      )
    `);
    await client.query('COMMIT');
    console.log("All PostgreSQL tables created successfully");
    return client;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error creating PostgreSQL tables:", error);
    throw error;
  }
}

async function connectToAWSDatabase() {
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
    console.log("Connected to AWS PostgreSQL database");
    await initializePostgreSQLTables(client);
    return client;
  } catch (error) {
    console.error("Error connecting to AWS PostgreSQL database:", error);
    throw error;
  }
}

// -------------------------
// SQLite Functions (for SILVER users using better-sqlite3)
// -------------------------
function initializeSQLiteTables(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cognitoid TEXT NOT NULL,
        username TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS companies (
        company_id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS user_companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        company_id TEXT NOT NULL,
        role TEXT,
        last_sync_time TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS ledgers (
        ledger_id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT NOT NULL,
        description TEXT NOT NULL,
        closing_balance NUMERIC NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        extra_data TEXT
      );
      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        licenseKey TEXT NOT NULL,
        userId TEXT NOT NULL,
        validTill TIMESTAMP NOT NULL,
        status TEXT NOT NULL,
        hardwareId TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        detectedhardwareid TEXT
      );
      CREATE TABLE IF NOT EXISTS temporary_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT NOT NULL,
        bank_account TEXT NOT NULL,
        transaction_date TIMESTAMP,
        transaction_type TEXT,
        description TEXT NOT NULL,
        amount NUMERIC,
        assigned_ledger TEXT DEFAULT '',
        status TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS user_temp_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        company TEXT NOT NULL,
        temp_table TEXT NOT NULL,
        uploaded_file TEXT NOT NULL
      );
    `);
    console.log("All SQLite tables created successfully");
    return db;
  } catch (err) {
    console.error("Error initializing SQLite tables:", err);
    throw err;
  }
}

async function connectToSQLiteDatabase() {
  try {
    let userDataPath;
    
    if (app) {
      // If we have access to the electron app
      userDataPath = app.getPath('userData');
    } else {
      // Fallback for when app is not available (testing environment)
      userDataPath = path.join(process.env.APPDATA || 
                             (process.platform === 'darwin' ? 
                               process.env.HOME + '/Library/Application Support' : 
                               process.env.HOME + '/.local/share'), 
                             'tallyfy-data');
      console.log("Using fallback path for user data:", userDataPath);
    }
    
    // Define a subdirectory for your app's data
    const dataDir = path.join(userDataPath, 'tallyfy-data');
    if (!fs.existsSync(dataDir)) {
      console.log("Creating data directory at", dataDir);
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'tallyfy.sqlite');
    const dbExists = fs.existsSync(dbPath);
    const db = new Database(dbPath, { verbose: console.log });
    console.log("Connected to SQLite database at", dbPath);
    if (!dbExists) {
      console.log("Database file doesn't exist. Creating tables...");
      initializeSQLiteTables(db);
    } else {
      console.log("Database file already exists. Skipping table creation.");
    }
    return db;
  } catch (error) {
    console.error("Error setting up SQLite database:", error);
    throw error;
  }
}

// -------------------------
// Main function to get DB connection based on user tier
// -------------------------
async function getDbConnection(userTier) {
  if (userTier === 'GOLD' || userTier === 'TRIAL') {
    console.log('Connecting with user tier:', userTier);
    return await connectToAWSDatabase();
  } else if (userTier === 'SILVER') {
    console.log('Connecting with user tier:', userTier);
    return await connectToSQLiteDatabase();
  } else {
    throw new Error('Unsupported user tier for database connection');
  }
}

// -------------------------
// Exported Database Functions for the App
// -------------------------
const authStore = new (require('electron-store'))({
  name: 'tallyfy-auth',
  encryptionKey: 'tallyfy-app-secure-key'
});

const database = {
  testConnection: async function () {
    try {
      const userData = authStore.get('userData');
      const userTier = userData && userData.tier ? userData.tier : 'GOLD';
      console.log('Connecting with user tier:', userTier);
      const client = await getDbConnection(userTier);
      if (userTier === 'SILVER') {
        const row = client.prepare("SELECT datetime('now') as now").get();
        return { success: true, message: `Connected to SQLite DB. Current time: ${row.now}` };
      } else {
        const result = await client.query('SELECT NOW()');
        await client.end();
        return { success: true, message: `Successfully connected to AWS DB. Current time: ${result.rows[0].now}` };
      }
    } catch (error) {
      return { success: false, error: error.message || 'Failed to connect to database' };
    }
  },

  executeQuery: async function (query, params = [], userTier = 'GOLD') {
    try {
      const client = await getDbConnection(userTier);
      if (userTier === 'SILVER') {
        try {
          const stmt = client.prepare(query);
          const rows = stmt.all(...params);
          return { success: true, rows, message: 'Query executed successfully on SQLite database' };
        } catch (err) {
          return { success: false, error: err.message || 'Failed to execute query on SQLite database' };
        }
      } else {
        const result = await client.query(query, params);
        await client.end();
        return { success: true, rows: result.rows, rowCount: result.rowCount, message: 'Query executed successfully on AWS database' };
      }
    } catch (error) {
      return { success: false, error: error.message || 'Failed to execute query' };
    }
  },

  getUserCompanies: async function (userEmail) {
    try {
      const userData = authStore.get('userData');
      const userTier = userData && userData.tier ? userData.tier : 'GOLD';
      const client = await getDbConnection(userTier);
      if (userTier === 'SILVER') {
        const stmt = client.prepare(`
          SELECT c.company_id, c.company_name
          FROM companies c
          JOIN user_companies uc ON c.company_id = uc.company_id
          WHERE uc.user_email = ?
        `);
        const rows = stmt.all(userEmail);
        return rows;
      } else {
        const result = await client.query(`
          SELECT c.company_id, c.company_name
          FROM companies c
          JOIN user_companies uc ON c.company_id = uc.company_id
          WHERE uc.user_email = $1
        `, [userEmail]);
        await client.end();
        return result.rows;
      }
    } catch (error) {
      console.error('Error in getUserCompanies:', error);
      return [];
    }
  },

  getOrCreateCompany: async function (username, companyName) {
    try {
      if (!companyName || typeof companyName !== 'string' || companyName.trim() === '') {
        console.error('Invalid company name:', companyName);
        return { success: false, error: 'Invalid company name' };
      }

      const userData = authStore.get('userData');
      const userTier = userData && userData.tier ? userData.tier : 'GOLD';
      
      try {
        const client = await getDbConnection(userTier);
        const companyId = companyName.replace(/\s+/g, '_').toLowerCase();

        if (userTier === 'SILVER') {
          const selectStmt = client.prepare('SELECT company_id FROM companies WHERE company_id = ?');
          const row = selectStmt.get(companyId);
          if (row) {
            console.log(`Company '${companyId}' already exists.`);
            return { success: true, companyId };
          }
          try {
            const insertCompanyStmt = client.prepare(`
              INSERT INTO companies (company_id, company_name, created_by, created_at)
              VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `);
            insertCompanyStmt.run(companyId, companyName, username);
            
            const insertUserCompanyStmt = client.prepare(`
              INSERT INTO user_companies (user_email, company_id, role)
              VALUES (?, ?, ?)
            `);
            insertUserCompanyStmt.run(username, companyId, 'admin');
            
            return { success: true, companyId };
          } catch (error) {
            console.error('Error creating company:', error);
            return { success: false, error: `Error creating company: ${error.message}` };
          }
        } else {
          const companyCheck = await client.query('SELECT company_id FROM companies WHERE company_id = $1', [companyId]);
          if (companyCheck.rows.length > 0) {
            await client.end();
            return { success: true, companyId };
          }
          await client.query('INSERT INTO companies (company_id, company_name, created_by, created_at) VALUES ($1, $2, $3, NOW())', [companyId, companyName, username]);
          await client.query('INSERT INTO user_companies (user_email, company_id, role) VALUES ($1, $2, $3)', [username, companyId, 'admin']);
          await client.end();
          return { success: true, companyId };
        }
      } catch (dbError) {
        console.error('Database error in getOrCreateCompany:', dbError);
        return { success: false, error: `Database error: ${dbError.message}` };
      }
    } catch (error) {
      console.error('Error in getOrCreateCompany:', error);
      return { success: false, error: error.message };
    }
  },

  getLedgerOptions: async function (companyId) {
    try {
      const userData = authStore.get('userData');
      const userTier = userData && userData.tier ? userData.tier : 'GOLD';
      const client = await getDbConnection(userTier);
      if (userTier === 'SILVER') {
        const stmt = client.prepare('SELECT description FROM ledgers WHERE company_id = ?');
        const rows = stmt.all(companyId);
        const ledgerOptions = rows.map(row => row.description);
        return ledgerOptions;
      } else {
        const result = await client.query('SELECT description FROM ledgers WHERE company_id = $1', [companyId]);
        await client.end();
        return result.rows.map(row => row.description);
      }
    } catch (error) {
      console.error('Error in getLedgerOptions:', error);
      return [];
    }
  },

  uploadLedgers: async function (username, companyName, ledgers) {
    try {
      const userData = authStore.get('userData');
      const userTier = userData && userData.tier ? userData.tier : 'GOLD';
      const client = await getDbConnection(userTier);
      
      // Get or create company, now returns { success, companyId, error }
      const companyResult = await database.getOrCreateCompany(username, companyName);
      if (!companyResult.success) {
        return { success: false, error: companyResult.error || 'Failed to get or create company' };
      }
      
      const companyId = companyResult.companyId;
      
      if (userTier === 'SILVER') {
        // Use a transaction provided by better-sqlite3:
        const tx = client.transaction((ledgers) => {
          if (ledgers.length === 0) {
            const updateStmt = client.prepare('UPDATE user_companies SET last_sync_time = CURRENT_TIMESTAMP WHERE user_email = ? AND company_id = ?');
            updateStmt.run(username, companyId);
            return;
          }
          const existingRows = client.prepare('SELECT description FROM ledgers WHERE company_id = ?').all(companyId);
          const existingLedgers = new Set(existingRows.map(r => r.description.trim().toLowerCase()));
          const newLedgers = ledgers.filter(ledger => {
            const ledgerName = (ledger.Name || ledger.LEDGERNAME || 'N/A').trim();
            return ledgerName !== 'N/A' && !existingLedgers.has(ledgerName.toLowerCase());
          });
          if (newLedgers.length === 0) {
            const updateStmt = client.prepare('UPDATE user_companies SET last_sync_time = CURRENT_TIMESTAMP WHERE user_email = ? AND company_id = ?');
            updateStmt.run(username, companyId);
            return;
          }
          const insertStmt = client.prepare('INSERT INTO ledgers (company_id, description, closing_balance, timestamp, extra_data) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)');
          for (const ledger of newLedgers) {
            const ledgerName = (ledger.Name || ledger.LEDGERNAME || 'N/A').trim();
            const closingBalance = parseFloat(ledger.ClosingBalance || ledger.CLOSINGBALANCE || '0') || 0.0;
            const extraFields = {};
            Object.keys(ledger).forEach(key => {
              if (!['Name', 'LEDGERNAME', 'ClosingBalance', 'CLOSINGBALANCE'].includes(key)) {
                extraFields[key] = ledger[key];
              }
            });
            insertStmt.run(companyId, ledgerName, closingBalance, JSON.stringify(extraFields));
          }
          const updateStmt = client.prepare('UPDATE user_companies SET last_sync_time = CURRENT_TIMESTAMP WHERE user_email = ? AND company_id = ?');
          updateStmt.run(username, companyId);
        });
        tx(ledgers);
        return { success: true };
      } else {
        // GOLD: PostgreSQL logic (unchanged)
        await client.query('BEGIN');
        try {
          const existingResult = await client.query('SELECT description FROM ledgers WHERE company_id = $1', [companyId]);
          const existingLedgers = new Set(existingResult.rows.map(row => row.description.trim().toLowerCase()));
          const newLedgers = ledgers.filter(ledger => {
            const ledgerName = (ledger.Name || ledger.LEDGERNAME || 'N/A').trim();
            return ledgerName !== 'N/A' && !existingLedgers.has(ledgerName.toLowerCase());
          });
          for (const ledger of newLedgers) {
            const ledgerName = (ledger.Name || ledger.LEDGERNAME || 'N/A').trim();
            const closingBalance = parseFloat(ledger.ClosingBalance || ledger.CLOSINGBALANCE || '0') || 0.0;
            const extraFields = {};
            Object.keys(ledger).forEach(key => {
              if (!['Name', 'LEDGERNAME', 'ClosingBalance', 'CLOSINGBALANCE'].includes(key)) {
                extraFields[key] = ledger[key];
              }
            });
            await client.query(
              'INSERT INTO ledgers (company_id, description, closing_balance, timestamp, extra_data) VALUES ($1, $2, $3, NOW(), $4)',
              [companyId, ledgerName, closingBalance, JSON.stringify(extraFields)]
            );
          }
          await client.query('UPDATE user_companies SET last_sync_time = NOW() WHERE user_email = $1 AND company_id = $2', [username, companyId]);
          await client.query('COMMIT');
          await client.end();
          return { success: true };
        } catch (error) {
          await client.query('ROLLBACK');
          await client.end();
          throw error;
        }
      }
    } catch (error) {
      console.error('Error in uploadLedgers:', error);
      return { success: false, error: error.message };
    }
  },

  getLastSyncTime: async function (userEmail, companyName) {
    try {
      const normalizedCompanyName = companyName.trim().toLowerCase();
      const userData = authStore.get('userData');
      const userTier = userData && userData.tier ? userData.tier : 'GOLD';
      
      if (userTier === 'SILVER') {
        // SQLite uses ? placeholders
        const query = `
          SELECT uc.last_sync_time
          FROM user_companies uc
          JOIN companies c ON uc.company_id = c.company_id
          WHERE uc.user_email = ?
          AND lower(c.company_name) = ?
        `;
        const result = await this.executeQuery(query, [userEmail, normalizedCompanyName], userTier);
        console.log("[getLastSyncTime] Query result:", result);
        if (result.success && result.rows.length > 0 && result.rows[0].last_sync_time) {
          const rawValue = result.rows[0].last_sync_time;
          let lastSyncString;
          try {
            lastSyncString = new Date(rawValue).toISOString();
          } catch (e) {
            lastSyncString = String(rawValue);
          }
          console.log("[getLastSyncTime] Formatted lastSyncString:", lastSyncString);
          return lastSyncString;
        }
      } else {
        // PostgreSQL uses $1, $2, etc.
        const query = `
          SELECT uc.last_sync_time
          FROM user_companies uc
          JOIN companies c ON uc.company_id = c.company_id
          WHERE uc.user_email = $1
          AND lower(c.company_name) = $2
        `;
        const result = await this.executeQuery(query, [userEmail, normalizedCompanyName], userTier);
        console.log("[getLastSyncTime] Query result:", result);
        if (result.success && result.rows.length > 0 && result.rows[0].last_sync_time) {
          const rawValue = result.rows[0].last_sync_time;
          let lastSyncString;
          try {
            lastSyncString = new Date(rawValue).toISOString();
          } catch (e) {
            lastSyncString = String(rawValue);
          }
          console.log("[getLastSyncTime] Formatted lastSyncString:", lastSyncString);
          return lastSyncString;
        }
      }
      return null;
    } catch (error) {
      console.error("[getLastSyncTime] Error:", error);
      throw error;
    }
  },
};

module.exports = database;