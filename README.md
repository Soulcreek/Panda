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

## 3. Struktur
```
server.js              # App Bootstrap, Middleware, CSP
routes/public.js       # Öffentliche Seiten & Timeline ALT5 Seeding
routes/admin.js        # Admin Panel, Media, KI Endpunkte, Advanced Pages
httpdocs/              # Statische Assets, JS, CSS, uploads/
views/                 # EJS Templates (partials/, admin_*, blog, pandas_way*.ejs)
locales/               # i18n JSON (de.json, en.json)
i18n.js                # Sprachlogik / Helper t()
db.js                  # MySQL Connection Pool
migrations/            # SQL Patches
```

## 4. Wichtige Features
- Blog Editor: Quill + Inline Bild Upload (Drag/Paste) + KI Buttons (Research News / Sample / Translate)
- Featured Image UX: Auswahl über Medienbibliothek, Clear-Link, Statushinweise
- Medienbibliothek: Kategorien Merge aus Config + DB Distinct Tags
- Advanced Pages: Mehrspaltige Layout Presets, Drag & Drop, Sidepanel-Konfiguration (Bild / Hintergrundfarbe)
- Timeline ALT5: Dynamisches Seeding, Level-Buttons, Intersection Reveal, Debug Overlay
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
Zweistufige Aufforderung (Optimierung + finaler JSON Output). Endpunkte:
- POST /admin/generate-whats-new  (Titel + content_de + whatsnew, Teaser wird NICHT mehr automatisch überschrieben)
- POST /admin/posts/generate-sample (Beispielartikel, Teaser unverändert)
- POST /admin/api/translate (DE → EN Title + HTML)
- POST /admin/generate-alt-text (Einzelnes Medium)
Limits konfigurierbar unter /admin/blog-config (max_response_chars, max_translate_chars, max_sample_chars). Tolerantes Parsing bei fehlerhaftem JSON (Regex Fallback).

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

## 14. Admin & API (Auszug)
| Route | Zweck |
|-------|-------|
| GET /admin | Dashboard |
| POST /admin/generate-whats-new | KI Research Content |
| POST /admin/posts/generate-sample | Sample Content |
| POST /admin/api/translate | Übersetzung |
| POST /admin/generate-alt-text | Medien Alt-Text |
| GET /admin/blog-config | KI / Blog Settings |
| POST /admin/blog-config | Speichern Settings |
| GET /admin/advanced-pages | Liste Advanced Pages |
| POST /admin/advanced-pages/save | Speichern Layout |
| GET /pandas-way-alt5 | Timeline ALT5 |

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
Aktuell keine automatisierten Tests. Geplant: Jest + Supertest für Routen, minimale Snapshot Tests für Rendering.

## 17. Roadmap / Nächste Schritte
Kurzfristig:
- ESC Close für Sidepanel & Picker
- Erweiterte Background Optionen (Padding Controls)
- Blog Post Revisionen
- Rate Limiting (Login / KI Endpunkte)
Mittelfristig:
- Caching Layer (Redis) für KI Antworten
- Image Optimization Pipeline (Sharp + WebP)
- Tag Management UI
Langfristig:
- GraphQL/REST API für externe Konsumenten
- Progressive Enhancement (Service Worker / offline cache)

## 18. Changelog (Auswahl jüngste Änderungen)
- Advanced Pages: Sidepanel Config (statt Modal), Background nur Color Picker
- ALT5 Timeline: Auto-Seeding + Debug + Auto Level 1 Activation
- Research News überschreibt Teaser nicht mehr; Sample ebenso
- KI Routen: Robust Parsing (Regex Fallback) / Logging
- Media Picker Filter für Featured Image korrigiert (`__featuredCombo`)
- Hero /pandas-way überarbeitet + Auto-Scroll entfernt
- Dark Mode Toggle refactored (früher Apply & Icon Sync)
 - ALT5 Timeline: Level Navigation unterstützt jetzt Thumbnails (image_path) & Icons
 - ALT5 Timeline: Level Meta HTML Persistenz behoben (Intro blieb zuvor nach Speichern leer)
 - Admin: Direktlinks zur öffentlichen ALT5 Seite in "Timeline Levels" & "Timeline Editor" Überschriften
 - Navbar Light/Dark Mode Kontrast überarbeitet (Light immer weißer Hintergrund, Dark konsistente Farben)

## 19. Troubleshooting
| Problem | Ursache | Lösung |
|---------|---------|-------|
| "Speichern fehlgeschlagen" bei Blog Config | ai_config Tabelle/Datensatz fehlte | Route erstellt jetzt automatisch; Logs prüfen |
| KI Response enthält kein gültiges JSON | Modellabweichung | Fallback Parser extrahiert Felder, Logs prüfen ai_call_log |
| Media Modal leer | Filter falsch oder keine Medien | Kategorie im Config prüfen, /admin/media uploaden |
| Dark Mode Button ohne Funktion | Script Laden / DOM Timing | Toggle Code lädt jetzt sofort; Browser Cache leeren |

---
© 2025 Purview Panda
