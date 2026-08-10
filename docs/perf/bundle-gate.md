# 번들 게이트 정책 (`scripts/check-studio-bundle.mjs`)

2026-08-08 기동 실측([`startup-findings.md`](./startup-findings.md))이 게이트의 사각지대 두 겹을
드러냈다. 이 문서는 그 뒤에 확정된 정책 — **무엇이 빌드를 깨뜨리고, 무엇이 관찰이며,
기준선을 어떻게 갱신하고, eager-dynamic을 어떻게 판정하는지** — 를 기록한다.

## 0. 고쳐진 두 가지 결함

| 결함 | 증상 | 조치 |
| --- | --- | --- |
| 초과를 보고하면서 `exit 0` | 12건 초과(app entry **4.73배**, Studio route 2.06배)가 "observation"으로 출력되고도 통과 | **ratchet**: 실측 기준선 대비 악화만 `exit 1` |
| "dynamic이면 지연"이라는 오판 | manifest상 dynamic이라 예산에서 빠진 청크가 사용자 입력 없이 기동 중 전부 로드 | **runtime probe**: 실제 브라우저 로드와 manifest 정적 폐포를 차집합 |

## 1. 세 층위 — 무엇이 실패인가

게이트가 출력하는 숫자는 성격이 셋이고, **실패시키는 것은 두 번째와 세 번째뿐이다.**

### 층위 A — reference budget (관찰, veto 아님)

`budgets = { ... }`의 값들. 2026-07-27 품질 우선 정책에 따라 **바이트와 정적 요청 수는
telemetry이지 릴리스 veto가 아니다**(`src/domains/creator/studio-build-size-advisory-policy-boundary.test.ts`가
이 성질을 잠그고 있다). 이 값은 "설계 목표에서 얼마나 멀어졌나"를 답한다.

출력은 경고 나열이 아니라 요약 표다:

```
reference budgets: 12 of 25 measurements exceed their design reference
item                                              current   reference  ratio
  app entry raw                                2354.2 KiB   498.0 KiB  4.73x
  Studio route raw                             6146.5 KiB  2988.3 KiB  2.06x
  ...
```

### 층위 B — ratchet (실패)

`scripts/bundle-baseline.json`에 고정된 **마지막으로 수용된 실측치**. 이 값은
"이번 빌드가 상황을 악화시켰나"를 답한다.

- 기준선 + 허용오차를 넘으면 → **`exit 1`**
- 같거나 줄면 → 통과. 개선은 보고되고 `--tighten`으로 잠글 수 있다
- 기준선에 없는 새 지표가 생기면 → **`exit 1`** (조용한 사각지대 재발 방지)
- 기준선 파일 자체가 없으면 → **`exit 1`**

허용오차:

| 종류 | 허용 | 근거 |
| --- | --- | --- |
| 바이트 | +2% | 코드젠 drift가 수백 바이트씩 흔들린다. 2%는 노이즈는 흡수하고 회귀는 못 흡수한다 |
| 청크 수 | +2%, 최소 +2개 | 작은 폐포(3~9청크)에서 비율만으로는 0이 되므로 절대 여유 2를 함께 둔다 |

기준선은 **명시적으로만** 갱신되므로 2% 여유가 매 빌드 누적되지 않는다. 늘리려면 사람이 한 번
결정을 내려야 한다.

### 층위 C — 구조 계약 (실패, 기존 그대로)

엔진 격리, dynamic 경계, Worker 고립, 테스트 소스 유출, 엔트리 modulepreload 제외, 앱 셸 i18n
청크 상한 등. 이들은 런타임 동작에 직결되므로 예전부터 hard fail이었고 지금도 그렇다.

## 2. 실행

```bash
node scripts/check-studio-bundle.mjs            # 기본: 정적 분석 + ratchet
node scripts/check-studio-bundle.mjs --verbose  # 전체 ratchet 표
node scripts/check-studio-bundle.mjs --runtime  # + 실제 브라우저 eager-dynamic 실측
```

| 플래그 | 환경변수 | 뜻 |
| --- | --- | --- |
| `--update-baseline` | `UPDATE_BUNDLE_BASELINE=1` | 현재 실측치를 기준선으로 재기록(양방향, 명시적 수용) |
| `--tighten` | `TIGHTEN_BUNDLE_BASELINE=1` | **개선분만** 잠근다. 절대 느슨해지지 않는다 |
| `--runtime` | `STUDIO_BUNDLE_RUNTIME=1` | eager-dynamic을 실제로 다시 측정 |
| `--verbose` | `STUDIO_BUNDLE_VERBOSE=1` | ratchet 전체 표 출력 |
| — | `STUDIO_BUNDLE_BASELINE=<path>` | 기준선 파일 위치(테스트/실험용) |
| — | `STUDIO_BUNDLE_RUNTIME_PORT` (기본 4288) | probe용 `vite preview` 포트 |
| — | `STUDIO_BUNDLE_RUNTIME_SETTLE_MS` (기본 5000) | 캔버스 등장 후 추가 관측 시간 |

`pnpm run check:studio-bundle`(= `pnpm run ci`의 마지막 단계)은 기본 모드로 돈다.
브라우저를 띄우는 `--runtime`은 **옵트인**이고, 기본 리포트에는 마지막으로 기록된 eager-dynamic
현황이 "재측정 안 함" 표시와 함께 나온다.

## 3. 기준선 갱신 절차

기준선은 **빌드 직후**에만 갱신한다. `dist/`가 최신이 아니면 잘못된 값을 잠근다.

```bash
pnpm run build
UPDATE_BUNDLE_BASELINE=1 node scripts/check-studio-bundle.mjs --runtime
git add scripts/bundle-baseline.json
```

- `--runtime`을 빼면 정적 지표만 갱신되고 기존 runtime 섹션은 보존된다.
- 커밋 메시지/PR 본문에 **왜 늘었는지**를 남긴다. 기준선 상향은 `budgets` 주석과 같은 급의
  결정이다(그 주석들이 반년치 결정 로그인 이유가 이것이다).
- 개선했을 때는 상향과 섞지 말고 `TIGHTEN_BUNDLE_BASELINE=1`로 잠근다. 그래야 되돌아가는 회귀가
  다음번에 잡힌다.

리뷰 관점: `scripts/bundle-baseline.json` diff에서 **증가한 줄**은 전부 정당화가 필요하고,
**감소한 줄**은 그대로 환영한다.

## 4. eager-dynamic 판정 방법

### 왜 manifest로는 판정할 수 없나

`checkDynamicBoundary`는 "이 모듈이 정적 그래프에 **없다**"만 증명한다. 그런데 이 조건은

- 버튼을 눌러야 로드되는 import 도
- 마운트 직후 `await`되는 import 도

똑같이 만족한다. 2026-08-08 실측에서 **manifest가 dynamic이라 부른 55개 청크(1,037 KiB)가
사용자 입력 없이 진입 1.1초 안에 전부 로드**됐다. 대표적으로 `studio-svg-export`는
`check-studio-bundle.mjs`가 "정적 그래프에 돌아오면 실패"로 지키던 바로 그 모듈인데,
`StudioInspectorAside`의 헬퍼 import 한 줄을 타고 dynamic 경계 뒤에 숨어 기동 시 그대로 로드됐다.

### 어떻게 판정하나

`--runtime`은 이렇게 동작한다.

1. `dist/`를 `vite preview`로 서빙(127.0.0.1 고정 — macOS에서 `localhost`는 ::1로 풀린다)
2. Playwright Chromium 1440×900, 온보딩 오버레이는 `localStorage`로 미리 닫음
3. `/studio` 콜드 진입 → Konva 표면이 붙을 때까지 대기 → 추가 settle(기본 5초)
4. `performance.getEntriesByType("resource")`의 `.js` 전량을 수집
   (Resource Timing 버퍼를 3000으로 올린다 — 기본값 250은 Studio에서 **잘린다**)
5. manifest 정적 폐포(StudioPage ∪ index.html)의 파일명 집합과 차집합
   → **"dynamic으로 선언됐지만 사용자 입력 없이 로드된"** 청크 목록

판정 기준은 시간 창이 아니라 **입력 없음**이다. 시간 창(예: "1초 안")은 머신 부하에 따라
흔들리지만, "아무것도 안 눌렀는데 받아졌다"는 부하와 무관하게 재현된다.

기록되는 지표는 4개다.

| 지표 | 뜻 |
| --- | --- |
| `startup JS requests` | 입력 없이 발생한 JS 요청 수 |
| `startup JS decoded bytes` | 그 파싱·평가 대상 바이트 |
| `eager-dynamic requests` | 그중 정적 폐포 밖 청크 수 |
| `eager-dynamic decoded bytes` | 그 바이트 |

여기에 **해시를 제거한 모듈 이름 목록**(`eagerDynamicChunks`)을 함께 기록한다. 콘텐츠 해시는
매 빌드 바뀌지만 모듈 정체성은 안 바뀌므로, 다음 실행에서 "무엇이 새로 eager가 됐는지"를
개수가 아니라 **이름으로** 보고할 수 있다.

```
newly eager vs baseline: studio-crdt-document, studio-svg-export, ...
no longer eager vs baseline: ...
```

이름 diff는 **보고**이고, `exit 1`을 만드는 것은 위 4개 지표의 ratchet이다.
(청크 분할·병합만으로도 이름은 흔들릴 수 있어서, 이름 변화 자체를 veto로 삼지 않는다.)

### 하니스와 숫자가 다른 이유

[`startup-findings.md`](./startup-findings.md)는 eagerDynamic 55개/1,037 KiB로 적었고,
이 게이트는 더 큰 값을 기록한다. 둘 다 맞다 — 측정 창이 다르다.

- 하니스는 Resource Timing **기본 버퍼 250개**에 걸려 잘렸다(그 실행의 `totalRequestCount`가
  정확히 250인 것이 그 증거다). 게이트는 버퍼를 3000으로 올린다.
- 게이트는 캔버스가 붙은 뒤 settle 구간까지 포함한다. 그 사이에 도착하는 것도 여전히
  "사용자가 아무것도 안 한" 로드다.

즉 게이트 쪽이 **더 완전한 계수**다. 두 숫자를 직접 비교하지 말고, 각자 자기 기준선과 비교하라.

## 5. 게이트가 실패했을 때

```
studio bundle check failed: app entry raw regressed to 2354.2 KiB
  (baseline 1150.0 KiB, max allowed 1173.0 KiB, 2.05x); shrink it or accept it with UPDATE_BUNDLE_BASELINE=1
```

순서대로 확인한다.

1. **의도한 증가인가?** 아니라면 되돌린다. `--verbose`로 어느 폐포가 커졌는지 좁힌다
   (route / after-app-shell / entry / 개별 Worker).
2. **정적 그래프에 들어오면 안 될 모듈이 들어왔나?** 구조 계약(층위 C) 실패가 함께 떠 있다면
   그게 원인이다.
3. **"lazy"라고 믿고 있던 것이 eager인가?** `--runtime`으로 확인한다. 조건 없이 렌더되는
   `React.lazy`, 마운트 `useEffect`의 `import()`, 헬퍼 하나 때문에 딸려오는 무거운 정적 의존이
   전형적인 원인이다.
4. 그래도 필요한 증가라면 §3 절차로 기준선을 올리고 **이유를 남긴다.**

## 6. 알려진 한계

- 기준선은 **빌드 산출물에 종속**이다. `dist/`가 오래됐으면 게이트가 오래된 사실을 검사한다.
  `pnpm run ci`는 `build` 다음에 `check:studio-bundle`을 돌리므로 CI 경로에서는 항상 최신이다.
- `--runtime`은 브라우저와 `node_modules`가 필요하고 한 번 실행에 수십 초가 든다. 그래서
  기본 게이트가 아니라 옵트인이다. 기준선의 runtime 섹션은 마지막 `--runtime` 실행 시점의
  스냅샷이며, 그 사실이 리포트에 timestamp와 함께 표시된다.
- ratchet은 **회귀 방지 장치이지 목표가 아니다.** 현재 기준선은 reference budget의 2~4.7배이며,
  그 격차를 좁히는 작업은 `startup-findings.md` §5의 우선순위를 따른다.
