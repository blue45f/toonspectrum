#!/usr/bin/env bash
# KR 리전 카탈로그 갱신 — OCI 서울/춘천 VM 의 호스트 cron 으로 실행. GH 러너가 못 풀던 KR 소스를
# 풀 수확하고, 검증 게이트를 통과해야만 커밋 → Vercel 재배포(정적 카탈로그) + Discord 알림.
# (GH Actions catalog-update.yml 의 KR-리전 대체본. 동일한 validate/notify 스크립트 재사용.)
#
# 사전: /opt/webdex 클론 + pnpm install, git push 가능한 자격(deploy key), deploy/oci/.env 작성.
# cron 예: 0 19 * * *  (04:00 KST)  bash /opt/webdex/deploy/oci/crawl-update.sh >> /var/log/webdex-crawl.log 2>&1

set -euo pipefail
REPO="${WEBDEX_REPO_DIR:-/opt/webdex}"
cd "$REPO"

# 크롤 cron 전용 env(NAVER_COOKIE·DISCORD_WEBHOOK_URL·VERCEL_DEPLOY_HOOK_URL 등) 주입.
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
    if [ -n "${VERCEL_DEPLOY_HOOK_URL:-}" ]; then
      curl -fsS -X POST "$VERCEL_DEPLOY_HOOK_URL" >/dev/null && echo "[crawl] Vercel 배포 트리거"
    fi
  fi
else
  echo "[crawl] 검증 실패 — 커밋/배포 스킵"
  pnpm exec tsx scripts/notify-catalog-changes.ts --alert "KR 크롤 검증 실패 — 배포 스킵($(date +%F))" || true
  exit 0
fi
