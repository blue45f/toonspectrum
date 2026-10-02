# Character Lab 작업 규칙

상태: current (2026-10-01). 이 디렉터리에서는 루트 `AGENTS.md`와 이 규칙을 함께 적용한다. 충돌하면 루트가 우선한다.
경계 규칙은 `src/architecture.test.ts`가 fs 스캔으로 기계 강제하므로, 규칙을 바꾸려면 그 테스트부터 바꾼다.

## 1. 앱 성격

- `apps/character-lab`(`@toonstudio/character-lab`)은 서버 기능이 없는 **정적 Vite 실험 앱**이며 운영 배포 대상이 아니다.
- 목표는 네이버웹툰 SHAPER(설치형)와 같은 3D 캐릭터 제작 흐름을 **웹에서** 재현하는 것이다. 설치·플러그인·외부 에디터 없이 브라우저만으로 동작해야 한다.
- 주 엔진은 Babylon.js 9.19 `WebGPUEngine`(사용자 명시 선택), 대안은 같은 버전 `Engine`(WebGL2, 역시 명시 선택)이다. 자동 선택·자동 전환은 없다(ADR-0018, ADR-0026).
- `apps/web`, `apps/admin-web`, `apps/api`, `apps/brush-lab`의 application source를 import하지 않는다. 공유 코드는 `packages/*`의 공개 진입점만 쓴다.

## 2. 디렉터리와 유일 소유자

| 경로 | 소유자 | 내용 |
| --- | --- | --- |
| `package.json` `vite.config.ts` `tsconfig.json` `index.html` | 통합 담당 | 의존성·빌드 설정(변경 요청은 이름·exact 버전·라이선스·이유를 적어 통합 담당에게) |
| `AGENTS.md` `README.md` `docs/shaper-parity-checklist.md` `scripts/browser-probe.mjs` | core | 규칙·안내·패리티 집계표, 실브라우저 프로브(Playwright, `CHARACTER_LAB_BROWSER_PROBE=1`일 때만 동작) |
| `docs/parity/<area>.md` | 각 영역 작업자 | 자기 영역 행만 쓰는 패리티 단일 소스(집계 전 원본) |
| `docs/authored-asset-pipeline.md` `public/assets/characters/**` | Blender 에셋 레인 | 제작 패키지(`index.json`, `<id>/manifest.json`, `*.glb`, `slot-mapping.json`) |
| `src/contracts/**` | core(0단계 동결) | 슬롯·프리셋 어휘·파라미터·morph/본 이름·레시피(zod)·명령/이벤트·엔진 포트·물리·캡처·manifest·비전·상태 계약. **변경은 core만** 한다 |
| `src/shared/**` | core | 수학·색(OKLab)·PRNG(mulberry32)·해시(fnv1a·SHA-256)·typed array·stable-json |
| `src/testing/**` | core | mock-engine·mock-store(`MockLabProvider`)·mock-runtime·recipe/raster/manifest fixtures·minimal-glb·psd-canvas-stub |
| `src/app/**` | core(+패널은 각 작업자) | `composition.ts`(영역 모듈을 꽂는 유일한 조립 파일), `shell/*`(런타임·엔진 세션·적용 루프·썸네일·TopBar·FailureBanner·레이아웃·컨텍스트), `shell/panels/<Panel>.tsx`(아래 표), `styles/character-lab.css`(패널 클래스도 core가 한 번에 관리) |
| `src/state/**` `src/presets/**` | state-presets | reducer·history·store·planApply·recipe-io·thumbnail-cache·외형 프리셋 64 |
| `src/domains/humanoid/**` | humanoid | 절차 파라메트릭 휴머노이드(케이지·세분·UV·morph·스켈레톤·스킨 웨이트) |
| `src/domains/outfit/**` `src/domains/physics/**` | outfit-physics | 헤어 7·의상 파츠·`createOutfitBuilder`, 결정적 XPBD 체인·캡슐·cloth·provider(builtin-pbd/rapier/havok) |
| `src/animation/**` | animation | two-bone IK·FABRIK·관절 제한·드래그·표정 합성·포즈 병합·연기 프리셋 30 |
| `src/render/**` | render | **유일한 `@babylonjs/*` import 허용 디렉터리**. capability 판정·엔진 팩토리·장면·재질·패스·캡처·glTF·HUD·NullEngine 하네스 |
| `src/paint/**` `src/export/**` | export-paint | 페인트 레이어·스트로크·포인터 드라이버, PNG 인코더·주선·tone-split·PSD·export-session·다운로드 |
| `src/domains/authored/**` `src/domains/vision/**` | vision-authored | 제작 패키지 manifest→능력 판정·매핑·로더, 참고 이미지 추천·사진 포즈 인식·MediaPipe 로더 |

패널 1파일 소유: `SlotPanel`(state-presets) · `ParamPanel`(humanoid) · `PhysicsPanel`(outfit-physics) · `PosePanel`/`ExpressionPanel`(animation) · `ViewportPane`/`RenderPanel`(render) · `PaintPanel`/`ExportPanel`(export-paint) · `VisionPanel`/`PackagePanel`(vision-authored). 각 패널은 `.test.tsx`를 함께 둔다.

도메인 디렉터리는 `src/<영역>/`과 `src/domains/<영역>/` 두 배치를 모두 같은 영역으로 취급한다(경계 테스트가 동일 규칙 적용). `src/domains/` 바로 아래에는 파일을 두지 않는다.

## 3. 모듈 경계(architecture.test.ts가 강제)

1. `contracts/`·`shared/`·`testing/`은 순수 TS다. 외부 import는 `zod`만(`testing/`은 `react`와 `testing/psd-canvas-stub.ts`의 `ag-psd` 추가 허용), 상대 경로는 서로와 `contracts`·`shared`만. `testing/`은 `app/shell/lab-store-context`·`app/shell/lab-runtime`만 추가로 import할 수 있다. `contracts/`·`shared/`의 **테스트**는 `testing/` fixture를 쓸 수 있다.
2. 도메인 디렉터리는 `contracts`·`shared`·같은 영역만 import한다. 영역 간 교차 import 금지 — 타입이 필요하면 `contracts/`로 올리고(core에 요청), 함수는 `app/composition.ts`에서 DI로 주입한다. 외부 패키지는 영역별 허용 목록(physics: rapier, vision: `@mediapipe/tasks-vision`, export: `ag-psd`, 공통: `zod`·`react`)만.
3. `@babylonjs/` 문자열이 들어간 import는 `src/render/**`에만 있다. side-effect import(`import "…"`)는 `render/babylon/babylon-side-effects.ts` 한 파일에만 둔다(앱 CSS 제외). `app/**`는 `render/babylon/**` 내부를 import하지 않는다.
4. `render/babylon-character-engine.ts`는 `app/composition.ts`의 **단 하나의 동적 `import()`**로만 로드한다(엔진 청크 분리). 그 파일이 디스크에 있으면 composition이 반드시 꽂아야 하고, 없으면 어느 파일도 import하지 않는다(typecheck TS2307 방지). 정적 import는 render 밖에서 금지.
5. 브라우저 전용 모듈은 `*.browser.ts` 접미 또는 `render/babylon/**`에만 둔다. 테스트 파일은 이들을 import하지 않는다(`render/testing/null-engine-harness` 경유만 허용). `render/testing/**`(하네스·fixture)는 테스트 파일처럼 core `testing/` fixture(minimal-glb 등)를 import할 수 있다. `app/shell/panels/*.tsx`는 전부 `app/composition.ts`가 import해 조립해야 한다(미조립 패널 방지). `app/` 밖의 Node 모듈은 `*.browser` 모듈을 정적 import하지 않는다.
6. `@/` alias 금지(vite alias·tsconfig paths 없음), `.mts`/`.cts`/JS 파일 금지, 타 앱 경로 문자열 금지, `src` 밖 상대 경로 금지, `node:`·`vitest` import는 테스트 파일만.
7. `Math.random` 금지(결정성: `shared/prng.ts` 고정 시드), `any` 타입 금지, `@ts-ignore`·`@ts-nocheck`·`eslint-disable` 금지.
8. DOM 테스트(`@testing-library/react`)는 파일 첫 줄에 `// @vitest-environment jsdom`을 둔다(루트 vitest는 node 환경).
9. 무음 대체 금지: 엔진·물리 provider·비전 모델은 요청한 하나만 시도하고 실패를 `LabFailure{code, reasonKo}`로 노출한다. 슬롯 미지원은 `SlotCapability.reasonKo`를 카드에 보여주고 다른 프리셋으로 바꾸지 않는다. WebGPU 실패 후 WebGL2 자동 생성 금지(사용자 클릭만).

## 4. 작업 방식

- `contracts/`는 0단계에 동결됐다. 계약 변경이 필요하면 core에 요청하고, core가 반영한 뒤 영향 영역이 따라간다. 임시 우회(도메인 안 재선언)는 구조적으로 같은 타입일 때만 허용하고 주석으로 표시한다.
- 패널은 `lab-store-context.tsx`의 훅(`useLabState`/`useLabSelector`/`useDispatch`/`useEngineSession`/`useCatalog`/`useApplyPlan`/`useUiState`/`useUiActions`/`useViewportRegistry`/`usePackagePlans`)만 쓰고, 단위 테스트는 `testing/mock-store.tsx`의 `MockLabProvider`로 한다. Babylon 객체는 React state에 넣지 않는다(`useEngineSession().engine()` ref 접근).
- 패널 스타일 클래스는 `cl-<panel>-…` 접두를 쓰고, 정의는 core가 `src/app/styles/character-lab.css`에 한 번에 추가한다(작업자는 공유 CSS를 편집하지 않는다).
- 영역 작업자는 `docs/parity/<area>.md`에 자기 영역 행만 쓴다(열: 구현 상태 / Node 검증 테스트 파일 / 브라우저 검증 / 비고). core가 `docs/shaper-parity-checklist.md`로 집계한다.
- 브라우저(GPU)에서만 확인할 수 있는 동작은 "브라우저 미검증"으로 정직하게 표기한다. 이 저장소의 컨테이너에는 GPU가 없다.
- 절차 소스 조립 규약(humanoid ↔ outfit, 2026-10-01): core 조립기 `src/app/shell/procedural-source.ts`는 humanoid의
  `buildHumanoidModel(recipe, { subdivisionLevels, seed, outfit: OutfitBuilderPort })`를 받는다(조립 완료: `app/composition.ts`). 그 함수 안에서
  (1) `outfit.buildHair`·`buildGarments` 결과를 `combineOutfitResults([hair, garments])`로 합치고 outfit 파츠의 jointIndices ≥ 55는 합친 결과의 `bones[index-55]`다,
  (2) 보조 루트 본의 restTranslation을 `rebaseAuxiliaryRoots(bones, 실제 rest, 추정값)`로 보정한다,
  (3) 헤어 파츠의 `param:headSize:±` morph와 의상 파츠에 전파된 bodyMorphs 이름을 `morphNames`에 포함한다.
- 렌더 엔진은 `app/composition.ts`의 `loadEngineFactory`가 `import("../render/babylon-character-engine")` 동적 import 한 곳으로만 로드한다(조립 완료, architecture.test.ts 강제).
- 셸 동작 규약(core, 2026-10-01 — 영역 작업자가 알아야 하는 것):
  1. **적용 루프**(`app/shell/apply-loop.ts`)는 recipe 참조·`history.revision`·capabilities 참조가 바뀐 스토어 알림에만 돈다. `failure`·썸네일·엔진 상태 이벤트로는 다시 돌지 않는다(실패가 실패를 부르는 무한 루프 방지). 같은 엔진에서 실패한 같은 소스·셰이딩·물리 provider는 값이 바뀔 때까지 재시도하지 않는다.
  2. **절차 소스 재생성 키** = humanoid `geometryKeyOf(recipe)`(eyes·irises·hair·top·bottom·shoes·accessory). 이 슬롯이 바뀌면 소스를 다시 만들어 올리고 셰이딩·물리·플랜·페인트 레이어를 다시 올린다. 파라미터·색·표정·포즈·셰이딩 변경은 플랜만 다시 적용한다. 지오메트리를 바꾸는 슬롯이 늘면 `GEOMETRY_SLOT_KINDS`에 넣는다.
  3. **능력 맵**은 절차 소스일 때 처음부터 `ALL_AVAILABLE_CAPABILITIES`이고, 엔진이 `loadSource`로 보고한 능력 맵이 스토어와 다르면 적용 루프가 `source/capabilities` 이벤트로 맞춘다(history 밖). 제작 패키지를 사용자가 고르는 흐름은 PackagePanel의 `source/set`(능력까지 undo/redo)이다.
  4. 패널이 `engineSession.reloadSource`로 직접 올린 소스는 런타임이 `applyLoop.markSourceLoaded`로 알리고, 레시피가 그 소스를 가리키는 입력 변경(`source/set`)이 올 때까지 루프는 기존 소스로 되돌리지 않는다.
  5. 썸네일은 현재 엔진에서 소스 로드와 첫 적용이 끝난 뒤(`applyLoop.settled()`)에만 요청한다. 엔진이 `thumbnailSources`를 선언하면 지오메트리 슬롯 카드는 프리셋을 입힌 임시 절차 소스(`ThumbnailRequest.source`, level 0)로 요청한다.
  6. 적용한 플랜의 `revision`은 history revision이다(플래너는 0).
- 베타 기능 토글(NodeMaterial 툰·IBL Shadows·OpenPBR·투영 페인트)은 **엔진 세션 상태**다. `ShadingProfile`·레시피는 core가 동결한 strict 계약이라 베타 필드를 더하지 않고, 엔진의 구조적 포트(`betaFeatures()`·`setBetaFeature()`, `render/beta-features.ts`)를 RenderPanel이 읽는다. 지원하지 않는 엔진에서는 켜지지 않고 한글 사유를 보이며 다른 경로로 대체하지 않는다.
- 레이아웃 규약: 데스크톱 폭(≥1181px)에서 워크벤치는 창 높이에 갇히고 좌·우 열이 각자 스크롤한다(뷰포트 캔버스는 고정). 패널 루트에 `height: 100vh`·`min-height: 100vh`를 두지 않는다 — 열이 늘어나 페이지 전체가 스크롤된다.
- 라이선스: 상업 이용 가능 라이선스(MIT/Apache-2.0/BSD/ISC/Zlib/CC0)만. 참고 코드는 개념·수식만 재구현하고 출처를 주석에 남긴다. 경쟁 제품 코드·에셋 복제 금지. 모든 프리셋은 `license: "original"`.

## 5. 검증

작업자별 최소 검증(자기 디렉터리):

```sh
pnpm --filter @toonstudio/character-lab typecheck
pnpm exec vitest run apps/character-lab/src/<자기 디렉터리>        # 루트 설정
pnpm --filter @toonstudio/character-lab exec vitest run src/<자기 디렉터리>   # 앱 설정
pnpm exec eslint --max-warnings=0 apps/character-lab/src/<자기 디렉터리>
```

통합 최소 검증: `pnpm harness:verify`, `pnpm typecheck:character-lab`, `pnpm test:character-lab`(두 vitest 설정 모두 통과해야 한다). 빌드 경계에 영향이 있으면 `pnpm build:character-lab`.
렌더·셰이딩·캡처·셸 동작을 바꿨다면 build 뒤 `CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs`(README §4)를 돌려 실브라우저 결과를 확인한다. NullEngine·모의 엔진 테스트는 PBR 재질이 실제로 그려지는지(알파)·셰이더 컴파일·readback을 검증하지 못한다.
루트 전체 `pnpm typecheck`·`pnpm test:root`·`pnpm build`·`pnpm install`과 루트 파일(`.github/*`, `scripts/*`, `config/*`, lockfile) 변경은 통합 담당만 한다. `pnpm install`은 동시에 여러 사람이 실행하지 않는다.

## 6. 의존성 메모

- WebGPU 타입은 TypeScript 6의 DOM lib이 제공하므로 `@webgpu/types`를 추가하지 않는다. top-level await와 ES module worker(`worker.format = "es"`)는 Vite 설정이 허용한다.
- 선언된 런타임 의존성: `@babylonjs/core|loaders|serializers` 9.19.0(exact), `@dimforge/rapier3d-deterministic-compat` 0.19.3, `@mediapipe/tasks-vision`, `ag-psd`(패치 적용), `zod` 4.4.3, React 19. 새 의존성은 금지이며 필요하면 통합 담당에게 요청한다(fast-png·`@babylonjs/havok`·three/three-vrm/playcanvas는 이번 범위에서 채택하지 않았다).
