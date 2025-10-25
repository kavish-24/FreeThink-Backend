-- Manual SQL migration script to add missing columns to notifications table
-- Run this SQL script directly in your MySQL database if the migration doesn't work

USE your_database_name; -- Replace with your actual database name

-- Add type column with default value
ALTER TABLE notifications ADD COLUMN type VARCHAR(255) NOT NULL DEFAULT 'info';

-- Add action_url column (nullable)
ALTER TABLE notifications ADD COLUMN action_url VARCHAR(255) NULL;

-- Add action_text column (nullable)
ALTER TABLE notifications ADD COLUMN action_text VARCHAR(255) NULL;

-- Add read column with default value
ALTER TABLE notifications ADD COLUMN `read` BOOLEAN NOT NULL DEFAULT FALSE;

-- Verify the table structure
DESCRIBE notifications;