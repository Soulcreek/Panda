-- scripts/grant_select_admin_tools.sql
-- Grant SELECT privileges so the app user can use Admin Tools (SHOW TABLES, information_schema queries).
-- Edit/verify DB and USER values before running as root/admin.

-- Example (based on your .env):
-- DB_NAME = k302164_PP_Data
-- DB_USER = k302164_PP2

GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'%';
FLUSH PRIVILEGES;

-- Notes:
-- - Some managed MySQL providers restrict metadata (information_schema) access. If SHOW TABLES still returns empty after this grant, consult the provider docs or run the diagnostic queries as an admin and export results to a read-only reporting schema.
-- - To run as root from shell:
--   mysql -u root -p < scripts/grant_select_admin_tools.sql
-- - To run as root and target a specific host/port:
--   mysql -u root -p -h <host> -P <port> < k302164_PP_Data < scripts/grant_select_admin_tools.sql
