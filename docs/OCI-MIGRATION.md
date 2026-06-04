# ToonSpectrum — Oracle Cloud(OCI) 백엔드 이전 런북

프론트엔드는 **Vercel 유지**(무료 글로벌 CDN). **API(NestJS) + Postgres + KR 크롤 cron** 을 OCI
**Always-Free ARM(Ampere A1, 최대 4 OCPU / 24GB RAM, 영구 무료)** VM 한 대로 옮긴다. 비용 $0.

## 왜 옮기나 (이번에 확인된 근거)
- **Neon 데이터 전송 쿼터 초과** — 무료 티어 한도를 이미 넘겨 DB 기능(리뷰·커뮤니티·피드백·인증)이 간헐 차단. OCI 자가호스트 Postgres(egress 10TB/월 무료)로 해소.
- **GH 러너 크롤 한계** — 비KR egress라 ~23.4k(novelpia 0)밖에 못 함. OCI **서울/춘천 리전** VM에서 크롤하면 풀 수확(~30k) + cron 자동 갱신.
- 콜드스타트 제거, API+DB+크롤 한 곳 통합.

## 아키텍처
```
브라우저 → Vercel(정적 SPA + /data 카탈로그 CDN)
            └ /api/* ──(Vercel rewrite, 동일 출처)──▶ OCI VM: Caddy(443,자동HTTPS) → NestJS API → Postgres
OCI VM cron: 크롤(KR) → validate 게이트 → catalog.json.gz 커밋/푸시 → Vercel 재배포 + Discord 알림
```

## 0. 준비물
- OCI 계정(무료 가입, 결제카드 본인확인만 — Always-Free는 과금 없음).
- API용 도메인 1개(예: `api.example.com`). 서브도메인이면 충분.
- 로컬에 빌드/검증 완료된 이 레포(`deploy/oci/` 일체 + 스모크 테스트 통과 확인됨).

## 1. ARM 인스턴스 생성 (OCI 콘솔)
1. **Compute → Instances → Create**.
2. Image: **Ubuntu 22.04/24.04 (aarch64)**. Shape: **VM.Standard.A1.Flex** — OCPU 2~4, RAM 12~24GB(Always-Free 한도 내). *ARM 무료 용량은 인기 리전에서 품귀일 수 있음 → 안 잡히면 다른 AD/리전(서울·춘천) 재시도.*
3. Networking: 새 VCN + public subnet, **퍼블릭 IP 할당**.
4. SSH 키 등록(본인 공개키).
5. **Advanced → Management → cloud-init**: `deploy/oci/cloud-init.yaml` 내용 붙여넣기.
6. Create. (cloud-init이 Docker/Node/pnpm 설치 + 레포 클론 + 80/443 개방까지 수행)

## 2. 보안 목록(Security List) 개방
VCN → Subnet → Security List → **Ingress 0.0.0.0/0 TCP 80, 443 추가**(SSH 22는 기본).
(인스턴스 내부 iptables는 cloud-init이 이미 개방)

## 3. DNS
도메인 DNS에 **A 레코드: `api.example.com` → VM 공인 IP**.

## 4. .env 작성 (SSH 접속 후)
```bash
ssh ubuntu@<VM_IP>
cd /opt/webdex/deploy/oci
cp .env.example .env && nano .env     # DOMAIN, POSTGRES_PASSWORD, AUTH_SECRET, AUTH_*,
                                      # ADMIN_EMAILS 등 — 현재 Vercel/.env.local 값 복사
```

## 5. 스택 기동 + 스키마
```bash
cd /opt/webdex/deploy/oci
docker compose up -d --build               # db + api + caddy(자동 HTTPS 발급)
docker compose exec -w /repo api pnpm exec drizzle-kit push --force   # 최초 1회 스키마
curl -s https://api.example.com/api/config # 200 확인
```

## 6. DB 데이터 이전 (Neon → OCI) — 선택
스키마는 §5의 drizzle push로 생성됨. 기존 데이터(리뷰·커뮤니티 등) 이관이 필요하면:
```bash
# 로컬(또는 쿼터 여유 있을 때)에서 Neon 덤프 — ⚠️ Neon 전송 쿼터 초과 중이면 월 리셋 후/일시 업그레이드 후 실행
pg_dump "$NEON_DATABASE_URL" --no-owner --no-privileges -Fc -f webdex-neon.dump
# OCI Postgres로 복원(VM의 127.0.0.1:5432 로 SSH 터널 또는 VM에서 직접)
pg_restore --no-owner --no-privileges -d "$OCI_DATABASE_URL" webdex-neon.dump
```
리뷰는 클라이언트 localStorage에도 남아 점진 복구되므로, 데이터 이관 없이 빈 DB로 시작해도 서비스는 동작한다.

## 7. 크롤 + 백업 cron + git push 키
```bash
# git push용 deploy key(쓰기 권한) 생성 후 GitHub repo → Deploy keys 등록(Allow write)
ssh-keygen -t ed25519 -f ~/.ssh/webdex_deploy -N ""
cat ~/.ssh/webdex_deploy.pub   # → GitHub Deploy keys 에 추가(write)
git -C /opt/webdex remote set-url origin git@github.com:blue45f/webtoon-index.git
git -C /opt/webdex config user.name "webdex-oci"; git -C /opt/webdex config user.email "oci@webdex"

crontab -e
# 매일 04:00 KST 크롤→검증→커밋→배포→알림
0 19 * * *  bash /opt/webdex/deploy/oci/crawl-update.sh >> /var/log/webdex-crawl.log 2>&1
# 매일 03:30 KST DB 백업(14개 로테이션)
30 18 * * * bash /opt/webdex/deploy/oci/backup-db.sh >> /var/log/webdex-backup.log 2>&1
```

## 8. Vercel을 OCI API로 전환 (선택적 rewrite — OCI-fit)
**고볼륨·캐시 가능한 엔드포인트는 Vercel 엣지에 남기고, DB가 필요한 동적 엔드포인트만 OCI로** 보낸다.
`/api/cover`(표지 프록시, `<img>`로 매 표지 호출 → 엣지 30일 캐시)와 `/title/:slug`→`/api/og`(공유 미리보기)를
전부 OCI로 보내면 CDN 엣지 캐시를 잃어 성능·대역폭이 나빠진다. 순서가 중요(구체 규칙 먼저):
```jsonc
"rewrites": [
  { "source": "/api/cover", "destination": "/api/index" },                  // Vercel 유지(엣지 캐시 이미지 프록시)
  { "source": "/title/:slug", "destination": "/api/og?slug=:slug" },        // Vercel 유지(OG HTML)
  { "source": "/api/(.*)", "destination": "https://api.example.com/api/$1" },// OCI(리뷰·커뮤니티·피드백·인증 등 DB 동적)
  { "source": "/(.*)", "destination": "/index.html" }                       // SPA
]
```
참고: home·calendar·search·ranking 등은 클라이언트(catalog-static.ts)가 가로채 네트워크를 안 타므로 어디로
rewrite 하든 무관하다. 실제 네트워크를 타는 동적 fetch(리뷰·커뮤니티·인증)만 OCI로 가면 된다.
커밋 → Vercel 재배포. 그 뒤 **인증 콜백 동작 확인**(Google/Kakao OAuth redirect/callback이 Vercel 도메인
기준으로 정상인지 — 필요 시 각 콘솔의 redirect URI 점검). `api/index.js`는 cover/og 처리로 계속 사용된다.

## 9. 컷오버 / 롤백
- 컷오버: §8 적용 후 리뷰 작성·로그인·커뮤니티 글쓰기 E2E 확인.
- 롤백: `vercel.json` rewrite를 `/api/index` 로 되돌리고 재배포 → 즉시 기존 서버리스+Neon 경로 복귀.

## 부록 A. OCI CLI 로 프로비저닝 자동화(선택)
콘솔 대신 자동화하려면 로컬에 OCI CLI를 설치/인증한다(이 명령들은 사용자가 직접 실행 — 대화형 인증 필요):
```bash
brew install oci-cli
oci session authenticate         # 브라우저 로그인 → ~/.oci/config 생성
```
인증 후에는 `oci compute instance launch ...`(이미지·shape·subnet·cloud-init 지정)로 §1을 스크립트화할 수 있다. CLI가 인증되면 이 런북의 §1~§2를 CLI 명령으로 만들어 드릴 수 있음.
