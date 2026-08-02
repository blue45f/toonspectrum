#!/usr/bin/env bash
# ARCHIVED OPTIONAL FALLBACK: Postgres pg_dump/gzip rotation with optional OCI Object Storage upload.
# cron 예: 30 18 * * *  bash /opt/toonspectrum/deploy/oci/backup-db.sh >> /var/log/toonspectrum-backup.log 2>&1

set -euo pipefail
REPO="${TOONSPECTRUM_REPO_DIR:-/opt/toonspectrum}"
COMPOSE_DIR="$REPO/deploy/oci"
OUT_DIR="${TOONSPECTRUM_BACKUP_DIR:-/opt/toonspectrum-backups}"
cd "$COMPOSE_DIR"
[ -f .env ] && { set -a; . .env; set +a; }

mkdir -p "$OUT_DIR"
TS=$(date +%Y%m%d-%H%M%S)
FILE="$OUT_DIR/toonspectrum-$TS.sql.gz"

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-toonspectrum}" "${POSTGRES_DB:-toonspectrum}" | gzip > "$FILE"
echo "[backup] $(date '+%F %T') → $FILE ($(du -h "$FILE" | cut -f1))"

# 14개 초과분 삭제
ls -1t "$OUT_DIR"/toonspectrum-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

# OCI Object Storage 업로드(선택) — oci-cli 설정 + OCI_BACKUP_BUCKET 지정 시
if command -v oci >/dev/null 2>&1 && [ -n "${OCI_BACKUP_BUCKET:-}" ]; then
  oci os object put -bn "$OCI_BACKUP_BUCKET" --file "$FILE" --name "toonspectrum/$(basename "$FILE")" --force >/dev/null \
    && echo "[backup] Object Storage 업로드 완료: $OCI_BACKUP_BUCKET"
fi
