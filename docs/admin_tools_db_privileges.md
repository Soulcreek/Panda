# Admin Tools: DB privilege diagnostics & quick fixes

Purpose
-------
This short guide helps triage and fix the common cause why `/admin/tools/raw` and `/admin/tools/tables` show no data: the application DB user lacks the needed SELECT/metadata privileges or the app is connected to the wrong database.

Checklist
- [ ] Confirm which DB the app is connected to (`DATABASE()`)
- [ ] Confirm which DB user the app uses (`CURRENT_USER()`)
- [ ] If needed, grant SELECT on the target database to the app user (least privilege)
- [ ] Re-run the app diagnostics (`/admin/tools/diag`) and check raw/tables views

Important note
--------------
Changing DB users and privileges should be done by a DBA or by a user with `GRANT OPTION` (typically `root` or an admin account). Avoid wildcard grants on production unless approved.

1) Quick checks (run as the app user or via the web diagnostic endpoint)

- From the running app (admin session): open the diagnostic endpoint added to the app:

  GET /admin/tools/diag

  Expected JSON keys: `current_user`, `database_name`, `env_DB_NAME`.

- From a MySQL client (replace placeholders):

  mysql -u panda_user -p -e "SELECT CURRENT_USER() AS cur, USER() AS user, DATABASE() AS db; SHOW GRANTS FOR CURRENT_USER();"

  Example (PowerShell):

  mysql -u panda_user -p -e "SELECT CURRENT_USER() AS cur, DATABASE() AS db; SHOW GRANTS FOR CURRENT_USER();"

2) Grant minimal privileges (as root/admin)

Replace these placeholders: `YOUR_DB` (database name), `APP_USER` (DB user), `APP_HOST` (host pattern, e.g. '%' or 'localhost'). Run as a DBA account in the MySQL shell or via command line.

-- If the user already exists, grant SELECT on the application's database:
GRANT SELECT ON `YOUR_DB`.* TO 'APP_USER'@'APP_HOST';
FLUSH PRIVILEGES;

-- If the user does not exist (create + grant):
CREATE USER 'APP_USER'@'APP_HOST' IDENTIFIED BY 'A_STRONG_PASSWORD';
GRANT SELECT ON `YOUR_DB`.* TO 'APP_USER'@'APP_HOST';
FLUSH PRIVILEGES;

Notes about metadata queries
----------------------------
- The Admin Tools use `SHOW TABLES` and a query against `information_schema.columns WHERE table_schema = DATABASE()`; granting SELECT on the target database is usually sufficient to let the user see `SHOW TABLES` and the `information_schema` rows for that database. Some managed MySQL services restrict metadata visibility — in that case ask the DBA to enable metadata access for the app user or run the necessary queries as an admin and export results to a read-only reporting schema.

3) Test the fix (as the app user)

-- From the MySQL client (replace placeholders):
mysql -u APP_USER -p -e "USE YOUR_DB; SHOW TABLES; SELECT COUNT(*) FROM posts LIMIT 1; SELECT CURRENT_USER(), DATABASE();"

-- From within the running app (after restart if you changed env):
1. Ensure `process.env.DB_NAME` (or `.env`) is set to `YOUR_DB`.
2. Restart the node process.
3. Open in browser (must be logged-in admin):
   - /admin/tools/raw
   - /admin/tools/tables
   - /admin/tools/diag  (should now show the correct DB and current_user)

4) If SHOW TABLES returns no tables but `DATABASE()` is correct

- Possible causes:
  - The DB is empty (no tables created in that DB). Run `SHOW TABLES` as admin to confirm.
  - The app connected to a different DB than expected (check `.env` and how the app is started).
  - The user has a very restricted metadata view (managed DBs occasionally restrict `information_schema` access).

5) Example: One-liner to grant SELECT from PowerShell (run as admin on the DB server)

```powershell
mysql -u root -p -e "GRANT SELECT ON `YOUR_DB`.* TO 'APP_USER'@'%' ; FLUSH PRIVILEGES;"
```

6) If you want me to prepare SQL tailored to your env

Provide the exact values for `YOUR_DB`, `APP_USER` and `APP_HOST` (or say `I will run as root`) and I will provide a ready-to-run snippet. If you prefer I can also prepare a migration-like SQL file under `migrations/` that your DB admin can review.

-- End of doc
