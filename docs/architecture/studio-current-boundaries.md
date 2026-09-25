# Studio 현재 아키텍처 경계

- 상태: **현재 + 마이그레이션**
- 최종 갱신: **2026-09-26**
- 범위: `/studio` route, 문서·입력·렌더링·저장·협업·오프라인 권위

## 1. 권위 원장

이 문서는 현재 구조의 탐색용 요약이다. 세부 사실의 최종 권위는 다음과 같다.

1. 실제 source와 테스트
2. `packages/studio-engine-registry/src/renderer-roles.ts`
3. 생성 문서 `docs/engines/renderer-roles.md`
4. 관련 ADR

렌더러 역할을 바꿀 때는 이 문서만 수정하지 않고 원장과 생성 문서를 함께 갱신한다.

## 2. 진입 경로

```text
apps/web/index.html
  -> apps/web/src/app/main.tsx
  -> apps/web/src/app/AppShell.tsx
  -> apps/web/src/app/routes/AppRouter.tsx
  -> apps/web/src/app/routes/groups/creator.routes.tsx
  -> apps/web/src/domains/creator/studio-router/StudioRouter.tsx
  -> routes/StudioEditorRoute.tsx 또는 StudioPublishRoute.tsx
```

제품 Studio는 기존 `/studio/*` 안에서 동작한다. V11/V12 같은 병렬 제품 앱이나 별도 URL을 만들지
않는다. 실험 harness는 `apps/web/tools/browser-harnesses`, 브라우저 fixture는
`apps/web/tests/browser-fixtures`에 둔다.

## 3. 문서와 입력 권위

현재 단독 소유자는 생성된 렌더러 원장을 따른다.

| 권위 | 현재 소유자 |
| --- | --- |
| 문서 표시 | Konva |
| 포인터 입력 | Konva |
| 선택·변형 chrome | Konva |
| 래스터 브러시 최종 커밋 | Canvas2D `StudioDrawNode` |
| 지원되는 벡터 문서 island | Skia/CanvasKit WebGL2 retained surface |
| 선택 오버레이 island | Pixi |
| 자연매체 | Hokusai WASM |
| stroke geometry | perfect-freehand |
| 3D 장면 | Three.js + three-vrm |
| 3D 전문 capture pass | Babylon.js |

Provider, reference, lab 엔진은 이 권위를 자동으로 넘겨받지 않는다. 실패 뒤 다른 엔진을 몰래 재실행하는
자동 폴백을 허용하지 않으며, 기능별 admission과 명시적 사용자 선택을 따른다.

## 4. 문서·명령·history

Studio는 렌더러 객체가 아니라 직렬화 가능한 문서와 명령을 저장 권위로 삼는다.

- 문서와 프로젝트 모델: 앱 내부 creator domain과 focused Studio packages
- 명령: 문서 mutation을 하나의 검증·history 경계로 통과
- transient preview: pointer move 중 문서·history·autosave·CRDT를 직접 쓰지 않음
- durable commit: pointer-up 또는 명시적 실행 경계에서 정확히 한 번
- undo/redo: 저장 문서와 같은 명령 의미를 사용

라이브 제스처의 세부 수명주기는 `studio-live-canvas-gesture.md`를 따른다.

## 5. 로컬 저장과 복구

제품 Studio의 기본 로컬 내구성 권위는 SQLite WASM + OPFS다.

```text
UI/runtime
  -> Studio local database client
  -> module Dedicated Worker
  -> SQLite WASM
  -> OPFS SAH-pool
```

- 논리 DB와 schema는 앱 수명 runtime이 소유한다.
- localStorage/IndexedDB는 명시적 호환 import, 탭 범위 설정, 삭제 cleanup 또는 검증된 fallback에만
  남을 수 있다.
- 서비스 워커 캐시는 앱 자산을 보존할 뿐 사용자 문서의 저장 권위가 아니다.
- OPFS는 클라우드 백업이나 물리적 전원 손실 보장을 의미하지 않는다.
- cloud sync는 `apps/desktop-sync`의 명시적 동기화·충돌 해결 경계를 사용한다.

## 6. 협업과 API

브라우저는 API source를 import하지 않는다. 협업 DTO·protocol은 runtime-neutral 계약을 통해 공유하고,
서버 구현은 `apps/api`가 소유한다.

```text
Web Studio
  -> HTTP / WebSocket protocol
  -> apps/api modules
  -> repository / DB / external adapter
```

CRDT, presence, voice, review와 asset API는 서로 다른 권한·수명주기를 유지한다. UI presence나 브라우저
상태를 서버 권한의 대체 증거로 사용하지 않는다. 교차 Web/API 계약 테스트는
`tests/integration/web-api`와 `tests/integration/api-web`에 둔다.

## 7. 3D 저작

브라우저가 기본 실행 환경이다.

- Three.js/three-vrm: 기본 3D 장면, 포즈, raycast, 표면 paint
- Babylon.js: 명시적으로 선택된 전문 capture pass
- module Worker + WASM: 메시·B-Rep·파생 계산
- SQLite WASM + OPFS: 브라우저 저장
- Desktop/native adapter: 선택형 가속·파일 연결이며 문서 권위가 아님

자세한 계약은 `studio-3d-web-authoring-v3-2026-09-24.md`와
`studio-3d-asset-governance-v1.md`를 따른다.

## 8. 배포·보안 헤더

응답 헤더의 정본은 `config/http-response-headers.json`이다.

```text
config/http-response-headers.json
  -> scripts/cloudflare-static-rules.mjs
  -> apps/web/public/_headers
  -> deploy/cloudflare-static/src/index.ts의 공통 CSP
```

`/studio`는 현재 COOP `same-origin`, COEP `credentialless` 경계를 사용한다. CSP는
`scripts/verify-static-csp.mjs`로 검사한다. Vercel 설정은 폐기되었으며 현재 배포 권위가 아니다.

## 9. 오프라인과 복구 표면

- 정상 Studio: 캐시된 앱 자산과 Studio 로컬 DB를 사용
- ToonStudio Draw presentation: 같은 Studio 문서·저장 권위를 다른 chrome으로 표시
- `/offline-draw/`: 독립된 비상 복구 편집기이며 Studio 기능 동등성을 주장하지 않음
- service worker: private API 응답이나 사용자 문서를 권위 캐시로 저장하지 않음

상세 동작은 `docs/creator-runtime/README.md`와 `docs/studio-service-worker.md`를 따른다.

## 10. 현재 마이그레이션 항목

- Creator domain 최상위 직접 파일 축소
- API -> Web 직접 계약 참조 제거
- legacy browser storage adapter의 명시적 경계 수렴
- WebGPU 브러시 provider의 검증된 범위 확대
- Admin 기능의 `apps/admin-web` 이전
- 대형 정적 에셋의 manifest/object storage 전환

목표 엔진이나 새 provider가 존재한다는 이유만으로 현재 primary 권위를 바꾸지 않는다.

## 11. 검증

```sh
pnpm run verify:studio-renderer-roles
pnpm run verify:studio-lifecycle
pnpm run validate:architecture
pnpm run typecheck
```

기능별 검증 명령은 관련 문서와 `package.json` script를 따른다.
