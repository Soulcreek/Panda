-- Purview Panda – Konsolidiertes Schema & manuelle Content-Patches (Stand: August 2025)
-- Dieses Skript ersetzt den bisherigen migrations/ Ordner.
-- Führe es (oder Teile daraus) einmalig in deiner MySQL Instanz aus.
-- Vorsicht: Manche UPDATE Statements (Panda's Way) überschreiben vorhandenen Inhalt für bestimmte Level/lang Kombinationen.

/* =========================
   BASIS / CORE TABELLEN (falls noch nicht vorhanden)
   ========================= */

-- USERS (Basis Accounts)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  password VARCHAR(120) NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- SESSIONS (Express MySQL Session Store Struktur)
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires INT UNSIGNED NOT NULL,
  data TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Index für Session Expiry (idempotent via INFORMATION_SCHEMA)
SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='sessions' AND INDEX_NAME='idx_sessions_expires');
SET @stmt := IF(@idx_exists=0, 'ALTER TABLE sessions ADD INDEX idx_sessions_expires (expires)', 'DO 0');
PREPARE _s FROM @stmt; EXECUTE _s; DEALLOCATE PREPARE _s;

-- MEDIA (Uploads / Bilder / Audio Referenzen)
CREATE TABLE IF NOT EXISTS media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_key VARCHAR(64) NOT NULL DEFAULT 'default',
  name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  type VARCHAR(120),
  alt_text VARCHAR(500),
  description TEXT,
  seo_alt VARCHAR(500),
  seo_description VARCHAR(500),
  meta_keywords VARCHAR(500),
  category_id INT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_media_path (path),
  KEY idx_media_site (site_key),
  KEY idx_media_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- POSTS (Blog Beiträge, zweisprachig)
CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  content MEDIUMTEXT,
  title_en VARCHAR(255),
  content_en MEDIUMTEXT,
  whatsnew VARCHAR(500),
  author_id INT,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  featured_image_id INT NULL,
  published_at DATETIME NULL,
  tags VARCHAR(500),
  seo_title VARCHAR(255),
  seo_description VARCHAR(255),
  meta_keywords VARCHAR(255),
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_posts_status_published (status, published_at),
  KEY idx_posts_featured (is_featured),
  KEY idx_posts_author (author_id),
  FULLTEXT KEY ftx_posts_content (title, content, title_en, content_en, whatsnew)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PODCASTS
CREATE TABLE IF NOT EXISTS podcasts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  audio_url VARCHAR(500),
  tags VARCHAR(255),
  seo_title VARCHAR(255),
  seo_description VARCHAR(255),
  meta_keywords VARCHAR(255),
  published_at DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ADVANCED PAGES (Layout Pages)
CREATE TABLE IF NOT EXISTS advanced_pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  layout_json MEDIUMTEXT,
  rendered_html MEDIUMTEXT,
  is_template TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  seo_title VARCHAR(255),
  seo_description VARCHAR(255),
  meta_keywords VARCHAR(255),
  meta_image VARCHAR(255),
  published_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS advanced_page_generation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  topic VARCHAR(255),
  intent VARCHAR(64),
  sections VARCHAR(255),
  style_profile VARCHAR(64),
  diagnostics JSON NULL,
  layout_json MEDIUMTEXT,
  research_json MEDIUMTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TIMELINE (ALT5 + Editor)
CREATE TABLE IF NOT EXISTS timeline_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_key VARCHAR(64) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  phase VARCHAR(120),
  content_html MEDIUMTEXT,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_timeline_site_level (site_key, level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timeline_site_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_key VARCHAR(64) UNIQUE,
  level_count INT NOT NULL DEFAULT 3,
  design_theme VARCHAR(32) DEFAULT 'glass'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timeline_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_key VARCHAR(64) NOT NULL,
  level_index INT NOT NULL,
  title VARCHAR(255),
  image_path VARCHAR(255),
  icon VARCHAR(120),
  content_html MEDIUMTEXT,
  UNIQUE KEY uniq_level (site_key, level_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- USER PREFERENCES (Theme / Progress)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INT PRIMARY KEY,
  theme VARCHAR(16) NOT NULL DEFAULT 'system',
  pandas_way_level INT NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AI KONFIGURATION
CREATE TABLE IF NOT EXISTS ai_config (
  id INT PRIMARY KEY,
  primary_key_choice VARCHAR(32),
  max_daily_calls INT NOT NULL DEFAULT 500,
  limits JSON NULL,
  prompts JSON NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO ai_config (id, max_daily_calls) VALUES (1, 500);

-- AI NUTZUNG
CREATE TABLE IF NOT EXISTS ai_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  day DATE NOT NULL,
  endpoint VARCHAR(64) NOT NULL,
  calls INT NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_day_ep (day, endpoint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PANDA'S WAY CONTENT STORAGE
CREATE TABLE IF NOT EXISTS pandas_way_content (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level INT NOT NULL,
  lang VARCHAR(8) NOT NULL DEFAULT 'de',
  content MEDIUMTEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_level_lang (level, lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* OPTIONALE FOREIGN KEYS (bewusst ausgelassen für flexible Deploys; bei Bedarf einkommentieren)
ALTER TABLE posts ADD CONSTRAINT fk_posts_featured_media FOREIGN KEY (featured_image_id) REFERENCES media(id) ON DELETE SET NULL;
*/

/* =========================
  PANDA'S WAY (OPTIONALE CONTENT SEEDED UPDATES – aus Legacy Migration 001)
  ========================= */
-- Platzhalter: Content kann manuell mit UPDATE eingefügt werden.
-- Beispiel:
-- UPDATE pandas_way_content SET content = '<div>...</div>' WHERE level=1 AND lang='de';
-- Vollständige HTML Blöcke siehe migrations_legacy/001-update-pandas-way.sql

/* =========================
   MANUELLE NACHARBEIT & HINWEISE
   ========================= */
-- (1) Prüfe ob alte SQLite/Datei-basierte Artefakte entfernt werden können (posts.db, media.db etc.), falls endgültig MySQL-only.
-- (2) Evtl. Indexe nachrüsten: ALTER TABLE posts ADD INDEX idx_posts_status_published_at (status, published_at);
-- (3) Optional: podcasts Slug/SEO separate Tabelle / Slug-Spalte ergänzen.
-- (4) Advanced Pages: veröffentlichten Status mit Veröffentlichungsdatum erweitern:
--     ALTER TABLE advanced_pages ADD COLUMN published_at DATETIME NULL;
-- (5) ai_usage Rotation/Archivierung per Cron skripten.

-- ENDE

/* =========================
  MANUELL ZU RUNDETE MIGRATIONEN (früher migrations/007 - migrations/009)
  Diese SQL-Snippets wurden aus den separaten migration-Dateien übernommen.
  Hinweis: Du hast entschieden, SQL manuell auf dem DB-Server auszuführen. Führe die folgenden Abschnitte nur einmal aus, falls deine Instanz sie noch nicht enthält.
  Die ursprünglichen files migrations/007-009 wurden aus dem Repo entfernt.
  ========================= */

-- 007: Grant minimal SELECT privileges needed for Admin Tools (raw/tables)
-- Run these statements as a DBA (root) on the MySQL server. Adjust APP_HOST if your app connects from a specific host.
-- Example (replace DB_NAME / APP_USER):
--   mysql -u root -p -e "GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'%'; FLUSH PRIVILEGES;"

GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'%';
FLUSH PRIVILEGES;

-- If you prefer a localhost-scoped grant, replace '@"%"' with '@"localhost"' for tighter security.

-- 008: Create table to store precomputed Purview aggregates
CREATE TABLE IF NOT EXISTS purview_aggregates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payload JSON NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (generated_at)
);

-- 009: Create table to store consent events (non-identifying)
CREATE TABLE IF NOT EXISTS consent_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  categories JSON NOT NULL,
  meta JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (created_at)
);

  ANGEWANDTE MYSQL MIGRATIONEN (ehemals migrations/003-005)
  Diese Sektion wurde aus dem entfernten migrations Ordner übernommen.
  Nur ausführen, falls deine Instanz diese Änderungen noch nicht enthält.
  ========================= */

-- 003 Media Categories Normalisierung
CREATE TABLE IF NOT EXISTS media_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_key VARCHAR(64) NOT NULL DEFAULT 'default',
  slug VARCHAR(100) NOT NULL,
  label VARCHAR(190) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_media_cat_site_slug (site_key, slug),
  KEY idx_media_cat_site (site_key)
) ENGINE=InnoDB;

-- Backfill categories from legacy media.category column if it ever existed (idempotent)
SET @legacy_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media' AND COLUMN_NAME='category');
SET @stmt := IF(@legacy_col=1, 'INSERT IGNORE INTO media_categories (site_key, slug,label) SELECT COALESCE(site_key,\'default\'), LOWER(TRIM(category)) AS slug, category AS label FROM media WHERE category IS NOT NULL AND TRIM(category)<>\'\' GROUP BY COALESCE(site_key,\'default\'), LOWER(TRIM(category))', 'DO 0');
PREPARE _mc FROM @stmt; EXECUTE _mc; DEALLOCATE PREPARE _mc;

-- 004 media.category_id Foreign Key
-- CATEGORY_ID Spalte + Index + FK idempotent anlegen (breite MySQL Kompatibilität)
-- Ensure site_key column exists on media (for older DBs)
SET @col_media_site := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media' AND COLUMN_NAME='site_key');
SET @stmt := IF(@col_media_site=0, 'ALTER TABLE media ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT \'default\' AFTER id, ADD INDEX idx_media_site (site_key)', 'DO 0');
PREPARE _m1 FROM @stmt; EXECUTE _m1; DEALLOCATE PREPARE _m1;

-- Ensure category_id column exists (if legacy schema still missing it)
SET @col_catid := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media' AND COLUMN_NAME='category_id');
SET @stmt := IF(@col_catid=0, 'ALTER TABLE media ADD COLUMN category_id INT NULL AFTER description, ADD INDEX idx_media_category_id (category_id)', 'DO 0');
PREPARE _m2 FROM @stmt; EXECUTE _m2; DEALLOCATE PREPARE _m2;

-- Optional FK (guarded)
SET @fk_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='media' AND CONSTRAINT_NAME='fk_media_category');
SET @stmt := IF(@fk_exists=0, 'ALTER TABLE media ADD CONSTRAINT fk_media_category FOREIGN KEY (category_id) REFERENCES media_categories(id) ON DELETE SET NULL', 'DO 0');
PREPARE _m3 FROM @stmt; EXECUTE _m3; DEALLOCATE PREPARE _m3;

-- Backfill category_id from legacy textual column if still present
SET @legacy_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media' AND COLUMN_NAME='category');
SET @stmt := IF(@legacy_col=1, 'UPDATE media m LEFT JOIN media_categories mc ON LOWER(TRIM(m.category)) = mc.slug AND mc.site_key=COALESCE(m.site_key,\'default\') SET m.category_id = mc.id WHERE m.category IS NOT NULL AND TRIM(m.category)<>\'\' AND m.category_id IS NULL', 'DO 0');
PREPARE _m4 FROM @stmt; EXECUTE _m4; DEALLOCATE PREPARE _m4;

-- 005 Podcast Slug + SEO Vorbereitung
-- Podcast Slug Spalte + Unique Index idempotent
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='podcasts' AND COLUMN_NAME='slug');
SET @stmt := IF(@col_exists=0, 'ALTER TABLE podcasts ADD COLUMN slug VARCHAR(255) NULL AFTER title', 'DO 0');
PREPARE _s FROM @stmt; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='podcasts' AND INDEX_NAME='uq_podcasts_slug');
SET @stmt := IF(@idx_exists=0, 'ALTER TABLE podcasts ADD UNIQUE INDEX uq_podcasts_slug (slug)', 'DO 0');
PREPARE _s FROM @stmt; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Backfill nur falls slug leer
UPDATE podcasts SET slug = LOWER(REGEXP_REPLACE(title,'[^a-zA-Z0-9\\s-]','')) WHERE (slug IS NULL OR slug='');
UPDATE podcasts SET slug = REGEXP_REPLACE(slug,'\\s+','-');
UPDATE podcasts SET slug = REGEXP_REPLACE(slug,'-+','-');
UPDATE podcasts SET slug = TRIM(BOTH '-' FROM slug);

UPDATE podcasts p JOIN (
  SELECT slug, COUNT(*) c FROM podcasts WHERE slug IS NOT NULL GROUP BY slug HAVING c>1
) d ON p.slug=d.slug
SET p.slug = CONCAT(p.slug,'-',p.id);

-- (Optional später) Slug Not Null erzwingen:
-- ALTER TABLE podcasts MODIFY slug VARCHAR(255) NOT NULL;

-- 006 Media Category Cleanup (drop legacy media.category + prune orphan categories)
SET @legacy_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media' AND COLUMN_NAME='category');
SET @stmt := IF(@legacy_col=1, 'ALTER TABLE media DROP COLUMN category', 'DO 0');
PREPARE _m5 FROM @stmt; EXECUTE _m5; DEALLOCATE PREPARE _m5;

-- Remove orphaned categories (those without any media referencing them per site_key)
DELETE mc FROM media_categories mc
LEFT JOIN media m ON m.category_id = mc.id AND m.site_key = mc.site_key
WHERE m.id IS NULL;

/* HINWEIS: IF NOT EXISTS bei ADD COLUMN / ADD CONSTRAINT wird in älteren MySQL Versionen nicht
  unterstützt. In solchen Fällen die Statements ohne IF NOT EXISTS ausführen und Fehler ignorieren,
  falls Objekt bereits existiert.

  EHEMALIGE MIGRATIONS (003-006) SIND ENTFALLEN UND HIER INTEGRIERT.
*/

