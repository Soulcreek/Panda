# [Archived] Deployment Checkliste - Purview Panda v2.0
This checklist is deprecated. See DEPLOYMENT.md (Chapter 0 and Quality gates) for the maintained process.

## Pre-Deployment Verification

### ✅ Abgeschlossene Entwicklung
- [x] Microsoft Purview Knowledge Center vollständig implementiert
- [x] Modern Home v2 mit Glass Morphism Design
- [x] Deutsche Lokalisierung aller UI-Elemente
- [x] KPI Refresh API implementiert
- [x] Database Connection Stability (Object Spread Wrapper)
- [x] Enhanced Blog Cards mit floating Design
- [x] Alle Template-Dateien error-free

### 🔍 Pre-Deployment Tests
- [x] Server läuft lokal ohne Fehler (Port 3000)
- [x] Homepage lädt korrekt mit animiertem Logo
- [x] Purview Knowledge Center funktional
- [x] KPI Refresh Button funktioniert
- [x] Deutsche Übersetzungen korrekt angezeigt
- [x] Blog Cards responsive und modern
- [x] Admin-Bereich zugänglich

## Deployment Schritte

### 1. Git Repository Vorbereitung
```powershell
# Alle Änderungen committen
git add .
git commit -m "feat: Complete modernization with Purview Knowledge Center and Home v2"
git push origin master
```

### 2. Deployment Konfiguration
```powershell
# Deployment Config anpassen (falls nötig)
cd _deployment-system
notepad deployment-config.env

# FTP-Verbindung testen
.\deploy-panda.ps1 -Test
```

### 3. Konfigurierbare Deployment-Modi

#### 🚀 Komplettes Deployment (Produktiv)
```powershell
# Alles deployen - für major Updates
.\deploy-panda.ps1 -Deploy all

# Mit Details und Dry-Run Test
.\deploy-panda.ps1 -Deploy all -DryRun -ShowDetails
```

#### ⚡ Teilbereich-Deployments (Entwicklung)
```powershell
# Nur öffentliche Bereiche (HTML, CSS, JS)
.\deploy-panda.ps1 -Deploy public

# Nur Admin-Bereich
.\deploy-panda.ps1 -Deploy admin

# Nur Editor-Bereich
.\deploy-panda.ps1 -Deploy editors

# Nur geteilte Libraries (lib/, locales/)
.\deploy-panda.ps1 -Deploy shared

# Nur Server-Files (server.js, package.json)
.\deploy-panda.ps1 -Deploy server
```

#### 🔧 Node.js Server Management
```powershell
# Node.js Deployment mit PM2
.\deploy-node.ps1

# Manuelle Deployment Alternative
ssh user@server
cd /path/to/project
git pull origin master
npm install --production
pm2 restart purview-panda
```
git pull origin master
npm install --production
pm2 restart purview-panda
```

### 4. Deployment Ausschlüsse

#### 🚫 Automatisch ausgeschlossen:
- `node_modules/` - Nicht erforderlich auf Server
- `.git/`, `.env` - Development Files
- `tests/`, `*.test.js` - Test Files
- `tmp/`, `logs/` - Temporary Files
- `_deployment-system/` - Deployment Scripts
- `repo-sync-automation/` - Repository Tools

#### ⚙️ Konfigurierbare Bereiche:
```env
DEPLOY_PUBLIC=true      # httpdocs/, public routes/views
DEPLOY_EDITORS=true     # editors routes/views
DEPLOY_ADMIN=true       # admin routes/views
DEPLOY_SHARED=true      # lib/, locales/
DEPLOY_SERVER=true      # server.js, package.json
```

### 5. Post-Deployment Verification

#### ✅ Erfolgreich deployed (Stand: August 2025):
- [x] **📁 Public Area (httpdocs/)**: 104 Dateien (CSS, JS, Bilder, Uploads)
- [x] **🚀 Public Routes**: 12 JavaScript-Dateien 
- [x] **👨‍💼 Admin Routes**: 11 JavaScript-Dateien
- [x] **✏️ Editors Routes**: 8 JavaScript-Dateien
- [x] **🖼️ Views Templates**: 79 EJS-Templates (inkl. Partials)
- [x] **🌐 Locales**: 2 Sprachdateien (DE/EN)
- [x] **⚙️ Server Files**: 4 Hauptdateien (server.js, package.json, etc.)

#### ⚠️ Bekannte Probleme:
- **Library Files (`/lib`)**: FTP-Berechtigungsproblem (550 Fehler)
  - **Status**: Nicht kritisch für Website-Funktionalität
  - **Lösung**: SSH-Deployment für Server-Libraries verwenden
- **Views Structure**: Flat structure (alle Views im Hauptverzeichnis)

#### Health Checks (Post-Deployment)
```powershell
# Website-Verfügbarkeit testen
curl https://purviewpanda.de

# Spezifische Endpunkte testen
curl https://purviewpanda.de/health
curl https://purviewpanda.de/purview
```

#### Live-Deployment Ergebnis:
- [x] **220+ Dateien erfolgreich deployed**
- [x] Homepage lädt mit modernem hellblauem Design
- [x] Purview Knowledge Center zugänglich
- [x] Admin- und Editor-Bereiche funktional
- [x] Blog-System vollständig verfügbar

### 6. FTP-Verbindung Troubleshooting

#### Bei Verbindungsproblemen:
```powershell
# Aktuelle FTP-Einstellungen anzeigen
.\deploy-panda.ps1 -Deploy test -ShowDetails
```

#### 🔧 Erforderliche FTP-Daten:
- **FTP_HOST**: ftp.your-domain.com
- **FTP_USER**: Ihr FTP-Benutzername  
- **FTP_PASSWORD**: Ihr FTP-Passwort
- **FTP_REMOTE_PATH**: /httpdocs (Standard)

#### Konfiguration in `deployment-config.env`:
```env
FTP_HOST=ftp.your-domain.com
FTP_USER=your-ftp-username
FTP_PASSWORD=your-ftp-password
FTP_REMOTE_PATH=/httpdocs
```

### 8. Lessons Learned (August 2025)

#### ✅ Was gut funktioniert hat:
- **Konfigurierbare Teilbereiche** - Ermöglichen schnelle Updates
- **Automatische Ausschlüsse** - node_modules werden korrekt ignoriert
- **FTP-Upload für Assets** - Zuverlässig für statische Dateien
- **Dry-Run Modus** - Sichere Tests vor Live-Deployment

#### ⚠️ Verbesserungsbedarf:
- **Library Deployment** - Benötigt SSH für Server-Libraries
- **Views Organization** - Flat structure funktional aber unorganisiert
- **Directory Permissions** - Einige FTP-Verzeichnisse benötigen manuelle Erstellung

#### 🔧 Empfohlene Deployment-Strategie:
```powershell
# Für Frontend-Updates (schnell):
.\_deployment-system\deploy-panda.ps1 -Deploy public

# Für Server-Updates (komplex):
# 1. FTP für Views/Routes
.\_deployment-system\deploy-panda.ps1 -Deploy server
.\_deployment-system\deploy-views.ps1

# 2. SSH für Libraries (wenn verfügbar)
# Manuelle Library-Updates über SSH-Deployment
```

### 9. Rollback Plan

### Falls Probleme auftreten:
```powershell
# Rollback zu vorheriger Version
git log --oneline -n 5  # Finde letzten stabilen Commit
git checkout <previous-commit>
pm2 restart purview-panda

# Database Rollback (falls nötig)
# Backup vor Deployment erstellen!
mysql -u root -p < backup_before_deployment.sql
```

## Monitoring nach Deployment

### Zu überwachen:
- Server Error Logs: `pm2 logs purview-panda`
- Database Connection Health
- Memory Usage: `pm2 monit`
- Response Times für neue Endpoints

### Log-Dateien prüfen:
- Node.js Application Logs
- Nginx/Apache Error Logs
- Database Slow Query Logs

## Support Kontakte

- **Development**: GitHub Copilot Team
- **Database**: DBA Team
- **Infrastructure**: System Administrator

---

**Deployment Status**: 🟡 Ready for Deployment
**Version**: 2.0 (August 2025)
**Risk Level**: Low (comprehensive testing completed)
