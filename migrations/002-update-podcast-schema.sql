-- DBNAME: podcasts.db
-- Migration 002: Macht die Podcast-Verwaltung mehrsprachig, analog zu den Blog-Posts.

-- Löscht die alten Tabellen, falls sie existieren, um einen sauberen Start zu gewährleisten.
DROP TABLE IF EXISTS podcasts;
DROP TABLE IF EXISTS podcasts_content;
DROP TABLE IF EXISTS podcasts_old; -- Falls ein vorheriger Versuch hängengeblieben ist

-- Neue 'podcasts'-Tabelle ohne sprachspezifische Spalten erstellen
CREATE TABLE podcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audio_filename TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 'podcasts_content'-Tabelle erstellen
CREATE TABLE podcasts_content (
    podcast_id INTEGER,
    lang TEXT,
    title TEXT,
    description TEXT,
    FOREIGN KEY(podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE,
    PRIMARY KEY (podcast_id, lang)
);

-- DEPRECATED: Original Migration archiviert unter migrations_legacy/002-update-podcast-schema.sql
-- Nutze statt dessen schema_consolidated.sql
