# ToonStudio Character Lab

상태: current (2026-10-01). `apps/character-lab`은 네이버웹툰 SHAPER(설치형)와 같은 3D 캐릭터 제작 흐름을
**웹에서** 재현하는 독립 정적 Vite 실험 앱이다(pnpm workspace `@toonstudio/character-lab`). 서버 기능이 없고
운영 배포 대상이 아니며, 모든 입출력은 브라우저 로컬 파일(레시피 JSON·PNG·PSD·GLB)로만 한다.

## 1. 목적과 웹의 차별점

- 15슬롯(얼굴형·눈·눈동자·코·입·귀·헤어·체형·상의·하의·신발·액세서리·표정·포즈·손 포즈) 프리셋 조립,
  체형 9·얼굴 15 파라미터, 표정 12 + FACS 16, 포즈 10·손 포즈 8 + IK·관절 드래그, 헤어·의상 2차 물리,
  PBR/IBL/그림자/후처리/툰 셰이딩, 투명 PNG·레시피·glTF·레이어 PSD 출력, 모델 위 UV 페인트,
  참고 이미지 추천·사진 포즈 인식, Blender 제작 패키지 투입까지가 범위다(격차를 1·2차로 나누지 않는다).
- 설치·플러그인·외부 에디터 없이 URL 하나로 즉시 실행·공유되고, ToonStudio 웹 파이프라인(레시피·PSD)과 바로 이어진다.
  이것이 설치형 SHAPER 대비 유일한 구조적 장점이므로 "웹에서 동작해야 한다"가 모든 엔진 결정의 제약이다.

## 2. 아키텍처 요약

```text
contracts/ (core, 동결)  ──►  state · presets · humanoid · outfit · physics · animation · paint · export · authored · vision
        │                                  (순수 TS, 영역 간 교차 import 금지, 함수는 app/composition.ts가 DI로 주입)
        └────────────────►  render/ (유일한 @babylonjs/* 소유자) ──► babylon-character-engine (동적 import 1곳)
app/shell: LabStoreProvider · engine-session · apply-loop · thumbnail-scheduler · TopBar · FailureBanner · 패널 11개
```

- 데이터 흐름: 패널 → `dispatch(LabCommand)` → `state/lab-store`(1 명령 = history 1단계) → `planApply` → `engine.applyPlan`.
  썸네일은 셸 스케줄러가 직렬로 `engine.renderThumbnail`, 출력은 `export-session` → `renderPasses` → PNG/PSD/GLB.
- 엔진 레인(문서와 HUD에 동일 표기, `contracts/engine.ts ENGINE_LANES`):

| 레인 | 상태 | 설명 |
| --- | --- | --- |
| babylon-webgpu | 주 엔진(실험, 브라우저 미검증) | `WebGPUEngine.initAsync()`; 사용자 명시 선택; 실패는 `EngineStatus.failed`로 노출 |
| babylon-webgl2 | 명시 대안 | `Engine(canvas, …, failIfMajorPerformanceCaveat)`; 자동 전환 없음 |
| null | 테스트 전용 | `NullEngine`으로 같은 어댑터 구동; readback은 `provenance.synthetic=true` |
| physics builtin-pbd / rapier / havok | 가용 / 가용(동적 import) / 미설치 사유 표시 | 활성 provider를 HUD·캡처 provenance에 기록 |
| three-webgpu+three-vrm, playcanvas, bevy/wgpu | 문서 비교 전용 | `docs/reports/character-lab-engine-alternatives-2026-10-01.md` |

- 무음 대체 금지: capability 미지원·엔진 실패·슬롯 미지원·모델 로드 실패는 전부 `LabFailure{code, reasonKo}` 또는
  `SlotCapability.reasonKo`로 화면에 보이고 자동 재시도·자동 대체가 없다(ADR-0018, ADR-0026).
- 경계는 `src/architecture.test.ts`가 fs 스캔으로 강제한다. 규칙 전문은 `AGENTS.md` §3.

## 3. 명령

```sh
pnpm --filter @toonstudio/character-lab dev        # http://localhost:4176
pnpm --filter @toonstudio/character-lab typecheck
pnpm --filter @toonstudio/character-lab test       # 앱 vite.config로 src/** vitest
pnpm --filter @toonstudio/character-lab build      # apps/character-lab/dist/ (GPU 없이 생성 가능)
pnpm --filter @toonstudio/character-lab preview    # http://localhost:4177
pnpm exec vitest run apps/character-lab            # 루트 vitest 설정(node 환경 + vitest.setup.ts)에서도 통과해야 한다
pnpm exec eslint --max-warnings=0 apps/character-lab
CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs   # 실브라우저 프로브(build 뒤, §4)
```

루트 별칭: `pnpm dev:character-lab`, `pnpm typecheck:character-lab`, `pnpm test:character-lab`, `pnpm build:character-lab`.
생성물 `dist/`는 git이 무시한다. 통합 검증은 `pnpm harness:verify`(변경 범위 게이트)와 `pnpm validate:architecture`.

테스트 층(위에서 아래로 넓어진다): ① 영역 단위 테스트(각 영역은 모의 포트로 검증) → ② `src/app/composition.test.ts`·`src/app/composed-app.smoke.test.tsx`(실제 영역 모듈·패널 조립 + 모의 엔진 팩토리: 카탈로그 94, 능력 맵, 절차 소스 재생성 키, 지오메트리 프리셋 썸네일 소스, 모든 인스펙터 탭 마운트)
→ ③ `src/app/null-engine.integration.test.ts`(실제 humanoid·state·outfit·physics·export를 render의 NullEngine 하네스에 꽂아 소스 로드·플랜 적용 skipped 0·표정/포즈 30 프리셋·물리 전환·썸네일 64·PNG/PSD/GLB/레시피 출력을 끝까지 실행)
→ ④ 브라우저 검증(아래 §4). 이 컨테이너에는 GPU가 없어 소프트웨어 렌더러(SwiftShader)의 WebGL2로 `scripts/browser-probe.mjs`만 돌릴 수 있고 실 GPU·WebGPU·성능은 검증하지 못한다. ③까지 통과해도 셰이더·readback 픽셀·성능은 검증되지 않는다.

Node 버전: 저장소 루트는 `engines.node >= 24.16`이고 CI는 Node 24로 돈다. 개발 컨테이너는 Node 22.22였으며
이 앱의 테스트·빌드는 양쪽에서 같은 결과를 내도록 `import.meta.dirname`/`process.cwd()` 기반 경로만 쓴다
(`fileURLToPath(import.meta.url)`은 vitest 4.1에서 file 스킴이 아닐 수 있어 쓰지 않는다).

## 4. GPU 환경 브라우저 검증 절차(이 컨테이너에는 GPU가 없다)

브라우저 실기기 증거 없이 "동작"으로 보고하지 않는다. 다음 절차를 Chrome 113+(WebGPU 활성)에서 수행하고
결과를 `docs/shaper-parity-checklist.md`의 **브라우저 검증** 열에 `YYYY-MM-DD·기기·backend`로 기록한다(미실행은 "미검증" 유지).

**자동 프로브(`scripts/browser-probe.mjs`)**: 절차 중 셸 마운트·백엔드 명시 선택(ready 또는 `[코드]` 사유 failed, 자동 대체 없음)·투명 PNG 검사(PBR·툰 각각 모서리 알파 0,
투명 픽셀 RGB 0, 캐릭터 면적 ≥ 1.5 % — 완전 투명 PBR 같은 회귀를 잡는다)·카드 클릭 1단계/실행 취소·썸네일 완료를 Playwright로 실행한다.
`pnpm --filter @toonstudio/character-lab build` 뒤 `CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs [--software] [--backends webgl2] [--require-ready webgl2] [--out <json>] [--shots <dir>] [--url <이미 뜬 서버>]`.
게이트가 꺼져 있으면 0으로 끝나고, playwright·Chromium이 없으면 구조적 skip(종료 코드 2)이다(`CHARACTER_LAB_CHROMIUM_PATH`로 실행 파일 지정). 이 컨테이너 같은 소프트웨어 렌더러(SwiftShader)에서는
`--software`를 주며 리포트에 그 사실이 남는다 — **성능·실 GPU 렌더 증거가 아니다**(WebGPU는 소프트웨어 폴백 어댑터라 의도대로 `webgpu-fallback-adapter`로 차단된다). 나머지 절차(관절 드래그·페인트·비전·PSD/GLB 열기·성능)는 수동이다.

1. `pnpm dev:character-lab` → `http://localhost:4176` → 상단 **[WebGPU]** 클릭. 배지가 `활성 엔진 … backend webgpu · <어댑터>`로 바뀌는지,
   실패 시 `[코드]: 사유`가 배너에 보이는지(자동으로 WebGL2가 만들어지지 않아야 한다). `chrome://gpu`의 어댑터와 대조.
2. **[WebGL2]** 클릭 → 같은 레시피로 복원되는지(device lost 복원 경로와 동일).
3. 슬롯 패널 카드 썸네일이 pending → 이미지로 바뀌는지, 카드 클릭 1회 = 실행 취소 1단계인지.
4. 파라미터·표정·포즈 탭 슬라이더/카드가 즉시 반영되는지, 관절 핸들 드래그가 관절 제한에서 멈추는지.
5. 물리 탭에서 builtin-pbd → rapier 전환, havok은 "미설치" 사유만 보이는지. 헤어·치마가 settle 뒤 안정되는지.
6. 렌더 탭에서 PBR↔툰, 그림자·SSAO·TAA(베타) 토글, HUD의 frame p95·gpu ms·draw calls. 1920×1080에서 p95 ≤ 33.3 ms(목표).
7. 페인트 탭 드로잉 모드 → 모델 위 스트로크가 텍스처에 반영되고 실행 취소 1단계로 되돌아가는지.
8. 내보내기 탭: 투명 PNG(알파 검사: 배경 픽셀 a=0·RGB=0), 레시피 저장/불러오기, GLB(다시 import), PSD(Photoshop/CSP에서 레이어·blend 확인).
9. 비전 탭: 참고 이미지 업로드 → MediaPipe 모델 로드 상태(CDN·SHA 검증·15 s timeout) → 슬롯 추천 카드, 사진 업로드 → 랜드마크 오버레이 → 포즈 적용.
10. 제작 패키지 탭: `index.json` 목록 → 패키지 로드(SHA-256 검증) → 15슬롯 능력 표와 사유.

측정 방법: HUD는 `SceneInstrumentation`·`gpuFrameTimeCounter`(timestamp query 미지원이면 null 표시)와 최근 120 프레임 p95다.
성능 목표(제안): 1920×1080 p95 frame ≤ 33.3 ms, input-to-present ≤ 50 ms, PSD opaque 재합성 MAE ≤ 2/255, 투명 PNG 2048² ≤ 500 ms.

## 5. 베타·실험 표기(기본 off 또는 미검증)

**베타 토글 4종**(RenderPanel '베타 기능', 기본 꺼짐): NodeMaterial 툰(기본은 ShaderMaterial 툰 GLSL/WGSL + OutlineRenderer), IBL Shadows, OpenPBR, MeshUVSpaceRenderer 투영 페인트.
켜기 전에 엔진 능력을 확인하고 지원하지 않으면 한글 사유와 함께 켜지지 않는다(다른 경로로 자동 대체하지 않는다). 토글은 엔진 세션 상태라 레시피(`ShadingProfile`)에 저장되지 않으며 엔진을 다시 고르면 꺼진다.
한계는 UI에 고지한다: OpenPBR은 페인트 데칼이 보이지 않고, IBL Shadows는 툰 재질에 적용되지 않으며, OpenPBR·IBL Shadows는 청색 노이즈 PNG 1장을 `assets.babylonjs.com`에서 받는다(외부 요청).
TAA·SSAO2도 베타(기본 꺼짐)이며 Havok provider는 미설치, VRM 부분 파서(VRMC_vrm meta/humanoid만), MediaPipe 모델 SHA 미고정은 그대로다.

**실제로 확인한 범위**: 2026-10-02 소프트웨어 렌더러(SwiftShader) WebGL2에서 PBR·툰 렌더의 가시성·투명 PNG 알파 규약·썸네일·셸 흐름을 프로브로 확인했다(`docs/shaper-parity-checklist.md` §13).
**확인하지 못한 범위**: WebGPU 경로, WGSL 셰이더 실제 컴파일, 실GPU 렌더 품질·성능, 투명 RTT readback 행 순서/premultiply 상수(`RTT_READBACK_*` 가정값), 그림자·후처리 품질, 페인트 텍스처 반영과 투영 페인트 포인터 흐름,
rapier 브라우저 성능, GLB 실파일 재import·외부 뷰어 sparse morph, PSD 재합성 MAE 실측.
항목별 상태는 `docs/shaper-parity-checklist.md`(구현 / Node 검증 / 브라우저 검증)를 본다.

지오메트리 슬롯 카드 썸네일(2026-10-01): 절차 소스는 선택된 슬롯의 지오메트리만 담으므로(헤어·상의·하의·신발·액세서리·눈·눈동자 변경 = 소스 재생성) 이 7개 슬롯의 카드는
셸이 프리셋을 입힌 임시 절차 소스(level 0)를 만들어 `ThumbnailRequest.source`로 보내고, 엔진(`CharacterEngine.thumbnailSources === true`)이 임시 리그로 그린 뒤 해제한다.
엔진이 이를 구현하지 않으면 현재 소스로 그려져 같은 슬롯 카드가 같은 모양으로 보인다. 실제 렌더에서의 실루엣 차이는 브라우저 검증 항목이다.

## 6. 제작(authored) 캐릭터 패키지 투입

`public/assets/characters/index.json`(스키마 `toonstudio.character-lab.authored-character-index/1`)에 등록된
`<id>/manifest.json`(Blender 파이프라인 실측 키: `kind: "toonstudio.character-package"`, `schemaVersion: 1`, `capabilities`, `quality`,
`files{role:{path,bytes,sha256}}`)과 `<id>/*.glb`, `slot-mapping.json`을 PackagePanel이 읽어 SHA-256을 검증하고 15슬롯 능력을
판정한다(미지원 슬롯은 사유 표시, 대체 없음). 생성 절차·라이선스·검증 기록은 `docs/authored-asset-pipeline.md`.
현재 패키지: `avatar-orion-authored`(CC0-1.0, primary), `reference-character`.

## 7. 소유권·문서

- 디렉터리별 유일 소유자와 경계 규칙: `AGENTS.md`.
- 패리티 집계표: `docs/shaper-parity-checklist.md`(core 집계), 영역 원본: `docs/parity/{state,humanoid,outfit,animation,render,export,vision}.md`.
- 레시피 파일 경로(2026-10-01 core 결정): 사용자 저장/열기는 ExportPanel의 `src/export/recipe-file.ts`(`*.character.json`, 페인트 레이어 PNG 내장) 하나로 통일한다.
  `src/state/recipe-io.ts`(`character-<digest8>.json`)는 정규형 직렬화와 파일 접근 capability 판정(File System Access/`<input type=file>`)용으로 유지하며,
  두 파서 모두 strict `parseRecipe`를 쓰므로 서로의 파일을 읽을 수 있다(열기는 둘 다 허용: ExportPanel의 파일 선택 `accept`가 `.character.json,.json`).
  이 결정은 `src/app/recipe-file-interop.test.ts`가 근거를 검증한다(두 직렬화의 바이트 동일, 서로 열기, 페인트 내장 파일, 손상 JSON 사유 일치, 파일 이름 digest 일치).
  `state/recipe-io.browser.ts`(File System Access 열기·저장)는 앱이 쓰지 않는다 — 두 번째 저장 경로를 만들지 않기 위해 연결하지 않았다.
- 엔진 대안 비교·승격: `docs/reports/character-lab-engine-alternatives-2026-10-01.md`, `docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md`,
  연구 참고 문헌: `docs/engines/labs-character-engine-references-2026-10-01.md`.
- `scripts/validate-app-boundaries.mjs`의 `characterLabToApps`·`appsToLabs` ratchet이 교차 앱 import를 0으로 고정한다.

## 8. 의존성

`@babylonjs/core`·`@babylonjs/loaders`·`@babylonjs/serializers` 9.19.0(exact, Apache-2.0), `ag-psd`(MIT, `patches/ag-psd@31.0.1.patch` 적용),
`@mediapipe/tasks-vision`(Apache-2.0, wasm은 번들·모델만 CDN 지연 로드), `@dimforge/rapier3d-deterministic-compat` 0.19.3(Apache-2.0, 동적 import),
`zod` 4.4.3, React 19. PNG 인코더는 자체 구현(`CompressionStream`)이라 추가 의존성이 없다. WebGPU 타입은 TypeScript 6 DOM lib이 제공한다.
의존성 변경은 통합 담당이 `pnpm install`로 lockfile과 함께 갱신한다.
