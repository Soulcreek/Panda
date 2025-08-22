# Universal Deployment System for Purview Panda

This deployment system handles both static websites and Node.js applications like Purview Panda.

## Quick Start for Purview Panda (Node.js)

1. **Configuration is already set up** in `deployment-config.env`
2. **Use Node.js deployment**: `.\deploy-node.ps1`
3. **For static frontend only**: `.\deploy.ps1`

## Recent Updates (August 2025)

### New Features Deployed
- Microsoft Purview Knowledge Center with KPI Dashboard
- Modern Home v2 with Glass Morphism Design
- Complete German Internationalization
- Enhanced Blog Cards and responsive design
- Database connection stability improvements

### Node.js Deployment Features
- Automatic process management (PM2 or systemd)
- Database migration support
- Environment variable management
- Log rotation and monitoring
- Health check endpoints (`/health`, `/health?deep=1`)

## Configuration

Edit `deployment-config.env` with your project settings:

```bash
# PROJECT CONFIGURATION
PROJECT_NAME=your-project-name
DOMAIN_URL=https://your-domain.com
BUILD_DIRECTORY=build                    # React: build, Vue: dist, Angular: dist

# FTP CREDENTIALS
FTP_HOST=ftp.your-domain.com
FTP_USER=your-username
FTP_PASSWORD=your-password
FTP_REMOTE_PATH=/httpdocs

# SSH CREDENTIALS (Backup)
SSH_HOST=your-server.com
SSH_USER=your-username
SSH_PASSWORD=your-password

# DEPLOYMENT OPTIONS
UPLOAD_ADMIN=true                        # Set to false if no admin panel
UPLOAD_FRONTEND=true
FTP_UPLOAD_BACKEND=false                # Always false for static hosting
```

## Usage

```powershell
# Deploy with auto-detection (FTP first, SSH fallback)
.\deploy.ps1

# Force FTP deployment
.\deploy.ps1 -Method ftp

# Force SSH deployment
.\deploy.ps1 -Method ssh

# Build and deploy (for React/Vue/Angular projects)
.\deploy.ps1 -Build

# Test deployment (dry run)
.\deploy.ps1 -Test

# Show detailed configuration
.\deploy.ps1 -ShowDetails
```

## Features

- **Multi-protocol support**: FTP primary, SSH fallback
- **Auto-detection**: Tries FTP first, falls back to SSH if needed
- **Build integration**: Can build React/Vue/Angular apps before deployment
- **Admin panel support**: Uploads admin directories if configured
- **Static hosting optimized**: No backend server requirements
- **Reusable**: Easy to copy to new projects
- **Secure**: Credentials in separate config file

## File Structure

```
_deployment-system/
├── deploy.ps1                          # Main deployment script
├── deployment-config.env               # Your project configuration
├── deployment-config-template.env     # Template for new projects
└── README.md                           # This file
```

## For New Projects

1. Copy the entire `_deployment-system` folder to your new project
2. Copy `deployment-config-template.env` to `deployment-config.env`
3. Update the configuration with your project details
4. Create a wrapper script in your project root (optional)
5. Run deployment

## Security Notes

- **Never commit** `deployment-config.env` with real credentials
- **Change default admin passwords** after first deployment
- **Use SSH keys** instead of passwords where possible
- **Restrict FTP access** to your IP if possible

## Troubleshooting

- **Connection failed**: Check FTP/SSH credentials and server access
- **Permission denied**: Ensure remote directory has write permissions
- **Build failed**: Check if build command works locally first
- **Files not found**: Verify BUILD_DIRECTORY path is correct

## Supported Project Types

- ✅ React (create-react-app)
- ✅ Vue.js
- ✅ Angular
- ✅ Next.js (static export)
- ✅ Plain HTML/CSS/JS
- ✅ Any static site generator

## License

Feel free to use this deployment system for any project!
