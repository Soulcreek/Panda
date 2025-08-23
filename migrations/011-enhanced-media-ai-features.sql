-- Migration: Enhanced Media Management with AI Features
-- Add AI-powered columns to media table

-- Add AI enhancement columns
ALTER TABLE media 
ADD COLUMN ai_tags TEXT NULL COMMENT 'AI-generated tags from image analysis',
ADD COLUMN ai_alt_text VARCHAR(500) NULL COMMENT 'AI-generated alt text for accessibility',
ADD COLUMN ai_keywords VARCHAR(1000) NULL COMMENT 'AI-extracted keywords for search',
ADD COLUMN ai_confidence DECIMAL(3,2) DEFAULT 0.00 COMMENT 'AI analysis confidence score (0-1)',
ADD COLUMN ai_processed_at DATETIME NULL COMMENT 'When AI analysis was completed',
ADD COLUMN file_size_bytes INT NULL COMMENT 'File size in bytes for optimization',
ADD COLUMN dimensions VARCHAR(20) NULL COMMENT 'Image dimensions (WxH)';

-- Add search index for AI tags and keywords
ALTER TABLE media ADD FULLTEXT KEY ft_ai_content (ai_tags, ai_keywords, ai_alt_text);

-- Add compound index for efficient filtering
ALTER TABLE media ADD INDEX idx_media_ai_processed (site_key, ai_processed_at);

-- Update existing media records with file sizes where possible
UPDATE media SET file_size_bytes = NULL WHERE file_size_bytes IS NULL;
