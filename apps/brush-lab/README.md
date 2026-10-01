# ToonStudio Brush Lab

- 상태: **현재(current)** — 2026-10-01 작업 트리 기준. 레인별 구현 상태의 권위는 `src/lanes/registry.ts`(아래 표와 1:1)다.
- 목적: 차세대 GPGPU 브러시 엔진 **Sumi**(자체 WebGPU compute 타일 파이프라인)와 **브러시 인증 테스트 벤치**를
  한 곳에서 실험한다. 브러시 **품질·성능 테스트만** 한다(undo·레이어·문서·저장·서버 연동 없음). 여기서 통과한
  브러시·엔진은 [승격 프로세스](docs/drafts/brush-lab-promotion-process.md)를 거쳐 본 서비스(`apps/web`)에 적용한다.

`apps/brush-lab`은 pnpm workspace `@toonstudio/brush-lab`이며 source와 빌드 설정을 이 디렉터리가 소유한다.
서버 기능이 없는 정적 Vite 앱이고 운영 배포 대상이 아니다.

## 명령

```sh
pnpm --filter @toonstudio/brush-lab dev        # http://localhost:4178
pnpm --filter @toonstudio/brush-lab typecheck  # tsc -p tsconfig.json
pnpm --filter @toonstudio/brush-lab test       # vitest run src (앱 로컬 설정, setup 없음)
pnpm --filter @toonstudio/brush-lab build      # apps/brush-lab/dist/ (ES module worker 청크 포함)
pnpm --filter @toonstudio/brush-lab preview    # http://localhost:4179
```

루트에서는 `pnpm dev:brush-lab`, `pnpm typecheck:brush-lab`, `pnpm test:brush-lab`, `pnpm build:brush-lab`을 쓴다.
루트 Vitest 설정으로도 같은 테스트가 통과해야 한다(`pnpm exec vitest run apps/brush-lab/src/app apps/brush-lab/src/platform`
처럼 경로를 좁혀 실행). 변경 파일 lint는 `pnpm exec eslint --max-warnings=0 <files>`다. 생성물 `dist/`는 git이 무시한다.
브라우저 게이트(`BRUSH_LAB_BROWSER_PROBE=1`, Playwright)와 wasm 빌드 명령은 확장 범위이며 통합 담당이 `package.json`에 추가한다.

## 디렉터리 구조

```text
src/
  boundary.test.ts      경계 게이트(apps/* import·@/·mixbox 부재, engine/ 외부 import 0)
  engine/               ★ Sumi 엔진 코어(승격 단위, 상대 import·zod만)
    core/ input/ physics/ dynamics/ texture/ raster/ pigment/ wet/ presets/ gpu/(layout·device·buffers·timing·pipeline·WGSL) webgl2/ wasm/
  lanes/                레인 계약(lane.ts)·레지스트리(registry.ts)·레인 구현(cpu-reference, platform-baseline, canvas2d, webgpu-compute, webgpu-instanced, hybrid, reserved)
  bench/                fixture 9종·지표(texture/render/handfeel/perf/family)·인증 리포트(스키마·임계값·buildReport·직렬화·PNG)·러너
  platform/             브라우저 어댑터: PointerEvent 캡처, rAF 프레임 스케줄러, Blob 다운로드, 캔버스 표시, 갤러리 Worker 클라이언트
  app/                  React 19 랩 UI
    bootstrap/main.tsx  shell/BrushLabApp.tsx(탭 셸)  state/(lab-store·run-compare·live-session·apply-overrides)
    ui/(CapabilityBanner·LaneSelector·BrushParamPanel·FixturePicker·LaneCanvas·DiffHeatmap·MetricsTable·ReportPanel·FamilyGallery·PresetCard)
    views/(GalleryView·CompareView·ReportView)  workers/gallery-render.worker.ts(ES module worker)  styles/brush-lab.css  testing/(모의 레인·러너·캔버스 스텁)
docs/drafts/            저장소 공용 docs/로 옮길 문서 초안 3종(통합 담당이 배치·등록)
wasm/ scripts/          Rust C-ABI wasm 커널·브라우저 프로브 자리(engine-gpu 확장 범위, 2026-10-01 현재 비어 있음)
```

레이어 의존 방향은 `app → platform → bench → lanes → engine`이며 `engine/`은 외부 import가 0이다(`@toonstudio/*`·react·DOM 전역 금지).

## 레인 상태 표

`src/lanes/registry.ts`의 `LANE_REGISTRY`가 단일 원천이다. 이 표는 `laneStatusTableMarkdown()` 출력과 같아야 하며
`src/lanes/registry.test.ts`가 드리프트를 고정한다. 상태 어휘는 `implemented`(Node에서 검증됨),
`browser-verification-required`(이 컨테이너에는 GPU·DOM 캔버스가 없어 실기기 픽셀 미검증), `reserved`(예약·미구현)다.

| 레인 ID | 종류 | 상태 | Node 검증 | 브라우저 검증 |
| --- | --- | --- | --- | --- |
| cpu-reference | baseline | implemented | 전체(9 fixture 픽셀 해시·결정성·addSamples 분할 = 일괄·dispose 오류) | 선택 |
| platform-baseline | baseline | implemented | 픽셀 해시·결정성·cpu-reference 대비 IoU 범위·even-odd 래스터 오라클 | 선택 |
| canvas2d | baseline | browser-verification-required | probe dom-unavailable 경로·모의 2D 컨텍스트 호출 계약(dab당 arc 1회·globalAlpha = flow) | 필요(실제 CanvasRenderingContext2D 픽셀·getImageData) |
| webgpu-compute | candidate | browser-verification-required | WGSL 정적 계약·fake 장치 바인딩/디스패치/제출 계약·예산·오류 표면화 | WGSL 실컴파일·cpu-reference 패리티(δ48 ≤ 0.5%, ΔE p99 < 1.0)·결정성(scripts/browser-probe.mjs) |
| webgpu-instanced | comparison | browser-verification-required | WGSL 정적 계약·fake 장치로 draw(6,n)·bake/encode 패스·미지원 프로그램 거부 | 실컴파일·compute 레인 대비 f16 누적 차이(허용 오차)·실기기 픽셀 |
| webgl2-instanced | comparison | reserved | probe not-implemented 경로만(engine-gpu 확장 예약) | — |
| wasm-cpu | candidate | reserved | probe not-implemented 경로만(INTEGRITY 봉인 후 구현) | — |
| wasm-gpu-hybrid | candidate | reserved | probe가 not-implemented를 구조화 반환·init이 LaneUnavailableError | 없음(미구현) |

레인이 unavailable이면 UI 배너와 셀렉터에 사유 코드(`webgpu-api-unavailable`, `dom-unavailable`, `not-implemented` 등)를
표시하고 **다른 레인으로 자동 전환하지 않는다**(ADR-0018, 무음 대체 금지). 소프트웨어 렌더러(swiftshader 등)로 판정된
레인은 배지로 경고하며 성능 증거로 쓰지 않는다.

## 랩 UI

탭 3개(`role="tablist"`, 화살표·Home·End 키 이동)로 구성되며 상태는 `app/state/lab-store.ts`(`useSyncExternalStore`, 외부 의존성 0)에 있다.

| 탭 | 구성 | 상태 흐름 |
| --- | --- | --- |
| 갤러리 | `FamilyGallery` → `PresetCard` × 30: 같은 fixture(zigzag 256²)를 모든 프리셋으로 **Worker**(`cpu-reference` 경로)에서 렌더. 결정성 해시(fnv1a64, 리포트 `pixelHash`와 동일 함수)·렌더 시간·dab 수·가족 지표 PASS/FAIL/UNAVAILABLE | `gallery.entries[presetId]`; Worker 실패는 오류 카드(메인 스레드 대체 렌더 없음) |
| A/B 비교 | `LaneSelector`(A/B, 레지스트리 기반, 미지원 레인 비활성 + 사유), `FixturePicker`(fixture 9종·캡처 획·캔버스 256/512/1024·시드·실시간 입력·결정성 재실행·캡처 JSON 저장/불러오기), `BrushParamPanel`(크기·경도·간격·불투명도·흐름·산포·안정화·팁 텍스처·샘플링 필터·그레인·습식 베타·KM 베타, configHash 즉시 표시), `LaneCanvas` A \| B \| `DiffHeatmap`(ΔE 램프), `MetricsTable`(지표·임계값·판정), `ReportPanel`(JSON/PNG 다운로드) | `runCompare`: A → B 순차 실행 → `compareLanes` → 리포트 2개(B는 A를 참조 레인으로 ΔE·IoU·퍼지 비교, 결정성 재실행 시 해시 동일 판정) → `results`·`reports` |
| 리포트 | 세션 리포트 목록·정규 직렬화 원문·JSON 다운로드 | `reports[]`(세션 메모리에만) |

실시간 입력(레인 A 캔버스)은 `platform/pointer-capture.ts`가 `getCoalescedEvents()`를 정본으로, `getPredictedEvents()`를
**미리보기 레이어 전용**으로 태깅하고, `platform/raf-scheduler.ts`가 프레임당 `addSamples` 1회 계약을 보장한다. 획이 끝나면
정본 표본이 캡처 획으로 저장돼 바로 A/B 리플레이로 이어진다. 다운로드는 `URL.revokeObjectURL`을 보장한다.
접근성: 44 px 이상 터치 타깃, `:focus-visible`, `prefers-contrast: more`, `forced-colors`, `prefers-reduced-motion`, 한글 UI 문구.

## 경계

- `apps/web`, `apps/admin-web`, `apps/api`, `apps/character-lab` source를 import하지 않는다(`scripts/validate-app-boundaries.mjs`의
  `brushLabToApps`·`appsToLabs` ratchet = 0).
- `@toonstudio/studio-brush-platform`·`@toonstudio/studio-project-model`은 `src/lanes/platform-baseline-lane.ts`에서만,
  `@toonstudio/studio-engine-registry`는 `bench/metrics/render-metrics.test.ts`(δ48 교차 검증)에서만 쓴다.
- `src/engine/**`은 `@toonstudio/*`·react·DOM 전역·`Math.random`·`Date.now`를 참조하지 않는다. zod는 `presets/program-schema.ts`·`wet/params.ts`만.
- `@/` alias 금지(상대 경로만). mixbox(CC BY-NC)·Krita 등 GPL 코드·canvaskit 유입 금지. `src/boundary.test.ts`가 거부한다.

## 의존성·라이선스

| 패키지 | 버전 | 라이선스 | 용도 |
| --- | --- | --- | --- |
| react / react-dom | ^19.2.7 | MIT | 랩 UI |
| zod | 4.4.3(exact) | MIT | 브러시 프로그램·fixture·인증 리포트 스키마 |
| @toonstudio/studio-brush-platform / studio-project-model / studio-engine-registry | workspace:* | 저장소 내부 | 현행 서비스 기준선 레인·δ48 교차 검증 |
| vite / @vitejs/plugin-react | ^8.0.16 / ^6.0.2 | MIT | 정적 빌드·ES module worker |
| vitest / jsdom / @testing-library/react | 4.1.11 / ^29 / ^16.3.2 | MIT | Node·jsdom 테스트 |
| typescript | ~6.0.3 | Apache-2.0 | typecheck(WebGPU 타입은 DOM lib 제공, `@webgpu/types` 미사용) |

참고 코드는 개념·수식만 재구현했고 외부 비트맵·재질 에셋은 0개다. 라이선스 판정 원장은
[brush-lab 참고 문헌 원장](../../docs/engines/labs-brush-engine-references-2026-10-01.md)이다.

## 알려진 한계·브라우저 미검증

- 이 컨테이너에는 GPU가 없다. `webgpu-compute`·`webgpu-instanced`는 모의 `GPUDevice`로 바인딩·디스패치·제출 계약만 검증했으며
  레지스트리 상태 `browser-verification-required`대로 **실기기 픽셀을 검증했다고 보고하지 않는다**. `canvas2d`는 jsdom에 캔버스가 없어 모의 컨텍스트 계약만 검증했다.
- 캔버스 상한 2048²(타일 16 384개), 대형 dab(타일 4096개 초과)은 fail-visible overflow로 기록된다.
- 갤러리 가족 지표의 임계값은 자체 정의 목표이며 브라우저 실측 전까지 "달성"으로 보고하지 않는다.
- 안정화 강도 0.6 초과 구간의 spring 팔로워 백엔드는 이 랩에 없고 같은 1€ 매핑을 쓴다(패널에 표시).
- 세션 리포트·캡처 획은 메모리에만 있다(서버·저장 없음). 필요하면 JSON으로 내려받는다.

## 승격 프로세스 요약

랩 실험 → 가족 지표 임계값 통과 → 인증 리포트(`<presetId>-<laneId>-<YYYYMMDD>.json`, 실 GPU `softwareRenderer:false` 최소 1개)를
`docs/evidence/brush-lab/`에 커밋 → `src/engine` → `packages/studio-brush-engine-sumi` 추출(경계 테스트·서비스 패키지 미의존) →
`apps/web` 레인 연결 PR(엔진 레지스트리 descriptor·라이선스 게이트·ADR-0018 단일 선택) → 회귀 게이트(픽셀 해시·δ48·성능 p95).
상세는 [승격 프로세스 초안](docs/drafts/brush-lab-promotion-process.md), 설계는
[Sumi 엔진 아키텍처 초안](docs/drafts/brush-lab-sumi-engine-architecture-2026-10-01.md), 증거 디렉터리 규약은
[증거 README 초안](docs/drafts/evidence-brush-lab-README.md), 결정 기록은
[ADR-0026](../../docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md)이다.

## 소유권

```text
index.html, vite.config.ts, tsconfig.json, package.json   통합 담당
src/engine, src/lanes/{lane,registry,cpu-reference-lane}  core 작업자
src/engine/gpu, src/lanes/{webgpu,canvas2d,webgl2,wasm}   engine-gpu 작업자
src/bench, src/lanes/platform-baseline-lane               bench 작업자
src/platform, src/app, README.md, AGENTS.md, docs/drafts  ui 작업자
```
