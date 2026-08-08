# ToonStudio 무거운 기능 실사용 성능 진단

측정 대상: **프로덕션 빌드**(`pnpm run build`)를 `vite preview`(gzip, cross-origin isolated)로 서빙하고
실제 Chromium(Playwright `channel=chrome`, headless, 1600×1000)으로 `/studio`를 열어 조작한 결과.

- 하네스: `tests/benchmarks/harness/heavy-feature-perf.ts`
- 원자료: `tests/benchmarks/results/heavy-feature-perf.json` (시나리오별 요청 목록·long task 포함)
- 호스트: Apple M2 Max, 12코어, 32 GB, Node v24.16.0, darwin/arm64
- 코드 수정 없음. 측정 전용.

---

## 1. 측정 방법과 정직성 경계

| 항목 | 정의 |
| --- | --- |
| `openMs` | 클릭 → **그 기능의 DOM이 실제로 화면에 보일 때까지**. 타이머 대기가 아니라 다이얼로그·뷰포트 셀렉터의 가시화 시각. |
| `settleMs` | 클릭 → 네트워크와 메인스레드가 800 ms 동안 조용해질 때까지의 **활성** 시간(끝의 정적 구간 제외). |
| `bytes` | CDP `Network.loadingFinished#encodedDataLength` — **gzip 전송 실측 바이트**. 번들 매니페스트 추정치가 아니다. |
| long task | 페이지 자신의 `PerformanceObserver({entryTypes:["longtask"]})` — 50 ms 초과 메인스레드 블로킹. |
| `codeDeliveryMs` / `postDeliveryMs` | 마지막 js·wasm·css 응답 종료 시각을 경계로 **코드 전달** / **그 이후(실행·초기화·첫 프레임·인코딩)** 로 분해. 프로파일러 귀속이 아니라 관측 가능한 경계다. |

설계상 중요한 세 가지:

1. **모든 시나리오가 새 `BrowserContext`에서 `/studio`를 다시 부팅한다.** lazy 청크가 진짜 콜드일 때만
   "첫 진입 비용"이 의미를 갖는다. 같은 세션에서 닫았다 다시 여는 비용은 `warm`으로 따로 기록했다.
2. **서비스 워커를 차단했다(`serviceWorkers: "block"`).** `dist/sw.js`는 `/assets/`를 cache-first로
   가로채는데, 서비스 워커가 중개한 응답은 페이지 타깃에서 `encodedDataLength: 0`으로 보고된다.
   차단 없이 잰 첫 실행에서는 부팅이 4.51 MB가 아니라 2.59 MB로, 3D 패널 오픈 비용이 **0 바이트**로 보였다.
   즉 SW를 켠 채로 재면 lazy 청크 비용이 통째로 사라진다. 아래 수치는 최초 방문 사용자 기준 실제 전송량이다.
3. **트리거 클릭 타임아웃을 1.2초로 낮췄다.** Studio의 일부 진입점은 `display:none` 컨테이너 안에 있어
   Playwright의 actionability 대기가 만료될 때까지 멈춘다. 초기 측정에서 "다중 레이어 타임라인 8.8초"가
   나온 원인이 그 6초 타임아웃이었다 — 지연이 아니라 계측 아티팩트였다. 아래 §4-1이 그 진짜 원인이다.

### 이 환경에서 재지 못해 비워 둔 것 (추정치 없음)

- **협업 CRDT 서버 왕복.** `VITE_STUDIO_LIVE_ORIGIN` / `VITE_STUDIO_REALTIME_ORIGIN`이 없고 로컬 실시간
  서버(Nest Socket.IO / Cloudflare DO)도 없다. `/studio?room=…`으로 서버 경로를 강제해도 프로바이더는
  로컬 모드로 떨어진다. 따라서 협업 수치는 **"연결 실패까지"의 비용**이며 실제 문서 동기화 지연이 아니다.
- **로그인·저장된 작품이 필요한 라이브 서브패널.** `StudioLiveCollaborationPanel`은
  `workId && viewer.status === "active"`에서만 렌더된다. 익명 세션에서는 마운트 자체가 없다.
- **서버 왕복이 포함된 임시저장.** 프리뷰에 `/api/*` 백엔드가 없어 세션·저장 호출이 502다.
  아래 임시저장 수치는 **클라이언트 측 비용만**이다.
- **`/vrm/` 반복 오픈.** 프로덕션 `vercel.json`은 `/vrm/(.*)`에 `max-age=31536000, immutable`을 주지만
  `vite preview`는 주지 않는다. JSON의 VRM `warm` 바이트(7.1 MB 재다운로드)는 프리뷰 서버 아티팩트이므로
  **첫 오픈 비용만 유효**하다.

---

## 2. 기능별 비용표

`bytes`는 gzip 전송 실측. `warm`은 같은 세션에서 닫고 다시 연 값.

| 기능 | 시나리오 | openMs | settleMs | bytes | 요청 | long task 합/최대 | warm open |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 문서 로드 | `/studio` 콜드 부팅 | **1,068** | 1,708 | **4.51 MB** | **268** | 118 / 68 ms | — |
| 3D/VRM | 3D 캐릭터(VRM 포저) | 448 | 1,161 | **7.83 MB** | 57 | 217 / 164 ms | 84 ms |
| 3D/VRM | 3D 배경(3D 장면 스튜디오) | 386 | 1,035 | 536 KB | 24 | 0 | 84 ms |
| 3D/VRM | Hybrid 3D DCC | 387 | 387 | 378 KB | 9 | 0 | 58 ms |
| 3D/VRM | 3D 데생 인형 | 838 | 838 | 223 KB | 6 | 0 | 71 ms |
| 패널 오픈 | 필터 다이얼로그(⌘⇧1) | 243 | 1,098 | **1.03 MB** | 35 | 110 / 110 ms | 177 ms |
| 패널 오픈 | 브러시 전체 라이브러리 | 838 | 838 | 14 KB | 3 | 0 | 57 ms |
| 패널 오픈 | 템플릿·에셋 시트 | 66 | 66 | 57 KB | 8 | 0 | 57 ms |
| 패널 오픈 | 인스펙터 재오픈 | 71 | 145 | 185 B | 1 | 0 | — |
| 타임라인 | 애니매틱 타임라인 | 827 | 827 | 12 KB | 2 | 0 | 41 ms |
| 타임라인 | 다중 레이어 타임라인 | 3,005¹ | 3,005¹ | 8 KB | 2 | 0 | 2,215¹ |
| 내보내기 | 내보내기 옵션 패널 | 850 | 850 | 56 KB | 9 | 0 | — |
| 내보내기 | PNG 현재 페이지 | 97 | 97 | 29 KB | 5 | 0 | — |
| 내보내기 | PSD (레이어별) | 137 | 137 | 91 KB | 3 | 0 | — |
| 내보내기 | 규격 슬라이스(네이버 도전만화) | 85 | 85 | 6 KB | 1 | 0 | — |
| 내보내기 | SVG (벡터) | 50 | 50 | 2 KB | 1 | 0 | — |
| 협업 | 팀 작업 공간 패널 | 842 | 842 | 28 KB | 2 | 0 | 56 ms |
| 협업 | `?room=` 라이브 룸 부팅 | 1,432 | 1,655 | 4.43 MB | 260 | 63 / 63 ms | — |
| 문서 로드 | 10페이지 구성 | — | 35 | 8 KB | 1 | 0 | — |
| 문서 로드 | 30페이지 구성 | — | 1,124 | 8 KB | 2 | 0 | — |

바이트는 십진(1 MB = 10⁶ B) 기준이며 JSON의 원시 바이트 값을 반올림한 것이다.

¹ 계측 아티팩트가 섞인 값이다. 트리거가 `display:none` 컨테이너 안에 있어 1.2초 클릭 타임아웃이
포함돼 있다. 프로그램적으로 dispatch하면 패널은 **797–807 ms**에 뜬다(§4-1).

### 내보내기 — 단계 분해

내보내기 시나리오는 모두 **펜으로 14획을 실제로 그린 뒤** 측정했다. 빈 문서 내보내기는 아무도 겪지 않는
숫자이기 때문이다. 산출물이 실제로 저장됐는지도 확인했다.

| 내보내기 | 코드 도착까지 | 캡처+인코딩+저장 | 총 클릭→다운로드 | 저장된 파일 |
| --- | ---: | ---: | ---: | --- |
| PNG 현재 페이지 | 29 KB | — | **97 ms** | `toonspectrum-comic.png` 179 KB |
| PSD (레이어별) | 91 KB | — | **137 ms** | `toonspectrum-comic.psd` 393 KB |
| 규격 슬라이스 JPG | 6 KB | — | **85 ms** | `…-naver-challenge.jpg` 31 KB |
| SVG 벡터 | 2 KB | — | **50 ms** | `toonspectrum-comic.svg` 182 KB |

**내보내기는 병목이 아니다.** 이 콘텐츠 규모에서 전 경로가 50–137 ms 안에 다운로드까지 끝난다.
다만 규격 슬라이스는 장수에 비례해 `studio-export-presets.ts:610`의 **슬라이스당 250 ms 고정 대기**가
누적된다(브라우저 연속 다운로드 차단 회피용). 10장이면 순수 대기만 2.25초다 — 콘텐츠 비용이 아니라
설계상의 상수이므로, 장수가 많은 회차에서는 이것이 체감 시간의 대부분이 된다.

### 문서 로드 / 오토세이브

- 페이지 추가: **p50 55 ms, p95 67 ms**(10페이지) → **p50 58 ms, p95 75 ms**(30페이지).
  10 → 30페이지에서 페이지당 비용이 사실상 늘지 않는다. 페이지 수는 병목이 아니다.
- 임시저장(클라이언트 측): 30페이지 문서에서 **51 ms**, 10페이지에서 176 ms. long task 0.
- 오토세이브 주기: 로컬 디바운스 **1,500 ms**(`StudioPage.tsx:9621`, OPFS 우선 + localStorage 미러),
  서버 오토세이브 유휴 **45,000 ms**(`StudioPage.tsx:2258`), 그림자 미러 레인 1,500 ms
  (`studio-shadow-autosave.ts:53`). 세 레인이 동시에 돈다.

---

## 3. 앱 전체의 정적 무게 (배포 산출물)

런타임 측정과 별개로, 방금 만든 `dist/`의 실제 구성이다.

| 영역 | 크기 | 비고 |
| --- | ---: | --- |
| `dist/` 전체 | **739 MB** | |
| `dist/vrm/` | **470 MB** | `.vrm` 88개, 개당 15–20 MB |
| `dist/assets/` | 161 MB | JS 청크 829개 + wasm |
| `dist/data/` | 66 MB | 카탈로그 스냅샷 |
| `dist/audio/` | 16 MB | |

gzip 기준 상위 자산: `opencascade.wasm` 13.7 MB, `vision_wasm_internal` 3.27 MB,
`vision_wasm_nosimd` 3.18 MB, `canvaskit.wasm` 2.89 MB, `vips.wasm` 1.98 MB,
`rhino3dm.wasm` 1.03 MB, `studio-bg3d-physics.worker` 857 KB, `studio-bg3d-babylon-runtime` 856 KB,
`StudioPage` 561 KB.

이들 대부분은 사용자가 해당 기능을 열기 전에는 전송되지 않는다(측정으로 확인). 문제는 **배포/캐시 무게**와
**콜드 부팅에 이미 들어와 있는 것들**이다.

---

## 4. 가장 비싼 5가지 — 근거와 개선안

### 4-1. 툴벨트 전용 기능 7종이 모든 뷰포트에서 포인터로 도달 불가 (P0)

**증거.** 툴벨트 호스트는 데스크톱에서 `lg:hidden` + `inert`, 모바일에서 `mobileImmersive && max-lg:hidden`
이다(`StudioPage.tsx:40369-40378`). 두 조건이 합쳐져 **1600×1000 / 900×1000 / 430×932 세 뷰포트 모두에서
`display:none`** 이다. 트리거 버튼의 `getBoundingClientRect()`는 `w=0, h=0`이고 조상 중 `display:none`
호스트가 잡힌다. 이 상태로 벨트 전용 컨트롤 **22개**가 DOM에는 있으나 클릭할 수 없다.

8개 상단 메뉴 + 프로젝트 작업 + 내보내기 옵션 + 템플릿·에셋 + 툴바 설정 + 패널 찾기 + 도구 빠른 실행을
모두 열어 **가시 컨트롤 이름 336개**를 수집해 교차 검증했다. 아래 7종은 **어디에서도 발견되지 않았다.**

- 다중 레이어 타임라인
- 타임랩스 녹화
- 스토리보드 그리드 보기
- 세로 스크롤 미리보기
- 이야기 연속성 검사
- 문서 댓글
- 페이지 검토와 편집 잠금

(나머지 15개 — 패널·사선 컷·프레임·텍스트·배경·줌 컨트롤 등 — 은 레일이나 보기 메뉴에 대체 진입점이 있다.)

**왜 "느리다"로 체감되는가.** 기능이 없어진 게 아니라 열리지 않는다. 그리고 열리기만 하면 빠르다 —
프로그램적으로 dispatch하면 다중 레이어 타임라인 패널은 **797–807 ms**에 뜨고(코드 8 KB, long task 0),
재생헤드 스크럽은 **16–25 ms/스텝**으로 60 fps에 근접한다. 즉 이건 성능 문제가 아니라 **진입점 회귀**다.

**개선안.**
1. `lg:hidden`과 `mobileImmersive && max-lg:hidden`이 겹쳐 전 구간을 덮는다는 사실을 테스트로 고정한다.
   "각 뷰포트에서 벨트 호스트가 보이거나, 벨트 전용 액션마다 가시 대체 진입점이 존재한다"는 불변식.
2. 위 7종을 데스크톱 진입점으로 승격한다. 다중 레이어 타임라인·세로 스크롤 미리보기·스토리보드 그리드는
   **보기 메뉴**로, 타임랩스 녹화·이야기 연속성 검사·문서 댓글·페이지 검토 잠금은 **프로젝트 작업 메뉴**로
   옮기는 것이 기존 정보구조와 가장 잘 맞는다.
3. 회귀 감시: 접근성 이름별로 "적어도 한 뷰포트에서 가시" 스냅샷을 CI에 넣는다.

### 4-2. 콜드 부팅 4.51 MB 중 2.06 MB가 서브셋되지 않은 웹폰트 (P0)

**증거.** 별도 요청 인구조사(같은 조건, 271요청 4.51 MB)의 확장자별 분해:
**woff2 2.06 MB (45.6 %)**, js 2.18 MB, css 54 KB,
json 46 KB, png 42 KB. 단일 최대 요청은
`cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/…/PretendardVariable.woff2` **2,058,664 B**
— StudioPage 청크(566 KB)의 3.6배다. 여기에 Google Fonts `/css2` 102 KB가 더해진다.
`index.html:100` 주석은 이 폰트를 "렌더 임계 경로"로 명시하고 preconnect까지 걸어 둔다.

**개선안.**
1. `pretendardvariable.min.css` → **`pretendardvariable-dynamic-subset.min.css`** 로 교체한다.
   같은 jsDelivr 경로에 존재함을 확인했다(HTTP 200). `unicode-range` 서브셋으로 쪼개져 실제 사용 글자
   범위만 받으므로 한국어 UI 기준 통상 수십 KB다. **부팅에서 약 2 MB가 즉시 사라진다.**
   CSP `font-src`에 `cdn.jsdelivr.net`이 이미 있어 정책 변경도 필요 없다.
2. Google Fonts(`Nanum Myeongjo`, `Space Grotesk`)는 UI 본문에 쓰이지 않는다면 셀프호스팅하거나
   실제 사용 화면에서만 지연 로드한다. `/css2` 102 KB + 뒤따르는 gstatic 폰트 왕복이 사라진다.
3. 두 CDN 모두 서드파티다. 부팅 임계 경로에서 서드파티 왕복을 없애면 지연의 분산도 함께 줄어든다.

### 4-3. VRM 포저 첫 진입 7.83 MB — 기본 아바타 한 개가 7.29 MB (P1)

**증거.** `3D 캐릭터` 오픈 시 전송 7,834,345 B / 57요청. 내역은 `/vrm/sample.vrm` **7,287,909 B**,
`StudioVrmPoser` 189 KB, `three.module` 184 KB, `react-three-fiber` 50 KB, `three-vrm` 34 KB.
즉 **93 %가 모델 파일 하나**다. long task 217 ms(최대 164 ms)도 여기서 발생한다.
배포본에는 `.vrm` 88개 **470 MB**가 들어 있다(`dist/` 전체 739 MB의 64 %).

**개선안.**
1. 기본 아바타를 경량 모델로 교체하거나 draco/meshopt 압축 + 텍스처 축소를 적용한다. VRM 기본 진입에
   7 MB짜리 풀 텍스처 모델이 필요하지 않다. 목표: 기본 아바타 1 MB 이하.
2. 88개 모델을 배포 산출물에서 분리해 온디맨드 오리진(오브젝트 스토리지/CDN)으로 옮긴다.
   `vercel.json`의 `/vrm/(.*) max-age=31536000, immutable`은 이미 있으므로 캐시 전략은 그대로 재사용된다.
   배포 산출물이 739 MB → 약 270 MB로 줄어 빌드·업로드·콜드 스타트가 모두 가벼워진다.
3. 라이브러리 썸네일은 모델 본체가 아니라 별도 경량 프리뷰 이미지로 렌더한다.

### 4-4. 필터 다이얼로그 오픈이 SQLite wasm 865 KB를 끌어온다 (P1)

**증거.** ⌘⇧1로 필터 다이얼로그를 열면 오픈 자체는 **243 ms**로 빠른데 전송이 **1.03 MB**다.
내역은 `sqlite3-*.wasm` **865,028 B** + sqlite 글루 `dist-*.js` 63 KB = **928 KB (전체의 90 %)**.
정작 `StudioFilterDialog` 청크는 10 KB, 필터 카탈로그 10 KB, konva 필터 10 KB에 불과하다.
long task 110 ms도 이 구간에 있다.

경로는 `studio-filter-island-plan.ts:154`가 `installStudioTournamentSqlitePersistence()`를 호출하고,
`studio-local-database.ts:695`의 `await import("@sqlite.org/sqlite-wasm")`가 실행되는 것이다.
이는 렌더러 레인 선택 실험(tournament) 결과를 남기기 위한 **관측·실험용 영속화**이지 필터 기능 자체가
아니다. 사용자 인터랙션 경로에서 900 KB wasm을 받는 대가로 얻는 게 텔레메트리다.

**개선안.**
1. tournament 영속화를 사용자 인터랙션에서 떼어내 `requestIdleCallback`(또는 첫 유휴 이후)로 미룬다.
   필터 다이얼로그 오픈 비용이 1.03 MB → 약 98 KB로 떨어진다.
2. 더 낫게는, 기록 대상이 소량 이벤트이므로 SQLite wasm 대신 IndexedDB/`localStorage` 저널로 충분한지
   재검토한다. 865 KB wasm은 이 용도에 과하다.
3. 최소한 프로덕션에서는 기본 비활성화하고 진단 플래그 뒤로 보낸다.

### 4-5. StudioPage 단일 청크 566 KB(원본 1.92 MB) + 소스 42,149줄 (P2)

**증거.** `StudioPage-*.js`는 부팅에서 두 번째로 큰 요청(566,037 B gzip / 1,923,881 B raw)이고
부팅 JS 2.18 MB의 26 %다. 소스 `src/domains/creator/StudioPage.tsx`는 **42,149줄**이며 빌드 로그에
`[BABEL] Note: The code generator has deoptimised the styling of …/StudioPage.tsx as it exceeds the max of 500KB`
가 남는다. 빌드 전체가 `@rolldown/plugin-babel`에 **91 %** 를 쓴다(`[PLUGIN_TIMINGS]`).

부팅 long task는 총 118 ms(최대 68 ms)로 아직 치명적이지는 않다 — M2 Max 기준이라는 점을 감안해야 한다.
저사양 기기에서는 같은 파싱·평가량이 몇 배로 커진다.

**개선안.**
1. 이건 "성능 벨로시티" 문제로 다루는 게 정확하다. 지금 당장 사용자 지연을 만들지는 않지만,
   Babel 디옵트 + 91 % 빌드 시간이 모든 반복 주기를 느리게 하고 회귀 감지를 늦춘다.
2. `studio-page-lazy-ui.ts`(약 150개 동적 경계)라는 이미 검증된 패턴이 있으므로, 부팅에 필요 없는
   서브시스템을 이 파일 밖으로 옮기는 작업을 계속한다. 우선순위는 부팅 경로에서 실행되지 않는 핸들러 군.
3. 빌드 로그의 `[INEFFECTIVE_DYNAMIC_IMPORT]` 경고(예: `studio-content-aware-fill.ts`가 동적·정적
   양쪽에서 import되어 청크 분리가 무효화됨)를 먼저 처리하면 비용 대비 효과가 크다.

---

## 5. 병목이 **아닌** 것으로 확인된 것

추측을 지우는 것도 결과다.

- **내보내기 전체(PNG/PSD/규격 슬라이스/SVG).** 14획 콘텐츠 기준 50–137 ms에 다운로드까지 완료.
  다만 규격 슬라이스는 장당 250 ms 고정 대기가 누적된다.
- **페이지 수.** 10 → 30페이지에서 페이지 추가 p50이 55 → 58 ms. 사실상 평탄하다.
- **임시저장(클라이언트 측).** 30페이지에서 51 ms, long task 0.
- **패널 재오픈.** 콜드 진입 후에는 3D 배경 84 ms, 데생 인형 71 ms, Hybrid DCC 58 ms,
  브러시 라이브러리 57 ms, 팀 패널 56 ms로 모두 100 ms 이하다. lazy 경계 자체는 제 역할을 한다.
- **다중 레이어 타임라인의 스크럽.** 16–25 ms/스텝. 문제는 §4-1의 도달성이지 렌더가 아니다.

---

## 6. 우선순위 제안

| 순위 | 항목 | 기대 효과 | 난이도 |
| --- | --- | --- | --- |
| 1 | 툴벨트 전용 7기능 진입점 복구 (§4-1) | 기능 7종이 다시 사용 가능 | 낮음 |
| 2 | Pretendard dynamic-subset 전환 (§4-2) | 콜드 부팅 −2 MB (−45 %) | 매우 낮음 |
| 3 | 필터 오픈 경로에서 SQLite wasm 분리 (§4-4) | 필터 오픈 −928 KB (−90 %) | 낮음 |
| 4 | VRM 기본 아바타 경량화 + 88모델 외부화 (§4-3) | 포저 첫 진입 −6 MB, 배포 −470 MB | 중간 |
| 5 | 규격 슬라이스 250 ms 대기 재검토 (§2) | 다장 회차 내보내기 체감 단축 | 낮음 |
| 6 | StudioPage 분할 계속 (§4-5) | 빌드·회귀 주기 개선, 저사양 부팅 여유 | 높음 |

---

## 7. 재현

```bash
pnpm run build
pnpm exec vite preview --host 127.0.0.1 --port 4399 --strictPort
pnpm exec tsx tests/benchmarks/harness/heavy-feature-perf.ts
```

`HEAVY_PERF_BASE_URL`로 다른 오리진을, `PLAYWRIGHT_CHANNEL`로 다른 브라우저 채널을 겨냥할 수 있다.
결과는 `tests/benchmarks/results/heavy-feature-perf.json`에 덮어쓴다.
