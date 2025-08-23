# Purview Panda - Deployment Quick-Start

## 🚀 Erstes Setup

### 1. FTP-Konfiguration
```powershell
cd _deployment-system
copy deployment-config-template.env deployment-config.env
notepad deployment-config.env  # FTP-Daten eintragen
```

### 2. Verbindung testen
```powershell
.\deploy-panda.ps1 -Test
```

## ⚡ Häufige Deployment-Szenarien

### Frontend-Update (CSS, JS, HTML)
```powershell
.\deploy-panda.ps1 -Deploy public
```

### Admin-Panel Update
```powershell
.\deploy-panda.ps1 -Deploy admin
```

### Server-Code Update
```powershell
.\deploy-panda.ps1 -Deploy server
.\deploy-node.ps1  # PM2 Neustart
```

### Komplettes Deployment
```powershell
.\deploy-panda.ps1 -Deploy all
```

## 🔧 Deployment Modi

| Modus | Bereiche | Verwendung |
|-------|----------|------------|
| `public` | httpdocs/, public routes/views | Frontend-Updates |
| `admin` | admin routes/views | Admin-Panel Updates |
| `editors` | editors routes/views | Editor-Interface Updates |
| `shared` | lib/, locales/ | Shared Libraries |
| `server` | server.js, package.json | Server Code |
| `all` | Alles | Vollständige Deployments |

## 📁 Ordnerstruktur Mapping

```
Lokal                    → Remote
├── httpdocs/           → /httpdocs/
├── routes/             → /routes/
│   ├── public/         → /routes/public/
│   ├── admin/          → /routes/admin/
│   └── editors/        → /routes/editors/
├── views/              → /views/
├── lib/                → /lib/
├── locales/            → /locales/
├── server.js           → /server.js
└── package.json        → /package.json
```

## 🚫 Automatische Ausschlüsse

- `node_modules/` - Nicht erforderlich
- `.git/`, `.env` - Development Files  
- `tests/` - Test Files
- `tmp/`, `logs/` - Temporary Files
- `_deployment-system/` - Deployment Tools

## 🔧 Erweiterte Optionen

```powershell
# Dry Run (Simulation)
.\deploy-panda.ps1 -Deploy all -DryRun

# Mit Details
.\deploy-panda.ps1 -Deploy public -ShowDetails

# Verbindungstest
.\deploy-panda.ps1 -Test
```

## 🆘 Troubleshooting

### FTP-Verbindung fehlgeschlagen
1. Prüfe FTP-Daten in `deployment-config.env`
2. Teste mit: `.\deploy-panda.ps1 -Test`
3. Prüfe Netzwerk/Firewall

### Einzelne Dateien fehlgeschlagen
- Verwende `-ShowDetails` für Details
- Prüfe Dateiberechtigungen
- Prüfe Netzwerkstabilität

### Node.js Server Neustart
```powershell
.\deploy-node.ps1  # Automatischer PM2 Neustart
```
