# WEBDEX — 웹툰·웹소설 통합 인덱스

> 흩어진 이야기를, 한 권의 색인으로.
> 네이버·카카오·리디·문피아·노벨피아를 가로질러 **검색·랭킹·리뷰**를 한 곳에서 제공하는 디스커버리 서비스.

WEBDEX는 콘텐츠를 호스팅하지 않습니다. 플랫폼 장벽 너머에서 **"무엇을, 어디서, 왜 봐야 하는지"** 답하는 디스커버리·큐레이션 레이어입니다.

<br/>

## 왜 만들었나 — 기존 서비스의 빈자리

네이버·카카오·리디 등은 모두 **자기 플랫폼 안에 독자를 가두는** 워터가든입니다. 독자는 작품이 "어디서, 얼마에" 볼 수 있는지 여러 앱을 오가며 확인해야 하고, 신뢰할 만한 통합 평점·리뷰도, 웹소설 원작과 웹툰화의 연결도 한눈에 보기 어렵습니다. WEBDEX는 그 공백을 정확히 겨냥합니다.

### 차별화 기능 (기존 서비스 대비)

| 기능 | 네이버/카카오/리디 | WEBDEX |
| --- | :---: | :---: |
| 플랫폼 무관 통합 작품 DB | ✕ | ✓ |
| **크로스플랫폼 "어디서 봐" 라우터** (무료/기다무/유료 비교) | ✕ | ✓ |
| 투명 산식 다축 랭킹 (6개 축) | △ 단순 조회수 | ✓ |
| 신뢰 가능한 소셜 리뷰 + **가변 별점**(별/10점/100점) | △ | ✓ |
| 스포일러 토글 + 리뷰 태그 | ✕ | ✓ |
| **원작 ↔ 웹툰 ↔ 영상화 어댑테이션 그래프** | ✕ | ✓ |
| 통합 장르 스펙트럼 / 태그 디스커버리 | △ | ✓ |
| **취향 프로필 분석 + 추천** | ✕ | ✓ |
| **대중용 트렌드·데이터 대시보드** | ✕ | ✓ |

자세한 경쟁 분석은 [`docs/competitor-analysis.md`](docs/competitor-analysis.md) 참고.

<br/>

## 핵심 화면

- **홈** `/` — 에디토리얼 히어로, 실시간 인기 랭킹, 장르 스펙트럼, 어댑테이션 스포트라이트, 큐레이션 레일
- **통합 검색** `/search` — 질의 + 패싯 필터(유형·장르·상태·플랫폼·평점·이용가·무료) + 정렬 + 그리드/리스트
- **통합 랭킹** `/ranking` — 인기·급상승·평점·정주행 몰입·완결·신작 **6개 축**, 기간(일/주/월/전체), **순위 산식 투명 공개**
- **탐색** `/explore` — 18개 장르 색상 스펙트럼 + 태그 클라우드로 떠나는 발견
- **작품 상세** `/title/[slug]` — "어디서 봐" 라우터, 평점 분포·정주행 지표, 어댑테이션 그래프, 리뷰, 비슷한 작품
- **리뷰 피드** `/reviews` — Letterboxd 감성의 한 줄 리뷰 피드 (스포일러 블러·공감·정렬)
- **인사이트** `/insights` — 장르·플랫폼·연도·평점·가격·어댑테이션을 시각화한 트렌드 대시보드
- **내 서재** `/library` — 관심/평가/완독 관리, **취향 분석**, 맞춤 추천, 컬렉션
- **⌘K 커맨드 팔레트** — 어디서든 통합 검색

<br/>

## 디자인 — "활자와 스펙트럼 (Type & Spectrum)"

따뜻한 잉크-블랙 위의 에디토리얼 다크. 디자인 시스템은 `impeccable` 스킬로 확립했습니다.

- **컬러**: OKLCH 토큰. 따뜻하게 틴트된 중립 + persimmon(감/주홍) 시그니처 악센트 + 18개 장르를 색상환에 매핑한 **장르 스펙트럼**
- **타이포**: 데이터/인덱스는 grotesque(Space Grotesk), 한국어 UI는 Pretendard, 문학적 순간은 serif(Nanum Myeongjo)
- **시그니처**: 인덱스 넘버럴, 스펙트럼 바, 타이포그래픽 커버(이미지 없이 활자 포스터), 어댑테이션 그래프
- 토큰·컴포넌트 규약은 [`DESIGN.md`](DESIGN.md), 제품 정의는 [`PRODUCT.md`](PRODUCT.md) 참고

<br/>

## 기술 스택

- **Vite 8** · **React 19** · **React Router 7** · **TypeScript**
- **NestJS API** — 카탈로그·랭킹·커뮤니티·내 서재·인증 엔드포인트
- **Tailwind CSS v4** (CSS-first `@theme` 토큰)
- **Zustand** (+ `localStorage` 영속화) — 평점·리뷰·북마크·취향·컬렉션
- **Motion** — 마이크로 인터랙션 · 스크롤 리빌
- 검색·랭킹·추천·취향분석 로직은 의존성 없는 순수 TypeScript (`lib/`)

## 라이브러리 (용도별)

`package.json` 기준 주요 의존성과 한 줄 용도입니다.

| 라이브러리 | 용도 |
| --- | --- |
| `drizzle-orm` + `pg` (node-postgres) | DB/ORM — PostgreSQL(로컬 docker / Neon 원격) 접근 (`DATABASE_URL`) |
| `react` · `react-dom` | UI 런타임 (React 19, React Compiler 활성) |
| `react-router-dom` | 라우팅 — React Router 7 SPA 라우트 |
| `zustand` | 상태 관리 — 평점·리뷰·북마크·취향·컬렉션 (localStorage 영속화) |
| `react-hook-form` + `@hookform/resolvers` + `zod` | 다중 필드 폼 — 관리자 플랜/캠페인·로그인/가입·리뷰 작성 폼의 상태·검증(`useForm` + `zodResolver`, 폼별 co-located 스키마) |
| `cmdk` | 커맨드 팔레트 — ⌘K 통합 검색 UI |
| `motion` | 애니메이션 — 마이크로 인터랙션·스크롤 리빌 |
| `lucide-react` | 아이콘 셋 |
| `tailwindcss` + `@tailwindcss/postcss` | 스타일 — Tailwind CSS v4 (CSS-first `@theme`) |
| `clsx` + `tailwind-merge` | 클래스 합성·중복 제거 (`cn` 유틸) |
| `vite` + `@vitejs/plugin-react` | 빌드/개발 서버 (Vite 8) |
| `babel-plugin-react-compiler` + `@rolldown/plugin-babel` | React Compiler — 자동 메모이제이션 |
| `drizzle-kit` | DB 마이그레이션·스키마 도구 |
| `typescript` · `eslint` · `typescript-eslint` | 타입 검사·린트 |
| `vitest` | 단위 테스트 |

> 참고: 클라이언트 검색은 입력마다 `/api/search` 네트워크 요청으로 동작합니다. `useDeferredValue`는 네트워크 호출을 디바운스하지 않으므로(메모리 내 파생 렌더만 지연) 검색/팔레트에는 적용하지 않습니다.

## 실데이터 수집과 서버 갱신

작품 데이터는 파일 seed가 아니라 서버 DB 스냅샷을 운영 소스로 사용합니다. `lib/data/` seed 모듈은 제거했고, Nest API가 크롤러 JSON 결과를 `catalog_snapshot`에 저장한 뒤 `lib/server/catalog-store.ts`의 서버 런타임 카탈로그를 갱신합니다. DB 스냅샷이 없으면 빈 런타임 카탈로그로 시작해 잘못된 하드코딩 데이터가 노출되지 않게 합니다. **즉 한 번도 ingest하지 않으면 카탈로그(검색·탐색·작품 목록)는 비어 있고, 표지 썸네일도 표시할 데이터가 없습니다.** 로컬에서는 아래 `pnpm ingest`로 채웁니다.

```bash
pnpm crawl                       # 크롤러 JSON을 stdout으로 출력(서버 스케줄러용)
pnpm ingest                      # 크롤 후 로컬 DB 스냅샷에 적재 → 서버 재시작 시 카탈로그 반영
pnpm ingest --from out.json      # 미리 크롤해 둔 JSON 적재(재크롤 없음)
```

> 로컬 DB(`file:` 기본)는 cwd와 무관하게 **레포 루트의 `data/webdex.db` 하나**로 고정됩니다(`lib/db`가 `pnpm-workspace.yaml` 위치를 기준으로 해석). API는 `apps/api`에서 실행되므로, 예전처럼 cwd 상대경로였다면 `apps/api/data/webdex.db`와 루트 `data/webdex.db`가 갈려 스냅샷이 한쪽에만 쌓였습니다.

- **웹툰**: 요일별/완결 목록 전체를 검색 색인으로 저장하고, 상위/설정 범위는 상세 API로 제목·작가·**별점·조회수·관심수·장르·시놉시스·태그·연재요일·연령등급·연재 시작 연도·표지 썸네일**을 보강합니다. 카카오웹툰/레진 공개 카탈로그도 추가로 정규화합니다.
- **웹소설**: 웹툰의 원작 정보(`novelOriginAuthors`)로 실제 원작 엔트리와 **원작↔웹툰 어댑테이션 연결**을 생성하고, 네이버 시리즈 장르 랭킹으로 보강.
- **표지 썸네일**: 핫링크/CORS 회피를 위해 Nest API의 `/api/cover` 프록시(허용 호스트 `*.pstatic.net`, `*.kakaopagecdn.com`, `*.kakaocdn.net`, `*.lezhin.com`)를 경유해 표시.
- 평가 수·평점 분포·완독률·몰입 지수 등 공개되지 않는 일부 보조 지표는 추정값이며, 랭킹은 실제 수집 데이터에 산식을 적용해 계산합니다.
- **플랫폼 확장**: `PlatformId`/`PLATFORMS`와 `lib/server/catalog-sources.ts`는 네이버·카카오 외에 리디, 문피아, 조아라, 노벨피아, 레진, 봄툰, 탑툰, 포스타입, 미스터블루, 코미코, 투믹스, 버프툰, 북큐브, 원스토리, 피너툰, 교보, 예스24까지 국내 웹툰/웹소설 수집 슬롯을 관리합니다. 현재 crawler 구현 소스는 네이버웹툰·네이버시리즈·카카오웹툰·레진이며, 리디처럼 Cloudflare/로그인/성인 인증/약관 검토가 필요한 소스는 우회하지 않고 pending으로 남깁니다.
- **DB 주기 갱신**:
  - `CATALOG_INGEST_MODE=off|fixed`
  - `CATALOG_INGEST_INTERVAL_SECONDS=1800`
  - `CATALOG_INGEST_TRIGGER_TOKEN` 설정 시 `/api/catalog/ingest/run` 수동 실행 가능
  - `/api/catalog/ingest/status`에서 current snapshot, 최근 실행 이력, 다음 실행 예정 시각 확인
  - `WEBDEX_SOURCE_IDS=naver-webtoon,naver-series,kakao-webtoon,lezhin`로 실제 실행 소스를 제한
- **랭킹 실시간성**: 실시간 라이브 보정은 환경변수로 운영합니다.
  - `WEBTOON_LIVE_REFRESH_MODE` (`fixed` / `adaptive` / `off`)
  - `WEBTOON_LIVE_TTL_SECONDS` (기본 120초)
  - `WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS` (고정 갱신 간격)
  - `WEBTOON_LIVE_REFRESH_BURST_SECONDS` (adaptive 집중 구간 간격)
  - `WEBTOON_LIVE_REFRESH_IDLE_SECONDS` (adaptive 유휴 구간 간격)
  - `WEBTOON_LIVE_REFRESH_DEMAND_WINDOW_SECONDS` (adaptive 수요 창, 초)
  - `WEBTOON_LIVE_DEMAND_THRESHOLD` (adaptive 임계치)

더 빠르게 만들고 싶으면 `adaptive` + 짧은 `burst/interval` 조합으로 시작하고, 호출량이 급증하면 `adaptive` 또는 `off`로 되돌립니다. (단, 외부 호출량이 늘어납니다.)

법적 리스크 완화를 위해 기본 수집 모드는 `off`입니다. 운영 전 플랫폼별 robots.txt, 이용약관, API 약관, 제휴 가능성, 저장 필드 범위를 검토해야 합니다. 자세한 랭킹 계속 갱신 운영(Always-on)과 법적 리스크 완화 원칙은 [`docs/ranking-architecture.md`](docs/ranking-architecture.md)에서 확인하세요. 수집 → DB 적재 → API → 화면 노출까지의 전 과정 도식과 단계별 설명은 [`docs/data-pipeline.md`](docs/data-pipeline.md)를 참고하세요.

## 실행

```bash
pnpm install
pnpm dev          # Vite 웹앱: http://localhost:5173
pnpm dev:api     # http://127.0.0.1:4001
pnpm dev:all     # 권장: 웹앱(:5173) + Nest API(:4001) 한 번에 실행
pnpm build && pnpm start   # 프로덕션 프리뷰
```

## 프로젝트 구조

```
src/                 Vite 엔트리, React Router 페이지, 라우트 셸
components/          UI 프리미티브 + 시그니처 컴포넌트
  ui/                button, chip, stars, spectrum-bar, segmented ...
lib/                 데이터 모델 · 런타임 카탈로그 저장소 · 검색/랭킹/추천 로직 · 스토어
  data/              DB 스냅샷으로 채워지는 런타임 카탈로그 저장소
  server/            랭킹·검색·카탈로그 수집 서버 로직
docs/                경쟁 서비스 분석
apps/api/            NestJS 백엔드 (catalog, ranking, auth, me, community, admin)
```

<br/>

> **데이터 고지** — 작품 메타데이터와 공개 수치는 공개적으로 접근 가능한 소스에서 벤치마킹 목적으로 수집합니다. 평가 수·평점 분포·완독률·몰입 지수 등 비공개 지표와 seed 리뷰는 데모용 추정·예시입니다. 표지 이미지의 저작권은 각 저작권자에게 있으며, 운영 전 플랫폼별 약관·robots·제휴 가능성을 별도로 검토해야 합니다.
