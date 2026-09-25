# 최소 비용·수동 전용 배포 정책

결정일: 2026-09-15 · 결정자: 저장소 소유자 · 범위: ToonSpectrum 운영 인프라 전체.
이 문서는 과거의 main 자동 배포, `[deploy]` 예외, Vercel 중심 릴리스 지침을 대체한다.

## 운영 권위

| 배포 단위 | 기본 운영 권위 | 비고 |
|---|---|---|
| SPA·정적 카탈로그·일반 에셋 | Cloudflare Static Assets | 정적 요청은 Worker 실행량을 사용하지 않는다. |
| 동적 경로 게이트웨이·edge liveness | Cloudflare Worker | `/api/health/live`는 Core API를 깨우지 않는다. |
| 대형 불변 파일 | 압축 Static Assets + R2 | Range 요청만 R2 원본을 사용한다. |
| Core API | Render `toonspectrum-core-api` | `API_RUNTIME_ROLE=full`, 수동 release, scale-to-zero. |
| 임시 실시간 조정 | Cloudflare Durable Objects | presence·cursor·comment·signaling. |
| PostgreSQL 원장 | Neon/호환 PostgreSQL | migration은 별도 승인형 single writer. |

## 변하지 않는 기본 원칙

PR 생성·병합·브랜치 정리는 배포 승인이 아니다. 사용자가 배포를 명시적으로 승인해야 한다.
자동 Git 빌드, 운영 배포, Preview, Deploy Hook, push/cron/workflow_run 배포를 활성화하지 않는다.
각 workload는 하나의 쓰기 권위만 가지며 공급자 장애를 이유로 다른 DB나 API에 자동 이중 쓰기하지 않는다.
유료 플랜, 유료 failover, 상위 빌드 머신으로 자동 승격하지 않는다.

## 기본 수동 릴리스 순서

1. 승인한 정확한 40자리 `main` SHA와 변경 배포 단위를 기록한다.
2. 필수 CI, migration manifest, 보안·라이선스 검증을 확인한다.
3. DB 변경이 있으면 승인형 migration workflow를 먼저 실행하고 runtime role readiness를 검증한다.
4. Render Core API를 수동 배포하되 아직 Cloudflare의 `CORE_API_ORIGIN`은 변경하지 않는다.
5. 다음 검증을 통과해야 Core API 권위를 전환할 수 있다.

```bash
RENDER_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com \
  pnpm run verify:render-core-origin
```

검증은 `/api/health/live`, `/api/health/ready`, JSON 계약, redirect 부재와 `x-vercel-id` 부재를 확인한다.
무료 Render는 inactivity 후 cold start가 있을 수 있으므로 timeout은 이를 허용하지만 readiness 실패를
성공으로 취급하지 않는다.

6. Cloudflare 정적 배포를 dry-run한 다음 검토된 Core origin으로 한 번 배포한다.

```bash
pnpm run verify:free-infrastructure
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run

export CLOUDFLARE_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

7. 루트, Studio SPA, 정적 카탈로그, edge liveness, Core readiness, 로그인·OAuth callback,
   권한이 필요한 API, R2 Range, realtime reconnect를 검사한다.
8. 릴리스 ID, Worker version, Render deploy ID, SHA와 롤백 대상을 기록한다.

## Render Core API 경계

- `render.yaml`의 `toonspectrum-core-api`는 `autoDeployTrigger: off`를 유지한다.
- build/start에서 migration이나 `drizzle-kit push`를 실행하지 않는다.
- 운영 비밀은 Render encrypted environment 또는 root `.env.local` Secret File에 저장한다.
- 비밀값은 터미널, PR, 로그, GitHub summary에 출력하지 않는다.
- `DATABASE_URL`, 인증 서명키와 OAuth state key가 준비되지 않으면 트래픽을 전환하지 않는다.
- 무료 인스턴스의 cold start와 월 사용 제한은 기능 저하가 아니라 운영 등급 제약이다. SLA가 필요할 때만
  별도 승인으로 always-on 호스트로 승격한다.

## Cloudflare 경계

- Static Assets가 가능한 요청을 Worker로 보내지 않는다.
- `/api/health`와 `/api/health/live`는 edge에서 `no-store`로 응답한다.
- `/api/health/ready`는 반드시 Core API의 DB/schema readiness를 확인한다.
- 대형 파일은 압축 sidecar와 R2가 모두 실패한 경우에만 명시적으로 설정한 HTTP fallback을 사용한다.
  `LARGE_ASSET_ORIGIN`이 비어 있으면 Core API를 파일 서버처럼 깨우지 않는다.
- 운영 배포는 검토된 `main`, clean worktree, 명시적 approval 문자열이 모두 필요하다.

## Vercel 제거 상태

저장소의 Vercel 런타임, 서버리스 진입점, 퇴역 배포 구성, GitHub 배포 workflow와 관련 검증 코드는
제거되어 정상 배포나 비상 롤백에 사용되지 않는다. Cloudflare Static Assets/Worker와 Render의
직전 검증 version이 각각의 롤백 단위다. Vercel 프로젝트, custom domain 연결, 팀 플랜과 잔여
배포 삭제는 코드 변경과 분리한 운영 작업으로 수행한다.

## 실패·롤백

배포 실패를 반복 실행하지 말고 원인을 먼저 조사한다. Core API 전환 실패 시 Cloudflare의
`CORE_API_ORIGIN`만 직전 검증 origin으로 되돌리고 정적/R2 계층은 유지한다. Worker 장애는 zone route의
fail-open 또는 직전 Worker version rollback을 사용한다. DB migration, secret rotation, 데이터 삭제,
DNSSEC·nameserver 변경은 일반 애플리케이션 배포 승인에 포함되지 않는다.

## 릴리스 기록

승인 시각·범위, 실행자, 정확한 SHA, CI, migration 상태, Render deploy ID, Worker version, R2 검증,
배포 후 smoke test, 롤백 대상과 재시도 여부를 남긴다. 비밀 값은 기록하지 않는다.
무료 플랜의 한도와 cold start를 수용하는 정책이며 무제한 트래픽·SLA·영구 0원을 보장한다는 뜻은 아니다.
