Migration workflow (manual SQL) — Purview Panda

Purpose
-------
This project now uses a consolidated schema file (`schema_consolidated.sql`). You requested to run SQL manually on the DB host instead of using per-file migrations or an internal migrate runner. This document records the exact steps, quick commands, verification and rollback hints for DB changes.

High-level policy
-----------------
- Always run schema changes manually on the target database (or via your DBA's approved tooling).
- Use `schema_consolidated.sql` as the single source-of-truth for schema creation and optional idempotent patches.
- Per-file migration scripts under `migrations/` have been removed (007-009 folded into the consolidated file). Do not rely on an internal migration runner.
- For production changes, prepare a short change plan to be executed during a maintenance window and include a rollback plan.

Checklist before you run SQL
----------------------------
- [ ] Make a full DB backup (mysqldump / snapshot) or ensure a restore point exists.
- [ ] Confirm the target `DB_NAME`, `DB_USER` and `DB_HOST` values to use.
- [ ] Review the SQL sections you intend to run; the consolidated file contains many idempotent statements and example seed content.

Common operations (examples)
----------------------------
# From the DB host (preferred): run the whole consolidated file
```bash
mysql -u root -p < /path/to/repo/schema_consolidated.sql
```

# Run only specific statements (e.g. grant)
```bash
mysql -u root -p -e "GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'%'; FLUSH PRIVILEGES;"
```

# Verify tables exist (as app user)
```bash
mysql -u APP_USER -p -e "USE YOUR_DB_NAME; SHOW TABLES LIKE 'consent_events'; SHOW TABLES LIKE 'purview_aggregates';"
```

PowerShell examples
-------------------
```powershell
# Run consolidated SQL from repo root (Windows host)
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p < schema_consolidated.sql
```

Verifying app behaviour
-----------------------
- Consent events: after creating `consent_events` table, interact with the cookie bar and confirm `/admin/consent-events` shows entries (admin-only view).
- Purview aggregates: after creating `purview_aggregates`, run any aggregation script you use once and check `/api/public/purview` or relevant endpoints return data.
- Admin tools: after running the GRANT, verify the app user can `SHOW TABLES` and the admin diagnostic endpoints show expected values.

Retention & purge
-----------------
- The repository includes `scripts/purge_consent_events.js`. Schedule or run it to implement your retention policy.
- Example cron (daily at 03:00):
```
0 3 * * * /usr/bin/node /path/to/repo/scripts/purge_consent_events.js 365 >> /var/log/panda/purge_consent.log 2>&1
```

Rollback guidance
-----------------
- For structural changes (ALTER TABLE / DROP), always test on staging first. If you must roll back:
  - Restore from DB backup/snapshot.
  - If you applied a non-destructive change (CREATE TABLE / GRANT), rollback is often a simple DROP TABLE / REVOKE, but verify dependencies first.

Developer notes (repo)
----------------------
- The `schema_consolidated.sql` now contains the remaining SQL that used to live in `migrations/007-009` (GRANT, purview_aggregates, consent_events).
- Application code may attempt to insert into `consent_events` and `purview_aggregates` if present; those operations are safe/no-op if the table is missing, but for full functionality apply the relevant SQL.
- If you want an automated runner later, adopt a standard tool (Flyway, Liquibase, dbmate, knex/migrate) and/or reintroduce per-file migrations under your preferred toolchain.

Questions / follow-up
---------------------
If you want, I can:
- Add a one-line `package.json` script to run the purge script: `npm run purge-consent -- 365`.
- Prepare a small, reviewable SQL snippet file for DBAs for the exact statements you want to run (e.g. just the grant + consent table + purge schedule).

