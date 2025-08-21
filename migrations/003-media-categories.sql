-- Migration 003: Media Categories Normalisierung
-- Creates media_categories table and backfills distinct existing categories from media.

CREATE TABLE IF NOT EXISTS media_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    label VARCHAR(190) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Backfill: insert distinct categories that are non-null/non-empty
INSERT IGNORE INTO media_categories (slug,label)
SELECT LOWER(TRIM(category)) AS slug, category AS label
FROM media
WHERE category IS NOT NULL AND TRIM(category) <> ''
GROUP BY LOWER(TRIM(category));

-- (Optional future) Add media.category_id FK once application migrated to use IDs:
-- ALTER TABLE media ADD COLUMN category_id INT NULL, ADD INDEX idx_media_category_id (category_id), ADD CONSTRAINT fk_media_category FOREIGN KEY (category_id) REFERENCES media_categories(id) ON DELETE SET NULL;
-- UPDATE media m JOIN media_categories mc ON LOWER(TRIM(m.category))=mc.slug SET m.category_id = mc.id;
-- (Keep textual category for backward compatibility until code fully switched.)
