#!/usr/bin/env bash
# ARCHIVED OPTIONAL FALLBACK: KR-region catalog refresh for an explicitly approved OCI VM.
# This is not part of the current production authority. GH 러너가 못 풀던 KR 소스를
# 풀 수확하고, 검증 게이트를 통과해야만 커밋 → Git Integration 배포 + Discord 알림.
# (GH Actions catalog-update.yml 의 KR-리전 대체본. 동일한 validate/notify 스크립트 재사용.)
#
# 사전: /opt/toonspectrum 클론 + pnpm install, git push 가능한 자격(deploy key), deploy/oci/.env 작성.
# cron 예: 0 19 * * *  (04:00 KST)  bash /opt/toonspectrum/deploy/oci/crawl-update.sh >> /var/log/toonspectrum-crawl.log 2>&1

set -euo pipefail
REPO="${TOONSPECTRUM_REPO_DIR:-/opt/toonspectrum}"
cd "$REPO"

# 크롤 cron 전용 env(NAVER_COOKIE·DISCORD_WEBHOOK_URL 등) 주입.
if [ -f deploy/oci/.env ]; then set -a; . deploy/oci/.env; set +a; fi
export TZ=Asia/Seoul

git pull --rebase --autostash
cp apps/api/data/catalog.json.gz /tmp/prev-catalog.json.gz

echo "[crawl] $(date '+%F %T') 시작"
node scripts/crawl.mjs --json --no-file > /tmp/catalog.json

if node scripts/validate-catalog.mjs /tmp/catalog.json /tmp/prev-catalog.json.gz; then
  gzip -9 -c /tmp/catalog.json > apps/api/data/catalog.json.gz
  pnpm exec tsx scripts/notify-catalog-changes.ts \
    --new /tmp/catalog.json --prev /tmp/prev-catalog.json.gz \
    --manifest apps/api/data/adaptation-seen.json || true
  git add apps/api/data/catalog.json.gz apps/api/data/adaptation-seen.json
  if git diff --staged --quiet; then
    echo "[crawl] 변경 없음 — 커밋 생략"
  else
    git commit -m "chore(catalog): KR 스냅샷 갱신 ($(date +%F))"
    git push
  fi
else
  echo "[crawl] 검증 실패 — 커밋/배포 스킵"
  pnpm exec tsx scripts/notify-catalog-changes.ts --alert "KR 크롤 검증 실패 — 배포 스킵($(date +%F))" || true
  exit 0
fi
