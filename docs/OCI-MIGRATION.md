# ToonSpectrum — Oracle Cloud(OCI) 선택형 폴백 런북 (보관됨)

> **운영 권위가 아닌 보관 자료입니다.** 이 디렉터리는 현재 production을 설명하지 않으며,
> 장애 복구 실험이나 명시적으로 승인된 장기 실행 컨테이너 폴백에만 사용합니다. OCI 무료 등급,
> 리전 가용성, 한도와 과금은 변경될 수 있으므로 `Always-Free`, 영구 무료 또는 비용 $0을 전제로
> production을 전환하지 않습니다.

2026-08-02 기준 권위 배치는 다음과 같습니다.

| 목적 | 현재 권위 | 상태 |
| --- | --- | --- |
| SPA와 bounded HTTP API | Vercel | production |
| 관계형 데이터·migration 원장 | Neon/호환 PostgreSQL | `0001`~`0025` checksum 원장·capability 검증 완료 |
| Studio ephemeral realtime | Cloudflare Durable Objects | `workers.dev` origin 활성, custom hostname/DNS/TLS는 별도 대기 |
| 분산 제한·coordination | Upstash | production 활성 |
| 비공개 원본·파생·export object | Supabase private Storage | production 활성 |
| Google OAuth | Vercel 동일 출처 callback | production 수정·검증 완료 |
| AI provider secrets/budget | Vercel production env | 다음 승인 배포 반영 대기 |

OCI를 다시 채택하더라도 위 목적들을 한 VM으로 합치지 않습니다. 해당 workload의 권위와 동일한
인증·ACL·migration·readiness·canary 계약을 먼저 증명한 뒤 **그 목적만** 전환합니다.

## 과거 검토 근거 (현재 운영 사실이 아님)
- **Neon 데이터 전송 쿼터 초과** — 무료 티어 한도를 이미 넘겨 DB 기능(리뷰·커뮤니티·피드백·인증)이 간헐 차단. OCI 자가호스트 Postgres(egress 10TB/월 무료)로 해소.
- **GH 러너 크롤 한계** — 비KR egress라 ~23.4k(novelpia 0)밖에 못 함. OCI **서울/춘천 리전** VM에서 크롤하면 풀 수확(~30k) + cron 자동 갱신.
- 콜드스타트 제거와 API+DB+크롤 통합을 검토했지만, 단일 VM 장애 도메인과 운영 부담 때문에 현재
  production 구조로 채택하지 않았다.

## 현재 권위 아키텍처
```
브라우저 → Vercel(정적 SPA + bounded Nest API) → Neon/PostgreSQL
         ├ Studio realtime → Cloudflare Durable Objects (workers.dev)
         └ private assets → 서명된 API 경계 → Supabase Storage
API coordination/rate-limit → Upstash
```

아래 절차는 이 구조를 설명하지 않습니다. OCI 폴백을 별도 승인한 경우의 재현 가능한 scaffold일
뿐이며, 실행 전 `DEPLOY.md`와 `docs/BACKEND_CAPABILITY_DISTRIBUTION.md`의 현재 계약을 우선합니다.

## 0. 폴백 활성화 전 준비물
- OCI 계정과 실제 tenancy의 현재 quota·billing alert·egress 정책 검토.
- API용 도메인 1개(예: `api.example.com`). 서브도메인이면 충분.
- 로컬에 빌드/검증 완료된 이 레포(`deploy/oci/` 일체 + 스모크 테스트 통과 확인됨).

## 1. ARM 인스턴스 생성 (OCI 콘솔)
1. **Compute → Instances → Create**.
2. Image: **Ubuntu 24.04 (aarch64)**. Shape: **VM.Standard.A1.Flex**. OCPU/RAM은 현재
   tenancy quota와 billing 설정을 직접 확인해 결정한다. 저장소 문서는 무료 용량을 보장하지 않는다.
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
cd /opt/toonspectrum/deploy/oci
cp .env.example .env && nano .env     # DOMAIN, DB/OAuth/session 등 폴백 목적에 필요한
                                      # 최소 값만 승인된 secret manager에서 주입
```

## 5. DB bootstrap/upgrade + 스택 기동

운영 DB에는 `drizzle-kit push`, 개별 migration SQL 수동 실행, 앱 시작 시 DDL을 사용하지 않는다.
정본은 `scripts/production-database-migrations.manifest`와
`toonspectrum_ops.deployment_migration` checksum 원장이다. API/Caddy는 capability 검증이 끝난
뒤에만 공개한다.

먼저 DB와 API 이미지만 준비하되 writer는 시작하지 않는다.

```bash
cd /opt/toonspectrum/deploy/oci
docker compose up -d db
docker compose build api
```

### 5-A. 완전히 빈 OCI DB 최초 bootstrap

빈 DB의 base schema 구성은 기존 운영 DB upgrade와 별개의 승인 작업이다. cloud-init은 이 경로에
필요한 `postgresql-client`를 설치한다. DB가 외부에 공개되지 않고 모든 Studio writer가 중지된
상태에서 먼저 읽기 전용 계획을 실행한다.

```bash
cd /opt/toonspectrum
export MIGRATION_DATABASE_URL='<OCI direct migrator URL>'
release_sha="$(git rev-parse HEAD)"
pnpm db:bootstrap:production-empty -- \
  --plan \
  --runtime-database-role toonspectrum_runtime \
  --release-sha "$release_sha"
```

계획이 올바른 DB, 0개의 다른 client connection, 안전하게 분리된 runtime role을 확인한 뒤에만
실행한다. runtime role이 없으면 `BOOTSTRAP_RUNTIME_DATABASE_PASSWORD`에 앱의 별도 runtime DB
비밀번호를 제공한다. 이 값과 direct URL은 로그에 출력되지 않는다.

```bash
export BOOTSTRAP_RUNTIME_DATABASE_PASSWORD='<runtime-role-secret-if-missing>'
pnpm db:bootstrap:production-empty -- \
  --execute \
  --runtime-database-role toonspectrum_runtime \
  --release-sha "$release_sha" \
  --confirmation BOOTSTRAP-EMPTY-TOONSPECTRUM-DATABASE
unset BOOTSTRAP_RUNTIME_DATABASE_PASSWORD MIGRATION_DATABASE_URL
```

명령은 reviewed historical baseline을 구성하고 `adopt` 모드로 checksum 원장을 초기화한 뒤 실제
pending migration을 적용하며, apply 재실행과 production capability verifier까지 성공해야 완료로
판정한다. verifier는 runtime role의 role membership, DB/public DDL 권한, DB·extension·public
relation 소유권을 거부하고, migration ledger의 PUBLIC/runtime 접근 차단, 0024 object-storage
컬럼 단위 권한 및 0025 인증 lifecycle 계약을 migration runner와 같은 기준으로 확인한다. 대상이
비어 있지 않으면 자동 삭제하지 않고 중단한다. 백업을 확인한 폐기 가능 DB만
계획에 표시되는 `RESET-AND-BOOTSTRAP-TOONSPECTRUM-DATABASE:<정확한 DB명>` 토큰을 별도
`--reset-confirmation`으로 제공할 수 있다. 이 토큰은 `public`과 `toonspectrum_ops`의 데이터 및
객체를 삭제하므로 기존 운영 DB upgrade에는 사용하지 않는다. 원장 초기화가 끝나기 전에는 API를
시작하지 않는다.

실행 경로는 사전 drain 확인 후 runtime role을 임시 `NOLOGIN`으로 전환하고, 전환 직후 연결 수를
재확인한 동안에만 schema와 migration을 변경한다. `PUBLIC CONNECT` 기본값은 바꾸지 않는다.
포착 가능한 오류에서는 `finally`로 `LOGIN`을 복원한 뒤 최종 verifier가 역할 경계를 다시
검증한다. VM 강제 종료 등으로 복원 단계 자체가 실행되지 못했다면 이는 의도적인 fail-closed
상태다. bootstrap 프로세스가 없고 DB client가 0임을 확인한 운영자만 direct migrator 연결에서
`ALTER ROLE toonspectrum_runtime LOGIN;`을 실행하고, 다시 `--plan`과 capability verifier를 통과시킨다.
계획 모드는 이 게이트를 활성화하지 않으며 완전히 읽기 전용이다.

Neon의 **전체 DB archive를 복제할 예정이면 이 bootstrap을 먼저 실행하지 않는다.** §6-A처럼
완전히 빈 대상 DB에 full archive를 먼저 복원한 뒤, 복원된 원장 유무에 맞춰 `adopt` 또는 `apply`를
실행한다. 이 bootstrap은 새 서비스 시작 또는 §6-B의 data-only 이관 경로에만 사용한다.

### 5-B. 기존 OCI DB upgrade

1. 모든 기존 Studio/API writer를 drain한다.
2. GitHub `production-database` Environment에 direct migrator URL secret
   `PRODUCTION_DATABASE_DIRECT_URL`과 최소 권한 runtime role variable
   `PRODUCTION_RUNTIME_DATABASE_ROLE`을 설정한다.
3. `.github/workflows/production-database-migrations.yml`을 배포할 정확한 40자리 main commit SHA로
   실행한다. 최초 원장 도입만 `adopt`, 이후 배포는 `apply`, 중단 원장 복구만 `repair`를 사용한다.
4. workflow의 exact checksum 원장 및 runtime capability 검증이 통과한 뒤 API/Caddy를 시작한다.

```bash
docker compose up -d api caddy
curl --fail --silent --show-error https://api.example.com/api/health/ready
curl --fail --silent --show-error https://api.example.com/api/config
```

`drizzle-kit push --force`와 numbered SQL 파일의 수동 재실행은 기존 DB upgrade 경로가 아니다.
checksum drift, 중단된 `applying`/`failed` row, 번호 누락, runtime/migrator role 혼용은 모두
fail-closed된다. writer drain, live-lock cutover, retry/rollback 절차는
[`STUDIO-LIVE-LOCK-REVISION-MIGRATION.md`](./STUDIO-LIVE-LOCK-REVISION-MIGRATION.md)를 따른다.

## 6. DB 데이터 이전 (Neon → OCI) — 선택

writer를 중지한 maintenance window에서 아래 두 경로 중 **정확히 하나만** 선택한다. full archive를
§5-A로 이미 bootstrap한 schema 위에 복원하면 relation 충돌 또는 부분 복원이 발생하므로 금지한다.

### 6-A. 전체 DB 복제 — 빈 대상에 full restore 후 원장 검증

대상 DB에는 application relation이 하나도 없어야 한다. §5-A를 실행하지 않은 새 DB임을 확인한 뒤
full archive를 한 transaction으로 복원한다.

```bash
# Neon 전송 쿼터가 충분할 때 실행
pg_dump "$NEON_DATABASE_URL" --no-owner --no-privileges -Fc -f toonspectrum-neon.dump

# 결과가 null이어야 한다. relation이 있으면 중지하고 새 빈 DB를 준비한다.
psql "$OCI_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "SELECT to_regclass('public.creator_work')"

pg_restore --exit-on-error --single-transaction \
  --no-owner --no-privileges \
  -d "$OCI_DATABASE_URL" toonspectrum-neon.dump
```

복원된 원장에 historical adoption marker가 없다면 정확한 release SHA로 workflow `adopt`를 한 번
실행한다. 원장과 marker가 함께 복원되었다면 `adopt`를 재실행하지 않고 `apply`를 실행한다. 두 경우
모두 capability verifier와 exact checksum 원장 검증을 통과한 뒤 writer를 재개한다.

### 6-B. 이미 bootstrap한 대상 — application data-only restore

§5-A와 capability verifier가 끝났고 application table이 비어 있는 대상에만 사용한다. migration
원장과 lock은 대상의 정본이므로 source archive에서 제외한다.

```bash
pg_dump "$NEON_DATABASE_URL" --data-only --exclude-schema=toonspectrum_ops \
  --no-owner --no-privileges -Fc -f toonspectrum-neon-data.dump
pg_restore --data-only --exit-on-error --single-transaction \
  --no-owner --no-privileges \
  -d "$OCI_DATABASE_URL" toonspectrum-neon-data.dump
```

복원 후 workflow `apply`와 capability verifier를 다시 실행하고 writer를 재개한다. 충돌을 무시하는
옵션, `--clean`, schema full restore를 이 경로에 추가하지 않는다. 클라이언트 저장소를 운영 데이터
복구 수단으로 간주하지 않는다.

## 7. 크롤 + 백업 cron + git push 키
```bash
# git push용 deploy key(쓰기 권한) 생성 후 GitHub repo → Deploy keys 등록(Allow write)
ssh-keygen -t ed25519 -f ~/.ssh/toonspectrum_deploy -N ""
cat ~/.ssh/toonspectrum_deploy.pub   # → GitHub Deploy keys 에 추가(write)
git -C /opt/toonspectrum remote set-url origin git@github.com:blue45f/toonspectrum.git
git -C /opt/toonspectrum config user.name "toonspectrum-oci"; git -C /opt/toonspectrum config user.email "oci@toonstudio.cloud"

crontab -e
# 매일 04:00 KST 크롤→검증→커밋→배포→알림
0 19 * * *  bash /opt/toonspectrum/deploy/oci/crawl-update.sh >> /var/log/toonspectrum-crawl.log 2>&1
# 매일 03:30 KST DB 백업(14개 로테이션)
30 18 * * * bash /opt/toonspectrum/deploy/oci/backup-db.sh >> /var/log/toonspectrum-backup.log 2>&1
```

## 8. Vercel을 OCI API로 전환 (보관된 비기본 절차)

현재 production에서는 이 rewrite를 사용하지 않습니다. exact workload 계약, OAuth/session/CSRF,
CORS, migration identity, observability, 용량과 장애 복구 canary를 새 OCI 배포에서 다시 증명하고
release 승인을 받은 경우에만 적용합니다.
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

## 9. 선택형 컷오버 / 복구
- 컷오버: §8 적용 후 인증·session/CSRF·저장·Studio ACL·readiness E2E와 provider canary 확인.
- 복구: OCI 목적 라우팅만 제거하고 마지막으로 승인된 Vercel+Neon release로 되돌린다. DB를 이중
  writer로 두지 않으며, 데이터 권위 전환에는 별도 drain·reconciliation 절차가 필요하다.

## 10. Studio 음성 TURN 데이터 플레인(기본 비활성·별도 선택)

production 기본값은 `STUDIO_LIVE_VOICE_ENABLED=false`입니다. 음성은 현재 핵심 Studio 계약이
아니며 OCI 폴백을 띄운다고 함께 활성화되지 않습니다. 비용·개인정보·abuse·relay quota 승인과
실제 forced-relay canary를 별도로 통과한 배포에서만 아래 보관 절차를 사용합니다.

Nest API는 짧은 수명의 TURN 자격증명만 발급하고 미디어를 릴레이하지 않는다. 운영 음성 작업실은
공인 고정 IP·전용 DNS·TLS 인증서·UDP relay 포트를 가진 coturn/관리형 TURN이 별도로 필요하다.
저장소의 `deploy/coturn` 스택은 기본 비활성이며 `--profile turn`을 명시해야만 시작한다.

같은 OCI VM을 사용할 때 VCN Security List와 호스트 방화벽에 TCP/UDP 3478, TCP/UDP 5349,
UDP 49160–49259를 추가하고, 443은 기존 Caddy가 계속 소유하게 둔다. 실제 변수, secret 생성·교체,
TLS 갱신, 외부 smoke와 forced-relay 브라우저 승인 절차는
[`deploy/coturn/README.md`](../deploy/coturn/README.md)를 따른다. VM 한 대에 API·DB·TURN을 함께
두는 구성은 비용 최적화일 뿐 고가용성이 아니므로 장애 도메인과 egress 한도를 별도로 감시한다.

## 부록 A. OCI CLI 로 프로비저닝 자동화(선택)
콘솔 대신 자동화하려면 로컬에 OCI CLI를 설치/인증한다(이 명령들은 사용자가 직접 실행 — 대화형 인증 필요):
```bash
brew install oci-cli
oci session authenticate         # 브라우저 로그인 → ~/.oci/config 생성
```
인증 후에는 `oci compute instance launch ...`(이미지·shape·subnet·cloud-init 지정)로 §1을 스크립트화할 수 있다. CLI가 인증되면 이 런북의 §1~§2를 CLI 명령으로 만들어 드릴 수 있음.
