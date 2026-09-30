# ToonStudio Character Lab

`apps/character-lab`은 캐릭터 파이프라인(Babylon.js 3D, PSD 입출력, WebGPU) 실험을 위한 독립 정적 Vite
애플리케이션이다. pnpm workspace 이름은 `@toonstudio/character-lab`이며 source와 빌드 설정을 이 디렉터리가
소유한다. 서버 기능이 없고 운영 배포 대상이 아니다.

## 명령

```sh
pnpm --filter @toonstudio/character-lab dev        # http://localhost:4176
pnpm --filter @toonstudio/character-lab typecheck
pnpm --filter @toonstudio/character-lab test
pnpm --filter @toonstudio/character-lab build      # apps/character-lab/dist/
pnpm --filter @toonstudio/character-lab preview    # http://localhost:4177
```

루트에서는 `pnpm dev:character-lab`, `pnpm typecheck:character-lab`, `pnpm test:character-lab`,
`pnpm build:character-lab`을 사용한다. 생성물 `dist/`는 git이 무시한다.

## 소유권

```text
index.html, vite.config.ts, tsconfig.json, package.json   통합 담당
src/app       bootstrap, shell placeholder, 전역 스타일
src/**        실험 기능(character-lab-lead 소유)
```

## 경계

- `apps/web`, `apps/admin-web`, `apps/api`, `apps/brush-lab` source를 import하지 않는다.
- 공유 코드는 `packages/*`의 공개 진입점만 사용한다.
- `scripts/validate-app-boundaries.mjs`의 `characterLabToApps`, `appsToLabs` ratchet이 교차 앱 import를 0으로 고정한다.

## 의존성

`@babylonjs/core`·`@babylonjs/loaders`·`@babylonjs/serializers` 9.19.0(exact), `ag-psd`(루트와 같은 범위,
`patches/ag-psd@31.0.1.patch` 적용), `@mediapipe/tasks-vision`(루트와 같은 범위),
`@dimforge/rapier3d-deterministic-compat` 0.19.3(exact), `zod` 4.4.3, React 19. WebGPU 타입은 TypeScript 6
DOM lib이 제공한다. 의존성 변경은 통합 담당이 `pnpm install`로 lockfile과 함께 갱신한다.
