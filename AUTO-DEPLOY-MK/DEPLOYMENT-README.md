# MK Auto-Deploy System — Canonical Deployment Runbook

## Universal Deployment README for Project Reuse

Doc map for this repository:

- This file is the canonical, step-by-step deployment runbook (what to run).
- `DEPLOYMENT.md` (repo root) summarizes high-level guardrails, TL;DR, and troubleshooting.
- `README.md` (repo root) is the implementation guide (architecture, folders, APIs, security).

Use this file when deploying. The others are for context and design.

A robust, one-click deployment system designed for maximum reliability and ease of use across different project types (React, Vue, Angular, PHP, static sites, etc.).

Related:

- Metrics notes: see README (Observability & metrics)

## 🎯 Key Features

- **One-Click Deployment**: Simply run `.\mk_deploy-live.ps1` to deploy to production
- **Local Testing**: Test locally with `.\mk_deploy-local.ps1 -StartServer`
- **Multi-Framework Support**: Works with React, Vue, Angular, PHP, static HTML, etc.
- **Comprehensive Verification**: FTP + HTTP checks ensure successful deployment
- **Robust Error Handling**: Retries, timeouts, detailed logging
- **Flexible Configuration**: YAML-based config supports multiple targets and project parts
  - Per-part basePath, includes, excludes
  - Fixed file mappings for special paths (e.g., package.json to /)
- **Manifest Generation**: Tracks all deployments with detailed logs

## 📁 File Organization

The deployment system is organized in the `AUTO-DEPLOY-MK/` folder with `mk_` prefixes for clarity:

```
project-root/
├── AUTO-DEPLOY-MK/           # All deployment files in one folder
│   ├── mk_deploy-cli.js      # Main Node.js CLI (core deployment logic)
│   ├── mk_deployment-config.yaml  # YAML configuration
│   ├── mk_deploy-live.ps1    # One-click live deployment
│   ├── mk_deploy-local.ps1   # One-click local testing
│   └── manifests/            # Deployment history logs
├── package.json              # Contains Node.js dependencies (MUST be in root!)
└── [your project files]
```

**Important**: The `package.json` file stays in the project root directory without the `mk_` prefix because it contains the required Node.js dependencies that need to be accessible from the root.

## 📦 Required Node.js Dependencies

Your root `package.json` must include these deployment dependencies:

```json
{
  "dependencies": {
    "basic-ftp": "^5.0.3",
    "js-yaml": "^4.1.0",
    "node-fetch": "^2.6.7",
    "fast-glob": "^3.3.1",
    "commander": "^9.4.1"
  },
  "scripts": {
    "deploy-test": "node AUTO-DEPLOY-MK/mk_deploy-cli.js --dry-run",
    "deploy-live": "node AUTO-DEPLOY-MK/mk_deploy-cli.js --project web --target production --parts default",
    "deploy-local": "node AUTO-DEPLOY-MK/mk_deploy-cli.js --project web --target local --parts default"
  }
}
```

## 🚀 Quick Setup for New Projects

### 1. Copy Deployment Files

```bash
# Copy the entire AUTO-DEPLOY-MK folder to your project root
cp -r /path/to/existing/AUTO-DEPLOY-MK/ ./
```

### 2. Install Dependencies

```bash
# Add the required dependencies to your package.json, then:
npm install
```

### 3. Configure Your Project

Edit `AUTO-DEPLOY-MK/mk_deployment-config.yaml`:

**For React Projects:**

```yaml
projects:
  web:
    localSource: './src'
    localBuild: './build'
    buildCommand: 'npm run build'
    parts:
      default:
        include: ['**/*']
        remotePath: '/'
    verify:
      enabled: true
      fileTemplate: 'deploy-verify-{timestamp}.html'
      urlTemplate: 'https://{domain}/{file}'
```

**For Vue 3 Projects:**

```yaml
projects:
  web:
    localSource: './src'
    localBuild: './dist'
    buildCommand: 'npm run build'
    parts:
      default:
        include: ['**/*']
        remotePath: '/'
    verify:
      enabled: true
      fileTemplate: 'deploy-verify-{timestamp}.html'
      urlTemplate: 'https://{domain}/{file}'
```

**For PHP/Static Projects (with admin under httpdocs/admin):**

```yaml
projects:
  web:
    localSource: './httpdocs'
    localBuild: './httpdocs'
    buildCommand: '' # No build needed
    parts:
      default:
        include: ['**/*']
        exclude: ['admin/**']
        remotePath: '/'
  admin:
    localSource: './httpdocs/admin'
    localBuild: './httpdocs/admin'
    buildCommand: ''
    parts:
      default:
        include: ['**/*']
        remotePath: '/admin'
  # Optional fixed-file mappings example
  server:
    localSource: '.'
    localBuild: '.'
    buildCommand: ''
    parts:
      default:
        include: []
        files:
          - { from: 'package.json', to: '/package.json' }
          - { from: 'server.js', to: '/server.js' }
```

### 4. Set Up Your Hosting Target

Update the production target with your hosting details:

```yaml
targets:
  production:
    method: ftp
    remoteRoot: '/'
    domain: 'your-domain.com'
    ftp:
      host: 'ftp.your-host.com'
      user: '${FTP_USER}'
      password: '${FTP_PASSWORD}'
      timeout: 30000
```

### 5. Set Environment Variables

Create `.env` file in your project root:

```
FTP_USER=your-ftp-username
FTP_PASSWORD=your-ftp-password
```

---

## 🚦 **Port-Belegung (Gentlemen's Agreement)**

Um Konflikte zu vermeiden, wenn mehrere Projekte auf demselben Entwickler-PC oder im selben Netzwerk laufen, halten wir uns an die folgende Port-Verteilung. Jedes Projekt hat einen primären Port für die Hauptanwendung und einen sekundären Port für Hilfsdienste oder alternative Konfigurationen.

| Projekt-Name | Primärer Port (App) | Sekundärer Port (Service/DB) | Anmerkungen                          |
| ------------ | ------------------- | ---------------------------- | ------------------------------------ |
| **Panda**    | `3000`              | `3001`                       | Aktuelles Projekt                    |
| _(frei)_     | `3010`              | `3011`                       | Reserviert                           |
| **KKI**      | `3020`              | `3021`                       | Projekt "KKI"                        |
| _Projekt D_  | `3030`              | `3031`                       | Für zukünftige Verwendung reserviert |
| _Projekt E_  | `3040`              | `3041`                       | Für zukünftige Verwendung reserviert |

**Regel:** Bevor ein Port verwendet wird, prüfe, ob er in dieser Liste bereits für ein anderes aktives Projekt reserviert ist.

---

## 🎮 Usage

### One-Click Live Deployment

```powershell
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1
```

### Local Testing

```powershell
# Start local server on port 4000 (preferred for this project)
.\AUTO-DEPLOY-MK\mk_deploy-local.ps1 -StartServer -AppPort 4000
```

### Advanced Options

```powershell
# Deploy with build
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Build

# Dry run (see what would be deployed)
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -DryRun

# Deploy specific parts
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Parts "frontend,api"
# Note (this repo): use -Parts "default" for the public web, or
# -Parts "backend:core,backend:lib,backend:routes,backend:views,backend:locales" for backend-only

# Force rebuild and deploy
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Build -Force

# Purge server view cache after deploy (fixes stale EJS on shared hosting)
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -PurgeViews -Verbose
```

## 📊 Framework-Specific Examples

### React with Create React App

```yaml
projects:
  web:
    localSource: './src'
    localBuild: './build'
    buildCommand: 'npm run build'
    parts:
      default:
        include: ['**/*']
        remotePath: '/'
```

### Vue 3 with Vite

```yaml
projects:
  web:
    localSource: './src'
    localBuild: './dist'
    buildCommand: 'npm run build'
    parts:
      default:
        include: ['**/*']
        remotePath: '/'
```

### Angular

```yaml
projects:
  web:
    localSource: './src'
    localBuild: './dist'
    buildCommand: 'ng build --prod'
    parts:
      default:
        include: ['**/*']
        remotePath: '/'
```

### Next.js (Static Export)

```yaml
projects:
  web:
    localSource: './'
    localBuild: './out'
    buildCommand: 'npm run build && npm run export'
    parts:
      default:
        include: ['**/*']
        remotePath: '/'
```

## 🌐 Hosting Provider Examples

### Shared Hosting (cPanel/FTP)

```yaml
targets:
  production:
    method: ftp
    remoteRoot: '/public_html'
    domain: 'yoursite.com'
    ftp:
      host: 'ftp.yourhost.com'
      user: '${FTP_USER}'
      password: '${FTP_PASSWORD}'
```

### Netcup / Shared Hosting with domain subfolders

Some hosts place each domain in its own folder at the FTP root. Within that, `httpdocs` is the web root. To avoid duplicating the domain folder in paths, set `remoteRoot: "/"` and use fully qualified per-project `remotePath`.

Example used in this repo (correctly indented, domain folder NOT included in paths):

```yaml
targets:
  production_purview:
    method: ftp
    remoteRoot: '/' # map full paths per project
    domain: 'purviewpanda.de'
    ftp:
      host: '${FTP_HOST}'
      user: '${FTP_USER}'
      password: '${FTP_PASSWORD}'

projects:
  web:
    parts:
      default:
        include: ['**/*']
        remotePath: '/httpdocs'
  admin:
    parts:
      default:
        include: ['**/*']
        remotePath: '/httpdocs/admin'
```

Auto-detection and overrides:

- The deploy CLI auto-detects the FTP server’s current working directory (PWD) on login. If your target’s `remoteRoot` is `/`, the CLI will use the server PWD as the effective remote root. This prevents accidental duplication like `/purviewpanda.de/purviewpanda.de/...` on hosts that already chroot you into `/purviewpanda.de`.
- You can force a specific root with the environment variable `FTP_REMOTE_ROOT`. If set, it overrides the configured `remoteRoot`.
- The CLI also has hard guards that block uploads if a duplicated `/{domain}/{domain}` or `/httpdocs/httpdocs` segment is detected at any stage.

### Hostinger

```yaml
targets:
  production:
    method: ftp
    remoteRoot: '/public_html'
    domain: 'yoursite.com'
    ftp:
      host: 'files.000webhost.com'
      user: '${FTP_USER}'
      password: '${FTP_PASSWORD}'
```

### GoDaddy

```yaml
targets:
  production:
    method: ftp
    remoteRoot: '/public_html'
    domain: 'yoursite.com'
    ftp:
      host: 'ftp.secureserver.net'
      user: '${FTP_USER}'
      password: '${FTP_PASSWORD}'
```

## ✅ Post-deploy smoke test (5 min)

Use these quick checks right after a deploy. Replace {domain} with your live domain. For admin-only endpoints, either be logged-in as admin or append ?admin_token=$env:ADMIN_ACCESS_TOKEN.

Endpoints and expected results (metrics restricted: requires admin session or IP allowlist):

- Public health: https://{domain}/health → {"status":"ok", "mode":"prod|dev"}
- Deep health (DB ping): https://{domain}/health?deep=1 → HTTP 200 with { db: true } or 500 if degraded
- Prometheus metrics (restricted): https://{domain}/metrics → text/plain; contains metric lines (403 if not admin or IP not allowlisted)
- Admin health page (HTML): https://{domain}/admin/health?admin_token=<token> → renders admin health view (200)
- DB health API (no auth): https://{domain}/admin/api/db-health → JSON with degraded,lastPingMs,rollingAvgMs
- Request timings (admin): https://{domain}/admin/api/timings?admin_token=<token> → JSON with summary,p95,p99
- Metrics summary (admin): https://{domain}/admin/api/metrics-summary?admin_token=<token> → JSON totals
- Clear EJS view cache (admin): https://{domain}/__ops/clear-views?admin_token=<token> → { ok: true }

Local equivalents (port 4000):

- http://localhost:4000/health
- http://localhost:4000/health?deep=1
- http://localhost:4000/metrics  # may return 403 unless your IP (127.0.0.1) is allowlisted or you are admin
- http://localhost:4000/admin/health?admin_token=<token>
- http://localhost:4000/admin/api/db-health
- http://localhost:4000/admin/api/timings?admin_token=<token>
- http://localhost:4000/admin/api/metrics-summary?admin_token=<token>
- http://localhost:4000/__ops/clear-views?admin_token=<token>

PowerShell one-liners (Windows PowerShell 5.1):

```powershell
$domain = "<your-domain>"
$env:ADMIN_ACCESS_TOKEN = "<your-strong-token>"  # matches server .env ADMIN_ACCESS_TOKEN

# Public health
Invoke-RestMethod -UseBasicParsing -Uri ("https://$domain/health")
# Deep health
Invoke-RestMethod -UseBasicParsing -Uri ("https://$domain/health?deep=1")
# Metrics (plain text)
Invoke-WebRequest -UseBasicParsing -Uri ("https://$domain/metrics") | Select-Object -ExpandProperty Content
# Admin health (HTML)
Invoke-WebRequest -UseBasicParsing -Uri ("https://$domain/admin/health?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN)) | Select-Object StatusCode
# DB health API (JSON)
Invoke-RestMethod -UseBasicParsing -Uri ("https://$domain/admin/api/db-health")
# Timings (admin JSON)
Invoke-RestMethod -UseBasicParsing -Uri ("https://$domain/admin/api/timings?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN))
# Metrics summary (admin JSON)
Invoke-RestMethod -UseBasicParsing -Uri ("https://$domain/admin/api/metrics-summary?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN))
# Clear view cache
Invoke-RestMethod -UseBasicParsing -Uri ("https://$domain/__ops/clear-views?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN))

# Local (HTTP, port 4000)
Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:4000/health"
Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:4000/health?deep=1"
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:4000/metrics" | Select-Object -ExpandProperty Content
Invoke-WebRequest -UseBasicParsing -Uri ("http://localhost:4000/admin/health?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN)) | Select-Object StatusCode
Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:4000/admin/api/db-health"
Invoke-RestMethod -UseBasicParsing -Uri ("http://localhost:4000/admin/api/timings?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN))
Invoke-RestMethod -UseBasicParsing -Uri ("http://localhost:4000/admin/api/metrics-summary?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN))
Invoke-RestMethod -UseBasicParsing -Uri ("http://localhost:4000/__ops/clear-views?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN))
```

## CI/CD note (no GitHub Actions required)

This project does not require GitHub Actions. Deploys are triggered manually via the PowerShell scripts in `AUTO-DEPLOY-MK/` or by running the Node CLI directly. If you later add CI/CD, keep it minimal: run the same commands defined here and invoke the smoke test script as a post-step.

Notes:

- Admin token query parameter is named admin_token. Set ADMIN_ACCESS_TOKEN in the server environment and reuse the same value locally for testing.
- If a 403 is returned on admin endpoints, ensure the token is correct or log in as an admin user and retry without the token.
- The deploy CLI also creates a verification file under /httpdocs (deploy-verify-<timestamp>.html); its URL is logged in manifests. Opening it should return HTTP 200.

## 🔧 Troubleshooting

### Common Issues

**1. "Node.js not found"**

- Install Node.js from https://nodejs.org
- Restart your terminal/PowerShell

**2. "Dependencies not found"**

- Run `npm install` in the project root
- Ensure package.json contains the required dependencies

**3. "FTP connection failed"**

- Check your FTP credentials in `.env`
- Verify firewall/antivirus isn't blocking FTP
- Try passive mode FTP

**4. "Build command failed"**

- Ensure your build command works manually
- Check if all dev dependencies are installed

**5. "Files not found"**

- Verify paths in `mk_deployment-config.yaml`
- Check that build output folder exists
- Use `--dry-run` to see what files would be deployed

**6. "Files land im falschen Ordner" / "Doppelte Domain-Ordner (z. B. /purviewpanda.de/purviewpanda.de)"**

- Auf Shared-Hosting setzt der FTP-Server häufig das Home bereits auf `/{domain}`. Wenn `remoteRoot: "/"` gesetzt ist, nutzt der Deployer automatisch das FTP-PWD als effektiven Root und verhindert damit doppelte Pfade.
- Stelle sicher, dass deine per-Projekt `remotePath`-Werte voll-qualifiziert sind (z. B. `/httpdocs` statt relativ). Den Domain-Ordner NIE in Pfade aufnehmen.
- Optional kannst du mit `FTP_REMOTE_ROOT` den effektiven Root manuell überschreiben.
- Einmalige Altlast: Lösche ggf. bestehende doppelte Ordner (z. B. `/purviewpanda.de/purviewpanda.de/`) manuell per FTP/Dateimanager.
- Der Deployer bricht Uploads ab, wenn doppelte Segmente erkannt werden, um erneute Fehldeploys zu verhindern.

### Debug Mode

```powershell
# Enable verbose logging
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Verbose

# See what would be deployed without uploading
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -DryRun

# Manually purge the server's EJS view cache (requires ADMIN_ACCESS_TOKEN in your environment)
$env:ADMIN_ACCESS_TOKEN = "<your-strong-token>"
Invoke-WebRequest -UseBasicParsing -Uri ("https://" + "{domain}" + "/__ops/clear-views?admin_token=" + [uri]::EscapeDataString($env:ADMIN_ACCESS_TOKEN)) -Headers @{ 'Cache-Control'='no-cache'; 'Cookie'='allow_wip=1' } | Select-Object -ExpandProperty Content
```

### Manual CLI Usage

```bash
# Direct CLI usage for advanced debugging
node AUTO-DEPLOY-MK/mk_deploy-cli.js --help
node AUTO-DEPLOY-MK/mk_deploy-cli.js --project web --target production --dry-run --verbose
```

## 📈 Monitoring & Logs

- **Deployment Manifests**: Check `AUTO-DEPLOY-MK/manifests/` for detailed deployment logs
- **Verification**: Each deployment can create a verification URL to confirm success
- **Error Logs**: Failed deployments include full error details in manifests

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit FTP credentials to version control
2. **Gitignore**: Add `.env` and `AUTO-DEPLOY-MK/manifests/` to `.gitignore`
3. **FTP Credentials**: Use strong passwords and consider SFTP if available
4. **File Permissions**: Review included files to avoid exposing sensitive data

### .env handling

- `.env` stays out of git via root `.gitignore`.
- The deploy CLI loads `.env` locally for credentials.
- For live deploys, `.env` is uploaded only with the `backend` part to the domain root (e.g. `/purviewpanda.de/.env`).
- A safety guard blocks any attempt to upload `.env` into `httpdocs` (public web root).

## ⚡ Performance Tips

- Use `--parts` to deploy only changed sections
- Enable verification cleanup to avoid accumulating verification files
- Use exclude patterns for large files that don't need deployment
- Consider enabling gzip compression on your web server

## 🆕 Version History

- **v1.0**: Initial release with FTP deployment, verification, and PowerShell wrappers
- Supports React, Vue, Angular, PHP, and static sites
- One-click deployment with comprehensive error handling

## Server runtime checklist (shared hosting)

1) Confirm app root in Plesk and run:
  - `node scripts/diag_modules.js` to see if dependencies resolve
  - If missing: `npm ci --omit=dev` in the app root
2) Restart Passenger by touching `/tmp/restart.txt` (use backend:restart part)
3) Verify `/health` and `/health?deep=1`

**Need Help?** Check `AUTO-DEPLOY-MK/manifests/` for deployment logs or run with `-Verbose`.
