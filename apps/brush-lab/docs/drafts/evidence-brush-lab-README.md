# brush-lab 인증 리포트 증거 디렉터리

- 상태: **현재(규약)**. 배치 예정 경로 `docs/evidence/brush-lab/README.md`(currentDocuments 등록은 통합 담당). 이 초안의 상대 링크는
  `apps/brush-lab/docs/drafts/` 위치 기준이다. 상위 디렉터리 [`docs/evidence/`](../../../../docs/evidence/)는 특정 commit·실험의 증거를 두는 곳이며
  현재 구조 문서가 아니다.
- 관련: [승격 프로세스](./brush-lab-promotion-process.md), [Sumi 엔진 아키텍처](./brush-lab-sumi-engine-architecture-2026-10-01.md),
  스키마 소스 `apps/brush-lab/src/bench/report/report-schema.ts`.

## 1. 파일명 규약

`<presetId>-<laneId>-<YYYYMMDD>.json` — 예: `pencil-hb-webgpu-compute-20261001.json`. 날짜는 리포트 `createdAt`(UTC)에서 온다.
파일명에 쓸 수 없는 문자는 `_`로 바꾼다(`bench/report/serialize.ts`의 `reportFileName`이 생성). 같은 조합을 같은 날 다시 생성하면 덮어쓰지 않고
`-2`, `-3` 접미를 붙인다.

## 2. 스키마와 검증

- `labSchemaVersion: "1.0.0"`(`apps/brush-lab/src/engine/core/version.ts`의 `LAB_SCHEMA_VERSION`). 모든 지표 값은 `number | null`이며 null의 사유는
  `metricNotes["<group>.<key>"]`에 한글로 있다.
- 검증: 리포트는 `brushCertificationReportSchema.parse`(zod)를 통과해야 하며 랩 UI의 다운로드 버튼과 `serializeReport`가 만든 정규(canonical) JSON만 커밋한다.
  검증 명령(루트): `pnpm exec vitest run apps/brush-lab/src/bench/report` (리포트 골든·verdict 규칙 테스트). 디렉터리 파일 전수 검증 스크립트는
  확장 범위이며 통합 담당이 추가한다.
- 필수 환경 필드: `environment.userAgent`(브라우저), `environment.adapterInfo`(vendor·architecture·device·description), `environment.features`,
  `environment.limits`, `environment.softwareRenderer`(true/false/null), `environment.node`(브라우저면 null).
- 해시: `pixelHash`(fnv1a64, 크기 헤더 포함)와 `pixelSha256`(64자리)을 모두 기록한다. `brushConfigHash`는 프로그램 canonical JSON의 SHA-256이다.

## 3. 재현 명령

```sh
# 브라우저 게이트(확장 범위, 통합 담당이 package.json에 등록): Playwright Chromium --enable-unsafe-webgpu, Linux swiftshader
BRUSH_LAB_BROWSER_PROBE=1 pnpm --filter @toonstudio/brush-lab test:browser   # 종료 0 = 리포트 생성, 2 = WebGPU 미지원 구조적 skip, 1 = 실패
# 현재 쓰는 직접 명령(package.json 스크립트 등록 전). 브라우저는 BRUSH_LAB_CHROMIUM_PATH가 없으면 PLAYWRIGHT_BROWSERS_PATH의 설치된 chromium-<rev>를 찾아 쓴다
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --lanes webgpu-compute --presets pencil-hb,charcoal --fixtures zigzag --size 128 --reports apps/brush-lab/docs/evidence
# Node(CPU 참조·기준선 레인) 리포트 재현
pnpm exec vitest run apps/brush-lab/src/bench/report apps/brush-lab/src/lanes
# 랩 UI에서 수동 생성: pnpm dev:brush-lab → A/B 비교 → 'JSON 다운로드'
```

리포트에는 fixture ID·시드·캔버스·프리셋 ID·`brushConfigHash`가 있으므로 같은 엔진 버전(`engineVersion`)에서 같은 입력으로 재현할 수 있다.

## 4. 사용 규칙

- **소프트웨어 렌더러 리포트는 성능 증거로 쓰지 않는다.** `softwareRenderer: true`(swiftshader·llvmpipe·lavapipe)는 WGSL 컴파일·패리티 증거로만 쓴다.
  승격(2단계)에는 `softwareRenderer: false` 리포트가 최소 1개 필요하다.
- **PNG는 커밋하지 않는다.** 픽셀은 `pixelHash`·`pixelSha256`으로만 기록하고, 필요하면 랩 UI의 'PNG 다운로드'로 로컬에서 재생성한다.
- 이 컨테이너(GPU 없음)에서 만든 리포트는 `environment.node`가 채워지고 `adapterInfo`가 null이다. 브라우저 검증을 대신하지 않는다.
- 리포트의 `verdict`가 `UNAVAILABLE`이면 "측정 불가"이지 "통과"가 아니다. `metricNotes`의 사유를 읽고 측정 가능한 fixture로 다시 실행한다.
- 파일을 수정하지 않는다. 엔진이 바뀌면 새 날짜로 새 파일을 만들고, 비교는 `pixelHash`·지표 diff로 한다.

## 5. 디렉터리 상태(2026-10-01)

`apps/brush-lab/docs/evidence/`에 브라우저 프로브(`scripts/browser-probe.mjs --reports <dir>`)가 만든 인증 리포트가 있다. 전부
**소프트웨어 렌더러**(헤드리스 Chromium 141 + SwiftShader) 실측이다. WebGPU·WebGL2 레인 리포트는 `environment.softwareRenderer: true`와 SwiftShader 어댑터 정보를 담고,
`canvas2d`·`wasm-cpu`는 GPU를 쓰지 않아 어댑터 필드가 null이다(`userAgent`로 브라우저를 식별한다). 파일 37개(6개 레인 × 대표 프리셋, 128² `zigzag` fixture 1개)는 WGSL·GLSL 실컴파일과
cpu-reference 패리티·결정성의 증거로만 쓴다 — **성능 증거도, 승격 증거도 아니다**(승격에는 `softwareRenderer: false` 리포트가 최소 1개 필요하고 아직 없다).
종합 `verdict`는 전부 FAIL인데, 37개 모두 `handfeel.cornerDeviationPx`(지그재그 꼭짓점 편차 2.5 px > 임계값 1.5 px — cpu-reference도 같은 값인 입력 파이프라인·fixture 특성)가
임계값을 넘기 때문이다. 패리티는 `verdicts`의 `render.*` 항목(`render.deltaEP99`·`render.fuzzyMismatchPct`·`render.determinism`)과 `metrics.render`로 따로 읽는다:
`webgpu-compute`·`wasm-gpu-hybrid`·`wasm-cpu`는 ΔE p99 0(비교 레인 `webgpu-instanced`는 ≤ 0.50, `webgl2-instanced`는 ≤ 1.27, `canvas2d` 기준선은 24 이상으로 다른 것이 정상)이고 전부 `render.determinism` PASS다.
습식(수채·수묵·구아슈·유화) 프리셋은 위 37개에 `webgpu-compute`·`wasm-gpu-hybrid` 리포트가 없다 — 그 시점(2026-10-01)에는 CPU 참조의 습식 구조(LBM·3층·표시 시점 층 합성)에 대한 GPU 미러가 없어 패리티가 어긋났기 때문이다.
**습식 GPU 미러는 2026-10-02에 구현했고**(`brush-wet-gpu-mirror-spec.md`, README '알려진 한계') 같은 날 SwiftShader에서 프로브를 돌려 대조했다: 카탈로그 31종 × fixture 3종(128²) 93건이 cpu-reference와 δ48 0%·ΔE p99 0(최대 ΔE 0.33, 8비트 채널 오차 ≤ 1/255, 픽셀 해시 87건 동일)로 일치하고
습식 장면 단일 서브스텝·60프레임 상태(max|Δ| ≤ 1.4e-6), 획 도중 상태, 다획 지속 레이어, 합성 지그재그 256²·512²(CPU 해시가 명세 §9.3 기준값과 일치), 100²·1024²도 통과했다. 이 측정의 JSON은 재생성 가능한 산출물이라 이 디렉터리에 커밋하지 않았다
(`--reports <dir>`로 `<presetId>-<laneId>-<YYYYMMDD>.json`을 다시 만들 수 있다). 소프트웨어 렌더러 결과라 **성능 증거도 승격 증거도 아니다**. `wasm-cpu`의 습식·임파스토 리포트는 있다(CPU 참조와 같은 코드 경로).
