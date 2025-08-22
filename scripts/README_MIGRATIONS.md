Migration Runner README

This simple migration runner executes .sql files in the `migrations/` directory in alphabetical order.

Usage:
  node scripts/run_migrations.js --database=YOUR_DB_NAME [--host=] [--user=] [--password=] [--dir=./migrations] [--dry-run]

Examples:
  # dry run (no changes):
  node scripts/run_migrations.js --database=k302164_PP_Data --dry-run

  # apply using env vars (replace placeholders accordingly)
  DB_HOST=YOUR_DB_HOST DB_USER=APP_USER DB_PASSWORD='YOUR_DB_PASSWORD' DB_NAME=YOUR_DB_NAME node scripts/run_migrations.js

Safety notes:
- The runner records applied migrations in a `schema_migrations` table. If a file's checksum changes after being applied, the runner will stop and report a checksum mismatch.
- Some DDL statements are non-transactional in MySQL; the script wraps execution in a transaction but not all changes can be rolled back. Review SQL files before running on production.
- Always run with `--dry-run` first and inspect changes.
- Backup your DB before running destructive migrations.

Advanced:
- You can version/control the `migrations/` directory; name files with a leading numeric prefix for ordering (e.g., 001-init.sql, 002-add-table.sql).
- The runner uses `multipleStatements=true` to allow files with multiple statements.
