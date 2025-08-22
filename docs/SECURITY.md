# Security and Secrets Handling

This project uses environment variables for all sensitive configuration. Do not commit secrets to source control. The repo already ignores `.env`.

Immediate actions if secrets were exposed (e.g., pasted in chat, logs, screenshots):

1. Rotate keys and passwords
   - Database: change the application DB user password and flush privileges.
   - Google/Gemini API keys: create new keys; revoke the old ones.
   - Admin token(s): generate a new random string and update `ADMIN_ACCESS_TOKEN`.
   - FTP/SSH: disable password auth if possible; prefer SSH keys. Change any exposed passwords.
2. Update the host environment
   - Set the new values via your process manager (systemd, PM2, hosting panel) or server env.
   - Do not store credentials in repository files; `.env` is for local/dev only.
3. Restart the app and verify
   - Confirm the app reads new env vars (check logs for the current `NODE_ENV` and DB connectivity).
   - Verify Admin access and DB queries still work.

Best practices

- Use long, random secrets for `SESSION_SECRET` and `ADMIN_ACCESS_TOKEN`.
- Prefer SSH key auth over FTP/Password.
- Give the app DB user only the minimal privileges it needs (e.g., SELECT/INSERT/UPDATE on the app schema; avoid global grants).
- Keep production `.env` files off-repo and off-build artifacts. Inject via environment.
- Audit logs for accidental key prints; never log full secrets.

Operational checks

- The server logs a warning at startup if placeholder/weak secrets are detected.
- Admin Tools include quick diagnostics to verify CURRENT_USER(), DATABASE(), and uploads.

Rotation snippets (examples)

- MySQL (run as DBA):
  - ALTER USER 'app_user'@'%' IDENTIFIED BY 'NEW_STRONG_PASSWORD'; FLUSH PRIVILEGES;
- Linux/random token: `openssl rand -hex 32`
- Windows PowerShell token: `[Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')`
