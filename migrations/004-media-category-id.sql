-- Migration 004: Introduce media.category_id FK referencing media_categories
ALTER TABLE media ADD COLUMN category_id INT NULL AFTER category;
ALTER TABLE media ADD INDEX idx_media_category_id (category_id);
ALTER TABLE media ADD CONSTRAINT fk_media_category FOREIGN KEY (category_id) REFERENCES media_categories(id) ON DELETE SET NULL;

-- Backfill existing rows
UPDATE media m
LEFT JOIN media_categories mc ON LOWER(TRIM(m.category)) = mc.slug
SET m.category_id = mc.id
WHERE m.category IS NOT NULL AND TRIM(m.category)<>'' AND m.category_id IS NULL;
