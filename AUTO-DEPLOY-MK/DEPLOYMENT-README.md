# MK Auto-Deploy System

## Universal Deployment README for Project Reuse

A robust, one-click deployment system designed for maximum reliability and ease of use across different project types (React, Vue, Angular, PHP, static sites, etc.).

## 🎯 Key Features

- **One-Click Deployment**: Simply run `.\mk_deploy-live.ps1` to deploy to production
- **Local Testing**: Test locally with `.\mk_deploy-local.ps1 -StartServer`
- **Multi-Framework Support**: Works with React, Vue, Angular, PHP, static HTML, etc.
- **Comprehensive Verification**: FTP + HTTP checks ensure successful deployment
- **Robust Error Handling**: Retries, timeouts, detailed logging
- **Flexible Configuration**: YAML-based config supports multiple targets and project parts
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
    localSource: "./src"
    localBuild: "./build"
    buildCommand: "npm run build"
    parts:
      default:
        include: ["**/*"]
        remotePath: "/"
    verify:
      enabled: true
      fileTemplate: "deploy-verify-{timestamp}.html"
      urlTemplate: "https://{domain}/{file}"
```

**For Vue 3 Projects:**

```yaml
projects:
  web:
    localSource: "./src"
    localBuild: "./dist"
    buildCommand: "npm run build"
    parts:
      default:
        include: ["**/*"]
        remotePath: "/"
    verify:
      enabled: true
      fileTemplate: "deploy-verify-{timestamp}.html"
      urlTemplate: "https://{domain}/{file}"
```

**For PHP/Static Projects:**

```yaml
projects:
  web:
    localSource: "./"
    localBuild: "./"
    buildCommand: "" # No build needed
    parts:
      default:
        include:
          - "*.html"
          - "*.css"
          - "*.js"
          - "*.php"
          - "assets/**"
          - "api/**"
        remotePath: "/"
    verify:
      enabled: true
      fileTemplate: "deploy-verify-{timestamp}.html"
      urlTemplate: "https://{domain}/{file}"
```

### 4. Set Up Your Hosting Target

Update the production target with your hosting details:

```yaml
targets:
  production:
    method: ftp
    remoteRoot: "/"
    domain: "your-domain.com"
    ftp:
      host: "ftp.your-host.com"
      user: "${FTP_USER}"
      password: "${FTP_PASSWORD}"
      timeout: 30000
```

### 5. Set Environment Variables

Create `.env` file in your project root:

```
FTP_USER=your-ftp-username
FTP_PASSWORD=your-ftp-password
```

## 🎮 Usage

### One-Click Live Deployment

```powershell
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1
```

### Local Testing

```powershell
.\AUTO-DEPLOY-MK\mk_deploy-local.ps1 -StartServer
```

### Advanced Options

```powershell
# Deploy with build
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Build

# Dry run (see what would be deployed)
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -DryRun

# Deploy specific parts
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Parts "frontend,api"

# Force rebuild and deploy
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Build -Force
```

## 📊 Framework-Specific Examples

### React with Create React App

```yaml
projects:
  web:
    localSource: "./src"
    localBuild: "./build"
    buildCommand: "npm run build"
    parts:
      default:
        include: ["**/*"]
        remotePath: "/"
```

### Vue 3 with Vite

```yaml
projects:
  web:
    localSource: "./src"
    localBuild: "./dist"
    buildCommand: "npm run build"
    parts:
      default:
        include: ["**/*"]
        remotePath: "/"
```

### Angular

```yaml
projects:
  web:
    localSource: "./src"
    localBuild: "./dist"
    buildCommand: "ng build --prod"
    parts:
      default:
        include: ["**/*"]
        remotePath: "/"
```

### Next.js (Static Export)

```yaml
projects:
  web:
    localSource: "./"
    localBuild: "./out"
    buildCommand: "npm run build && npm run export"
    parts:
      default:
        include: ["**/*"]
        remotePath: "/"
```

## 🌐 Hosting Provider Examples

### Shared Hosting (cPanel/FTP)

```yaml
targets:
  production:
    method: ftp
    remoteRoot: "/public_html"
    domain: "yoursite.com"
    ftp:
      host: "ftp.yourhost.com"
      user: "${FTP_USER}"
      password: "${FTP_PASSWORD}"
```

### Hostinger

```yaml
targets:
  production:
    method: ftp
    remoteRoot: "/public_html"
    domain: "yoursite.com"
    ftp:
      host: "files.000webhost.com"
      user: "${FTP_USER}"
      password: "${FTP_PASSWORD}"
```

### GoDaddy

```yaml
targets:
  production:
    method: ftp
    remoteRoot: "/public_html"
    domain: "yoursite.com"
    ftp:
      host: "ftp.secureserver.net"
      user: "${FTP_USER}"
      password: "${FTP_PASSWORD}"
```

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

### Debug Mode

```powershell
# Enable verbose logging
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -Verbose

# See what would be deployed without uploading
.\AUTO-DEPLOY-MK\mk_deploy-live.ps1 -DryRun
```

### Manual CLI Usage

```bash
# Direct CLI usage for advanced debugging
node AUTO-DEPLOY-MK/mk_deploy-cli.js --help
node AUTO-DEPLOY-MK/mk_deploy-cli.js --project web --target production --dry-run --verbose
```

## 📈 Monitoring & Logs

- **Deployment Manifests**: Check `AUTO-DEPLOY-MK/manifests/` for detailed deployment logs
- **Verification**: Each deployment creates a verification URL to confirm success
- **Error Logs**: Failed deployments include full error details in manifests

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit FTP credentials to version control
2. **Gitignore**: Add `.env` and `AUTO-DEPLOY-MK/manifests/` to `.gitignore`
3. **FTP Credentials**: Use strong passwords and consider SFTP if available
4. **File Permissions**: Review included files to avoid exposing sensitive data

## ⚡ Performance Tips

- Use `--parts` to deploy only changed sections
- Enable verification cleanup to avoid accumulating verification files
- Use exclude patterns for large files that don't need deployment
- Consider enabling gzip compression on your web server

## 🆕 Version History

- **v1.0**: Initial release with FTP deployment, verification, and PowerShell wrappers
- Supports React, Vue, Angular, PHP, and static sites
- One-click deployment with comprehensive error handling

---

**Need Help?** Check the deployment manifests in `AUTO-DEPLOY-MK/manifests/` for detailed logs, or run with `--verbose` for debug information.
