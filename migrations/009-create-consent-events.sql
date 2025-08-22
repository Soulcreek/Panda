-- Migration: Create table to store consent events (non-identifying)
CREATE TABLE IF NOT EXISTS consent_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  categories JSON NOT NULL,
  meta JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (created_at)
);
