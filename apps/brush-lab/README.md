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
브라우저 프로브와 wasm 빌드는 아직 `package.json` 스크립트가 아니다(통합 담당이 `test:browser`·`wasm:build`와 playwright devDependency를
추가한다). 그 전에는 아래 명령을 직접 쓴다.

```bash
# wasm 커널 재현 빌드(rustc/cargo + wasm32-unknown-unknown 필요). --check는 산출물·INTEGRITY·내장 TS 일치 검증
bash apps/brush-lab/wasm/sumi-kernel/build.sh
bash apps/brush-lab/wasm/sumi-kernel/build.sh --check

# 브라우저 프로브(게이트가 꺼져 있으면 즉시 0으로 종료). Playwright·Chromium이 필요하다. BRUSH_LAB_CHROMIUM_PATH가 없고 기본 Chromium을 실행할 수 없으면
# PLAYWRIGHT_BROWSERS_PATH(없으면 ~/.cache/ms-playwright)에 설치된 chromium-<rev>를 찾아 쓴다. Linux는 --use-webgpu-adapter=swiftshader(소프트웨어 WebGPU)로 띄운다
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --set smoke
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --lanes webgpu-compute,wasm-gpu-hybrid,wasm-cpu --presets pencil-hb,airbrush --fixtures zigzag,curve
# 인증 리포트(증빙 JSON)까지 쓴다: apps/brush-lab/docs/evidence/<presetId>-<laneId>-<YYYYMMDD>.json (같은 이름이 있으면 -2, -3 접미)
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --lanes webgpu-compute --presets pencil-hb,charcoal --fixtures zigzag --size 128 --reports apps/brush-lab/docs/evidence
# 습식 GPU 미러 점검(패리티 케이스 없이): 습식 장면(CPU 장면의 시작 상태를 GPU 습식 풀에 올려 1·60프레임 뒤 채널별 max|Δ|·질량·활성 타일 대조),
# 실제 프리셋 습식 파라미터 장면, 획 도중 상태 대조, 다획 지속 레이어, 합성 지그재그(CPU 해시 = 명세 §9.3 기준값), 장치 한도·타이밍 영수증 점검
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --skip-parity --wet-scenes --wet-preset-scenes --limits-check --timing-check --lanes webgpu-compute,webgpu-instanced
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --skip-parity --stroke-state sumi-ink-wet:spiral,oil-impasto:spiral --stroke-checkpoints 1,10,30,60 --seed 7
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --skip-parity --lanes webgpu-compute --sequences "watercolor-wet:curve>pencil-hb:line,oil-impasto:curve>oil-impasto:spiral"
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --skip-parity --lanes webgpu-compute --synthetic watercolor-wet,oil-impasto --size 256 --seed 1
```

프로브 종료 코드: 0 통과(또는 게이트 꺼짐), 1 WGSL 컴파일·패리티·결정성 실패, 2 브라우저/WebGPU 미지원(구조적 skip). 레인이 설계상 거부하는 프로그램(`not-implemented`, 예: 렌더 인스턴싱의 습식·smudge)은 실패가 아니라 `미지원`으로 기록한다.

## 디렉터리 구조

```text
src/
  boundary.test.ts      경계 게이트(apps/* import·@/·mixbox 부재, engine/ 외부 import 0)
  engine/               ★ Sumi 엔진 코어(승격 단위, 상대 import·zod만)
    core/ input/ physics/ dynamics/ texture/ raster/ pigment/ wet/ presets/ gpu/(layout·device·buffers·timing·pipeline·WGSL) webgl2/ wasm/
  lanes/                레인 계약(lane.ts)·레지스트리(registry.ts)·레인 구현(cpu-reference, platform-baseline, canvas2d, webgpu-compute, webgpu-instanced, webgl2-instanced, hybrid, reserved)
  bench/                fixture 9종·지표(texture/render/handfeel/perf/family)·인증 리포트(스키마·임계값·buildReport·직렬화·PNG)·러너
  platform/             브라우저 어댑터: PointerEvent 캡처, rAF 프레임 스케줄러, Blob 다운로드, 캔버스 표시, 갤러리 Worker 클라이언트
  app/                  React 19 랩 UI
    bootstrap/main.tsx  shell/BrushLabApp.tsx(탭 셸)  state/(lab-store·run-compare·live-session·apply-overrides)
    ui/(CapabilityBanner·LaneSelector·BrushParamPanel·FixturePicker·LaneCanvas·DiffHeatmap·MetricsTable·ReportPanel·FamilyGallery·PresetCard)
    views/(GalleryView·CompareView·ReportView)  workers/gallery-render.worker.ts(ES module worker)  styles/brush-lab.css  testing/(모의 레인·러너·캔버스 스텁)
docs/drafts/            저장소 공용 docs/로 옮길 문서 초안 3종(통합 담당이 배치·등록)
docs/evidence/          (커밋하지 않음) 브라우저 프로브 `--reports`가 쓰는 인증 리포트 출력 위치(`<presetId>-<laneId>-<YYYYMMDD>.json`)
wasm/sumi-kernel/       Rust C-ABI wasm 커널(std만, 외부 crate 0) 소스·`build.sh`·`pkg/`(산출 wasm + INTEGRITY.sha256)
scripts/                브라우저 프로브(browser-probe.mjs·browser-probe.html·browser-probe-page.mjs)
```

레이어 의존 방향은 `app → platform → bench → lanes → engine`이며 `engine/`은 외부 import가 0이다(`@toonstudio/*`·react·DOM 전역 금지).

## 레인 상태 표

`src/lanes/registry.ts`의 `LANE_REGISTRY`가 단일 원천이다. 이 표는 `laneStatusTableMarkdown()` 출력과 같아야 하며
`src/lanes/registry.test.ts`가 드리프트를 고정한다. 상태 어휘는 `implemented`(Node에서 검증됨),
`browser-verification-required`(실 GPU 어댑터에서의 픽셀·타이밍 미검증 — 헤드리스 Chromium의 SwiftShader 소프트웨어 렌더러 실측은 아래 "브라우저 검증" 열에 따로 적는다), `reserved`(예약·미구현)다.

| 레인 ID | 종류 | 상태 | Node 검증 | 브라우저 검증 |
| --- | --- | --- | --- | --- |
| cpu-reference | baseline | implemented | 전체(9 fixture 픽셀 해시·결정성·addSamples 분할 = 일괄·dispose 오류) | 선택 |
| platform-baseline | baseline | implemented | 픽셀 해시·결정성·cpu-reference 대비 IoU 범위·even-odd 래스터 오라클 | 선택 |
| canvas2d | baseline | browser-verification-required | probe dom-unavailable 경로·모의 2D 컨텍스트 호출 계약(dab당 arc 1회·globalAlpha = flow) | 헤드리스 Chromium의 실제 CanvasRenderingContext2D에서 실행·결정성 확인(기준선이라 cpu-reference와 픽셀이 다른 것이 정상: ΔE p99 24~100); 실기기 브라우저별 차이는 미검증 |
| webgpu-compute | candidate | browser-verification-required | WGSL 정적 계약(8모듈·습식 가족 바인딩·결정성 규칙)·fake 장치 바인딩/디스패치/제출 계약(습식 물 4패스·유화 5패스·정착 루프·평탄화)·예산(확장 풀·스냅샷·유화 스크래치를 장치가 실제로 받은 한도로 검증, 필요 한도는 requiredLimits로 요청)·오류 표면화 | SwiftShader(소프트웨어 렌더러) 실측: WGSL 11모듈 실컴파일 오류 0·카탈로그 31종(수채·수묵·구아슈·유화 포함) × fixture 3종 93건 전부 cpu-reference와 δ48 0%·ΔE p99 0(픽셀 해시 87건 동일, 채널 오차 ≤ 1/255)·재실행 결정성(128²)·100²·512²·1024²·습식 상태 대조(장면·획 도중 질량 상대 오차 ≤ 1.3e-6)·다획 지속 레이어 8종·합성 지그재그 습식 5종(CPU 해시 명세 일치); 실 GPU(softwareRenderer false)·성능 미검증(scripts/browser-probe.mjs) |
| webgpu-instanced | comparison | browser-verification-required | WGSL 정적 계약·fake 장치로 draw(6,n)·bake/encode 패스·미지원 프로그램 거부 | SwiftShader 실측: 실컴파일 오류 0·건식 12종 cpu-reference 대비 ΔE p99 ≤ 0.96(f16 누적)·결정성, smudge·습식·임파스토는 설계상 not-implemented 거부; 실 GPU 미검증 |
| webgl2-instanced | comparison | browser-verification-required | GLSL 정적 검사·모의 WebGL2로 프레임당 drawArraysInstanced 1회·bake/encode·확장 부재 feature-missing | SwiftShader(ANGLE) 실측: GLSL 실컴파일·EXT_color_buffer_float·결정성, 건식 12종 cpu-reference 대비 ΔE p99 0~4.9(f16 누적, halftone 최대, 비교 레인); 실 GPU 미검증 |
| wasm-cpu | candidate | implemented | INTEGRITY 봉인·변조 거부·재현 빌드·TS 참조 일치(해시·커버리지·CSR·표면 문서; 임파스토·습식 층 포함) | Chromium 실측: WebAssembly 로드·cpu-reference 패리티(스모크·증빙 대상 전부 ΔE p99 0, 습식·임파스토 포함)·결정성; 실 CPU 성능은 측정하지 않음 |
| wasm-gpu-hybrid | candidate | browser-verification-required | wasm 로드·INTEGRITY·모의 장치로 비닝 4패스 생략·CSR 업로드·overflow 절대값 기록 계약 | SwiftShader 실측: 습식 5종 × fixture 3종 15건·스모크 15종(zigzag)·1024²가 cpu-reference와 δ48 0%·ΔE p99 0이고 webgpu-compute와 픽셀 해시 동일(습식 포함); 실 GPU 미검증(scripts/browser-probe.mjs) |

레인이 unavailable이면 UI 배너와 셀렉터에 사유 코드(`webgpu-api-unavailable`, `dom-unavailable`, `not-implemented` 등)를
표시하고 **다른 레인으로 자동 전환하지 않는다**(ADR-0018, 무음 대체 금지). 소프트웨어 렌더러(swiftshader 등)로 판정된
레인은 배지로 경고하며 성능 증거로 쓰지 않는다.

## 랩 UI

탭 3개(`role="tablist"`, 화살표·Home·End 키 이동)로 구성되며 상태는 `app/state/lab-store.ts`(`useSyncExternalStore`, 외부 의존성 0)에 있다.

| 탭 | 구성 | 상태 흐름 |
| --- | --- | --- |
| 갤러리 | `FamilyGallery` → `PresetCard` × 31(스펙 30종 + 수묵 `sumi-ink-wet`): 같은 fixture(zigzag 256²)를 모든 프리셋으로 **Worker**(`cpu-reference` 경로)에서 렌더. 결정성 해시(fnv1a64, 리포트 `pixelHash`와 동일 함수)·렌더 시간·dab 수·가족 지표 PASS/FAIL/UNAVAILABLE | `gallery.entries[presetId]`; Worker 실패는 오류 카드(메인 스레드 대체 렌더 없음) |
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

- 이 컨테이너에는 하드웨어 GPU가 없다. 대신 헤드리스 Chromium 141의 **SwiftShader(소프트웨어 WebGPU·WebGL2)** 로 `scripts/browser-probe.mjs`를 실제로 돌려
  WGSL 11모듈·GLSL 실컴파일(오류 0), cpu-reference 패리티, 재실행 결정성을 측정했다(2026-10-02, 습식 GPU 미러·종이/각도 정밀도 수정 반영 코드 기준). 결과: `webgpu-compute`는 카탈로그 31종(스펙 30종 + 수묵 `sumi-ink-wet`)
  × fixture 3종(curve·spiral·fast-flick, 128²) 93건이 전부 δ48 0%·**ΔE p99 0**(최대 ΔE 0.33, 8비트 채널 오차 ≤ 1/255, 픽셀 해시 87건이 CPU와 동일)이고 재실행 결정성 93/93이다.
  타일 경계에 맞지 않는 100²(습식 5종·건식 2종 7건 전부 CPU와 픽셀 해시 동일)·512²(수채·유화 합성 지그재그)·1024²(건식 4종 + 수채·수묵·유화)도 통과했다. `wasm-gpu-hybrid`는 `webgpu-compute`와 픽셀 해시가 같다(습식 5종 15건·스모크 15종·1024² 4종 포함).
  렌더 인스턴싱 비교 레인은 f16 누적이라 ΔE p99가 다르다(WebGPU 인스턴싱 스모크 12종 0~0.95, 2026-10-02; WebGL2 인스턴싱은 2026-10-01 측정 0~4.9; 습식·smudge·임파스토는 설계상 거부). **이 값은 소프트웨어 렌더러 결과라 성능 증거도 승격 증거도 아니다**
  (승격에는 `softwareRenderer: false` 리포트가 필요하다). 실제 GPU 드라이버·타이밍(`timestamp-query` 값; SwiftShader의 값은 성능이 아니다)·f32 연산 순서 차이는 검증하지 못했다. Node 테스트의 모의 `GPUDevice`·
  모의 WebGL2는 바인딩·호출 계약 검증용이고 픽셀을 만들지 않는다. 2026-10-01·02 SwiftShader 실측 리포트(JSON)는 재생성 가능한 산출물이라 커밋하지 않았다(`--reports`로 재생성; WebGPU·WebGL2 레인은 `softwareRenderer: true`·SwiftShader 어댑터, `canvas2d`·`wasm-cpu`는 GPU를 쓰지 않아 어댑터 필드가 null).
- **습식(수채·수묵·구아슈·유화) GPU 미러 — 구현·SwiftShader 실측 완료(2026-10-02)**: CPU 참조의 습식 구조(LBM D2Q9 흐름층·Curtis 3층 물 교환·섬유 차단(수묵 갈라짐·번짐 이방성)·재습윤·백런·에지 다크닝·그래뉼레이션·확장 풀 23채널·
  표시 시점 층 합성(획 끝에 굽지 않는 지속 레이어)·유화 물감 층(점도 의존 전단·KM 혼색·Bingham 레벨링·건조))을 `docs/drafts/brush-wet-gpu-mirror-spec.md`대로 WebGPU compute로 옮겼다. 1·2차로 나누지 않고 한 번에 완성했다.
  - 구조: 습식 가족 전용 바인드 레이아웃(group 3 신설, 가족마다 storage 버퍼 ≤ 8) · WGSL `wet-water`(스냅샷·에지 Δ·물 스텝(gather 전용, 결과 경로에 원자 없음)·활성 타일 확장·목록 확정·정착 검사)·`wet-oil`(dab 순차 처리: 셰이드 → 고정 순서 트리 리덕션 → 밀기 × 패스 → 붓 색 → 침착 → 되쓰기, 레벨링·건조)·`wet-composite`(표시 시점 합성·`bake_wet`·`flatten_oil`)
    · 결정성 수학(`det_sin`/`det_cos`, `pow` 없음, 종이 파생 필드는 전역 셀 좌표의 순수 함수) · `endStroke`는 습식 층을 굽지 않고 매체 종류가 바뀔 때만 평탄화(`flattenWet`).
  - 예산·한도: 확장 풀 23채널·스냅샷 20채널·f32 종이(`paper_wet`)·유화 스크래치를 **장치가 실제로 받은 한도**(`device.limits`)로 검증하고 초과는 `StrokeBudgetExceededError`(버퍼 이름 포함)로 init·획 시작에서 던진다(무음 축소·무음 검증 오류 없음). 필요한 한도가 기본을 넘으면 레인이 어댑터 한도 범위에서 `requiredLimits`로 요청한다(2048²·6000타일 → 확장 풀 141 MB를 SwiftShader에서 실제 장치가 받아 획이 그려짐을 확인).
    기본 습식 풀 용량은 2048타일(110 MiB; 724² 이하 캔버스는 전 타일)이며 더 큰 캔버스는 `LaneInit.wetCapacityTiles`로 올린다. 유화 스크래치·선형 표시 버퍼는 지연 생성이라 쓰지 않는 세션은 영향이 없다.
  - 실측(SwiftShader, CPU 참조 대비): ① 습식 장면 단일 서브스텝 max|Δ| ≤ 2.4e-7(명세 허용 1e-5)·20·60프레임 max|Δ| ≤ 1.4e-6(허용 5e-4)·상대 L2 ≤ 2e-5(허용 1e-3)·물·안료 질량 상대 오차 ≤ 1.3e-6(허용 1e-4)·활성 타일 집합 일치 — 수채·수묵·구아슈, 에지·물막·그래뉼레이션, 프리셋 실제 파라미터·종이 포함 10장면;
    ② 실제 획 도중 상태(128² 나선, CPU·GPU가 받는 dab 배치는 값까지 동일, 질량 상대 오차 ≤ 4.4e-7): 유화 189 dab 뒤 높이·색 max|Δ| 2.2e-6(명세의 단일 dab 허용 2e-6 수준), 수채 건조 184 dab 뒤 7.6e-7, 구아슈 430 dab 뒤 1.8e-5, 수묵 136 dab 뒤 9.6e-5(모세관 1셀) — 수채 126 dab 획 꼬리 프레임에서 속도장 1셀(전체의 0.0062%)이 문턱 분기로 0.17 어긋난 것이 유일한 예외이며 질량·안료·물은 일치;
    ③ 다획 지속 레이어(수채→수채, 수채→건식, 유화→건식, 수채→유화, 유화→유화, 수묵→수채, 건식→수채, 구아슈→수채 건조) 8종 ΔE p99 0·채널 오차 ≤ 1/255; ④ 합성 지그재그 `zigzagStroke(size, 600 ms)` 256² 습식 5종·512² 2종: CPU 해시가 명세 §9.3 기준값과 일치하고 GPU는 δ48 0%·ΔE p99 0(최대 ΔE 0.37; 구아슈 3.54는 검정 위 알파 1/255 양자화 한 칸).
  - 이 측정이 드러낸 **원래 래스터 미러의 어긋남 2건을 고쳤다**: (a) 래스터·유화 그레인이 8비트 `paperTex`(요철 양자화 ≤ 1/510 + 하드웨어 필터 가중치)를 읽던 것을 f32(`rgba32float`) 텍스처 + `textureLoad` 4탭 직접 쌍선형 보간으로 바꿨다(CPU `samplePaper`와 같은 식);
    (b) dab 각도·종이 회전이 WebGPU가 2^-11 절대 오차를 허용하는 내장 `sin/cos`를 쓰던 것을 `rot_cs`(`det_sin/det_cos`, 각도 0은 정확히 (1, 0))로 바꿨다 — SwiftShader에서 dab 각도 0.3의 커버리지 오차가 4.2e-4였고 수묵·구아슈 상태 어긋남(셀당 최대 0.13)의 원인이었다. 수정 후 단일 dab 24개 스윕이 전부 ≤ 9e-7이다.
    효과: 카탈로그 93건 ΔE p99 최대 0.69 → 0, 유화 189 dab 상태 5.3e-3 → 2.2e-6. 렌더 인스턴싱 레인도 같은 WGSL 헬퍼를 쓴다.
  - 한계: 실 GPU에서의 `sin/cos` 외 내장 함수(`exp`·`pow`·`log2`) 정밀도, f32 합산 순서, 타이밍은 검증하지 못했다. 문턱 분기(방향 선택·경화·핀닝)는 f32/f64 차이로 드물게 뒤집힐 수 있다(위 속도장 1셀 예외). `wasm-cpu` 커널은 습식 스탬프가 CPU와 같도록(안료 질량 × 그레인 응답, 임파스토 dab는 획 레이어에 쓰지 않음) 재빌드했다(`wasm/sumi-kernel/build.sh`, INTEGRITY·`kernel-*.ts` 재생성).
  - CPU 습식 해시는 의도적으로 바뀌었다: watercolor-wet 256² `e2eeedfaad6bccd9`·512² `21d19d4a9bb0d714`, oil-impasto 256² `1d1437eb6d4ebc42`·512² `b4f8ae7943dbd81f`(새 스냅샷은 `raster/wet-presets*.snapshot.test.ts`), 비습식 프리셋 해시는 변하지 않았다.
- 표시용 릴리프 조명을 거치지 않은 `readbackLinear()`는 GPU 표시 합성(`composite_linear`)으로 같은 조명·층 합성을 적용해 돌려준다. `wasm-cpu`는 `Surface`를 상속해 임파스토를 TS 유화 층 패스 그대로 지원하고(CPU와 비트 동일),
  렌더 인스턴싱 레인(WebGPU·WebGL2)은 습식·smudge·임파스토를 `not-implemented`로 거부한다.
- `wasm-gpu-hybrid`는 wasm이 CSR(counts·offsets·refs)만 만들고 GPU가 래스터를 한다. 스펙의 "wasm이 StrokePipeline 동역학까지 수행"은 구현하지 않았다.
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
