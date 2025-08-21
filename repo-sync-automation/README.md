
# Repo Sync Automation

Automate deployment of your GitHub repository to a remote server via cron and shell scripts.

## Features
- Periodic `git pull` to update local repo
- Sync changes to remote server via SCP, rsync, or FTP
- SSH password and key support (see `config/sync.conf`)
- Manual one-liner for Windows (pscp.exe)
- Easy to extend for custom hooks

## Usage
1. Edit `config/sync.conf` with your server and repo details (SSH password: `DEPLOY_SSH_PASS`).
2. Make `scripts/sync.sh` executable: `chmod +x scripts/sync.sh`
3. Run manually:
	```bash
	cd repo-sync-automation/scripts
	./sync.sh
	```
4. Or add to your crontab for scheduled runs:
	```bash
	*/10 * * * * /path/to/repo-sync-automation/scripts/sync.sh >> /path/to/repo-sync-automation/sync.log 2>&1
	```

## Windows (cmd) One-Liner Example
Download [pscp.exe](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) and run:
```cmd
pscp -pw <DEPLOY_SSH_PASS> TEST_DEPLOY.txt <DEPLOY_SSH_USER>@<DEPLOY_SSH_HOST>:<DEPLOY_WEB_ROOT>
```

## Configuration Example (`config/sync.conf`)
```
REPO_PATH="/path/to/your/local/repo"
SYNC_METHOD="scp" # or "rsync"
DEPLOY_SSH_HOST="hosting223936.ae94b.netcup.net"
DEPLOY_SSH_USER="hosting223936"
DEPLOY_SSH_PASS="hallo.4Netcup"
DEPLOY_WEB_ROOT="/korrekter/zielpfad"
```

## Notes
- For SCP/rsync with password, `sshpass` is required (auto-installed in the script).
- For FTP, fill in FTP_* variables in `sync.conf` and set `SYNC_METHOD="ftp"`.
- For Windows, use `pscp.exe` for single files or WinSCP for folders.
- Adjust `DEPLOY_WEB_ROOT` to your actual server path (ask your hoster if unsure).
