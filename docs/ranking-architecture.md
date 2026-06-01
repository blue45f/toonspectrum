# Ranking architecture

WEBDEX ranking has two separate responsibilities:

1. Server catalog ranking: deterministic scoring over the internal title catalog.
2. Live signal correction: short-lived public ranking signals from external platforms.

The UI must never compute ranking order from `lib/data` directly. Client surfaces should call `/api/ranking` and render the returned `items`, `meta`, and `insights`.

## Runtime contract

- Route: `GET /api/ranking`
- Controller: `apps/api/src/modules/catalog/catalog.controller.ts`
- Service boundary: `apps/api/src/modules/catalog/catalog.service.ts`
- Cache policy: `Cache-Control: no-store, max-age=0`
- Live source adapter: `lib/server/live.ts`
- Formula source: `lib/ranking.ts`

The Vite client reads ranking data through the Nest API proxy. The server service owns query normalization, catalog filtering, live signal matching, and reliability metadata so browser components do not duplicate ranking logic.

## 실시간 갱신 전략 (Real-time refresh strategy)

라이브 랭킹 반영은 `on-demand` + `preload`의 혼합 전략입니다.

1. **요청 기반 SWR (stale-while-revalidate)**
   - 기본적으로 `/api/ranking`은 라이브 캐시 시그니처(`day|limit|sources`)를 기준으로 TTL 검증 후 반환합니다.
   - 캐시가 유효하면 즉시 반환.
   - 캐시가 stale해지면(만료 이후) 기존 캐시를 즉시 반환하고, 백그라운드에서 `forceRefresh`를 실행해 다음 요청을 위해 갱신합니다.
   - 클라이언트는 `refresh=true` 쿼리로 강제 동기 갱신을 요청할 수 있습니다.

2. **주기적 사전 갱신 (scheduler preload)**
   - API 서비스 기동 시 `startLiveRankingScheduler()`가 실행되며, 현재 구현에선 `getLiveRanking(..., forceRefresh: true)`를 기반으로 갱신합니다.
   - 현재 갱신 동작은 모드 기반입니다.
     - `fixed`: 고정 주기 갱신.
     - `adaptive`: 요청 수요가 많으면 촉진, 유휴 시 완화.
     - `off`: 스케줄러 비활성, 요청 기반 갱신만 동작.
   - 이렇게 해서 실제 요청이 몰리지 않아도 캐시가 오래 떨어져 있지 않도록 유지합니다.
   - 스케줄러는 가드/단일타이머로 중복 실행을 방지하고, 갱신 실패 누적 시 backoff가 걸립니다.

3. **폴백 일관성**
   - 라이브 신호 실패/부재 시 산식 기반 폴백으로 동작을 중단하지 않습니다.
   - `meta.source`, `meta.reliability`, `sourceStatuses`로 폴백/장애 원인을 UI에 노출해 신뢰 추론을 가능하게 합니다.

## 운영 가이드: 계속 갱신(Always-on) 구성

항상 최신랭킹을 운영하려면 아래 순서대로 운영하면 됩니다.

1. 운영 모드 선택
   - 실시간성 우선: `WEBTOON_LIVE_REFRESH_MODE=adaptive`
   - 안정성/예측성 우선: `WEBTOON_LIVE_REFRESH_MODE=fixed`
   - 비용 통제/외부 블로킹 회피: `WEBTOON_LIVE_REFRESH_MODE=off`

2. 값 구성
   - `adaptive` 권장 시작점:
     - `WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS=120`
     - `WEBTOON_LIVE_REFRESH_BURST_SECONDS=60`
     - `WEBTOON_LIVE_REFRESH_IDLE_SECONDS=600`
     - `WEBTOON_LIVE_REFRESH_DEMAND_WINDOW_SECONDS=120`
     - `WEBTOON_LIVE_DEMAND_THRESHOLD=4`
   - `fixed`는 `WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS`만 의미 있습니다.

3. 운영 점검 주기(권장 5~10분)
   - `/api/ranking/health`에서 `okSources`가 0이면 외부 접근 장애로 간주.
   - `/api/ranking` 응답의 `meta.liveRefreshPlan.mode/running/nextRefreshInSeconds`가 갱신되는지 확인.
   - `meta.liveRefreshPlan.consecutiveFailures` 또는 `meta.live.matched`, `meta.live.fetched` 추세를 추적해 과도한 폴백이 있는지 점검.

4. 비정상 대응
   - `meta.liveRefreshPlan.consecutiveFailures >= 3` 구간이 누적되면 `adaptive`를 `fixed`로 바꾸고 `interval`을 완화.
   - 동일 증상이 계속되면 `off`로 전환해 사용자 요청 기반 갱신만 유지.
   - 외부 차단이 의심되면 `TIMEOUT_MS` 및 UA/Referer 헤더 정책 재점검.

### 계속 갱신 운영 Runbook (Always-on Playbook)

- **운영 목표 정의**
  - 실시간성(신규 급등 반영 속도) 중심인지, 안정성(실패 누적 시 서비스 지속) 중심인지, 호출량 통제(차단/요금) 중심인지 먼저 정한다.
  - API에서 확인할 1차 지표는 `meta.live.*`, `meta.reliability.*`, `meta.liveRefreshPlan.*`이다.

- **배포 시 기본 정책**
  - 단일 API 프로세스 기준에서는 `WEBTOON_LIVE_REFRESH_MODE=adaptive`를 기본으로 두고 시작한다.
  - 멀티 인스턴스 운영 시는 스케줄러를 중복 실행하지 않도록 1개 인스턴스만 `adaptive`/`fixed`로 두고, 나머지는 `off`를 권장한다.

- **권장 환경값 템플릿**

  - 소규모/저부하
    ```env
    WEBTOON_LIVE_REFRESH_MODE=fixed
    WEBTOON_LIVE_TTL_SECONDS=180
    WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS=240
    ```
  - 일반 운영
    ```env
    WEBTOON_LIVE_REFRESH_MODE=adaptive
    WEBTOON_LIVE_TTL_SECONDS=120
    WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS=120
    WEBTOON_LIVE_REFRESH_BURST_SECONDS=60
    WEBTOON_LIVE_REFRESH_IDLE_SECONDS=600
    WEBTOON_LIVE_REFRESH_DEMAND_WINDOW_SECONDS=120
    WEBTOON_LIVE_DEMAND_THRESHOLD=4
    ```
  - 피크 대응
    ```env
    WEBTOON_LIVE_REFRESH_MODE=adaptive
    WEBTOON_LIVE_TTL_SECONDS=90
    WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS=90
    WEBTOON_LIVE_REFRESH_BURST_SECONDS=30
    WEBTOON_LIVE_REFRESH_IDLE_SECONDS=300
    WEBTOON_LIVE_REFRESH_DEMAND_WINDOW_SECONDS=90
    WEBTOON_LIVE_DEMAND_THRESHOLD=3
    ```

- **운영 점검(권장 5~10분)**
  - `GET /api/ranking/health`에서 `okSources`, `status`, `refreshPlan.consecutiveFailures` 추적
  - `GET /api/ranking?axis=popular&period=daily&platform=all&limit=20`에서 `meta.live.matched`, `meta.live.fetched`, `meta.liveRefreshPlan.demandSignals` 추적
  - `GET /api/ranking?...&refresh=true`로 `fetchedAt`/`fetched`/`nextRefreshAt` 즉시 반응 여부 확인

- **예방적 대응 규칙**
  - `refreshPlan.consecutiveFailures >= 3` 또는 `meta.liveRefreshPlan.consecutiveFailures >= 3`:
    - 1차: `adaptive`를 `fixed`로 바꾸고 간격을 완화
    - 2차: `off`로 전환해 요청 기반 갱신만 유지
  - `health.okSources == 0` 반복:
    - 소스 블로킹/타임아웃/네트워크 장애 점검
    - 원인 미해결 시 임시 `off` 운영을 유지
  - `demandSignals`가 과도하게 낮으면서 주기 요청이 너무 잦은 경우:
    - `demandThreshold` 상향 또는 `BURST`/`IDLE` 조절

- **실제 운영 체크 커맨드**
  ```bash
  curl -s http://127.0.0.1:4001/api/ranking/health
  curl -s "http://127.0.0.1:4001/api/ranking?axis=popular&period=daily&platform=all&limit=20"
  curl -s "http://127.0.0.1:4001/api/ranking?axis=popular&period=daily&refresh=true&limit=20"
  ```

### 갱신 파라미터(환경 변수)

- `WEBTOON_LIVE_TTL_SECONDS` (기본 `120`, 최소 `30`, 최대 `1800`)  
  라이브 캐시 TTL. 실제로는 `live.ttlSeconds`로 API 응답에 노출됩니다.
- `WEBTOON_LIVE_REFRESH_MODE` (`off` | `fixed` | `adaptive`)
- `WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS` (기본 `min(300, max(60, TTL))`, 최소 `30`, 최대 `1800`)  
  `fixed` 모드 주기 갱신 간격.
- `WEBTOON_LIVE_REFRESH_BURST_SECONDS` (기본 `max(30, interval*0.5)`)  
  `adaptive`에서 요청량이 임계치 초과일 때 단축 간격.
- `WEBTOON_LIVE_REFRESH_IDLE_SECONDS` (기본 `min(900, max(120, interval*4))`)  
  `adaptive`에서 요청이 줄었을 때 완화 간격.
- `WEBTOON_LIVE_REFRESH_DEMAND_WINDOW_SECONDS` (기본 `120`, 30~900)  
  수요 집계 윈도우.
- `WEBTOON_LIVE_DEMAND_THRESHOLD` (기본 `4`, 1~40)  
  최근 창 내 임계치 도달 시 burst 적용.
- 라이브 fetch timeout: 현재 코드 상수 `3500ms`.
- 클라이언트 폴링은 `meta.live.ttlSeconds`를 우선 사용하며, 라이브 미사용 축은 `meta.refreshSeconds`(60초 기본)를 사용합니다.
- 수동 갱신: `?refresh=true` 또는 `?refresh=1`이면 즉시 강제 갱신.

## Ranking flow

1. Normalize query parameters.
2. Filter the server catalog by type, genre, platform, status, pricing, and minimum rating.
3. Run the transparent formula with `rankBy`.
4. For daily or weekly `popular` and `trending`, request live Naver Webtoon and Kakao Webtoon signals.
5. Match live items to local title IDs.
6. Add live boost only to matched local titles.
7. Return ranked items with evidence metadata.

Unmatched external live items do not enter the unified ranking because WEBDEX cannot show full metadata, reviews, platform routing, or detail pages for them. This protects ranking integrity.

## Reliability model

The API returns `meta.reliability` for every request.

- `confidence`: 0 to 100 interpretation score.
- `level`: `high`, `medium`, or `low`.
- `fallbackReason`: explains why the API used formula-only ranking when applicable.
- `estimatedShare`: share of ranked items whose core stats are estimated.
- `liveCoverage`: share of ranked items matched to live source signals.
- `sourceStatuses`: per-source result, fetched count, latency, and failure message.

Confidence is not another ranking factor. It is a UI disclosure layer that tells users how strongly to trust the current ordering.

## UI rules

- Always show source type: `Live API` or `Formula API`.
- Always show confidence and evidence chips near the ranking controls.
- Show row-level `LIVE #n` badges only for titles directly matched to a live source.
- Do not present a formula fallback as live data.
- If live sources fail, keep ranking usable and explain the fallback.

## 실시간성 교차 검증 체크리스트

랭킹의 실시간 반영이 실제로 동작하는지 확인하려면 아래를 점검하세요.

- 동일 조건에서 다음을 순차 호출:
  - `GET /api/ranking?axis=popular&period=daily&limit=20`
  - `GET /api/ranking?axis=popular&period=daily&refresh=true&limit=20`
- 두 응답에서 `meta.live.fetchedAt`, `meta.live.nextRefreshAt`, `meta.reliability.matched`, `meta.live.matched`가 갱신되었는지 비교.
- `meta.source === "live-api"`이면서 `meta.sourceStatuses`의 `ok` 값이 실제 소스별 성공률을 반영하는지 확인.
- UI에서 `CONFIDENCE`/`EVIDENCE` 텍스트가 폴백 케이스에서 감소하는지 확인.
- 수동 갱신 직후 같은 클라이언트 필터에서 순위가 급변하면 live/포뮬러 보정이 실제로 반영된 것으로 간주.

## Data boundaries

- `lib/data/*` is the current server catalog source.
- `lib/server/*` is the server service boundary.
- `apps/api/src/modules/catalog/*` is the external and client-facing data boundary.
- `components/*` must not import `TITLES` or `SEED_REVIEWS`.

If a future source becomes available, replace the server catalog boundary first. Avoid pushing raw provider-specific data into client components.

## Runtime configuration

- `WEBTOON_LIVE_TTL_SECONDS`
- `WEBTOON_LIVE_REFRESH_MODE`
- `WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS`
- `WEBTOON_LIVE_REFRESH_BURST_SECONDS`
- `WEBTOON_LIVE_REFRESH_IDLE_SECONDS`
- `WEBTOON_LIVE_REFRESH_DEMAND_WINDOW_SECONDS`
- `WEBTOON_LIVE_DEMAND_THRESHOLD`

`apps/api/src/modules/catalog/catalog.service.ts`는 서비스 시작 시 라이브 스케줄러를 시작해 초기 요청 전 캐시 예열을 수행합니다.

## Quality gates

Run these after ranking changes:

```bash
pnpm lint
pnpm test
pnpm build
curl -s 'http://localhost:4001/api/ranking?axis=popular&period=daily&limit=3'
curl -s 'http://localhost:4001/api/ranking?axis=popular&period=daily&refresh=true&limit=3'
```

Manual UI checks:

- Desktop ranking page shows `CONFIDENCE` and `EVIDENCE`.
- Mobile ranking page has no horizontal overflow.
- Live-matched rows show `LIVE #n`.
- Console has no warnings or errors during initial render.
