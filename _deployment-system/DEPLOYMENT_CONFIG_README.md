Deployment Config README

Place project-specific deployment settings in `deployment-config.env` in this folder.

- This file is included in `.gitignore` to avoid leaking credentials.
- Copy values from `deployment-config-template.env` or edit the existing `deployment-config.env`.

Required variables:
- FTP_HOST
- FTP_USER
- FTP_PASSWORD

Optional variables include FTP_REMOTE_PATH, PROJECT_NAME, DOMAIN_URL and others used by the scripts.

Usage:
- Run `./hotfix-deploy.ps1 -DryRun` to validate configured files and paths without uploading.
- Run `./hotfix-deploy.ps1` to perform the critical hotfix deployment.

If you encounter permission or connection issues, run `./fix-lib-upload.ps1` for diagnostics.
