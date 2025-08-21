# NEXT_STEPS (Refactoring Sprint – August 2025)

Aktueller Fokus: Stabilisierung & Test-Runde – neue Feature-Arbeit (Caching/Metrics) temporär auf Hold.

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
- [ ] Medien Kategorien Normalisierung – KERN UMGESETZT (Migration 003 + 004, FK + Backfill, dynamische UI, API Endpoints `/editors/api/media-categories`, Code nutzt `category_id`). OFFEN: Entfernung alte Textspalte (optional) & Orphan-Cleanup Script. (Teilstatus)
- [ ] Podcast SEO Slug + Public Podcast Detail Seite SEO Meta – UMGESETZT (Migration 005, Slug Feld, SEO Meta, Canonical Redirect, RSS Anpassung). OFFEN: Slug `NOT NULL` Enforcement + sitemap update. (Teilstatus)
- [ ] AI Caching: Hash (model+endpoint+normalizedPrompt) -> Redis/In-Memory TTL. (ON HOLD – verschoben bis nach Stabilisierungstest)
- [x] Performance: DB Connection Health Banner (> Threshold) – Wrapper + metrics (rollingAvg, slowQueries, totalQueries) in db.js, banners in editors_nav & admin_nav, polling + /admin/api/db-health.

## 3. Mittel- & Langfristige Roadmap (Ergänzend zur README)
- [ ] Progressive Enhancement: Service Worker für Blog & Media Cache.
- [ ] Public Read API: `/api/v1/posts`, `/api/v1/media` (authless read, sanitized) + Rate Limit.
- [ ] Multi-Tenant Erweiterung (site_key Partition überall konsistent) – aktuell partiell (timeline_entries, timeline_levels).
- [ ] Rollenmodell: editor, admin, viewer – differenzierte Gatekeeping Middleware.
- [ ] Feature Flags (Switch in ai_config.prompts oder extra Tabelle) für Beta-Funktionen.
- [ ] Observability: Request Timing Middleware + /admin/debug timings chart.

## 4. Technische Schulden
- [ ] Admin Doku Feinschliff & Auth Zentralisierung.
	- DONE: Feingranulare Module (settings, tools, usage, legacyRedirects) + Delegator-Stubs für alte Dateien.
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
- [ ] Setup Jest + Supertest (Health, Redirect Middleware, AI endpoint with mocked fetch).
	- Zusatz: Modular Admin Routing Basis-Tests (`adminModular.test.js`) hinzugefügt (blog-config, tools, legacy redirect).
- [ ] Snapshot Tests für Advanced Pages Rendering (rendered_html Sanitizer).
- [ ] Quill Content Sanitization Regression Test (script tag removal).

## 6. Sicherheit & Compliance
- [ ] CSP Enhancement: Nonce pro Request + Inline Script Eliminierung.
- [ ] Session Cookie Flags überprüfen (secure, sameSite=strict in prod).
- [ ] Access Log anonymization (DSGVO-Hinweis) + Impressum Aktualisierung.
- [ ] Opt-In Consent Banner (Tracking / optional AI Telemetrie anonymisiert).

## 7. Developer Experience
- [ ] `npm run lint` + Standard ESLint Config.
- [ ] Precommit Hook (lint-staged) optional.
- [ ] Local .env.example erweitern (alle neuen Variablen, free/paid key Hinweis).

## 8. Monitoring & Metrics
- [ ] Add /metrics (Prometheus) – Counters: http_requests_total, ai_calls_total, db_query_duration_bucket. (ON HOLD – nach Test-Runde zusammen mit AI Caching)
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
- Media Categories Cleanup (Entfernung Altspalte + Orphan Prune)
- Podcast Slug `NOT NULL` + sitemap.xml Integration
- Erweiterte Observability (Request Timing Middleware Charts)
- Feature Flag Mechanismus Entscheidung

---
Letzte Aktualisierung: 2025-08-21 (Hold-Update)
