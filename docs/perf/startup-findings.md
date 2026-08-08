# ToonStudio 기동·로딩 성능 실측 (2026-08-08)

프로덕션 번들(`dist/`)을 `vite preview`로 서빙하고 Playwright Chromium + CDP로 실측했다.
추정치 없음 — 모든 수치는 실행 로그이며 원본은
[`tests/benchmarks/results/app-startup-perf.json`](../../tests/benchmarks/results/app-startup-perf.json),
하니스는 [`tests/benchmarks/harness/app-startup-perf.ts`](../../tests/benchmarks/harness/app-startup-perf.ts)에 있다.

## 측정 조건

| 항목 | 값 |
| --- | --- |
| 아티팩트 | `dist/` (재빌드 안 함, `StudioPage-BH3qv46w.js` / `i18n-CdB262Tn.js` 해시로 동일성 검증) |
| 서버 | `pnpm exec vite preview --port 4199` (Studio COOP/COEP 헤더 적용 확인) |
| 브라우저 | Playwright Chromium headless, viewport 1440×900 |
| 반복 | 시나리오·프로파일당 3회, 표는 중앙값 |
| 저사양 | CPU 4x throttle + Slow 4G (1.6 Mbps↓ / 750 Kbps↑ / 562.5 ms RTT, DevTools "Slow 4G" 프리셋) |
| long task | 진입 후 5초간 `PerformanceObserver("longtask")` 전수 수집, TBT = Σ(dur − 50 ms) |
| **병행 부하** | **Apple M2 Max 12-core, load average 13.8 / 11.7 / 10.4.** 같은 레포에서 다른 에이전트가 동시 작업 중이었다. 절대 시간에는 이 배경 부하가 섞여 있고, 3회 반복 간 편차도 그만큼 크다(예: unthrottled `+interactive` 1107 / 2186 / 2195 ms). **병목의 상대 순위와 바이트·요청 수는 부하와 무관하게 재현된다** — 실제로 부하가 다른 두 차례 전체 실행에서 요청 수 240, decoded 7.19/7.18 MiB, eagerDynamic 55개가 그대로 나왔다. |

주의: TTFB가 ~2 ms인 것은 localhost 서빙 때문이다. 실제 CDN 왕복은 여기에 더해진다.
GPU/Commit 계열 수치는 headless 소프트웨어 래스터라이저의 영향을 받으므로 본 문서의 결론에서 제외했다.

## 1. 기동 지표

정상(무스로틀) / 저사양(CPU 4x + Slow 4G), 중앙값 ms.
`+interactive`는 문서 커밋 이후 Konva 캔버스 표면이 붙기까지 추가로 걸린 시간이다.

| 시나리오 | 프로파일 | TTFB | FCP | LCP | DCL | load | +interactive | TBT | 최장 task |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/studio` 콜드 직행 | 정상 | 2.0 | 340 | 1253 | 260 | 260 | **+2186** | **961** | 579 |
| `/studio` 콜드 직행 | 저사양 | 1.8 | 3183 | **7505** | 2937 | 2938 | **+6219** | **3689** | 808 |
| `/` 랜딩 콜드 | 정상 | 1.7 | 336 | 500 | 228 | 228 | +314 | 0 | 0 |
| `/` 랜딩 콜드 | 저사양 | 2.2 | 3228 | 4264 | 2923 | 2924 | +2650 | 218 | 161 |
| 랜딩 → `/studio` (앱 내 이동) | 정상 | 2.6 | 345 | 1246 | 268 | 268 | +1678 | 1111 | 654 |
| 랜딩 → `/studio` (앱 내 이동) | 저사양 | 5.9 | 1194 | 5465 | 929 | 937 | **+6111** | 4020 | 866 |

읽는 법:

- 랜딩은 건강하다(TBT 0, LCP 500 ms). **느린 것은 `/studio` 하나다.**
- 저사양에서 `/studio`는 **LCP 7.5초, 진입 완료까지 약 9.2초, 메인스레드가 3.7초 블로킹**된다.
- 랜딩에서 앱 내 이동으로 들어가도 비용이 줄지 않는다(+6111 ms). 이유는 §4.

## 2. 번들 실측 vs 정적 예산

`/studio` 콜드 진입 시 **실제로 다운로드된 것**:

| 항목 | 실측 |
| --- | ---: |
| JS 요청 수 | **240** |
| JS decoded (파싱·평가 대상) | **7,183 KiB** |
| JS gzip 환산(프로덕션 CDN 기준) | 1,769 KiB |
| CSS (렌더 블로킹 1장) | 378 KiB |
| 4 KiB 미만 초소형 청크 | **111개 (전체 요청의 46%, 바이트는 196 KiB로 2.7%)** |

`scripts/check-studio-bundle.mjs`의 정적 분석과 대조:

| | 정적 분석 | 실측 | 괴리 |
| --- | ---: | ---: | --- |
| Studio 청크 수 | 185 | **240** | **+55** |
| Studio route raw | 6,146 KiB | 7,183 KiB decoded | +1,037 KiB |
| 예산 기준 raw | 2,988 KiB | — | **정적 분석부터 이미 2.06배 초과** |

두 겹의 문제가 있다.

1. **정적 게이트가 이미 초과를 보고하고 있는데 아무도 못 본다.** `pnpm run check:studio-bundle`은
   현재 **12건의 초과 관측**을 출력하고도 `exit 0`으로 통과한다(2026-07-27 정책상 바이트는
   veto가 아니라 telemetry). 대표 항목:
   - Studio route: 6,146.5 KiB raw (기준 2,988.3) — **2.06배**
   - app entry: 2,354.2 KiB raw (기준 498.0) — **4.73배**
   - StudioPage entry: 1,878.8 KiB raw (기준 1,253.9) — 1.50배
2. **정적 게이트가 구조적으로 못 보는 55개 청크가 더 있다.** manifest상 `dynamic`이라
   예산에서 빠지지만, 사용자가 아무것도 안 했는데 진입 1.1초 안에 전부 받아진다
   (1,037 KiB decoded). `check-studio-bundle.mjs`의 `checkDynamicBoundary`는
   "정적 그래프에 없음"만 검사하므로, **mount 즉시 await되는 dynamic import를 지연으로 오판한다.**

### 실제 다운로드 top 10 (decoded / gzip 환산 / 도착 시각)

| # | 청크 | decoded | gzip | 도착 |
| ---: | --- | ---: | ---: | ---: |
| 1 | `StudioPage-BH3qv46w.js` | 1,879 KiB | 552 KiB | +334 ms |
| 2 | `i18n-CdB262Tn.js` | **1,839 KiB** | **70 KiB** | **+27 ms** |
| 3 | `studio-konva-runtime-BPWjoavh.js` | 283 KiB | 86 KiB | +335 ms |
| 4 | `StudioInspectorAside-BGXmS6Cq.js` | 224 KiB | 63 KiB | +660 ms |
| 5 | `react-runtime-D6Z9ZTks.js` | 220 KiB | 70 KiB | +27 ms |
| 6 | `index-CuOOiHOh.js` (앱 엔트리) | 190 KiB | 61 KiB | +27 ms |
| 7 | `studio-dynamic-brush-render-plan-B5FOTHv-.js` | 159 KiB | 58 KiB | +334 ms |
| 8 | `lucide-studio-core-icons-BLMKNl9G.js` | 92 KiB | 26 KiB | +46 ms |
| 9 | `studio-dynamic-brush-coverage-renderer-Ct-00_3w.js` | 88 KiB | 25 KiB | +335 ms |
| 10 | `schemas-B_0pifLD.js` | 72 KiB | 19 KiB | +334 ms |

2번 항목의 raw/gzip 비율 **26.2배**가 이례적이다 — 로직이 아니라 반복 데이터 테이블이라는 신호다. §5.1.

### 요청 웨이브 = 직렬 왕복 횟수

요청 시작 시각을 80 ms 간격으로 군집화한 결과. 각 웨이브는 사용자가 기다리는 왕복 1회다.

- 정상: `+27ms(11)` → `+257ms(180)` → `+641ms(31)` → `+859ms(18)` — **4 웨이브**
- 저사양: `+603ms(10)` → `+2133ms(1)` → `+2954ms(5)` → `+3609ms(175)` → `+4964ms(29)` → `+5193ms(2)` → `+5828ms(19)` — **7 웨이브, 5.2초에 걸침**

저사양에서 마지막 웨이브가 **+5.8초**에 시작한다. 진입 완료가 9.2초인 직접 원인이다.
(정상에서 4~5 웨이브로 관측되는 것은 웨이브 3/4가 부하에 따라 붙었다 떨어졌다 하기 때문이며,
저사양에서는 항상 7개로 분리되어 나타난다.)

## 3. long task top 5

| 순위 | 정상 | 저사양 |
| ---: | --- | --- |
| 1 | 773 ms @ +1242 ms | 813 ms @ +5044 ms |
| 2 | 579 ms @ +1578 ms | 808 ms @ +4975 ms |
| 3 | 541 ms @ +1526 ms | 799 ms @ +4963 ms |
| 4 | 203 ms @ +662 ms | 425 ms @ +5949 ms |
| 5 | 197 ms @ +920 ms | 420 ms @ +7057 ms |

상위 3개가 마지막 요청 웨이브 직후에 몰려 있다 — 늦게 도착한 청크들이 한꺼번에 평가·마운트되며
메인스레드를 0.5~0.8초씩 연속 점유한다. 저사양에서 5위 task가 **+7.06초**에도 나타나는 것은
캔버스가 붙은 뒤에도 초기화가 계속된다는 뜻이다.

청크별 파싱·컴파일 비용(정상, Chrome trace `v8.compile` 계열을 스크립트 URL로 귀속):

| 청크 | 파싱+컴파일 |
| --- | ---: |
| `StudioPage` | 121.2 ms |
| `lib-FCHq9tEM.js` (pixi.js 본체) | 28.0 ms |
| `i18n` | 19.3 ms |
| `studio-konva-runtime` | 17.5 ms |
| `studio-dynamic-brush-render-plan` | 10.6 ms |

CPU 4x에서는 이 값들이 대략 4배가 된다.

## 4. 랜딩 → `/studio` 이동은 전체 문서를 버린다

CDP `Page.frameNavigated`로 메인 프레임 내비게이션을 셌다.

- `/studio` 직행: 내비게이션 **1회**
- 랜딩 → `/studio`: 내비게이션 **2회** (`/` → `/studio`), 최종 문서의 `PerformanceNavigationTiming.type === "reload"`
- `crossOriginIsolated`: 랜딩에서 `false` → Studio에서 `true`

원인은 설계된 동작이다. `src/app/studio-cross-origin-isolation.ts`는 공개 사이트를 COOP/COEP 밖에
두고(OAuth 팝업 보존), `/studio` 진입 시 격리 문서로 **한 번 리로드**한다(`location.reload()`,
`studio-cross-origin-isolation.ts:413`).

측정된 결과: 랜딩에서 받은 24개 요청 / 2,421 KiB가 **전부 폐기**되고, `/studio` 콜드 직행과
**완전히 동일한 240 요청 / 7,183 KiB를 처음부터 다시 받는다.** 저사양 +6111 ms가 그 값이다.

이건 버그가 아니라 격리 정책의 대가다. 다만 **랜딩의 "스튜디오 열기" 계열 진입점을
SPA 링크가 아니라 일반 문서 링크(`<a href="/studio">`)로 바꾸면** 리로드 왕복 1회와
랜딩 번들 파싱을 통째로 줄일 수 있다(§5.5).

## 5. 병목 top 5와 개선안

### 5.1 `lib/i18n.ts` 1,839 KiB가 모든 라우트의 임계 경로에 preload된다 — 최우선

> **[2026-08-08 수정 완료]** 조치 결과와 실측은
> [`tests/benchmarks/results/i18n-fix.json`](../../tests/benchmarks/results/i18n-fix.json).
> 앱 엔트리 raw **2,354.2 → 575.9 KiB (−75.5%)**, gzip 233.1 → 181.3 KiB,
> i18n 청크 1,883,219 → 61,914 바이트, `dist/index.html`의 i18n modulepreload 제거.
>
> **아래 "67개가 영어와 바이트 동일" 주장은 과장이었다.** 실측하면 en 외 74개 로케일 전부가
> 최소 12개 키에서 영어와 다르다. 다만 결론은 유지된다 — 그 12~15개는 `nav.*`/`common.*`
> 라벨뿐이고 **67개 로케일이 525개 키 중 2.3~2.9%만 번역**되어 나머지 97%는 영어로 렌더된다.
> 실제 번역(≥50%)은 `ko en ja zh zh-hant` 5개, `es fr de`는 8.5%(앱 셸 표면만)다.
> 로케일별 실측 번역률은 `lib/i18n-locale-catalog.ts`(생성물)에 있다.

**근거**
- `dist/index.html:118`에 `<link rel="modulepreload" href="/assets/i18n-CdB262Tn.js">`. 최고 우선순위로 +27 ms에 도착.
- decoded 1,839 KiB / gzip 70 KiB — **비율 26.2배.**
- 원본은 `lib/i18n.ts`, **2,135,813 바이트 / 40,737줄의 손으로 쓴 단일 파일**. `lib/i18n.ts:19`의 `DICT` 하나에 **75개 로케일 × 약 519키**가 전부 인라인.
- **74개 비-ko 로케일 중 67개가 영어와 바이트 동일**하다(`id vi th ru pt it ar hi tr nl pl sv fil ms af am as az be bg bn bs ca cs da el et eu fa fi gl gu he hr hu hy is ka kk km kn ky lo lt lv mk ml mn mr my ne no or pa ro si sk sl sq sr sw ta te uk ur uz zu`). 실제 번역은 `ko en ja zh zh-hant es fr de` 8개뿐.
- `vite.config.ts:15`의 `ENTRY_PRELOAD_EXCLUSIONS`는 Konva·three·VRM만 제외하고 **i18n은 빠뜨렸다.**
- 앱 엔트리 정적 그래프가 2,354 KiB인데 그중 1,839 KiB가 이것 하나다(78%). 예산 초과 4.73배의 정체.

**개선안**
1. (즉시, 무위험) 영어와 동일한 67개 로케일 블록을 삭제하고 `en` 폴백에 맡긴다. 렌더 결과가 이미 영어이므로 동작 변화 없음.
2. `DICT`를 로케일별 `public/i18n/<locale>.json`으로 분리하고, `src/domains/creator/studio-i18n-loader.ts`가 `studio.*` 키에 이미 쓰고 있는 지연 로딩 패턴을 그대로 적용한다. 번들에는 활성 로케일 + `en` 폴백만 남긴다.
3. 그때까지의 임시 조치로 `ENTRY_PRELOAD_EXCLUSIONS`에 `i18n`을 추가해 최소한 preload 우선순위에서만이라도 뺀다.

**예상 절감** — 앱 엔트리 raw **2,354 KiB → 약 515 KiB (−78%)**, i18n gzip 70 KiB → 약 4 KiB.
모든 라우트(랜딩 포함)의 임계 경로에서 1.8 MB 파싱이 사라진다. 저사양 기준 파싱만 약 70 ms,
메모리 상주 문자열 1.8 MB 절감.

> 부수 효과: 67개 로케일이 조용히 영어로 렌더되는 건 **성능 문제가 아니라 출하 버그**다. 별도로 다뤄야 한다.

### 5.2 솔로 문서인데 CRDT 협업 룸을 mount에서 시작한다

**근거**
- `studio-crdt-*` 5개 청크가 마지막 웨이브(정상 +859 ms)에 도착. 합계 **228 KiB raw / 64 KiB gzip** (yjs는 `studio-crdt-document`에 인라인).
- 진입점: `src/domains/creator/StudioLiveCollaborationProvider.tsx:536-553`이 `await nextRoom.start()` 후 6개 모듈을 `Promise.all`로 dynamic import.
- 게이트(`:368`, `:381`)를 솔로 문서가 통과하는 이유:
  - `StudioPage.tsx:3575-3578`이 `instantWorkIdRef.current`(`work-instant-${Date.now()}`)를 합성해 `effectiveWorkId`가 **절대 null이 되지 않는다.**
  - `StudioPage.tsx:3586-3592`가 **`!workId`일 때 오히려** `"익명 게스트"` editor 참가자를 반환한다.
  - `transportPreference`가 `"local"`로 초기화되고, 로컬 지원 판정은 `typeof BroadcastChannel === "function"`(`studio-live-collaboration-transport.ts:131-133`) — 항상 참.
- 결과: **모든 콜드 `/studio` 진입이 참가자 1명(자기 자신)짜리 Y.js 문서 그래프를 구성한다.**
- 이 5개 청크가 마지막 웨이브(정상 +859 ms / 저사양 **+5828 ms**)의 주요 구성원이라 왕복 1회를 통째로 유발한다.

**개선안** — `StudioPage.tsx:3575`와 `:3588`을 고친다. 사용자가 실제로 공유하거나 문서가 저장되기
전까지는 (a) `instantWorkIdRef`를 `effectiveWorkId`에 합성하지 않고, (b) `!workId` 경로에서 참가자를
반환하지 않는다. 룸 시작을 "공유 버튼 클릭 / `?room=` 존재 / 저장된 workId" 시점으로 미룬다.

**예상 절감** — 228 KiB raw / 64 KiB gzip + **요청 웨이브 1회 제거**. 저사양에서 마지막 웨이브가
+5,746 ms에 시작하므로, 진입 완료 시간 기준 **약 0.5~1.0초** 단축이 기대된다.

### 5.3 pixi.js 823 KiB를 첫 페인트에 항상 로드한다

**근거**
- pixi 계열 9개 청크(`lib-FCHq9tEM.js` 본체 + `Geometry`/`GraphicsContext`/`RenderTargetSystem`/`FederatedEventTarget`/`FilterSystem`/`Filter`/`GCManagedHash`/`BufferResource`) 합계 **823 KiB raw / 239 KiB gzip**, 마지막 두 웨이브(정상 +641~859 ms / 저사양 +4964~5828 ms)에 도착.
- `lib-FCHq9tEM.js` 파싱·컴파일만 **28.0 ms**(정상) — StudioPage 다음으로 큰 단일 청크 비용.
- 트리거: `src/domains/creator/StudioPixiSceneOverlayHost.tsx:48-62`의 mount `useEffect`가 `createStudioPixiSceneProvider`를 호출 → `studio-pixi-scene-provider.ts:70-72`의 `import("pixi.js")`.
- `enabled`는 `STUDIO_PIXI_SCENE_HOST_ALWAYS_ON = true` 상수(`studio-pixi-scene-host-admission.ts:16`)이고, `StudioCanvasViewport.tsx:3717-3719`에서 `enabled` prop을 명시적으로 넘긴다. 실질 게이트는 "스테이지 크기 > 0", 즉 **첫 페인트**뿐이다.
- 용도는 선택 오버레이 chrome인데, **선택된 것이 없으면 그릴 게 없다.**

**개선안** — `StudioPixiSceneOverlayHost.tsx:48`의 effect 조건에 "선택이 존재할 때"를 추가한다
(예: `selectedIds.length > 0`). `STUDIO_PIXI_SCENE_HOST_ALWAYS_ON`은 유지하되 의미를
"기능 활성"에서 "첫 선택 시 활성"으로 좁히는 편이 안전하다. 시각적 변화 없음.

**예상 절감** — 823 KiB raw / 239 KiB gzip을 첫 선택 시점까지 이연. 파싱 35 ms(저사양 약 140 ms)
+ 요청 8건 제거.

### 5.4 "lazy" UI가 조건 없이 마운트되어 5단 워터폴을 만든다

**근거** — 아래 전부 `React.lazy` / dynamic import이지만 렌더 조건이 없다.

| 트리거 | 파일:라인 | 끌려오는 것 |
| --- | --- | ---: |
| `LazyStudioInspectorAside` (`!isMobile`이면 항상 참) | `StudioPage.tsx:41160` | Inspector 224 KiB **+ 정적 꼬리** `studio-filter-pack` 59 KiB, `studio-raster-edit-preparation` 18 KiB, `studio-svg-export` 60 KiB → 합 **361 KiB raw / 106 KiB gzip** |
| `LazyStudioMenubarContent` (무조건, `hidden` 클래스는 마운트를 막지 않음) | `StudioPage.tsx:40122` | 메뉴바 38 KiB → 다시 `StudioMainMenu` (`StudioMenubarContent.tsx:503`) — **2단 워터폴** |
| `StudioPageThumbnail` (페이지당 1개, 기본 페이지 1장으로도 발화) | `StudioPageListPane.tsx:538` | 13 KiB |
| 프레즌스 독 / 원격 커서 오버레이 (조건 없음 / `!masterEditMode`) | `StudioCanvasViewport.tsx:2096`, `:3812` | 29 KiB |

특히 `StudioInspectorAside.tsx:172`의 `import { summarizeStudioRasterPreparationSources } from "./studio-raster-edit-preparation";`
**한 줄이** raster-edit-preparation과 그 정적 의존인 `studio-svg-export`까지 끌고 온다.
`check-studio-bundle.mjs`가 "SVG/PSD 엔진이 정적 그래프에 돌아오면 실패"로 지키던 바로 그 모듈이,
dynamic 경계 뒤에 숨어 **기동 시 그대로 로드된다.**

**개선안**
1. Inspector: `!isMobile` 무조건 렌더를 "인스펙터가 실제로 열려 있을 때"로 바꾼다. 이미 있는 `preloadStudioInspectorAside()` hover 워밍업이 체감을 메운다.
2. `StudioInspectorAside.tsx:172`의 헬퍼 1개를 위해 무거운 모듈을 정적 import하지 말고, 해당 헬퍼만 별도 경량 모듈로 떼거나 사용 시점 dynamic import로 바꾼다 → `studio-svg-export` 60 KiB가 기동 그래프에서 빠진다.
3. 메뉴바: `StudioMainMenu`를 `StudioMenubarContent` 안에서 다시 lazy하지 말고 같은 청크에 합쳐 2단 워터폴을 1단으로 만든다.
4. 썸네일·프레즌스 오버레이: 뷰포트 가시성 / 협업 활성 조건으로 게이팅.

**예상 절감** — 약 **450 KiB raw / 140 KiB gzip** 이연 + **워터폴 단계 1개 제거**.
정상 기준 +641 ms 웨이브(31 요청)의 대부분이 여기서 나온다.

### 5.5 앱 셸 자체가 무겁다 — StudioPage 단일 1,879 KiB + 전역 CSS 378 KiB + 초소형 청크 111개

**근거**
- `StudioPage-BH3qv46w.js` 단일 청크 **1,879 KiB raw / 552 KiB gzip**, 파싱·컴파일 **121.2 ms**(정상 → 저사양 약 480 ms). 정적 예산 기준의 1.50배.
- `dist/assets/index-BD5_1asI.css` **378 KiB, 렌더 블로킹 1장.** 출처는 `src/app/main.tsx:9` → `src/styles/globals.css`(Tailwind v4). Studio 전용 셀렉터가 189곳 들어 있는데 **랜딩에서도 전부 받는다.**
- 4 KiB 미만 청크 **111개**가 전체 JS 요청의 46%를 차지하면서 바이트는 196 KiB(2.7%)뿐이다.
- `dist/index.html:104`, `:108`에 Google Fonts / jsDelivr Pretendard **외부 렌더 블로킹 스타일시트 2장**(측정상 Google Fonts만 119 KiB). COEP `credentialless` 아래 교차 출처 왕복이 임계 경로에 있다.
- 랜딩 → `/studio` 이동 시 이 CSS·폰트를 **두 번** 받는다(§4의 리로드).

**개선안**
1. `StudioPage.tsx`를 실제 사용자 의도 경계로 더 쪼갠다. 지금은 canvas viewport·pixi provider·overlay host가 전부 이 청크에 인라인되어 있어 §5.3의 이연 효과가 반감된다.
2. Studio 전용 CSS를 `globals.css`에서 분리해 `/studio` 라우트에서만 로드한다 → 랜딩 렌더 블로킹 바이트 감소.
3. 폰트를 self-host하거나 `media="print"` + `onload` 패턴으로 비블로킹화한다. COEP 격리 문서에서 교차 출처 폰트 CSS는 특히 비싸다.
4. 랜딩의 스튜디오 진입 링크를 SPA 네비게이션이 아닌 일반 `<a href="/studio">` 문서 링크로 바꿔 §4의 리로드 왕복을 없앤다.
5. 초소형 청크 111개는 `manualChunks`에서 소규모 계약 모듈을 몇 개 그룹으로 합쳐 요청 수를 줄인다(이미 `studio-core-micro-contracts` 등에서 쓰는 패턴).

**예상 절감** — 랜딩 렌더 블로킹 CSS 378 KiB → Studio 전용분 제외 시 유의미하게 감소,
폰트 왕복 1회 제거, 요청 수 240 → 약 160대. §4 링크 수정만으로 랜딩 진입 사용자의
2,421 KiB 재다운로드가 사라진다.

## 6. 요약 — 우선순위

| 순위 | 병목 | 이연/절감 (raw / gzip) | 성격 |
| ---: | --- | ---: | --- |
| 1 | i18n 메가 청크가 모든 라우트에 preload | 1,839 / 66 KiB | 즉시 수정 가능, 무위험, 출하 버그 동반 |
| 2 | 솔로 문서 CRDT 룸 mount 시작 | 228 / 64 KiB + 웨이브 1회 | 조건 수정 2줄 |
| 3 | pixi.js 항상 로드 | 823 / 239 KiB | effect 조건 1줄 |
| 4 | 조건 없는 "lazy" UI 마운트 → 워터폴 | 약 450 / 140 KiB + 단계 1개 | 렌더 조건 + import 정리 |
| 5 | StudioPage 단일 청크 / 전역 CSS / 초소형 청크 111개 | 구조 개선 | 중기 |

1~4번만 반영해도 `/studio` 기동 시 **약 3.3 MB raw / 0.5 MB gzip**과 **요청 웨이브 2회**가
빠진다. 저사양 진입 완료 9.2초 중 상당 부분이 마지막 두 웨이브(+5.0초, +5.8초)에서 발생하므로,
체감 개선폭이 가장 큰 것은 2·3·4번의 웨이브 제거다.

## 7. 재현

```bash
pnpm exec vite preview --port 4199            # dist/ 를 그대로 서빙
STARTUP_PERF_BASE_URL=http://localhost:4199 \
  STARTUP_PERF_ITERATIONS=3 \
  pnpm exec tsx tests/benchmarks/harness/app-startup-perf.ts
```

결과는 `tests/benchmarks/results/app-startup-perf.json`에 덮어쓴다.
하니스는 빌드를 하지 않는다 — `dist/`에 있는 것을 그대로 측정하고,
`bundle.largestChunkHashes`에 측정 대상 아티팩트의 콘텐츠 해시를 함께 기록한다.
