-- Migration 010: Add SEO fields to media table
-- Date: 2025-08-23
-- Purpose: Add missing seo_alt, seo_description, and meta_keywords columns to media table

ALTER TABLE media 
ADD COLUMN seo_alt VARCHAR(500) NULL AFTER alt_text,
ADD COLUMN seo_description TEXT NULL AFTER seo_alt,
ADD COLUMN meta_keywords VARCHAR(1000) NULL AFTER seo_description;

-- Update existing records to have basic SEO values based on existing data
UPDATE media 
SET seo_alt = COALESCE(alt_text, name),
    seo_description = COALESCE(description, CONCAT('Media file: ', name))
WHERE seo_alt IS NULL OR seo_description IS NULL;
