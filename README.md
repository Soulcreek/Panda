# Purview Panda

Aktueller Stand (August 2025) – Node.js / Express CMS mit Blog, Podcasts, Advanced Pages Builder, Timeline (Panda's Way) & KI-gestützten Workflows.

## Inhaltsverzeichnis
1. Überblick
2. Tech Stack & Architektur
3. Struktur / Verzeichnisbaum
4. Wichtige Features
5. Datenbank-Modelle (Ist-Zustand)
6. KI Subsystem (Gemini)
7. Advanced Pages Builder
8. Panda's Way (Timeline Varianten)
9. Medienverwaltung
10. Internationalisierung (i18n)
11. Dark Mode & Preferences
12. Sicherheit & Schutzmaßnahmen
13. Konfiguration / ENV
14. Admin Routen & API Endpunkte (Auszug)
15. Entwicklungs-Workflow & Scripts
16. Tests / Linting (Status)
17. Roadmap / Nächste Schritte
18. Changelog (Kurz)
19. Troubleshooting

---
## 1. Überblick
Purview Panda ist eine modulare Content-Plattform (DE/EN) mit:
- Blog (zweisprachig, Teaser & Längen-Limits: Teaser DE 180 Zeichen, Inhalt DE 2000 Plain-Text Zeichen enforced client & server)
- Podcasts
- Interaktiven Lernpfaden ("Panda's Way" – mehrere Varianten inkl. ALT5 Glass Timeline)
- Advanced Pages (layout-basierter Builder mit Blöcken: html, text, image, background)
- KI Features (News Research, Sample Generator, Übersetzung, Medien Alt-Text)

## 2. Tech Stack & Architektur
- Runtime: Node.js + Express
- View Layer: EJS + Bootstrap 5 + Icons
- DB: MySQL (mysql2 Pool) – automatische Schema-Erweiterungen (ALTER TRY/CATCH)
- Sessions: express-session + express-mysql-session
- Security: CSRF (csurf), Basic CSP, Header Hardenings
- Sanitization: DOMPurify (Server) für Advanced Pages Block HTML
- Frontend Tools: Quill Editor (Blog), Custom Builder (Advanced Pages), AOS
- Namespacing: /admin (Settings, legacy bridges) vs /editors (alle aktiven Content- & KI-Workflows)

## 3. Struktur
```
server.js              # App Bootstrap, Middleware, CSP
routes/public.js       # Öffentliche Seiten, Blog Slug Route, Timeline ALT5
routes/admin.js        # Admin Settings (Konfiguration, AI Usage, Tools) – KEIN Content mehr
routes/editors/        # Modular Editors Center (posts.js, media.js, podcasts.js, advancedPages.js, timeline.js, ai.js, index.js)
httpdocs/              # Statische Assets, JS, CSS, uploads/
views/                 # EJS Templates (partials/, editors_*, admin_* stubs, blog, pandas_way*.ejs)
locales/               # i18n JSON (de.json, en.json)
i18n.js                # Sprachlogik / Helper t()
db.js                  # MySQL Connection Pool
migrations/            # (deprecated) leer / Platzhalter – alte Dateien archiviert
migrations_legacy/     # Archiv der ursprünglichen SQL Migrationen
schema_consolidated.sql# Neues konsolidiertes Schema & Content-Patches (MySQL)
```

## 4. Wichtige Features
- Blog Editor (/editors): Quill + Inline Bild Upload (Drag/Paste) + KI Buttons (Research News / Sample / Translate)
- Featured Image UX: Auswahl über Medienbibliothek, Clear-Link, Statushinweise
- Medienbibliothek (/editors/media): Kategorien Merge aus Config + DB Distinct Tags
- Advanced Pages (migriert nach /editors/advanced-pages, alte /admin Pfade 301 Redirect)
- Timeline ALT5 (öffentlich) + Vollständiger Timeline Editor im Editors Center (/editors/timeline-editor)
- Server-seitige SEO Meta Tags via `partials/seo_meta.ejs` (Blog Detail, künftig Podcasts)
- Dark Mode: Sofortiges Laden per serverseitiger html class + Toggle (persist via localStorage + optional Sync /api/user/preferences)

## 5. Datenbank-Modelle (relevant)
(Tabelle wird bei Bedarf erstellt wenn Route aufgerufen wird)
- posts(id, title, content, title_en, content_en, whatsnew, tags, status, featured_image_id, published_at, ...)
- media(id, name, path, type, category, alt_text, uploaded_at)
- ai_config(id=1, primary_key_choice, max_daily_calls, limits(JSON), prompts(JSON))
- ai_usage / ai_call_log (Tracking)
- advanced_pages(id, title, slug, layout_json, rendered_html, status, published_at)
- timeline_entries(id, site_key, position, level, title, phase, content_html)
- timeline_site_config(site_key, level_count, design_theme)
- timeline_levels(id, site_key, level_index, title, content_html, image_path)

## 6. KI Subsystem (Gemini)
Zweistufige Prompt-Kaskade (Research / Optimierung → finaler strukturierter JSON Output) für Blog Content. Aktuelle Endpunkte (alle unter /editors):
- POST /editors/generate-whats-new – Generiert Titel (DE), Content (DE) und liefert interne Zwischenstufe (stage1) als Rohtext. Teaser wird nur gesetzt wenn leer.
- POST /editors/generate-sample – Beispielartikel (DE) für Themen-Sandbox; EN-Felder werden geleert.
- POST /editors/api/translate – Übersetzt DE Titel + HTML Body nach EN (JSON Response {title, content}).
- POST /editors/podcasts/:id/ai-metadata – Ergänzt SEO Felder für Podcasts.

Konfiguration (& Limits / Prompts) via /admin/blog-config:
- primary_key_choice (paid|free) – LOGIK FÜR KEY-SELEKTION: TODO (derzeit nur GEMINI_API_KEY genutzt; Umschaltung vorbereitet)
- max_daily_calls (Rate Gate – TODO: Enforcement Endpoint-seitig aktivieren)
- limits.max_response_chars / max_translate_chars / max_sample_chars (Client & Server Soft-Cut)
- prompts (whats_new_research, translate, blog_sample, media_alt_text, seo_title_prefix, blog_tags, media_categories)

Logging & Monitoring:
- Aggregation: ai_usage (day, endpoint, calls)
- Detail: ai_usage_log (prompt, response_raw, response_chars, error_message)
- UI: /admin/ai-usage – Verteilung, Historie, Detail-Log mit Modal (Lupe) für vollständigen Prompt & Raw Response, Copy Buttons.

Resilienz / Parsing:
- JSON Parsing tolerant (Fallback extrahiert Felder / Parse-Warnung Badge im Editor).
- Safety Settings aktualisiert auf aktuelle Gemini Kategorien (BLOCK_NONE für frühe Entwicklungsphase; TODO Hardening Feintuning).
- CSRF: KI Endpunkte im Skip-Set, da sie nur intern aufgerufen werden (TODO: Token Validation re-härten sobald stabil).

Noch offen (siehe NEXT_STEPS.md): Key Umschaltung paid/free, Fehlerbudget / Rate Limit Response, Retry/Backoff Policy, Response Caching.

## 7. Advanced Pages Builder
- Blöcke: html, text, image, background
- Background Block: aktuell nur Farbwähler im Sidepanel
- Image Block: URL, ALT, Caption + Medien-Picker
- Drag & Drop Reordering von Blöcken (spaltenweise / spaltenübergreifend)
- JSON togglbar & speicherbar (layout_json) – serverseitig sanitisiert
- Sidepanel (.ap-config-sidepanel) ersetzt überlagernde Modale

## 8. Panda's Way Varianten
- /pandas-way (Hauptseite; Hero redesign, zweisprachig, kein Auto-Scroll)
- /pandas-way-alt5 (Glass Navigation + Level Buttons + dynamische Einträge + Debug: Counts & Logs)
Seeding ALT5: Erstaufruf erstellt Beispiel-Einträge mit Level-Verteilung (1–3).

## 9. Medienverwaltung
- /admin/media (CRUD, optional KI Alt-Text)
- API: GET /admin/api/media?category=…&type=image|audio
- Filtern nach Kategorie; Kategorien konfigurierbar über /admin/blog-config (media_categories)
- Auswahlmodale reuse: Featured Image, Advanced Pages Image Block, Blog Inline Picker

## 10. Internationalisierung (i18n)
- Query ?lang=de|en → Session
- Helper t(key) mit Fallback-Kaskade
- Neue Keys in locales/de.json & en.json anlegen

## 11. Dark Mode & Preferences
- Server setzt class="dark-mode" wenn userPrefs.theme==='dark'
- Früher Startscript liest localStorage (pp_theme)
- Toggle Button synchronisiert (localStorage & optional /api/user/preferences – nur bei vollem Cookie Consent)

## 12. Sicherheit
- CSRF Schutz für alle POST außer explizite Upload-Ausnahmen
- DOMPurify auf Server für Advanced Pages HTML (XSS Minimierung)
- Upload Handling via multer (TODO: MIME Whitelist strenger + Rate Limits)
- Basic CSP vorhanden (Verbesserungspotenzial: Nonces / Hashes)

## 13. Konfiguration (.env)
```
SESSION_SECRET=changeme
GEMINI_API_KEY=...
GEMINI_API_KEY_PAID=...
GEMINI_API_KEY_FREE=...
PORT=3000
NODE_ENV=production
CLEAR_SESSIONS_ON_START=false
```

## 14. Admin & Editors & API (Auszug)
| Route | Zweck |
|-------|-------|
| GET /editors | Editors Dashboard |
| GET /editors/posts | Beiträge Übersicht |
| GET /editors/posts/new | Neuer Beitrag |
| POST /editors/generate-whats-new | KI Research Content |
| POST /editors/generate-sample | Sample Content |
| POST /editors/api/translate | Übersetzung |
| GET /editors/media | Medienbibliothek |
| POST /editors/api/upload-inline-image | Inline Upload |
| GET /editors/timeline-editor | Timeline Levels Übersicht |
| GET /editors/timeline-editor?level=1 | Timeline Einträge Level 1 |
| GET /health | Health Check (leicht) |
| GET /health?deep=1 | Health Check inkl. DB Ping |
| POST /editors/timeline-editor/add | Timeline Eintrag hinzufügen |
| POST /editors/timeline-editor/reorder | Reorder JSON |
| POST /editors/podcasts/:id/ai-metadata | KI Podcast Metadaten |
| GET /blog/:slug | Öffentlicher Blogpost (SEO Slug) |
| GET /pandas-way-alt5 | Timeline ALT5 Öffentlich |
| GET /admin | Admin Settings Dashboard (Settings / AI Usage) |
| GET /admin/ai-usage | AI Nutzung & Log Detail |

## 15. Entwicklungs-Workflow
Installieren:
```
npm install
```
Entwicklung:
```
npm run dev
```
Produktion:
```
npm start
```
MySQL muss laufen; DB Zugang in `db.js` konfigurieren (oder .env Erweiterung hinzufügen falls refactored).

## 16. Tests / Linting
Aktuell erste Test-Vorbereitung (Jest + Supertest) – Abhängigkeiten noch nicht installiert (ExecutionPolicy Workaround nötig). Ziel: Health, Redirects, Advanced Pages Utils.

### Datenbank / Migrationen (neu)
Der frühere SQLite-/Datei-Migrationsmechanismus wurde stillgelegt. Statt inkrementeller Dateien gibt es jetzt:
`schema_consolidated.sql` – enthält CREATE TABLE IF NOT EXISTS + kommentierte Content-Patches (Panda's Way Levels).
Alte Dateien sind unter `migrations_legacy/` archiviert. Der Ordner `migrations/` bleibt als Stub bestehen, wird aber nicht mehr ausgeführt.
Vorgehen in neuer Umgebung:
1. schema_consolidated.sql im MySQL Client ausführen (oder nur relevante Teile)
2. App starten – dynamische ALTERs (Advanced Pages) laufen tolerant weiter
3. Optional: Indizes / zusätzliche Spalten (siehe Hinweise am Ende der SQL Datei)

## 17. Roadmap / Nächste Schritte (Kurzüberblick – Details in NEXT_STEPS.md)
Kurzfristig (Aktive Sprint-Kandidaten):
- AI Key Umschaltung (paid/free) & Fallback-Kaskade (Heavy→Fast)
- Daily Call Enforcement (HTTP 429 mit Restlimit) statt nur Logging
- Editor: Copy / Expand für AI Response Pane
- ESC Close für Medienpicker & Advanced Pages Sidepanel
- Slug Editing UI (manuelles Überschreiben + Lock)
- Blog Post Revisionen (Shadow Table posts_revisions)

Mittelfristig:
- Response Caching (Redis) + Hash Keys (Prompt Fingerprint)
- Image Pipeline (Sharp resize + WebP + Lazy Manifest)
- Tag Management UI (CRUD + Frequenz / Auto Suggest Server)
- Rate Limiting global (IP + Session) für Auth & AI
- Access Audit Log (user_id, route, ts)

Langfristig:
- Public Read API (REST/GraphQL) mit Token Auth
- Service Worker: Offline Cache Blog & Media Manifest
- AI Model Abstraktion (Adapter Layer für OpenAI / Anthropic)
- Multi-Tenant (site_key Isolation) Erweiterung

## 18. Changelog (Auswahl jüngste Änderungen)
Neueste Schritte ganz oben:
- Health Endpoint `/health` (+ `?deep=1` für DB-Ping) hinzugefügt (Load Balancer / Uptime Robot geeignet)
- KI Logging erweitert: ai_usage_log jetzt mit response_raw + Modal Detailansicht
- AI Editor Feedback Panel (Status, Parse-Warnung, Raw Snippet)
- Slug-Generierung bei Posts: ensureUniqueSlug + Auto-Migration fehlender Spalten (ensurePostsColumns)
- Blog Config: Defaults gemerged, Prompts persistenter Merge statt Überschreiben
- Einheitliche 301 Redirect Middleware für migrierte Content-Pfade `/admin/*` → `/editors/*` (Posts, Media, Podcasts, Advanced Pages, Timeline)
- Legacy Admin-Content-Views durch schlanke Hinweis-Stubs ersetzt; Originale unter `views/legacy/` archiviert
- Modularisierung: `routes/editors/` Feature Router (Posts, Media, Podcasts, Advanced Pages, Timeline, AI) + `index.js` Aggregator
- Editors Center eingeführt: Alle aktiven Content- & KI-Routen von /admin → /editors migriert
- Legacy Blog Editor durch Stub + Soft Redirect ersetzt (/admin_edit_post.ejs)
- Timeline Editor komplett nach /editors/timeline-editor verlagert (CRUD + Level Meta + Reorder)
- Redirect-Stubs für /admin/timeline-editor & /admin/advanced-pages implementiert (jetzt durch zentrale Middleware ersetzt)
- SEO: Serverseitige Meta Tags (og:/twitter) via neues Partial `partials/seo_meta.ejs` + Slug Route /blog/:slug
- Podcast & Blog Slug Infrastruktur vorbereitet (Podcast SEO folgt)
- Media API konsolidiert (/editors/api/media) und Legacy Timeline Editor Verweise aktualisiert
- Code Cleanup & Namespace Dokumentation aktualisiert

## 19. Troubleshooting
| Problem | Ursache | Lösung |
|---------|---------|-------|
| "Speichern fehlgeschlagen" bei Blog Config | ai_config Tabelle/Datensatz fehlte | Route erstellt jetzt automatisch; Logs prüfen |
| KI Response enthält kein gültiges JSON | Modellabweichung | Fallback Parser extrahiert Felder, Logs prüfen ai_call_log |
| Media Modal leer | Filter falsch oder keine Medien | Kategorie im Config prüfen, /admin/media uploaden |
| Dark Mode Button ohne Funktion | Script Laden / DOM Timing | Toggle Code lädt jetzt sofort; Browser Cache leeren |

---
© 2025 Purview Panda
