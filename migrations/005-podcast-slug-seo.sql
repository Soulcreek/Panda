-- Migration 005: Add slug column to podcasts and backfill + indexes
ALTER TABLE podcasts ADD COLUMN slug VARCHAR(255) NULL AFTER title;
ALTER TABLE podcasts ADD UNIQUE INDEX uq_podcasts_slug (slug);

-- Backfill existing rows with slugified title (MySQL 8 REGEXP_REPLACE usage)
UPDATE podcasts SET slug = LOWER(REGEXP_REPLACE(title,'[^a-zA-Z0-9\s-]','')) WHERE (slug IS NULL OR slug='');
UPDATE podcasts SET slug = REGEXP_REPLACE(slug,'\s+','-');
UPDATE podcasts SET slug = REGEXP_REPLACE(slug,'-+','-');
UPDATE podcasts SET slug = TRIM(BOTH '-' FROM slug);

-- Ensure uniqueness by appending id if duplicates
UPDATE podcasts p JOIN (
  SELECT slug, COUNT(*) c FROM podcasts WHERE slug IS NOT NULL GROUP BY slug HAVING c>1
) d ON p.slug=d.slug
SET p.slug = CONCAT(p.slug,'-',p.id);

-- (Optional) enforce NOT NULL later once application writes slug on insert
-- ALTER TABLE podcasts MODIFY slug VARCHAR(255) NOT NULL;
