-- Migration: Grant minimal SELECT privileges needed for Admin Tools (raw/tables)
-- Created: 2025-08-22
-- NOTE: Run these statements as a DBA (root) on the MySQL server. Adjust APP_HOST if your app connects from a specific host.

-- Inferred from repository .env (DO NOT COMMIT PASSWORDS):
-- DB_NAME = `k302164_PP_Data`
-- APP_USER = `k302164_PP2`

-- Recommended minimal grant (allows SELECT on all tables in the application DB):
GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'%';
FLUSH PRIVILEGES;

-- If your app connects from localhost, prefer a localhost-scoped grant (tighter):
-- GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'localhost';
-- FLUSH PRIVILEGES;

-- If the user does not exist, create it and grant (replace 'A_STRONG_PASSWORD' with a secure secret):
-- CREATE USER 'k302164_PP2'@'%' IDENTIFIED BY 'A_STRONG_PASSWORD';
-- GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'%';
-- FLUSH PRIVILEGES;

-- Verification queries (run as the app user or from the diagnostic endpoints):
-- As the app user from the MySQL client:
-- mysql -u k302164_PP2 -p -e "USE k302164_PP_Data; SHOW TABLES; SELECT COUNT(*) FROM posts LIMIT 1; SELECT CURRENT_USER(), DATABASE();"

-- Quick one-liner to run as root (PowerShell example):
-- mysql -u root -p -e "GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'%'; FLUSH PRIVILEGES;"

-- Notes:
-- - Using '@"%"' allows the user to connect from any host. Replace with a specific host for tighter security.
-- - Some managed MySQL providers restrict metadata visibility; if SHOW TABLES still returns empty, consult your provider's docs or run the above queries as an admin to confirm tables exist.
-- - After changing grants, restart the app only if you changed connection settings (.env). Otherwise the new grants should take effect immediately.
