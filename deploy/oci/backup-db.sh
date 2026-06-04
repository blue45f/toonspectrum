#!/usr/bin/env bash
# Postgres 백업 — pg_dump → gzip, 로컬 14개 로테이션. OCI Object Storage(10GB 무료) 선택 업로드.
# cron 예: 30 18 * * *  bash /opt/webdex/deploy/oci/backup-db.sh >> /var/log/webdex-backup.log 2>&1

set -euo pipefail
REPO="${WEBDEX_REPO_DIR:-/opt/webdex}"
COMPOSE_DIR="$REPO/deploy/oci"
OUT_DIR="${WEBDEX_BACKUP_DIR:-/opt/webdex-backups}"
cd "$COMPOSE_DIR"
[ -f .env ] && { set -a; . .env; set +a; }

mkdir -p "$OUT_DIR"
TS=$(date +%Y%m%d-%H%M%S)
FILE="$OUT_DIR/webdex-$TS.sql.gz"

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-webdex}" "${POSTGRES_DB:-webdex}" | gzip > "$FILE"
echo "[backup] $(date '+%F %T') → $FILE ($(du -h "$FILE" | cut -f1))"

# 14개 초과분 삭제
ls -1t "$OUT_DIR"/webdex-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

# OCI Object Storage 업로드(선택) — oci-cli 설정 + OCI_BACKUP_BUCKET 지정 시
if command -v oci >/dev/null 2>&1 && [ -n "${OCI_BACKUP_BUCKET:-}" ]; then
  oci os object put -bn "$OCI_BACKUP_BUCKET" --file "$FILE" --name "webdex/$(basename "$FILE")" --force >/dev/null \
    && echo "[backup] Object Storage 업로드 완료: $OCI_BACKUP_BUCKET"
fi
