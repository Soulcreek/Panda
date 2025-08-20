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
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

-- MEDIA (Uploads / Bilder / Audio Referenzen)
CREATE TABLE IF NOT EXISTS media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  type VARCHAR(120),
  alt_text VARCHAR(500),
  description TEXT,
  category VARCHAR(120),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_media_path (path)
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
