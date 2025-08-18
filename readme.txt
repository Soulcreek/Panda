Projektdokumentation & Onboarding: Purview Panda

Dieses Dokument dient als zentrale Anlaufstelle für Entwickler.

1. Projektübersicht
Name: Purview Panda
Zweck: Öffentliche Informationsseite (Blog, Podcasts, interaktive Lernpfade) + Admin-CMS.
Stack: Node.js (Express), EJS, Bootstrap 5, MySQL.
Hosting: Netcup (Webhosting 4000).

2. Struktur (Kurz)
server.js – App Bootstrap / Middleware / CSP
db.js – MySQL Pool
routes/public.js – Öffentliche Routen
routes/admin.js – Admin & KI Endpunkte
views/ – EJS Templates
httpdocs/ – Statische Assets & Uploads
locales/ – i18n JSON Dateien
i18n.js – Sprach-Middleware

3. Datenbank Kern-Tabellen
users(id, username, password)
posts(id, title, content, title_en, content_en, slug, status, featured_image_id, author_id, published_at, tags, whatsnew)
media(id, name, path, type, category, alt_text)
podcasts(id, title, description, audio_url, published_at)
pandas_way_levels(id, title, content, display_order)
sessions(session_id, data, expires) – von express-session

4. Aktuelle technische Hinweise
- Dynamische Schema-Erweiterung per TRY/CATCH beim Schreiben (Adds: published_at, tags, is_deleted …)
- CSRF aktiviert (POST /admin/upload ausgenommen)
- Content Security Policy manuell gesetzt

5. Internationalisierung (i18n)
Middleware `i18n.js`: Query ?lang → Session → Accept-Language → Fallback 'de'.
Helper: t(key[,fallback]). Fallback: current → default(de) → key.
Locales: locales/de.json, locales/en.json.

6. KI Features (Gemini API)
POST /admin/generate-whats-new
POST /admin/api/translate
POST /admin/generate-alt-text
ENV: GEMINI_API_KEY benötigt. JSON Schema Nutzung für strukturierte Antworten.

7. Panda's Way Varianten
/pandas-way (Basis) + /pandas-way-alt1..alt4
Unterschiede nur in Content-Layout; Navigation teilweise konsistent.
Admin Dashboard zeigt alle Varianten.
Geplant: settings Tabelle zur Aktivierung bevorzugter Variante.

8. Environment (.env Beispiel)
SESSION_SECRET=change_me
GEMINI_API_KEY=sk-xxx
WHITELISTED_IPS=127.0.0.1
NODE_ENV=production
PORT=3000
CLEAR_SESSIONS_ON_START=false

9. Sicherheit
Headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, CSP.
TODO: Rate Limiting, Helmet optional, Login Bruteforce Schutz.

10. Performance
IntersectionObserver statt großer Libs.
Bilder künftig als WebP/AVIF + srcset.
Cache-Control für /httpdocs (noch nicht gesetzt).

11. Internationalisierung Ausbau
Hardcoded Strings in alt2–alt4 → Keys.
Optional Cookie statt Session (besseres Caching).

12. Roadmap (Auszug)
- Aktive Panda Variante
- Post Revisionen
- Tag Verwaltung UI
- Related Posts Empfehlung
- Dark Mode (CSS Vars)
- Tests & CI Pipeline
- Rate Limiting / Security Layer

13. Developer Cheats
Neue Variante: view anlegen → Route → Dashboard Karte.
Neuer Übersetzungs-Key: locales/de.json & en.json ergänzen.
Session Reset: CLEAR_SESSIONS_ON_START=true + Restart.

14. KI Erweiterungsideen
- Caching von Übersetzungen
- Batch Übersetzung bestehender Posts
- "Glossary Builder" Endpoint

15. Offene Verbesserungen
- CSP Verfeinern (Hashes/Nonces)
- Logging Framework (pino)
- Tests (Supertest) minimal

Ende der Dokumentation.
