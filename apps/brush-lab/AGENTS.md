# Brush Lab 작업 규칙

이 디렉터리에서는 루트 `AGENTS.md`와 이 규칙을 함께 적용한다.

- `apps/brush-lab`(`@toonstudio/brush-lab`)은 서버 기능이 없는 정적 Vite 실험 앱이며 운영 배포 대상이 아니다.
- `apps/web`, `apps/admin-web`, `apps/api`, `apps/character-lab`의 application source를 직접 import하지 않는다.
  브러시 플랫폼은 `@toonstudio/studio-brush-platform`, 엔진 레지스트리는 `@toonstudio/studio-engine-registry`,
  문서 모델은 `@toonstudio/studio-project-model`의 공개 진입점만 사용한다.
- 기능 코드는 `src/` 아래에만 둔다. `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`과
  루트·공유 파일 변경(의존성 추가·버전 변경, AssemblyScript/Rust wasm 도구 도입 포함)은 통합 담당에게 요청한다.
- `pnpm install`은 통합 담당만 실행하고 여러 작업자가 동시에 실행하지 않는다. `pnpm-lock.yaml`은 수동 편집하지 않는다.
- WebGPU 타입은 TypeScript 6의 DOM lib이 제공하므로 `@webgpu/types`를 추가하지 않는다. top-level await와
  ES module worker(`worker.format = "es"`)는 Vite 설정이 허용한다.
- 최소 검증은 `pnpm harness:verify`, `pnpm typecheck:brush-lab`, `pnpm test:brush-lab`이다.
  빌드 경계에 영향이 있으면 `pnpm build:brush-lab`을 실행한다.
