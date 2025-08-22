# NEXT_STEPS (Refactoring Sprint – August 2025)

Aktueller Fokus: Stabilisierung & Abschluss Media Cleanup / Dashboard Hardening – AI Caching & erweitertes Metrics weiter auf Hold.

## PRIORISIERTE ABLAUFREIHENFOLGE (User 1→3→5→6→2→4 – Stand 2025-08-21)
Neue umzusetzende Reihenfolge für offene Punkte über die Sektionen hinweg:

1. Sektion 1 (Offene Punkte) – Resttests (`advancedPagesUtil` zusätzliche Kantenfälle, AI Fallback Parsing Tests)
2. Sektion 3 (Roadmap) – Abschluss Multi-Tenant (Timeline jetzt implementiert → Validierung & Cleanup), Rollenmodell (viewer), Observability Feinschliff (/metrics, Percentiles)
3. Sektion 5 (Qualität/Tests) – Ausweitung Testabdeckung (Snapshot, Sanitization, Auth Guards, Multi-Tenant Isolation, Feature Flags CRUD)
4. Sektion 6 (Sicherheit) – CSP Nonce & Inline Script Reduktion, Cookie Flags Review, Consent Banner
5. Sektion 2 (Kurzfristige Verbesserungen) – Podcast Slug NOT NULL + sitemap, AI Caching (nach Tests), restliche SEO Feinschliff (Media Altspalte & Orphan Cleanup ERLEDIGT)
6. Sektion 4 (Technische Schulden) – Nav/EJS Partials Vereinheitlichung, Picker Refactor Rollout, i18n Lücken, Delegator-Stubs Entsorgung

Taktik: Zuerst test & tenant correctness sichern (1+3), dann Qualität/Tests vertiefen (5), danach Security Hardening (6). Verbesserungen (2) und Schulden (4) folgen nachdem Stabilität + Sicherheit erhöht wurden.

Quick KPI Definition für Abschluss jedes Blocks:
- Block 1: Alle offenen Unit Tests grün, Abdeckung kritischer Parser >90% branches.
- Block 3: Keine ungelabelten Tabellen ohne site_key, Rollen-Middleware aktiv, /metrics liefert Basis-Counter.
- Block 5: Neue Testsuite deckt mind. 15 Kernpfade; Isolation Leak Test negativ.
- Block 6: Report zeigt CSP ohne 'unsafe-inline' (Scripts), Inline Scripts migriert.
- Block 2: Altspalten entfernt, sitemap enthält Podcasts, AI Cache hit-rate Metrik sichtbar.
- Block 4: Doppelter Picker-Code eliminiert (>70% Reduktion betroffene Zeilen), zentrale nav Partial.

---

## 1. Offene Punkte aus heutigem Refactor
- [x] AI Key Umschaltung: Nutzung `ai_config.primary_key_choice` (paid|free) mit Fallback-Kette paid→free→(global). Implementiert in `aiConfig.resolveApiKey` & `aiHelpers`.
- [x] Daily Limit Enforcement: Vor Ausführung Limit-Check (`ai_usage` Summe) → 429 `{error:'AI Tageslimit erreicht', detail, reset_hours}` bei Überschreitung.
- [x] Rate Limiting Login (Brute Force Schutz) – einfache in-memory Variante implementiert (Ausbau/Redis noch offen).
- [x] Editor AI Feedback: Expand/Collapse + Copy Raw Button (Editor Pane implementiert).
- [x] Response Parsing Robustheit: Standardisiertes Schema Validierungsmodul (parse salvage + shape validation) implementiert (`aiParse`).
- [x] Advanced Pages: Sidepanel ESC Close + Fokus-Trap (advanced_pages_builder.js).
- [x] Medienpicker: ESC Close + Tastaturfokus / ARIA Labels (advanced_pages_builder.js).
- [x] Slug Editing: Manuelles Override Feld + Lock/Auto Heuristik implementiert.
- [x] Blog Post Revisionen: Tabelle `post_revisions` + Hook vor Update + Restore Endpoint/UI.
- [x] AI Prompt Testing Tool (/admin/tools/prompt-tester): Mini-Form zum Ad-hoc Prompt + Raw Response.
- [ ] Unit Tests für `advancedPagesUtil`, AI helper fallback parsing (Slug Generator & API Key Auswahl bereits abgedeckt durch `slug.test.js`, `aiConfig.test.js`) – REST AUSSTEHEND.
- [x] Security Hardening: Reaktivierung CSRF für AI Endpunkte (Header Token Mapping) implementiert.
- [x] Logging: Fehlerhafte JSON Parses im Editor persistent in `ai_usage_log.error_message` + `parse_error_flag` (implementiert 2025-08-21)
- [x] Public Routes Modularisierung: Aufspaltung ehemaliger `routes/public.js` in strukturierte Module (`routes/public/*.js`) + Aggregator `index.js` (2025-08-21)
- [x] Admin Routes Modularisierung: Struktur live (settings, usage, tools, legacy redirects). Legacy Einzeldateien jetzt reine Delegator-Stubs. Offene Folgepunkte ausgelagert (Auth Middleware Konsolidierung, Unauth Tests, Doku Feinschliff).
		- [x] Konsolidierte `isAuth` Middleware zentralisieren (`lib/auth.js` o.ä.)
		- [x] Unauth Admin Access Tests (Redirect -> /login) – neues Testfile geplant (`adminAuth.test.js`)

## 2. Verbesserungen kurzfristig sinnvoll
- [x] Konsistentes Error Format: `{error, detail, code, hint}` across Editors & Public APIs (global Middleware erkennt API Requests)
- [x] Centralized Error Middleware + `res.apiError` / `res.apiOk` Helpers (Reduktion Wiederholung)
 - [x] Globale Nutzung `apiFetch` Frontend (alle relevanten Stellen vereinheitlicht)
 - [x] Automatische globale Error Toasts für ungefangene API Fehler (`unhandledrejection` Listener)
 - [x] GET Retry Backoff (apiFetch: 2x Exponential für 5xx & Netzwerkfehler)
- [x] Upload Validation: MIME + Dimensions + Max Size (8MB, 6000x6000) implementiert (`lib/uploadValidation.js`, angewendet in `routes/editors/media.js`).
- [x] Medien Kategorien Normalisierung – KERN UMGESETZT (Migration 003 + 004, FK + Backfill, dynamische UI, API Endpoints `/editors/api/media-categories`, Code nutzt `category_id`). NEU: Migration 006 hinzugefügt (Entfernung alte Textspalte + Orphan Cleanup). Deployment-Hinweis: Vor Ausführung prüfen, dass keine Alt-Version mehr auf `media.category` zugreift.
- [x] Podcast SEO Slug + Public Podcast Detail Seite SEO Meta – UMGESETZT (Slug Feld, SEO Meta, Canonical Redirect, RSS Anpassung). NEU: `sitemap.xml` Endpoint integriert (Posts, Podcasts, Pages). OFFEN: Slug `NOT NULL` Enforcement (geplant nach Validierung produktiver Daten) & evtl. Priorisierung Feintuning.
- [ ] AI Caching: Hash (model+endpoint+normalizedPrompt) -> Redis/In-Memory TTL. (ON HOLD – verschoben bis nach Stabilisierungstest)
- [x] Performance: DB Connection Health Banner (> Threshold) – Wrapper + metrics (rollingAvg, slowQueries, totalQueries) in db.js, banners in editors_nav & admin_nav, polling + /admin/api/db-health.

## 3. Mittel- & Langfristige Roadmap (Ergänzend zur README)
- [x] Progressive Enhancement: Service Worker für Blog & Media Cache (Basis implementiert: sw.js, offline.html, network-first HTML, stale-while-revalidate API/Images – Erweiterungen: precache Thumbnails manifest, versioned purge TBD).
- [x] Public Read API: `/api/v1/posts`, `/api/v1/media` (authless read, sanitized) + einfacher In-Memory Rate Limit (Konfig via `PUBLIC_API_RPM`). Folgeideen: ETag/If-None-Match, cursor pagination, conditional GET.
- [x] Multi-Tenant Erweiterung: Kern abgeschlossen (site_key für posts, podcasts, media, advanced_pages, timeline_entries, timeline_levels + Slug Uniqueness). OFFEN: Validierungs-Skript für fehlende site_key Werte, Migrations-Doku (Consolidated Schema ersetzt Einzelschritte; Migrations-Stubs deprecated).
- [x] Rollenmodell: Basis ergänzt (`viewer` vorgesehen, `requireRole([...])` Utility, role exposure in Templates). NOTE: `viewer` aktuell explizit wie public/anonymous behandelt (keine Enforcement / Sonderrechte) – UI-Anpassungen dadurch obsolet bis neue Anforderungen.
- [x] Feature Flags: Implementiert (DB Tabelle, Cache, Admin UI, Audit). OFFEN: Variant Weighting / Bulk Toggle UI.
- [x] Observability (Basis): Request Timing Middleware + Debug Page + /metrics Endpoint (Prometheus Plaintext) + P95/P99 + ai_calls_total + db_query_duration_seconds histogram + Labeled Route Request Counters + Memory Gauges (RSS/Heap). OFFEN: Per-Route Duration Histogram (begrenzte Kardinalität) & Error Rate Gauge.

## 4. Technische Schulden
- [ ] Admin Doku Feinschliff & Auth Zentralisierung.
	- DONE: Feingranulare Module (settings, tools, usage, legacyRedirects) + Delegator-Stubs für alte Dateien.
	- DONE (Cleanup 2025-08-21): Entfernte ungenutzte Legacy Admin Edit/List Views (posts/podcasts/media/advanced_pages/timeline) & alte admin_* Route-Stubs; nur aktive Settings/Tools/AI Usage Views verbleiben.
	- DONE (Editors Consolidation 2025-08-21): Ehemalige Admin Content-Funktionen ins Editors Dashboard integriert (Advanced Pages, Generator, AI Usage, Tools, Prompt Tester, Panda's Way Links).
	- DONE (Minimal Reinstatement 2025-08-21): Schlankes Admin Dashboard (nur AI Nutzung, Generator Logs, Config/Tools Links) wiederhergestellt – keine Content KPIs mehr.
	- DONE: contentMigrations Platzhalter entfernt.
	- TODO: AI / content-migrations Platzhalter mit echter Logik füllen (falls benötigt) & zentrale Auth Middleware extrahieren.
	- TODO: Entfernbare Delegator-Stubs nach Grace Period dokumentieren (Abbauplan).
	- Konsistente Fehlerstruktur: Basis vorhanden; prüfen ob alle neuen Module ausschließlich Helpers nutzen.
- [ ] EJS Partials Vereinheitlichung (nav variants) → theme partial config.
- [ ] Inline Styles reduzieren, zentrale SCSS Pipeline (Optional).
- [ ] Duplicate Code für Media Picker (Editor / Advanced Pages / Timeline) → extrahieren als Partial + JS Modul.
- [ ] Picker/Modal Refactor: Nutzung `A11yDialog` für Media/Post/Podcast Picker vereinheitlichen (aktuell nur Sidepanel migriert).
	- Geplant: Neues `pickers.js` Modul kapselt Media/Post/Podcast Auswahl mit A11yDialog.
	- Status: `pickers.js` implementiert & Advanced Pages migriert; nächste Schritte: Einsatz in weiteren Editoren-/Admin-Views.
- [ ] Missing Types: Optional JSDoc oder TS Migration langfristig.
- [ ] Hardcoded Strings für Buttons (Internationalisierung noch unvollständig im Editors Bereich).

## BUGS (Priorisierte, dringende Fehler - Stand 2025-08-22)
Priorität: 1 = kritisch → 5 = niedrig

1. Admin Tools: Raw/Tables zeigen keine Daten (kritisch)
	 - Symptome: `/admin/tools/raw` und `/admin/tools/tables` listen Tabellen, liefern aber 0 rows or empty schema.
	 - Kurzaufgaben:
		 - [ ] Aktiviere `ADMIN_TOOLS_DEBUG=true` und reproduziere Fehler; sammle `errors[]` aus UI.
		 - [ ] Prüfe DB connection, `DB_NAME` und DB user rights (SELECT on information_schema + tables).
		 - [ ] Nutze die Diagnose-Endpunkte (`/admin/tools/diag`, `/admin/tools/uploads`) — es gibt jetzt ein kleines PowerShell-Hilfs-Skript unter `scripts/run_admin_diag.ps1` das die Abfragen automatisiert und JSON-Antworten speichert.
		 - [ ] Falls Berechtigungen fehlen: wende die im `Manuelle Schritte` dokumentierte GRANT-Anweisung an (DBA).

2. Medienbibliothek / Thumbnails (hoch)
	 - Symptome: Medien-Library nicht aufrufbar, fehlende Thumbnails in Schnellzugriffen.
	 - Kurzaufgaben:
		 - [ ] Server/Storage Check: Validieren, ob Uploads unter `/uploads` vorhanden sind (Pfadprüfung, Rechte).
		 - [ ] Aktiviere `ADMIN_TOOLS_DEBUG` um API-Errors sichtbar zu machen.
		 - [ ] Prüfe Thumbnail-Generation Pipeline; wenn nötig Batch-Regeneration oder Platzhalter-Images bereitstellen.

3. Dark Mode Caching / Theme Switch (mittel)
	 - Symptome: Auf Seitenwechsel wechselt die Seite Light→Dark (mobile reproduzierbar).
	 - Kurzaufgaben:
		 - [ ] Reproduce & Log: Console logs beim Theme-Toggle, prüfe `userPrefs` Rendering in `header.ejs`.
		- [x] Ensure theme preference precedence: localStorage > server; do not overwrite incorrectly on init. Implemented in `httpdocs/js/inline/bootstrap_start.js` to always enforce computed theme class on each load.
		- [ ] Verify on mobile (iOS/Android) across navigation that theme remains stable; record console logs from `bootstrap_start.js` if any regressions.

4. i18n / Language Switch & Dark-mode visual regressions (mittel)
	 - Symptome: DE→EN Switch nicht überall; Dark Mode führt zu unlesbarem Text in Komponenten.
	 - Kurzaufgaben:
		 - [ ] Grep für hardcoded strings / fehlende `t()` Aufrufe in Templates.
		 - [ ] Dark-mode CSS Audit: `httpdocs/css/util.css` erweitern oder `dark-mode.css` hinzufügen.

5. Multi-Upload: Automatisches Tagging + SEO Meta (niedrig / Feature)
	 - Ziel: Beim Hochladen mehrere Bilder automatisch Tags & SEO-Felder vorschlagen (AI optional).
	 - Kurzaufgaben:
		 - [ ] API Design: `POST /editors/api/media/multi-upload` (returns metadata per file).
		 - [ ] Implement Worker/AI-Tagging optional; UI: Vorschau & Edit vor Save.

Hinweis: Die Items wurden priorisiert. Starte mit Item 1 (Admin Tools). Das neue Hilfs-Skript `scripts/run_admin_diag.ps1` automatisiert die initialen Diagnosen (siehe `scripts/`).

### Terminology
- Purview: Whenever the docs mention "Purview" it refers to "Microsoft Purview" (the Microsoft product). For the roadmap and public-facing content, treat "Purview" as a read-only public informational site (not part of admin/editor content). Use the phrase "Microsoft Purview" where clarity is needed in public docs.

Notes: Diese Punkte wurden auf Wunsch in Punkt 4 aufgenommen und priorisieren Debug/visibility Schritte vor produktiven Änderungen (zuerst Logs & Repro, dann Fixes).

## Manuelle Schritte (zu erledigen)
Diese Liste sammelt die manuellen Tasks, die du selbst ausführen willst, um Admin-Tools / Medien-Fehler zu triagieren und zu beheben. Kopiere / führe die Befehle auf dem Host oder in der DB-Umgebung aus und hake die Punkte ab.

- [ ] 1) README: Prüfe `.env` in repo root — bestätige `DB_NAME`, `DB_USER`, `DB_PASSWORD` sind korrekt für die produktive DB

- [ ] 2) Server-Debug aktivieren & Neustart (lokal/host):
	- Setze in der Shell temporär: `ADMIN_TOOLS_DEBUG=true` und starte den Node-Prozess neu (oder setze in der Host-Env und restart).
	- Beispiel PowerShell (in deploy shell):
	  $env:ADMIN_TOOLS_DEBUG='true'; npm run start

- [ ] 3) Rufe die neuen Diagnose-Endpunkte (als angemeldeter Admin) ab und speichere die JSON-Antworten:
	- https://<host>/admin/tools/diag  → prüfe `current_user`, `database_name`, `env_DB_NAME`.
	- https://<host>/admin/tools/uploads → prüfe `count` und Beispiel-Dateinamen; notiere Permission- oder Fehler-Meldungen.

- [ ] 4) Falls DB-Rechte fehlen: Führe die Migration / SQL als DBA aus (oder leite sie an DBA weiter):
	- Datei: `migrations/007-grant-select-admin-tools.sql` (enthält GRANT SELECT für `k302164_PP2` auf `k302164_PP_Data`).
	- PowerShell-Shortcut (als root):
	  mysql -u root -p -e "GRANT SELECT ON `k302164_PP_Data`.* TO 'k302164_PP2'@'%'; FLUSH PRIVILEGES;"

- [ ] 5) Nach Grant: Teste per MySQL-Client als App-User:
	- mysql -u k302164_PP2 -p -e "USE k302164_PP_Data; SHOW TABLES; SELECT COUNT(*) FROM posts LIMIT 1; SELECT CURRENT_USER(), DATABASE();"

- [ ] 6) Uploads prüfen auf Host (wenn `/admin/tools/uploads` meldet leer oder Fehler):
	- SSH to host, prüfe `httpdocs/uploads` existiert und enthält Dateien: `ls -la httpdocs/uploads | head -n 50` (oder `Get-ChildItem` in PowerShell auf Windows hosts).
	- Prüfe Webserver mapping (nginx) und Dateirechte (owner, mode). Wenn files missing, untersuche backup, filesystem mount, S3 config.

- [ ] 7) Thumbnails / Bildpipeline prüfen (manuell falls benötigt):
	- Prüfe thumbnail-worker logs oder Job-Queue (falls vorhanden). Wenn keine Pipeline, erstelle fallback placeholder images in `httpdocs/uploads/placeholders`.
	- Optional: Batch-Regeneration (wenn Script vorhanden) oder manuelle Regeneration per Tool; siehe `README.md` / media docs.
	- Helper Script: `scripts/regenerate_thumbnails.js` was added to batch-create thumbnails.
	  - Install `sharp` for best results (optional): `npm install --no-audit --no-fund sharp`
	  - Run from project root (PowerShell): `node .\\scripts\\regenerate_thumbnails.js`
	  - If `sharp` not installed the script will copy small files or use `httpdocs/uploads/placeholders/placeholder.svg` as fallback.

- [ ] 8) Sammle alle Fehler-JSONs / Screenshots und füge sie dem Issue / Ticket (oder paste hier) für weitere Analyse.

- [ ] 9) Wenn alles grün: Deaktiviere `ADMIN_TOOLS_DEBUG` in der Host-Env (setze zurück und restart) oder belasse es nur für den reproduzierbaren Zeitraum.

- [ ] 10) Consent persistence (optional): create `consent_events` table and enable minimal, non-identifying ingestion

	- Apply migration (as DBA). Example (adapt to your environment):

```powershell
# Run the SQL migration file on the target DB (replace credentials / host as needed)
mysql -u root -p < migrations/009-create-consent-events.sql
# or: mysql -u root -p -D YOUR_DB_NAME < migrations/009-create-consent-events.sql
```

	- Verify table and permissions for the app DB user:

```powershell
mysql -u APP_USER -p -e "USE YOUR_DB_NAME; SHOW TABLES LIKE 'consent_events'; SELECT COUNT(*) FROM consent_events LIMIT 1;"
```

	- After migration, the app will attempt to POST a small, non-identifying consent record to `/api/consent` when users accept/decline the cookie bar. This is best-effort and will not block the page if DB is unavailable.

	- Suggested retention purge example (run as scheduled job):

```sql
DELETE FROM consent_events WHERE created_at < NOW() - INTERVAL 365 DAY;
```

		- Cron / scheduled job example (runs purge script daily):

	```bash
	# daily at 03:00 via systemd/cron: run from project root
	0 3 * * * /usr/bin/node /path/to/repo/scripts/purge_consent_events.js 365 >> /var/log/panda/purge_consent.log 2>&1
	```

		- Or use the included Node script directly on the host:

	```powershell
	# Run from repo root
	node scripts/purge_consent_events.js 365
	```

Fertig: Markiere jeden Punkt ab, wenn erledigt. Wenn du Ergebnisse oder Fehlermeldungen postest, mache ich konkrete Fix-Vorschläge (SQL, chmod chown, nginx config). 

---

Zusätzliche, konsolidierte manuelle Schritte (Repository-Hilfs-Skripte)

Diese Schritte fassen alle Hilfs-Skripte und SQL-Dateien zusammen, die du auf dem Host ausführen solltest, um die Admin-Tools, Uploads und Consent-Pipeline zu prüfen und ggf. zu fixen.

- 0) Kurz: Setze `ADMIN_TOOLS_DEBUG=true` in der Host-Env und starte Node neu, damit die Admin UI mehr Details anzeigt.

- A) HTTP-Diagnose (schnell, UI + Uploads)
	- PowerShell (Windows host):
		- `.\\scripts\\run_admin_diag.ps1 -Host https://your-host.example.com -OutDir tmp`
		- Optional (auth): `-CookieHeader 'session=YOUR_SESSION_COOKIE'`
	- Ergebnis: `tmp/diag.json`, `tmp/uploads.json`, `tmp/raw.json` — poste diese Dateien hier.

- B) DB-Privilege-Check (verifiziert SHOW TABLES + information_schema)
	- PowerShell wrapper (interactive): `.\\scripts\\check_db_privs.ps1`
	- Node direct (non-interactive):
		- `node scripts/check_db_privs.js --host=10.35.233.76 --user=k302164_PP2 --password="%wQ6181qh" --database=k302164_PP_Data`
	- Ergebnis: `tmp/check_db_privs_<ts>.json` — poste die Datei hier.

- C) Wenn Privilegien fehlen: wende die vorbereitete SQL als DBA an
	- Datei: `scripts/grant_select_admin_tools.sql` (enthält `GRANT SELECT ON \\`k302164_PP_Data\\`.* TO 'k302164_PP2'@'%'`)
	- Als root auf dem DB-Host: `mysql -u root -p < scripts/grant_select_admin_tools.sql`
	- Danach: neu prüfen via Schritt B.

- D) Consent / Migrations (manuelle DB-Aktionen du durchführen willst)
	- Apply consolidated schema or specific consent table SQL from `schema_consolidated.sql` (oder per-DB: run the SQL snippet for `consent_events`).
	- After applying: Verify with:
		- `mysql -u APP_USER -p -e "USE YOUR_DB_NAME; SHOW TABLES LIKE 'consent_events'; SELECT COUNT(*) FROM consent_events LIMIT 1;"`
	- Optional purge: `node scripts/purge_consent_events.js 365` (or schedule via cron/systemd timer).

- E) Verify session cookie flags (production)
	- From an external host: `curl -I https://your-host.example.com/ | Select-String -Pattern 'Set-Cookie'` (PowerShell) and check for `SameSite=Strict` and `Secure`.

Wenn du diese Schritte ausführst und die erzeugten `tmp/*.json` Dateien hier postest, übernehme ich die Auswertung und liefere exakte, getestete Remediationsschritte (SQL, nginx/file perms, or code patches).

## 5. Qualität / Tests
- [x] Setup Jest + Supertest (Grundgerüst aktiv; vorhandene Tests: `slug.test.js`, `aiConfig.test.js`, `advancedPagesUtil.test.js`, `adminAuth.test.js`, `adminModular.test.js`, `server.test.js`).
	- Nächste Schritte: Parser Edge Cases (`aiParse.extractJson` Error Branches), Feature Flags CRUD, Multi-Tenant Isolation (cross-site access verhindern), Timeline Editor Permission.
- [ ] Snapshot Tests für Advanced Pages Rendering (rendered_html Sanitizer).
- [ ] Quill Content Sanitization Regression Test (script tag removal).

## 6. Sicherheit & Compliance
- [x] CSP Enhancement: Nonce pro Request + Inline Script Eliminierung (`header.ejs` inline JS ausgelagert, 'unsafe-inline' bei scripts entfernt).
    - [x] Session Cookie Flags überprüfen (secure, sameSite=strict in prod). Implemented in `server.js` (cookie.sameSite = 'strict' in production). Verify via browser devtools or curl.

	Verification example (curl shows Set-Cookie header):

```bash
curl -I https://your-host.example.com/ | grep -i Set-Cookie
```

	Look for `SameSite=Strict` and `Secure` in the Set-Cookie header when running in production behind HTTPS.
- [ ] Access Log anonymization (DSGVO-Hinweis) + Impressum Aktualisierung.
- [ ] Opt-In Consent Banner (Tracking / optionale AI Telemetrie anonymisiert).

## 7. Developer Experience
- [ ] `npm run lint` + Standard ESLint Config.
- [ ] Precommit Hook (lint-staged) optional.
- [ ] Local .env.example erweitern (alle neuen Variablen, free/paid key Hinweis).

## 8. Monitoring & Metrics
- [x] Add /metrics (Prometheus) – Metriken: http_requests_total, http_request_duration_seconds (Buckets), ai_calls_total, ai_call_duration_seconds, db_query_duration_seconds, db_query_errors_total, memory_rss_bytes, memory_heap_used_bytes, memory_heap_total_bytes, http_route_requests_total_<METHOD>_<route>. OFFEN: Fehlerquote / Alert Schwellen & Optional: http_request_duration_seconds per normalized route.
- [ ] Error Rate Alert (threshold-based) offline config.

## 9. Offene Fragen / Decisions Needed
- Feature Flag Mechanismus: DB vs JSON Config?
- Response Caching TTL Richtlinie (pro Endpoint unterschiedlich?)
- Slug Regeneration Policy beim Titel-Update (jetzt heuristisch; Option festzuschreiben?)
- Paid vs Free Modellumschaltung – wann fallback? Timeout vs HTTP Fehler?

## 10. Kurzer Implementierungsplan für Kernpunkte (aktualisiert / Pause berücksichtigt)
1. (DONE) AI Key Umschaltung + Limit Enforcement
2. (DONE) CSRF Reinforcement & Rate Limit Gate
3. (DONE) Revisionen + Slug Override UI
4. (FORTSCHRITT) Tests erweitern (`advancedPagesUtil`, AI Fallback Parsing) + Lint Setup
5. (ON HOLD) Caching & Performance Telemetrie (/metrics + AI Cache Layer)
6. (FORTSCHRITT) Image Pipeline & Media Normalisierung (Kern fertig, Cleanup offen)

## 11. Temporär auf Hold
- AI Caching Layer (Design steht, Implementierung nach Stabilisierung)
- /metrics Prometheus Endpoint
- Media Categories Cleanup (Entfernung Altspalte + Orphan Prune) – DONE (in konsolidiertes Schema integriert, Code refactored)
- Podcast Slug `NOT NULL` + sitemap.xml Integration
- Erweiterte Observability (Request Timing Middleware Charts)
- Feature Flag Mechanismus Entscheidung

---
Letzte Aktualisierung: 2025-08-21 (Sitemap, Memory Metrics, Last-Admin Schutz, Site-Key Audit)


## 12. Public-Bereich: Startseite 2.0 & Purview (Knowledge‑Consumer)
Ziel: Eine performante, moderne Startseite (Home v2) plus ein separates Public‑Knowledge-Portal, das "Purview" als Knowledge‑Consumer Site erklärt, was "Microsoft Purview" ist und wie Betreiber/Redaktion die Plattform zur Governance und Datenübersicht nutzen können.

12.1 Startseite 2.0 – Kernziele
- Priorität: Medium → hohe Sichtbarkeit
- Ziele: schnelle First-Contentful-Paint, klare Content-Hierarchy, wiederverwendbare Komponenten für Featured Content und Podcasts, resilienter Offline-Fallback.
- Konkrete Anforderungen:
		- SSR für kritische Bereiche (hero, featured items) + client-side hydration für carousels.
		- CDN-fähige responsive thumbnails (srcset) + lazyload; service-worker policy: stale-while-revalidate für images, network-first with fallback for HTML shell.
		- SEO & Social: JSON-LD für posts/podcasts, canonical tags, AI-assisted meta fallbacks for missing descriptions.
		- Accessibility: semantic markup, keyboard focus order, aria labels for carousels and pickers.

12.2 Purview (Knowledge‑Consumer Site) – Konzept
Goal: Build a public-facing, read-only knowledge site that helps non-technical consumers (editors, operators, stakeholders) understand what "Microsoft Purview" is, why it matters, and how it maps to our operational KPIs. This is not an admin dashboard; it's explanatory, educational, and links into operational pages where applicable.

Key points the Knowledge Site should cover:
	- What Microsoft Purview is: short clear definition, role in data governance, key concepts (catalog, classifications, data lineage, policies).
	- Our operational view: which on-site metrics relate to Purview concerns (media storage, data classification tags, content ownership, retention policies).
	- How editors/operators use it: simple workflows (e.g., "How to tag media for discoverability", "Where to find retention policy docs").
	- Glossary & links: map product terms (classification, sensitivity labels) to our app concepts (media.tags, post metadata, audit logs).
	- Privacy & Compliance note: what data is exposed publicly vs internal, and how to request deeper access.

Design & UX guidance:
	- Read-first layout: top summary cards (What is Purview? Why it matters; Quick Actions links), followed by expandable FAQ and short guided walkthroughs.
	- Visualizations: lightweight trend sparklines (aggregates only), sample screenshots (annotated), and code-free explanations — avoid heavy technical dashboards.
	- Discoverability: prominent search/filter for glossary terms and example use-cases.

Data & Implementation constraints:
	- Public pages only show aggregated, non-sensitive metrics. Any internal-level metrics remain behind admin auth and site_key protection.
	- Reuse `lib/metrics` and precomputed `purview_aggregates` to avoid expensive live queries. Aggregation job should run off-hours and store small, cacheable blobs.
	- Keep the public site static-cache friendly: aggressive HTTP caching for non-critical assets, short revalidation for KPI cards.

12.3 Concrete next steps (deliverables)
- [ ] Wireframe Home v2 (desktop + mobile) and Purview knowledge pages (2 mockups each)
- [ ] Create `/views/components/*` EJS partials for hero, featured list, kpi-card, faq-card and small client hydrate scripts under `httpdocs/js/components/*`
- [ ] Implement a small aggregation job (cron or scheduled script) to populate `purview_aggregates` with anonymized counts + trends and a lightweight API `/api/public/purview` that serves the cached aggregates.
- [ ] Build Purview knowledge pages under `/public/purview` with:
		- short intro, glossary, FAQ, annotated screenshots, and links to internal admin purview (protected) where appropriate.
		- Search for glossary and example workflows (client-side indexed JSON) for instant UX.
- [ ] Add caching headers + SW caching rules for these pages and setup a small health-check that validates aggregates freshness.
- [ ] Feature flag rollout: wrap Home v2 and Purview in feature flags per `site_key` for staged rollout and simple A/B testing.

Scheduling note:
- The script `scripts/generate_purview_aggregates.js` can be scheduled via cron on the host. Example cron (every 15 minutes):
	- */15 * * * * cd /path/to/repo && /usr/bin/node scripts/generate_purview_aggregates.js >> /var/log/purview_aggregates.log 2>&1


12.4 Success criteria
- Home v2: FCP < 1.2s on slow 3G simulated (critical above-the-fold only) and Lighthouse Performance + Accessibility scores improved vs current home.
- Purview knowledge site: editors/operators report that basic Purview concepts are understandable (simple internal survey) and page receives < 200ms median API response for cached aggregates.


## Final Review & Restructure Proposal
- I consolidated your reported bugs into `4.1 Dringende Bug-Reports` and added the Public‑Ausbau in section 12.
- Vorschlag zur Restrukturierung: Verschiebe "Dringende Bug-Reports" aus `4.1` in einen eigenen top-level Abschnitt `BUGS` wenn du möchtest; das erleichtert kurzfristige Priorisierung gegenüber technischer Schuld.
Vorschlag Priorisierung (Kurzfristig → Mittelfristig → Langfristig):
	1. BUGS (dark-mode cache, media library, admin raw/tables, language switch) — immediate visibility + repro + fixes
	2. Autos-Tagging Multi-Upload + Thumbnail regen — medium complexity, high ROI
	3. Purview 2.0 + Startseite 2.0 (design + precompute) — roadmap/UX work then implementation
	4. Large refactors (i18n cleanup, picker consolidation, CSS dark-mode audit)

Status: Die "Dringende Bug-Reports" wurden in ein eigenes `BUGS`-Kapitel verschoben und sind weiter oben im Dokument zu finden; die Todos wurden unverändert übernommen und können dort priorisiert werden.
