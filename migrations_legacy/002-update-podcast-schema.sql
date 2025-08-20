-- Archiv (Legacy) – Original Podcast Migration
-- DBNAME: podcasts.db (SQLite Alt)
-- Diente zur Umstellung auf zweistufiges Schema (Basis + sprachspezifisch)
-- Wird aktuell nicht mehr aktiv verwendet – neues Schema siehe schema_consolidated.sql

DROP TABLE IF EXISTS podcasts;
DROP TABLE IF EXISTS podcasts_content;
DROP TABLE IF EXISTS podcasts_old;

CREATE TABLE podcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audio_filename TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE podcasts_content (
    podcast_id INTEGER,
    lang TEXT,
    title TEXT,
    description TEXT,
    FOREIGN KEY(podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE,
    PRIMARY KEY (podcast_id, lang)
);
