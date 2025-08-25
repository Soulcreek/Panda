# Purview Panda – Deployment (Authoritative TL;DR)

This is the high‑level reference for deploying Purview Panda. For the full step‑by‑step runbook, see `AUTO-DEPLOY-MK/DEPLOYMENT-README.md`. Older scattered docs are deprecated and merged.

## Chapter 0 — TL;DR

- Prereqs: Node 22+, PowerShell 5+, .env in repo root with FTP*\*, ADMIN_ACCESS_TOKEN, DB*\*. Don’t put .env in httpdocs.
- One‑click deploy (Windows PowerShell):
  - Full web + backend parts: .\AUTO-DEPLOY-MK\mk_deploy-live.ps1
  - Only backend parts: .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Parts "backend:core,backend:lib,backend:routes,backend:views,backend:locales"
  - Public web only (this repo): .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Parts "default"
- Paths are guarded: deploy never uploads to a purviewpanda.de folder explicitly and won’t create duplicate segments like /httpdocs/httpdocs. FTP root auto-detected.
- After deploy: purge EJS view cache to avoid stale templates on shared hosting:
  - .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -PurgeViews -Verbose
- Verify: open homepage and /health (200). If deep DB check: /health?deep=1
- Rollback: re-deploy last known good commit; DB changes are manual (see “Database changes”).
- Tip: use -DryRun and -Verbose to see effective FTP PWD and final remote paths before uploading.

---

## 1) What’s deployed where

- Hosting: Shared Apache + Passenger. FTP chroot puts you at the domain root. Web root is httpdocs.
- Never include the domain folder in remote paths. The deployer uses the FTP server’s PWD as effective root when remoteRoot is "/".
  - Web (public): /httpdocs
  - Admin (public admin UI): /httpdocs/admin
  - Backend core files (server.js, db.js, i18n.js, migrate.js, package\*.json, .env): /
  - Backend lib/routes/views/locales: respective folders under /
- Guards block any path that attempts to add domain folders or duplicate segments.

## 2) Deployment commands

- Full deploy (recommended):
  - .\AUTO-DEPLOY-MK\mk_deploy-live.ps1
- Selective parts (examples):
  - Backend core only: .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Parts "backend:core"
  - Only templates: .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Parts "backend:views"
  - Public web only (this repo): .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Parts "default"
  - Admin area only (if configured): .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Parts "admin:default"
- Dry run / verbose:
  - .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -DryRun
  - .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Verbose
- Local test (optional):
  - .\AUTO-DEPLOY-MK\mk_deploy-local.ps1 -StartServer
    - Features: kills blocking port, ensures node_modules, waits for /health, streams logs
    - Defaults: PORT 3000 (see Appendix B for port conventions)

Notes

- Retries, reconnects, mkdir -p, and safe cd+STOR are built-in for FTP robustness.
- A build/version badge is injected and shown in the footer automatically.

## 3) Configuration & env

- Config file: AUTO-DEPLOY-MK/mk_deployment-config.yaml (targets, projects, parts)
- .env (repo root):
  - FTP_HOST, FTP_USER, FTP_PASSWORD
  - ADMIN_ACCESS_TOKEN=a long random token (required for purge endpoint)
  - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (app runtime)
  - Never upload .env to httpdocs; deployer enforces this.

Security

- The deploy CLI loads .env locally and only uploads it with backend core to the domain root.
- Purge endpoint requires ADMIN_ACCESS_TOKEN via query or session.

Generating a secure admin token (Windows PowerShell)

- [Recommended] 48-byte random hex token (PowerShell 5.1 compatible):
  - $bytes = New-Object 'System.Byte[]' 48; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); $token = -join ($bytes | ForEach-Object { $\_.ToString('x2') })
- Or (fallback): concatenate two GUIDs without dashes: $token = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
- Put it into .env as ADMIN_ACCESS_TOKEN=$token and re-deploy backend:core.

Passenger restart signal

- The deploy maps a restart marker to /tmp/restart.txt (and /httpdocs/tmp/restart.txt) during backend:core to nudge Passenger to reload.

## 4) View cache purge (stale EJS on shared hosts)

- Recommended right after updating views or partials:
  - .\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -PurgeViews -Verbose
- Manual (PowerShell):
  - $env:ADMIN_ACCESS_TOKEN = "<strong-token>";
  - Invoke-WebRequest -UseBasicParsing -Uri "https://purviewpanda.de/__ops/clear-views?admin_token=$([uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN))" -Headers @{ 'Cache-Control'='no-cache'; 'Cookie'='allow_wip=1' } | Select-Object -ExpandProperty Content
- Shortcut helper:
  - .\AUTO-DEPLOY-MK\mk_purge-views.ps1 # reads ADMIN_ACCESS_TOKEN from env or .env
    Notes
- The deployer can write a short-lived verification file under httpdocs to confirm upload and will clean it automatically. These files are ignored by git.

## 5) Database changes (manual)

This project uses a consolidated schema file. Apply SQL manually on the DB host.

Checklist

- Make a backup/snapshot
- Confirm target DB values (DB_NAME/USER/HOST)
- Review only the statements you need

Run (examples)

- Windows PowerShell (local):
  - & 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe' -u root -p < schema_consolidated.sql
- Linux/macOS:
  - mysql -u root -p < schema_consolidated.sql

Verify

- Tables: consent_events and purview_aggregates should exist if features are used
- App health: /health?deep=1

Rollback

- Restore from backup/snapshot when necessary
- For non-destructive changes, DROP/REVOKE as appropriate (validate deps first)

Retention & purge

- Consider scheduling scripts/purge_consent_events.js (daily) to enforce retention.

## 6) Troubleshooting

- Duplicate remote paths
  - The deployer auto-detects FTP PWD and strips domain prefixes; it blocks uploads if it detects duplications like /httpdocs/httpdocs.
  - Use -DryRun and -Verbose to inspect remote paths before uploading.
- Passenger 500 after deploy
  - server.js is resilient to missing modules. Re-deploy backend:lib and backend:routes if modules were missing during upload.
  - Purge views and retry.
- Admin token errors on purge
  - Ensure ADMIN_ACCESS_TOKEN is set and deployed (backend:core). Then retry -PurgeViews.
- FTP conflicts/timeouts
  - Ensure no other FTP client (e.g., FileZilla, VS Code FTP) is connected during deploy.
  - If stuck, close terminals, start a fresh PowerShell, re-run with -Verbose. Retries and mkdir -p are built-in.

## 7) Quality gates after deploy

- Build/Install: Not applicable server-side; runtime is Node + Passenger
- Smoke: GET / and /health should return 200; /health?deep=1 should hit DB
- Views: Trigger purge; spot-check critical templates
- Logs: If a deploy failed, inspect AUTO-DEPLOY-MK/manifests for details

## 8) Legacy docs cleanup (done)

Removed as deprecated/duplicated in favor of this file:

- \_deployment-system/README.md
- \_deployment-system/DEPLOYMENT_GUIDE.md
- \_deployment-system/QUICK-START.md
- \_deployment-system/DEPLOYMENT_CONFIG_README.md
- docs/DEPLOYMENT_DETAIL.md (empty)
- DEPLOYMENT_CHECKLIST.md (historical)

If you still need any of the above, retrieve them from git history.

## Appendix A — Safe path rules (shared hosting)

- Do not include purviewpanda.de in any configured remote path.
- Use remoteRoot: "/" so the deployer uses the FTP PWD as effective root.
- Allowed examples:
  - /httpdocs
  - /httpdocs/admin
  - /lib, /routes, /views, /locales (backend)
- The deployer prevents uploading to /httpdocs/httpdocs, /domain/domain, or any duplicated segment.

## Appendix B — Local ports (informal)

- Panda app defaults to 3000; reserve 3001 for alternates/services.
- If 3000 is taken, pass -AppPort 3001 to mk_deploy-local.ps1.

## Appendix C — Consolidated sources

This TL;DR consolidates checklists and guardrails from:

- \_deployment-system/\* (archived)
- docs/DEPLOYMENT_DETAIL.md
- DEPLOYMENT_CHECKLIST.md
  For implementation details, see `README.md`; for the full runbook, see `AUTO-DEPLOY-MK/DEPLOYMENT-README.md`.
