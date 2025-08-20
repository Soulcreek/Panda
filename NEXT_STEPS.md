# NEXT_STEPS (Refactoring Sprint – August 2025)

Aktueller Fokus: Konsolidierung Editors Center, Stabilisierung KI-Flows, Observability & DX.

## 1. Offene Punkte aus heutigem Refactor
- [ ] AI Key Umschaltung: Nutzung `ai_config.primary_key_choice` (paid|free). Fallback-Kette: paid→free→error. Anpassung in `lib/aiConfig.js` + `aiHelpers`.
- [ ] Daily Limit Enforcement: Prüfen `ai_usage` vor Ausführung → bei Überschreitung 429 JSON `{error:'AI Tageslimit erreicht'}`. Konfigurierbar via `ai_config.max_daily_calls`.
- [ ] Rate Limiting Login (Brute Force Schutz) – express-rate-limit + Memory/Redis Store.
- [ ] Editor AI Feedback: Expand/Collapse + Copy Raw Button (Frontend Utility) – teilweise vorhanden (Copy im Log Modal, noch nicht im Editor Pane).
- [ ] Response Parsing Robustheit: Standardisiertes Schema Validierungsmodul (z.B. simple shape check) + Feld-Mapping.
- [ ] Advanced Pages: Sidepanel ESC Close + Fokus-Trap.
- [ ] Medienpicker: ESC Close + Tastaturfokus / ARIA Labels.
- [ ] Slug Editing: Optionales manuelles Override in Post-Form (Lock Toggle) – derzeit auto.
- [ ] Blog Post Revisionen: Tabelle `post_revisions(id, post_id, slug, title, content, created_at)` + Hook bei Update.
- [ ] AI Prompt Testing Tool (/admin/tools): Mini-Form zum Ad-hoc Prompt + Raw Response + Token/Chars.
- [ ] Unit Tests für `advancedPagesUtil`, Slug Generator, AI helper fallback parsing.
- [ ] Security Hardening: Reaktivierung CSRF für AI Endpunkte (statt global skip) mit stabiler Fetch Signierung.
- [ ] Logging: Fehlerhafte JSON Parses im Editor persistent in `ai_usage_log.error_message` statt nur parse_error Flag.

## 2. Verbesserungen kurzfristig sinnvoll
- [ ] Konsistentes Error Format: `{error, detail, code, hint}` across Editors APIs.
- [ ] Centralized Error Middleware (reduce repetition in routes/editors/ai.js).
- [ ] Upload Validation: MIME + Dimensions + Max Size Konfiguration.
- [ ] Medien Kategorien Normalisierung (separate Tabelle media_categories zur Pflege).
- [ ] Podcast SEO Slug + Public Podcast Detail Seite SEO Meta.
- [ ] AI Caching: Hash (model+endpoint+normalizedPrompt) -> Redis TTL.
- [ ] Performance: DB Connection Health Banner bei Verzögerung > x ms.

## 3. Mittel- & Langfristige Roadmap (Ergänzend zur README)
- [ ] Progressive Enhancement: Service Worker für Blog & Media Cache.
- [ ] Public Read API: `/api/v1/posts`, `/api/v1/media` (authless read, sanitized) + Rate Limit.
- [ ] Multi-Tenant Erweiterung (site_key Partition überall konsistent) – aktuell partiell (timeline_entries, timeline_levels).
- [ ] Rollenmodell: editor, admin, viewer – differenzierte Gatekeeping Middleware.
- [ ] Feature Flags (Switch in ai_config.prompts oder extra Tabelle) für Beta-Funktionen.
- [ ] Observability: Request Timing Middleware + /admin/debug timings chart.

## 4. Technische Schulden
- [ ] Vermischte Legacy / Neue Routen im Admin Bereich – Aufräumen von Stubs + klare Doku.
- [ ] EJS Partials Vereinheitlichung (nav variants) → theme partial config.
- [ ] Inline Styles reduzieren, zentrale SCSS Pipeline (Optional).
- [ ] Duplicate Code für Media Picker (Editor / Advanced Pages / Timeline) → extrahieren als Partial + JS Modul.
- [ ] Missing Types: Optional JSDoc oder TS Migration langfristig.
- [ ] Hardcoded Strings für Buttons (Internationalisierung noch unvollständig im Editors Bereich).

## 5. Qualität / Tests
- [ ] Setup Jest + Supertest (Health, Redirect Middleware, AI endpoint with mocked fetch).
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
- [ ] Add /metrics (Prometheus) – Counters: http_requests_total, ai_calls_total, db_query_duration_bucket.
- [ ] Error Rate Alert (threshold-based) offline config.

## 9. Offene Fragen / Decisions Needed
- Feature Flag Mechanismus: DB vs JSON Config?
- Response Caching TTL Richtlinie (pro Endpoint unterschiedlich?)
- Slug Regeneration Policy beim Titel-Update (jetzt heuristisch; Option festzuschreiben?)
- Paid vs Free Modellumschaltung – wann fallback? Timeout vs HTTP Fehler?

## 10. Kurzer Implementierungsplan für Kernpunkte (Priorisierungsvorschlag)
1. AI Key Umschaltung + Limit Enforcement
2. CSRF Reinforcement & Rate Limit Gate
3. Revisionen + Slug Override UI
4. Tests (Health + Slug + AI Mock) + Lint Setup
5. Caching & Performance Telemetrie
6. Image Pipeline & Media Normalisierung

---
Letzte Aktualisierung: 2025-08-20
