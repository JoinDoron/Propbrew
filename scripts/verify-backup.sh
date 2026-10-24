#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE must point to a recoverable pg_dump file}"

test -s "$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" >/dev/null
echo "Backup archive is readable: $BACKUP_FILE"
echo "Restore into an isolated Neon branch before promotion; never overwrite production in place."
