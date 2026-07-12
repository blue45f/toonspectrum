# ToonSpectrum — 웹툰·웹소설 통합 인덱스

> 흩어진 이야기를, 한 권의 색인으로.
> 네이버·카카오·리디·문피아·노벨피아를 가로질러 **검색·랭킹·리뷰**를 한 곳에서 제공하는 디스커버리 서비스.

ToonSpectrum는 콘텐츠를 호스팅하지 않습니다. 플랫폼 장벽 너머에서 **"무엇을, 어디서, 왜 봐야 하는지"** 답하는 디스커버리·큐레이션 레이어입니다.

<br/>

<p align="center">
  <img src="docs/screenshots/home.png" alt="ToonSpectrum 홈 — 웹툰·웹소설 통합 인덱스(검색·랭킹·리뷰)" width="820" />
</p>
<p align="center">
  <img src="docs/screenshots/home-mobile.png" alt="ToonSpectrum 모바일 홈" width="240" />
</p>

<br/>

## 왜 만들었나 — 기존 서비스의 빈자리

네이버·카카오·리디 등은 모두 **자기 플랫폼 안에 독자를 가두는** 워터가든입니다. 독자는 작품이 "어디서, 얼마에" 볼 수 있는지 여러 앱을 오가며 확인해야 하고, 신뢰할 만한 통합 평점·리뷰도, 웹소설 원작과 웹툰화의 연결도 한눈에 보기 어렵습니다. ToonSpectrum는 그 공백을 정확히 겨냥합니다.

### 차별화 기능 (기존 서비스 대비)

| 기능 | 네이버/카카오/리디 | ToonSpectrum |
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
- **연재 캘린더** `/calendar` — 연재요일 메타데이터 기준 요일별 보드 + **표시할 플랫폼 멀티셀렉트 필터**(원하는 플랫폼만 골라 보기)
- **작품 상세** `/title/[slug]` — "어디서 봐" 라우터, 평점 분포·정주행 지표, 어댑테이션 그래프, 리뷰, 비슷한 작품
- **리뷰 피드** `/reviews` — Letterboxd 감성의 한 줄 리뷰 피드 (스포일러 블러·공감·정렬)
- **인사이트** `/insights` — 장르·플랫폼·연도·평점·가격·어댑테이션을 시각화한 트렌드 대시보드
- **내 서재** `/library` — 관심/평가/완독 관리, **취향 분석**, 맞춤 추천, 컬렉션
- **창작 스튜디오** `/studio` — 멀티페이지 컷·말풍선·3D/VRM·벡터/래스터 소재·AI 제작 보조·검토·
  복구·Publish Package와 역할 기반 팀 초대·공유 원본·revision 충돌 방지를 합친 모바일 대응 올인원
  제작실. 컷툰/업로드 작품 형식을 보존한 채 팀 작업 목록에서 바로 전환하며, 상세 벤치마크와 구현 현황은
  [`docs/studio-competitor-features.md`](docs/studio-competitor-features.md) 참고
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

## 실데이터 수집과 스냅샷 갱신

작품 데이터는 하드코딩 seed가 아니라 크롤러가 만든 검증 스냅샷을 운영 소스로 사용합니다. `lib/data/` seed 모듈은 제거했고, 기본 사용자 경로는 `apps/api/data/catalog.json.gz`를 빌드 시 `public/data/*.json`으로 변환해 Vercel/CDN에서 제공하는 정적 카탈로그입니다. **카탈로그는 파일 전용입니다** — Nest API도 같은 gz 파일(`WEBDEX_CATALOG_FILE`로 재정의 가능)을 부팅 시 로드하고 파일 스탯 폴링으로 핫 리로드하며, DB는 동적 데이터(리뷰·커뮤니티·계정·창작) 전용입니다(DB `catalog_snapshot` 읽기/쓰기는 `WEBDEX_CATALOG_FORCE_DB=1` 레거시 모드 전용). 파일이 없으면 빈 런타임 카탈로그로 시작해 잘못된 하드코딩 데이터가 노출되지 않게 합니다.

```bash
pnpm crawl                       # 크롤러 JSON을 stdout으로 출력(서버 스케줄러용)
pnpm ingest                      # 크롤 후 catalog.json.gz 원자적 갱신(DB 불필요; --db는 레거시)
pnpm ingest --from out.json      # 미리 크롤해 둔 JSON 적재(재크롤 없음)
pnpm catalog:gen                 # apps/api/data/catalog.json.gz → public/data/*.json 정적 카탈로그 생성
KMAS_PRV_KEY=... pnpm kmas:update-catalog  # 기존 catalog.json.gz 썸네일 URL/줄거리/연령등급을 규장각 API 응답으로 점진 병합
```

> DB는 **PostgreSQL**입니다(`lib/db`가 `DATABASE_URL`로 연결, 미설정 시 로컬 docker `:55432` 폴백). 리뷰·커뮤니티·인증 같은 동적 데이터와 ingest 실행 이력(수 KB)에만 사용합니다 — 카탈로그 본문은 DB에 저장하지 않습니다. 설정은 아래 [실행](#실행)의 "DB 준비"를 참고하세요.

- **웹툰**: 요일별/완결 목록 전체를 검색 색인으로 저장하고, 상위/설정 범위는 상세 API로 제목·작가·**별점·장르·시놉시스·태그·연재요일·연령등급·연재 시작 연도·표지 썸네일**을 보강합니다. 카카오웹툰/레진을 비롯한 14개 공개 카탈로그도 추가로 정규화합니다.
- **웹소설**: 웹툰의 원작 정보(`novelOriginAuthors`)로 실제 원작 엔트리와 **원작↔웹툰 어댑테이션 연결**을 생성하고, 네이버 시리즈 장르 랭킹으로 보강.
- **규장각 실시간 병합**: `KMAS_PRV_KEY`가 설정되어 있으면 웹 앱 진입 시 브라우저가 `/api/kmas/merge-on-access`를 한 번 호출하고, 서버가 기존 스냅샷의 노출 우선순위 작품을 만화규장각 Open API(`result` + `itemList`)로 제목 조회해 `imageDownloadUrl` 썸네일 URL, `outline` 줄거리, 연령등급을 병합합니다. KMAS 썸네일은 기존 크롤 썸네일 URL과 같은 `coverImage` 메타데이터로 저장/노출하되, 이미지 바이너리는 저장하지 않고 `/api/cover` 서버 프록시로도 중계하지 않습니다. `/api/home` 등 카탈로그 API 진입도 같은 병합 루틴을 공유합니다. `KMAS_MERGE_ON_ACCESS=0`으로 끌 수 있고, `KMAS_MERGE_ON_ACCESS_LIMIT`/`KMAS_RESPONSE_ENRICH_LIMIT`로 최초 병합·응답 보강 건수를 조절합니다. 외부 KMAS 진입 병합 결과는 `KMAS_MERGE_ON_ACCESS_TTL_MS` 동안 서버 메모리에 캐시되며 기본값은 5분입니다. 제목별 KMAS 조회도 일 1,000회 한도와 응답 지연을 줄이기 위해 서버 메모리 TTL 캐시를 사용하며, 기본값은 24시간입니다(`KMAS_LOOKUP_CACHE_TTL_MS`). 클라이언트가 인증키를 직접 들고 호출하지 않도록 서버 프록시 `/api/kmas/book-webtoons`도 제공합니다.
- **KMAS 전체 목록 제약**: `bookAndWebtoonList`와 `dcmtDtaList` 모두 `prvKey`만 붙인 무조건 전체 목록 호출은 실제 응답에서 `데이터가 없습니다.`를 반환합니다. 전체 목록 단독 호출 검증 경로는 남겨두되, 운영 갱신은 기존 카탈로그 제목을 기준으로 공식 KMAS 응답을 매칭합니다.
- **표지 썸네일**: 플랫폼 표지는 핫링크/CORS 회피를 위해 Nest API의 `/api/cover` 프록시를 경유해 표시합니다. 허용 호스트는 플랫폼별 표지 CDN으로 한정합니다 — pstatic·kakaopagecdn·kakaocdn·lezhin·ridicdn·munpia·joara·cloudfront(포스타입)·mrblue·bookcube·onestore·yes24·novelpia·balcony(봄툰)·toptoon·toomics·kyobobook. KMAS 썸네일은 `/api/cover`로 중계하지 않고, KMAS API가 응답한 `imageDownloadUrl` 원본 URL을 `coverImage`로 직접 노출합니다.
- 평가 수·평점 분포·완독률·몰입 지수 등 공개되지 않는 일부 보조 지표는 추정값이며, 랭킹은 실제 수집 데이터에 산식을 적용해 계산합니다. **네이버 웹툰 별점은 실수집이지만, 네이버가 공개 조회수 집계를 비공개로 전환(목록 API가 `viewCount=0` 응답)함에 따라 조회·관심수는 추정값(≈)으로 표시합니다.** 어떤 경로로든 조회수가 0/누락이면 `scripts/crawl.mjs`의 `normalizeStats`가 별점·해시 기반 추정값으로 보정하고, 해당 작품은 `statsEstimated` 플래그로 표기되어 화면에서 ≈/추정 배지가 붙습니다(**"조회 0" 노출 방지**).
- **플랫폼 커버리지(19개 슬롯)**: 공개 카탈로그 크롤러로 수집 가능한 플랫폼 — 네이버웹툰·네이버시리즈·카카오웹툰·카카오페이지·레진·리디·문피아·조아라·노벨피아·봄툰·탑툰·포스타입·미스터블루·투믹스·북큐브·원스토리·교보문고·예스24·코미코. 구현 상태는 `scripts/crawlers/<id>.mjs`와 `lib/server/catalog-sources.ts`가 관리합니다. 로그인/성인 인증/약관을 우회하지 않고 공개 목록 메타데이터만 사용합니다. **피너툰**(도메인 연결 종료)·**버프툰**(서비스 종료, nc.com 리다이렉트)은 폐기 서비스라 목록에서 제외했습니다. **코미코**는 운영 중이지만 한국 외 IP를 방화벽에서 차단(지오펜스)하므로, 크롤러(`scripts/crawlers/comico.mjs`)를 **KR egress 조건부**로 배선했습니다 — 한국 리전 egress(운영 크론)에선 자동 수집되고, 그 외 환경에선 첫 요청 타임아웃 시 즉시 빈 결과로 종료합니다. 또한 검색·랭킹·캘린더의 플랫폼 필터는 **카탈로그에 실제 존재하는 플랫폼만** 노출하므로(데이터 기반), 수집되지 않은 환경에서 코미코가 빈 슬롯으로 보이지 않습니다.
- **DB 주기 갱신**:
  - `CATALOG_INGEST_MODE=off|fixed`
  - `CATALOG_INGEST_INTERVAL_SECONDS=1800`
  - `CATALOG_INGEST_TRIGGER_TOKEN` 설정 시 `/api/catalog/ingest/run` 수동 실행 가능
  - `/api/catalog/ingest/status`에서 current snapshot, 최근 실행 이력, 다음 실행 예정 시각 확인
  - `WEBDEX_SOURCE_IDS=all` 또는 쉼표 구분 source id로 실제 실행 소스를 제한
- **랭킹 갱신성**: 웹 기본 경로는 `/api/ranking` 서버 응답이며, 정적 모드(`VITE_CATALOG_SOURCE=static`)에서는 `scripts/build-static-catalog.ts`와 `src/catalog-static.ts`가 사전 계산한 파일을 사용합니다. 두 경로 모두 기본 랭킹은 같은 스냅샷 산식으로 동작하고, 규장각 병합은 작품 메타와 썸네일 URL 보강에만 적용됩니다. `lib/server/live.ts`의 실시간 어댑터와 `WEBTOON_LIVE_*` 환경변수는 보존되어 있지만, 별도 운영 경로로 다시 연결하기 전까지 기본 랭킹에는 외부 실시간 랭킹 호출을 반영하지 않습니다.
- **카탈로그 호출 경로**: 웹 기본값은 `/api/*` 서버 경로입니다. 규장각 병합·런타임 정책을 타지 않는 완전 정적 카탈로그가 필요하면 `VITE_CATALOG_SOURCE=static`을 명시합니다(토스처럼 `dataBase`를 주입하는 교차 출처 셸은 정적 라우팅 유지).

법적 리스크 완화를 위해 기본 수집 모드는 `off`입니다. 운영 전 플랫폼별 robots.txt, 이용약관, API 약관, 제휴 가능성, 저장 필드 범위를 검토해야 합니다. 랭킹 산식·스냅샷 모드·보존된 live 어댑터의 경계는 [`docs/ranking-architecture.md`](docs/ranking-architecture.md)에서 확인하세요. 수집 → 스냅샷 → 정적 카탈로그/API → 화면 노출까지의 전 과정 도식과 단계별 설명은 [`docs/data-pipeline.md`](docs/data-pipeline.md)를 참고하세요.

## 실행

```bash
pnpm install
pnpm dev          # Vite 웹앱: http://localhost:5173
pnpm dev:api     # http://127.0.0.1:4001
pnpm dev:all     # 권장: 웹앱(:5173) + Nest API(:4001) 한 번에 실행
pnpm build && pnpm start   # 프로덕션 프리뷰
```

### DB 준비 (PostgreSQL / Neon)

DB는 **PostgreSQL**입니다 — 로컬은 docker, 원격·배포는 **Neon**(서버리스 Postgres). `lib/db`가 `DATABASE_URL`을 읽고, 미설정 시 로컬 docker(`postgres://webdex:webdex@127.0.0.1:55432/webdex`)로 폴백합니다. 둘 중 하나를 고른 뒤 스키마를 push하고 카탈로그를 적재하세요.

**A. 로컬 docker Postgres**

```bash
docker run -d --name wd-pg \
  -e POSTGRES_USER=webdex -e POSTGRES_PASSWORD=webdex -e POSTGRES_DB=webdex \
  -p 55432:5432 postgres:16-alpine
pnpm exec drizzle-kit push        # 스키마 생성(20테이블). DATABASE_URL 미설정 시 위 docker 기본값 사용
pnpm ingest                       # 전 소스 크롤 후 catalog.json.gz 갱신(DB 무관) → API가 폴링으로 자동 반영
pnpm dev:all
```

**B. 원격 Neon** — `.env.local`에 연결 문자열만 넣으면 크롤·ingest·API가 모두 원격을 사용합니다.

```bash
# .env.local (gitignore됨)
echo 'DATABASE_URL="postgresql://<user>:<pw>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=require"' >> .env.local
pnpm exec drizzle-kit push        # Neon에 스키마 생성(동적 데이터 전용 — 카탈로그는 DB에 없음)
pnpm ingest                       # catalog.json.gz 갱신(Neon 전송 0)
pnpm dev:all                      # apps/api가 부팅 시 .env.local을 먼저 로드 → 자동으로 Neon 연결
```

> 데이터 갱신: 정적 운영에서는 `pnpm catalog:gen`으로 `public/data/*.json`을 재생성하고 재배포합니다. API는 gz 파일 mtime/size 폴링(`CATALOG_REFRESH_POLL_SECONDS`, 기본 60s — DB 왕복 없음)으로 새 카탈로그를 **무중단 핫 리로드**하거나, `POST /api/catalog/refresh`로 즉시 반영합니다. 전체 흐름은 [`docs/data-pipeline.md`](docs/data-pipeline.md) 참고.

## 프로젝트 구조

```
src/                 Vite 엔트리, React Router 페이지, 라우트 셸
components/          UI 프리미티브 + 시그니처 컴포넌트
  ui/                button, chip, stars, spectrum-bar, segmented ...
lib/                 데이터 모델 · 런타임 카탈로그 저장소 · 검색/랭킹/추천 로직 · 스토어
  data/              빌드 시 생성되는 정적 카탈로그 파일(public/data)
  server/            랭킹·검색·카탈로그 수집 서버 로직
docs/                경쟁 서비스 분석
apps/api/            NestJS 백엔드 (catalog, ranking, auth, me, community, admin)
```

<br/>

> **데이터 고지** — 작품 메타데이터와 공개 수치는 공개적으로 접근 가능한 소스에서 수집합니다. 평가 수·평점 분포·완독률·몰입 지수 등 플랫폼이 공개하지 않는 지표는 추정값(≈)으로 표기합니다. 표지 이미지의 저작권은 각 저작권자에게 있으며, 운영 시 플랫폼별 약관·robots·제휴 가능성을 준수합니다.
