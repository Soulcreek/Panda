-- Archiv (Legacy) – Originalinhalt
-- Siehe neue konsolidierte Datei schema_consolidated.sql

-- BEGIN ORIGINAL
-- DBNAME: site_content.db
-- Migration 001: Aktualisiert die Inhalte für "The Panda's Way" mit reichhaltigem, animiertem HTML.

UPDATE pandas_way_content
SET content = 'FULL_HTML_LEVEL_1_ORIGINAL (siehe Repo Historie)'
WHERE level = 1 AND lang = 'de';

UPDATE pandas_way_content
SET content = 'FULL_HTML_LEVEL_2_ORIGINAL (siehe Repo Historie)'
WHERE level = 2 AND lang = 'de';

UPDATE pandas_way_content
SET content = 'FULL_HTML_LEVEL_3_ORIGINAL (siehe Repo Historie)'
WHERE level = 3 AND lang = 'de';

UPDATE pandas_way_content
SET content = 'FULL_HTML_LEVEL_4_ORIGINAL (siehe Repo Historie)'
WHERE level = 4 AND lang = 'de';
-- END ORIGINAL
