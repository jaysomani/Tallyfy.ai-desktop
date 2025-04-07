# Hardware ID Licensing for Silver Tier Users

This document explains how hardware ID verification works for Silver tier users in the application.

## Overview

Silver tier users are licensed to use the application on a single computer. To enforce this license restriction, the application captures a unique hardware identifier from the user's computer during the first login, stores it securely in the **online AWS PostgreSQL database**, and verifies it on subsequent logins against this central database.

## How It Works

1. **Hardware ID Generation**: When a Silver tier user logs in for the first time, a unique hardware ID is generated using the `node-machine-id` package, which retrieves a consistent identifier for the computer.

2. **Secure Storage**: The hardware ID is hashed using SHA-256 before being stored in the **online AWS PostgreSQL database** in the `licenses` table. This ensures that the actual hardware ID is never stored in plain text.

3. **Verification Process**: On subsequent logins, the application:
   - Connects to the online AWS PostgreSQL database
   - Retrieves the stored hardware ID for the user
   - Retrieves the current computer's hardware ID
   - Compares them
   - Only allows login if they match

4. **Fallback Mechanism**: If the primary hardware ID method fails, the application can fall back to a composite ID based on:
   - System hostname
   - CPU architecture
   - CPU model
   - Total system memory

## Technical Implementation

The hardware ID functionality is implemented in the following files:

- `src/services/hardwareId.js`: Core functions for retrieving and verifying hardware IDs against the online database
- `src/main/auth.js`: Integration with authentication flow
- `src/main/main.js`: IPC handlers for hardware ID operations and startup verification
- `src/main/preload.js`: Exposes hardware ID methods to the renderer process
- `src/renderer/js/login.js`: Updated to support hardware ID verification

## Database Schema

The AWS PostgreSQL database includes two columns in the `licenses` table:
- `hardwareId`: Stores the registered hardware ID for the user
- `detectedhardwareid`: Used for auditing - stores hardware IDs detected during failed verification attempts

## Limitations

- Hardware IDs may change if significant hardware changes are made to the computer
- Virtual machines or cloud environments may have less stable hardware IDs
- Some hardware ID collection methods may require administrative privileges

## Administration

To transfer a license to a new computer:

1. An administrator with access to the AWS database needs to update the `hardwareId` column in the `licenses` table for the user.
2. This can be done with a SQL command:

```sql
UPDATE licenses 
SET "hardwareId" = NULL, "updatedAt" = CURRENT_TIMESTAMP 
WHERE "userId" = 'user@example.com';
```

3. Setting the `hardwareId` to NULL will allow the next login from any computer to register as the new authorized hardware for that user.

## Security Considerations

- Hardware ID verification always happens against the online AWS PostgreSQL database
- Even for Silver users who typically use a local SQLite database, hardware verification connects to AWS
- This ensures that hardware verification cannot be bypassed by modifying the local database