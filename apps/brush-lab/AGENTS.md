# Brush Lab 작업 규칙

이 디렉터리에서는 루트 `AGENTS.md`와 이 규칙을 함께 적용한다. 현재 구조·레인 상태는 `README.md`와 `src/lanes/registry.ts`가 권위다.

## 범위와 경계

- `apps/brush-lab`(`@toonstudio/brush-lab`)은 서버 기능이 없는 정적 Vite 실험 앱이며 운영 배포 대상이 아니다. 브러시 품질·성능
  테스트만 한다(undo·레이어·문서·저장·서버 연동을 추가하지 않는다).
- `apps/web`, `apps/admin-web`, `apps/api`, `apps/character-lab`의 application source를 직접 import하지 않는다.
  `@toonstudio/studio-brush-platform`·`@toonstudio/studio-project-model`은 `src/lanes/platform-baseline-lane.ts`에서만,
  `@toonstudio/studio-engine-registry`는 `src/bench/metrics/render-metrics.test.ts`에서만 쓴다.
- 레이어 의존 방향은 `app → platform → bench → lanes → engine`이다(역방향 import 금지). `bench`는 `engine`의 타입·CPU 참조 렌더만 쓴다.
- `src/engine/**`은 승격 단위다: `@toonstudio/*`·react·DOM 전역(`document`·`window`·`navigator`·`requestAnimationFrame`)·
  `performance`·`Date.now`·`Math.random`을 참조하지 않고 시간·GPU·캔버스·wasm 바이트는 인자로 주입한다.
  zod는 `engine/presets/program-schema.ts`·`engine/wet/params.ts`에서만 허용한다. `src/boundary.test.ts`가 이를 거부한다.
- `@/` alias를 쓰지 않는다(상대 경로 또는 패키지 이름만). mixbox(CC BY-NC)·GPL/AGPL 코드(Krita·GIMP·MyPaint 앱 등)·canvaskit
  유입 금지. 참고 코드는 개념·수식만 재구현하고 MIT/Apache/BSD/ISC/CC0/Zlib은 출처 주석을 남긴다.

## 코딩 규약

- `import-x/order`: builtin → external → internal → parent → sibling → index → type 그룹, 그룹 사이 빈 줄 1개, 그룹 내 알파벳순.
  type import는 `import type`으로 분리한다(`verbatimModuleSyntax`).
- `any`·광범위 ignore·빈 catch·테스트 skip 금지. `enum` 대신 `as const` 객체 + 유니언 타입.
- 오류는 `SumiError` 하위 클래스 + `code`. 측정 불가 값은 `null` + 사유 필드(`metricNotes`).
- 무음 대체 금지(ADR-0018): capability 불일치·초기화 실패·device loss는 `LaneUnavailableError(code)`로 드러내고 다른 레인으로
  자동 전환하지 않는다. UI는 사유 코드를 배너·셀렉터에 표시한다.
- 결정성: 엔진 안의 모든 난수는 `Pcg32`/`hashU32`(시드 전달), 부동소수는 `Math.fround`로 f32 미러.
- WGSL은 `src/engine/gpu/wgsl/*.wgsl.ts`에서 `export const <NAME>_WGSL: string`으로 내보내고 워크그룹·바인딩·타일 상수는
  `gpu/layout.ts` 상수를 템플릿 리터럴로 삽입한다. WGSL 식별자로 `meta`·`active`를 쓰지 않으며 진입점 이름은 `snake_case`다.
- 주석·테스트 이름·문서는 한글, 식별자는 영문.

## 테스트 규약

- 테스트는 소스 옆 `*.test.ts(x)`. DOM이 필요하면 파일 첫 줄에 `// @vitest-environment jsdom`.
- 앱 로컬(`pnpm --filter @toonstudio/brush-lab test`, setup 없음)과 루트 설정(`pnpm exec vitest run apps/brush-lab/src/...`,
  `vitest.setup.ts` 로드) 양쪽에서 자족적으로 통과해야 한다.
- 컴포넌트 테스트는 `src/app/testing/`의 모의 레인·모의 러너·캔버스 스텁을 쓰고 실제 Worker·GPU에 의존하지 않는다.
- 브라우저 전용 경로(WebGPU·Canvas2D·Worker 생성)는 capability·오류 경로를 단위 테스트하고 README에 "브라우저 미검증"으로 정직하게
  표기한다. 실기기 픽셀을 검증했다고 보고하지 않는다.

## 공유 파일·도구

- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`과 루트·공유 파일 변경(의존성 추가·버전 변경, AssemblyScript/Rust wasm
  도구 도입, Playwright 게이트 스크립트 등록 포함)은 통합 담당에게 요청한다.
- `pnpm install`은 통합 담당만 실행하고 여러 작업자가 동시에 실행하지 않는다. `pnpm-lock.yaml`은 수동 편집하지 않는다.
- Rust wasm 커널(`wasm/sumi-kernel`) 빌드와 `INTEGRITY.sha256` 재생성은 통합 담당(또는 engine-gpu 작업자)이 한다.
- WebGPU 타입은 TypeScript 6의 DOM lib이 제공하므로 `@webgpu/types`를 추가하지 않는다. top-level await와 ES module
  worker(`worker.format = "es"`)는 Vite 설정이 허용한다.

## 최소 검증

- `pnpm harness:verify`, `pnpm typecheck:brush-lab`, `pnpm test:brush-lab`, 변경 파일 `pnpm exec eslint --max-warnings=0 <files>`.
- 빌드 경계에 영향이 있으면 `pnpm build:brush-lab`(출력에 `apps/web` 청크가 없고 worker 청크가 ES module이어야 한다).
- 레인·README 변경 시 `pnpm exec vitest run apps/brush-lab/src/boundary.test.ts apps/brush-lab/src/lanes/registry.test.ts`.
