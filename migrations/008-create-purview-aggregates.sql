-- Migration: Create table to store precomputed Purview aggregates
CREATE TABLE IF NOT EXISTS purview_aggregates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payload JSON NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (generated_at)
);
