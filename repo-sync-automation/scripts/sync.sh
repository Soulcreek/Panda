#!/bin/bash
# Repo Sync Automation Script
set -e
CONFIG_DIR="$(dirname "$0")/../config"
source "$CONFIG_DIR/sync.conf"

cd "$REPO_PATH"
echo "[Sync] $(date): Pulling latest changes..."
git pull --rebase

case "$SYNC_METHOD" in
  scp)
    echo "[Sync] Using SCP to sync files..."
    scp -i "$SSH_KEY" -r . "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
    ;;
  rsync)
    echo "[Sync] Using rsync to sync files..."
    rsync -az --delete -e "ssh -i $SSH_KEY" . "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
    ;;
  ftp)
    echo "[Sync] Using FTP to sync files..."
    lftp -u "$FTP_USER","$FTP_PASSWORD" "$FTP_HOST" -e "mirror -R . $FTP_REMOTE_DIR; quit"
    ;;
  *)
    echo "[Sync] Unknown SYNC_METHOD: $SYNC_METHOD"
    exit 1
    ;;
esac

echo "[Sync] Done."
