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

## 5. Qualität / Tests
- [x] Setup Jest + Supertest (Grundgerüst aktiv; vorhandene Tests: `slug.test.js`, `aiConfig.test.js`, `advancedPagesUtil.test.js`, `adminAuth.test.js`, `adminModular.test.js`, `server.test.js`).
	- Nächste Schritte: Parser Edge Cases (`aiParse.extractJson` Error Branches), Feature Flags CRUD, Multi-Tenant Isolation (cross-site access verhindern), Timeline Editor Permission.
- [ ] Snapshot Tests für Advanced Pages Rendering (rendered_html Sanitizer).
- [ ] Quill Content Sanitization Regression Test (script tag removal).

## 6. Sicherheit & Compliance
- [x] CSP Enhancement: Nonce pro Request + Inline Script Eliminierung (`header.ejs` inline JS ausgelagert, 'unsafe-inline' bei scripts entfernt).
- [ ] Session Cookie Flags überprüfen (secure, sameSite=strict in prod).
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
