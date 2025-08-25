# Purview Panda — Implementation Guide

Aktueller Stand (August 2025) – Node.js/Express CMS mit Blog, Podcasts, Advanced Pages, Timeline und KI-Workflows.

Doc map:

- Deployment: `AUTO-DEPLOY-MK/DEPLOYMENT-README.md` (runbook)
- Development plan and roadmap: `DEVELOPMENT_PLAN_2025.md`

## 1) Tech stack & architecture

- Node.js + Express, EJS views, Bootstrap 5
- MySQL via mysql2 pool; sessions with express-mysql-session
- Security: csurf, CSP with nonces, hardened headers; server-side DOMPurify for Advanced Pages
- Namespacing: public routes, `/editors/*` for content tools, minimal `/admin` for settings

## 2) Repository structure (key paths)

```
server.js              # bootstrap, middleware, CSP nonces, optional requires
routes/                # public/, editors/ feature routers
httpdocs/              # static assets
views/                 # EJS templates & partials
locales/               # i18n JSON (de/en)
AUTO-DEPLOY-MK/        # deploy CLI, wrappers, manifests
schema_consolidated.sql# manual DB schema
```

Notes:

- Migrations are consolidated in `schema_consolidated.sql`; apply manually.
- Default theme is light unless user explicitly selects dark (persisted via localStorage).

## 3) Configuration (.env)

```
SESSION_SECRET=...
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
ADMIN_ACCESS_TOKEN=...
PORT=3000
NODE_ENV=production
```

Never deploy `.env` to `httpdocs`. The deployer enforces this.

## 4) Key features (short)

- Modern Home v2, Purview Knowledge Center, enhanced blog, timeline ALT5
- Media library with thumbnails, Advanced Pages builder
- i18n DE/EN, SEO meta partials, PWA service worker
- AI tools (translate, sample, whats-new), usage logging and limits

## 5) API & routes (excerpt)

- `/` home, `/purview` knowledge center, `/blog/:slug`
- `/editors/*` editors center (posts, media, podcasts, timeline, ai)
- `/health` and `/health?deep=1`

## 6) Development workflow

Install: `npm install`
Dev: `npm run dev`
Prod: `npm start`

## 7) Security checklist

- CSRF on POST; sanitize HTML server-side
- CSP with per-request nonces; avoid inline scripts
- Rate limiting and session security enabled; review cookies

## 8) Testing status

- Jest + Supertest planned/partial; smoke endpoints included

## 9) Changelog & roadmap

See `DEVELOPMENT_PLAN_2025.md` for phases, KPIs, and next steps.

## 10) Observability & metrics

- Prometheus metrics at `/metrics` (restricted):
  - Allowed if requester is an authenticated admin or the IP is allowlisted via `METRICS_IP_ALLOWLIST` (fallback: `WHITELISTED_IPS`).
  - Example allowlist: `METRICS_IP_ALLOWLIST=127.0.0.1,::1,203.0.113.42`.
- Helpful queries: total requests (rate), client/server error rates, p95 latency.
- For production scraping, prefer IP allowlisting; do not put secrets in the metrics URL.

## 10) Troubleshooting (quick)

- Purge view cache after template changes: `AUTO-DEPLOY-MK/mk_purge-views.ps1`
- Duplicate FTP paths are guarded; use `-DryRun -Verbose`.

© 2025 Purview Panda

## Appendix — Consolidated from legacy docs

The following documents were merged into this implementation guide and the deployment docs:

- docs/FEATURES_OVERVIEW.md, docs/FEATURE_UPDATE_2025.md (features summary)
- docs/SECURITY.md (additional hardening notes)
- scripts/README_MIGRATIONS.md, deploy/MIGRATION.md, STARTUP_MIGRATIONS.md (migration notes)
- repo-sync-automation/README.md (process notes)
- docs/admin_tools_db_privileges.md (DB privilege diagnostics for Admin Tools)
  For deployment procedures and checklists, see `AUTO-DEPLOY-MK/DEPLOYMENT-README.md` and `DEPLOYMENT.md`.
