# Ranking architecture

ToonSpectrum ranking has two separate responsibilities:

1. Server catalog ranking: deterministic scoring over the internal title catalog.
2. Live signal correction: short-lived public ranking signals from external platforms.

The UI must never compute ranking order from a client-side catalog directly. Client surfaces should call `/api/ranking` and render the returned `items`, `meta`, and `insights`.

## Runtime contract

- Route: `GET /api/ranking`
- Controller: `apps/api/src/modules/catalog/catalog.controller.ts`
- Service boundary: `apps/api/src/modules/catalog/catalog.service.ts`
- Cache policy: `Cache-Control: no-store, max-age=0`
- Live source adapter: `lib/server/live.ts`
- Formula source: `lib/ranking.ts`

The Vite client reads ranking data through the Nest API proxy. The server service owns query normalization, catalog filtering, live signal matching, and reliability metadata so browser components do not duplicate ranking logic.

## 서버 카탈로그 갱신 구조

작품 카탈로그는 `lib/data/titles.ts` 같은 정적 파일을 운영 데이터의 주 저장소로 사용하지 않습니다. `lib/data/` seed 모듈은 제거했고, 운영 데이터는 서버가 주기적으로 수집해 DB 스냅샷으로 저장합니다. `lib/server/catalog-store.ts`의 런타임 카탈로그는 최신 `catalog_snapshot`에서만 채워집니다. 스냅샷이 없거나 파싱에 실패하면 빈 카탈로그로 남겨 잘못된 하드코딩 데이터가 노출되지 않게 합니다.

랭킹에 없는 작품도 검색 가능해야 하므로 crawler는 두 레벨로 동작합니다.

- **색인 레벨**: 공개 목록/카탈로그에 있는 작품을 가능한 한 넓게 수집해 검색, 상세 진입, 플랫폼 라우팅에 사용합니다.
- **상세 레벨**: 호출량이 큰 상세 API는 상위 작품 또는 환경변수로 지정한 범위만 보강합니다.
- 랭킹은 색인 전체에 산식을 적용하지만, live 보정은 실제 라이브 소스와 매칭되는 작품에만 적용합니다.

- 저장 테이블: `catalog_snapshot`
  - `snapshot`: 정규화된 `Title[]` JSON
  - `source`, `sourceVersion`, `titleCount`, `isCurrent`
  - `metadata.runHash`, `runId`, `requestedBy`, `triggeredBy`
- 실행 이력: `catalog_ingest_run`
  - `running | success | failed | aborted`
  - 실행 시간, 소요 시간, 작품 수, 에러 메시지, run hash
- 서버 시작 흐름:
  - `CatalogService.onModuleInit()`에서 최신 `catalog_snapshot.isCurrent=true`를 로드
  - DB 스냅샷이 없으면 빈 런타임 카탈로그로 시작
  - 라이브 랭킹 스케줄러와 카탈로그 수집 스케줄러를 분리 실행
- 수집 흐름:
  - `scripts/crawl.mjs --json --no-file` 실행
  - `WEBDEX_SOURCE_IDS` allowlist에 포함된 구현 소스만 실행
  - stdout JSON을 파싱해 `Title[]` 검증
  - 동일 hash면 새 스냅샷을 만들지 않고 메모리 카탈로그만 새로고침
  - 변경 hash면 기존 스냅샷을 `isCurrent=false`로 내리고 새 스냅샷을 current로 저장
- 운영 API:
  - `GET /api/catalog/ingest/status`: current snapshot, 최근 실행 이력, 다음 실행 예정 시각
  - `POST /api/catalog/ingest/run`: 수동 실행. `CATALOG_INGEST_TRIGGER_TOKEN`이 설정되어 있어야 하며, `x-catalog-ingest-token` 또는 body token과 일치해야 합니다.

### 환경 변수

- `CATALOG_INGEST_MODE` (`off` | `fixed`)  
  기본은 `off`. 운영에서 플랫폼별 허용 범위를 확인한 뒤 `fixed`로 켭니다.
- `CATALOG_INGEST_INTERVAL_SECONDS` (기본 `1800`, 최소 `60`)  
  DB 카탈로그 전체 갱신 주기. 랭킹 라이브 보정 TTL과 별도입니다.
- `CATALOG_INGEST_TIMEOUT_MS` (기본 `180000`, 최대 `600000`)  
  한 번의 크롤 작업 제한 시간.
- `CATALOG_INGEST_SCRIPT_MAX_OUTPUT_MB`  
  JSON stdout 최대 버퍼.
- `CATALOG_INGEST_TRIGGER_TOKEN`  
  수동 실행 필수 토큰. 미설정이면 수동 실행 API는 거부됩니다.
- `WEBDEX_CRAWL_DELAY_MS`, `WEBDEX_WEBTOON_CAP`, `WEBDEX_WEBTOON_DETAIL_CAP`, `WEBDEX_SERIES_BONUS_CAP`, `WEBDEX_KAKAO_WEBTOON_CAP`, `WEBDEX_LEZHIN_CAP`, `WEBDEX_WEBTOON_FINISHED_PAGES`, `WEBDEX_SERIES_PAGES_PER_GENRE`
  플랫폼별 호출량과 범위를 제한하는 크롤러 안전장치입니다.
  - `WEBDEX_WEBTOON_CAP`은 전체 색인 개수 제한입니다. 비워두면 공개 목록 전체를 색인합니다.
  - `WEBDEX_WEBTOON_DETAIL_CAP`은 별도 상세 API를 호출할 상위 작품 수입니다. 전체 검색성을 유지하면서 외부 호출량을 줄이기 위한 2단계 수집 한도입니다.
- `WEBDEX_SOURCE_IDS`
  실행할 수집 소스 allowlist입니다. 기본값은 `naver-webtoon,naver-series,kakao-webtoon,lezhin`입니다. `all`은 레지스트리 전체를 뜻하지만, 실제 crawler 구현이 없는 소스는 `/api/catalog/ingest/status`의 `sourcePlan.pending`에 남고 실행되지 않습니다.

### 국내 전체 확장을 위한 수집 레지스트리

국내 전체 웹툰/웹소설을 다루기 위해 플랫폼 목록과 실제 crawler 구현을 분리했습니다.

- 레지스트리 파일: `lib/server/catalog-sources.ts`
- 플랫폼 모델: `lib/types.ts`, `lib/platforms.ts`
- 현재 crawler 구현 소스:
  - `naver-webtoon`
  - `naver-series`
  - `kakao-webtoon`
  - `lezhin`
- pending 소스:
  - `kakao-page`, `ridi`, `munpia`, `joara`, `novelpia`, `bomtoon`, `toptoon`, `postype`
  - `mrblue`, `comico`, `toomics`, `bufftoon`, `bookcube`, `onestory`, `peanutoon`, `kyobo`, `yes24`

새 플랫폼을 활성화하는 순서는 아래와 같습니다.

1. `catalog-sources.ts`에 source metadata를 추가하거나 기존 pending 항목을 업데이트합니다.
2. 플랫폼 약관, robots, 공식 API/제휴 피드, 호출량 제한, 성인/유료/UGC 경계를 확인합니다.
3. crawler adapter를 구현하고 `implementation: "crawler"`로 변경합니다.
4. `WEBDEX_SOURCE_IDS`에 해당 source id를 추가합니다.
5. staging에서 `/api/catalog/ingest/status`와 `catalog_ingest_run` 실패율을 확인한 뒤 운영에 반영합니다.

이 구조는 “모든 플랫폼을 한 번에 무차별 크롤”하지 않습니다. 모든 플랫폼을 **수집 가능한 슬롯**으로 등록하되, 법적/운영 검토가 끝난 소스만 실행하는 방식입니다.

### 소스 활성화 승인 게이트

새 소스는 코드에 등록되더라도 바로 실행되지 않습니다. `implementation: "partner-required"` 또는 `"manual"` 상태의 소스는 `/api/catalog/ingest/status`의 `sourcePlan.pending`에만 노출되고 crawler 실행 대상에서 제외됩니다.

운영에서 `"crawler"`로 승격하려면 아래 항목을 모두 통과해야 합니다.

1. **권한/정책 확인**
   - 공개 API, 공식 피드, 제휴 데이터 제공 계약이 있으면 그 경로를 우선합니다.
   - robots.txt, 이용약관, API 약관에서 자동 수집을 금지하거나 제한하면 crawler로 승격하지 않습니다.
   - 로그인, 성인 인증, 결제, CAPTCHA, 앱 전용 API 우회가 필요한 경로는 사용하지 않습니다.

2. **데이터 범위 확인**
   - 작품명, 작가명, 공개 랭킹/평점/조회 수치, 공개 플랫폼 URL, 연재 상태, 연재요일, 공개 태그 등 검색과 랭킹에 필요한 최소 메타데이터만 저장합니다.
   - 본문, 회차 이미지 바이너리, 댓글/리뷰 원문, 개인 식별 가능 데이터, 비공개 유료 수치는 저장하지 않습니다.
   - 외부 리뷰 데이터는 공식 제공 또는 사용자가 ToonSpectrum에 직접 작성한 데이터만 운영 저장소에 넣습니다.

3. **호출량/장애 대응**
   - 플랫폼별 지연, cap, timeout을 환경변수로 둡니다.
   - 429/403/차단 징후가 반복되면 해당 source id를 `WEBDEX_SOURCE_IDS`에서 제거하거나 `CATALOG_INGEST_MODE=off`로 전환합니다.
   - 멀티 인스턴스에서는 카탈로그 수집 스케줄러를 한 인스턴스에서만 실행합니다.

4. **검증/추적**
   - staging에서 최소 3회 이상 성공한 `catalog_ingest_run`과 snapshot hash 안정성을 확인합니다.
   - UI에는 `meta.source`, `meta.reliability`, `sourcePlan`, snapshot `sourceVersion`을 노출해 사용자가 live/산식/폴백을 구분할 수 있게 합니다.
   - 삭제 요청, 플랫폼 차단 요청, 출처 정정 요청을 처리할 운영 경로를 둡니다.

## 법적 리스크 완화 원칙

이 문서는 법률 자문이 아닙니다. 운영 전에는 서비스 목적, 수집 범위, 플랫폼별 약관, robots 정책, 제휴 가능성을 변호사 또는 법무 담당자와 확인해야 합니다. 다만 ToonSpectrum 아키텍처는 아래 원칙을 기본으로 법적/운영 리스크를 낮춥니다.

1. **공식/허용 소스 우선**
   - 공개 API, 공식 랭킹/검색 페이지, 제휴 피드, 정식 데이터 제공 계약을 우선합니다.
   - robots.txt, 이용약관, API 약관에서 금지하거나 제한한 경로는 어댑터를 `enabled=false`로 둡니다.
   - 로그인, 성인 인증, 결제, CAPTCHA, 앱 전용 API 우회는 금지합니다.

2. **저장 범위 최소화**
   - 저장 대상은 검색/랭킹에 필요한 작품 메타데이터, 플랫폼 URL, 공개 수치, 갱신 시각, 출처 메타데이터로 제한합니다.
   - 유료 회차 본문, 이미지 바이너리, 댓글/리뷰 원문, 회차 이미지, 개인 식별 가능 데이터는 수집/저장하지 않습니다.
   - 표지는 바이너리 저장 대신 허용 호스트 프록시 URL만 보관하고, 원 소유자 권리를 침해하지 않도록 삭제 요청 대응 경로를 둡니다.

3. **호출량 통제**
   - `CATALOG_INGEST_MODE=off`가 기본입니다.
   - 운영 갱신은 전체 크롤보다 증분/라이브 신호 우선으로 설계합니다.
   - 최소 지연(`WEBDEX_CRAWL_DELAY_MS`)과 플랫폼별 cap을 두고, 장애/차단 징후가 있으면 스케줄러를 끕니다.

4. **출처와 산정 방식 공개**
   - 각 랭킹 응답은 `meta.source`, `meta.reliability`, `sourceStatuses`를 포함합니다.
   - DB 스냅샷은 `sourceVersion`, `runHash`, `createdAt`을 보존해 어떤 데이터로 순위를 계산했는지 추적할 수 있습니다.
   - 공개되지 않는 수치(완독률, 평가 분포 등)는 추정값으로 표시하고, 실제 공개 수치와 혼동시키지 않습니다.

5. **어댑터 승인 절차**
   - 새 플랫폼 어댑터는 `disabled` 상태로 추가합니다.
   - robots/약관/제휴 가능성 확인, 저장 필드 검토, 호출량 제한, 에러/차단 대응 runbook 작성 후 활성화합니다.
   - 해외 플랫폼은 각 관할권의 데이터베이스권, 저작권, 약관, 개인정보 규제를 별도 검토합니다.

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

Unmatched external live items do not enter the unified ranking because ToonSpectrum cannot show full metadata, reviews, platform routing, or detail pages for them. This protects ranking integrity.

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

- `catalog_snapshot` is the current server catalog source in production.
- `lib/server/catalog-store.ts` is the server-only in-memory runtime catalog store populated from DB snapshots.
- `lib/server/*` is the server service boundary.
- `apps/api/src/modules/catalog/*` is the external and client-facing data boundary.
- `components/*` must not import runtime catalog globals such as `TITLES`; they must use API responses.

If a future source becomes available, replace the server catalog boundary first. Avoid pushing raw provider-specific data into client components.

## Legal / Policy References

Operational review should cite the current text of these sources before enabling a new crawler:

- Korean Copyright Act, including database producer rights: https://www.law.go.kr/법령/저작권법
- Personal Information Protection Act, including collection/use grounds: https://www.law.go.kr/법령/개인정보보호법
- Robots Exclusion Protocol (RFC 9309): https://www.rfc-editor.org/rfc/rfc9309

## Runtime configuration

- `WEBTOON_LIVE_TTL_SECONDS`
- `WEBTOON_LIVE_REFRESH_MODE`
- `WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS`
- `WEBTOON_LIVE_REFRESH_BURST_SECONDS`
- `WEBTOON_LIVE_REFRESH_IDLE_SECONDS`
- `WEBTOON_LIVE_REFRESH_DEMAND_WINDOW_SECONDS`
- `WEBTOON_LIVE_DEMAND_THRESHOLD`
- `CATALOG_INGEST_MODE`
- `CATALOG_INGEST_INTERVAL_SECONDS`
- `CATALOG_INGEST_TIMEOUT_MS`
- `CATALOG_INGEST_SCRIPT_MAX_OUTPUT_MB`
- `CATALOG_CRAWL_SCRIPT`
- `CATALOG_INGEST_TRIGGER_TOKEN`
- `WEBDEX_CRAWL_DELAY_MS`
- `WEBDEX_WEBTOON_CAP`
- `WEBDEX_WEBTOON_DETAIL_CAP`
- `WEBDEX_SERIES_BONUS_CAP`
- `WEBDEX_KAKAO_WEBTOON_CAP`
- `WEBDEX_LEZHIN_CAP`
- `WEBDEX_SOURCE_IDS`

`apps/api/src/modules/catalog/catalog.service.ts`는 서비스 시작 시 라이브 스케줄러를 시작해 초기 요청 전 캐시 예열을 수행합니다.

## Quality gates

Run these after ranking changes:

```bash
pnpm lint
pnpm test
pnpm build
curl -s 'http://localhost:4001/api/ranking?axis=popular&period=daily&limit=3'
curl -s 'http://localhost:4001/api/ranking?axis=popular&period=daily&refresh=true&limit=3'
curl -s 'http://localhost:4001/api/catalog/ingest/status'
```

Manual UI checks:

- Desktop ranking page shows `CONFIDENCE` and `EVIDENCE`.
- Mobile ranking page has no horizontal overflow.
- Live-matched rows show `LIVE #n`.
- Console has no warnings or errors during initial render.
