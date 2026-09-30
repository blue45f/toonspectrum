# ToonStudio Brush Lab

`apps/brush-lab`은 브러시 엔진(스트로크 기하, WebGPU 렌더링, 엔진 선택) 실험을 위한 독립 정적 Vite
애플리케이션이다. pnpm workspace 이름은 `@toonstudio/brush-lab`이며 source와 빌드 설정을 이 디렉터리가
소유한다. 서버 기능이 없고 운영 배포 대상이 아니다.

## 명령

```sh
pnpm --filter @toonstudio/brush-lab dev        # http://localhost:4178
pnpm --filter @toonstudio/brush-lab typecheck
pnpm --filter @toonstudio/brush-lab test
pnpm --filter @toonstudio/brush-lab build      # apps/brush-lab/dist/
pnpm --filter @toonstudio/brush-lab preview    # http://localhost:4179
```

루트에서는 `pnpm dev:brush-lab`, `pnpm typecheck:brush-lab`, `pnpm test:brush-lab`, `pnpm build:brush-lab`을
사용한다. 생성물 `dist/`는 git이 무시한다.

## 소유권

```text
index.html, vite.config.ts, tsconfig.json, package.json   통합 담당
src/app       bootstrap, shell placeholder, 전역 스타일
src/**        실험 기능(brush-lab-lead 소유)
```

## 경계

- `apps/web`, `apps/admin-web`, `apps/api`, `apps/character-lab` source를 import하지 않는다.
- 브러시 플랫폼, 엔진 레지스트리, 문서 모델은 `@toonstudio/studio-brush-platform`, `@toonstudio/studio-engine-registry`,
  `@toonstudio/studio-project-model`의 공개 진입점(workspace 패키지)으로만 사용한다.
- `scripts/validate-app-boundaries.mjs`의 `brushLabToApps`, `appsToLabs` ratchet이 교차 앱 import를 0으로 고정한다.

## 의존성

`@toonstudio/studio-brush-platform`·`@toonstudio/studio-engine-registry`·`@toonstudio/studio-project-model`(workspace:*),
`zod` 4.4.3, React 19.
WebGPU 타입은 TypeScript 6 DOM lib이 제공한다. AssemblyScript·Rust wasm 도구는 설계 확정 후 통합 담당이
추가한다. 의존성 변경은 통합 담당이 `pnpm install`로 lockfile과 함께 갱신한다.
