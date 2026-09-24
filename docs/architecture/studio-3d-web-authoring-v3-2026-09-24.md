# Studio 3D Web Authoring V3

- 상태: 구현 및 제품 연결 완료
- 결정일: 2026-09-24
- 범위: WEBTOON SHAPER형 캐릭터 저작, Clip Studio형 3D 레이어 연결, 브라우저 기반 WASM·Worker 실행

## 결정

ToonSpectrum의 3D 저작 환경은 **브라우저를 기본·필수 실행 환경**으로 유지한다. WebAssembly는 네이티브 앱으로 이탈하기 위한 수단이 아니라 브라우저 안에서 메시·B-Rep·저장 커널을 실행하기 위한 구현 기술이다.

프로젝트 열기, 편집, 자동 저장, 복구, 3D 미리보기, Groom·Geometry Stroke 생성, CharacterDocument 편집 및 PNG·PSD 출력에 네이티브 호스트를 요구하지 않는다. 데스크톱 셸은 향후 투명 always-on-top 창이나 OS 파일 연결을 제공할 수 있지만 선택적 어댑터이며 문서 authority가 아니다.

## 실행 토폴로지

```text
React UI
  -> Serializable CharacterCommand / ProjectCommand
  -> CharacterDocument V3 / StudioWebAuthoringProject V3
  -> browser adapters
       - Three WebGPU, WebGL2 fallback
       - module Worker
       - Manifold WASM
       - OpenCascade WASM
       - SQLite WASM + OPFS
       - IndexedDB fallback
       - OffscreenCanvas output worker
```

제품 계약은 모든 kernel에 `nativeRequired: false`를 강제한다. WebGPU가 없으면 WebGL2, OPFS가 없으면 IndexedDB, module Worker가 없으면 cooperative browser-main fallback을 사용한다. WebGPU와 WebGL2가 모두 없는 환경에서만 interactive 3D 실행을 명시적으로 차단한다.

## 구현된 authority

### CharacterDocument V3

`character-platform/document/character-document-v3.ts`

- 모델, topology, rig, morph, renderer revision
- 슬롯 recipe와 재질 look
- semantic morph, proportion, control cage, corrective, sculpt delta 변형 stack
- guide-curve Groom document
- Pose V3
- Surface Paint와 Surface Ink
- free/surface Geometry Stroke
- Linked 3D Layer
- 카메라와 semantic output recipe
- browser-required/native-not-required runtime policy
- V2 -> V3 결정적 migration과 JSON round trip

### CharacterAuthoringAuthority

`character-platform/application/character-authoring-authority.ts`

- 직렬화 가능한 operation
- expected document/revision fence
- 여러 operation의 단일 revision commit
- transient preview, commit, cancel
- undo/redo
- Worker job token과 stale-result rejection
- 기존 VRM host projection을 V3 authority에 동기화하되 Groom, Geometry Stroke, Linked Layer와 사용자 재질 override는 보존
- topology 변경 시 Surface Ink, Groom, Geometry Stroke를 삭제하지 않고 `needs-reprojection`으로 전환

### StudioWebAuthoringProject V3

`studio-web-runtime/studio-web-authoring-project-v3.ts`

- Scene3D와 CharacterDocument V3를 ID/revision으로 연결
- content-addressed binary resource descriptor
- editable mesh, B-Rep, procedural, sculpt, rigged character 등 geometry authority
- renderer-neutral Feature Graph
- persistent topology reference
- cycle, missing resource, stale character revision fail-closed validation

## 저작 커널

### Guide-curve Groom

`character-platform/groom/character-groom-document.ts`

가이드 곡선과 표면 root anchor를 authority로 저장하고 ribbon mesh를 derivative로 만든다. Guide resampling, editable profile, topology reprojection 상태를 제공한다. 렌더러 객체는 저장하지 않는다.

### Geometry Stroke

`character-platform/surface-ink/character-geometry-stroke.ts`

Surface Ink와 별도로 자유 공간 또는 표면에 부착된 control point를 저장한다. 속눈썹, 헤어 스트랜드, 장식선처럼 자체 형상을 가진 ribbon derivative를 실제 정점·인덱스 버퍼로 생성한다.

### Linked 3D Layer

`character-platform/linked-layer/character-linked-layer.ts`

다음 anchor를 지원한다.

- entity-local transform
- stable topology name
- triangle + barycentric coordinate
- UV + material
- object-ID mask

3D revision 또는 topology가 바뀌면 충돌을 사용자에게 노출하며 2D 보정 anchor를 조용히 삭제하지 않는다.

## Browser Worker

`character-platform/runtime/character-authoring-*`

module Worker에서 다음 작업을 실행한다.

- CharacterDocument V2 -> V3 migration
- CharacterDocument V3 validation
- Groom guide resampling
- Groom ribbon 생성
- Geometry Stroke ribbon 생성

결과 메시 buffer는 transferable ArrayBuffer로 반환하며 byte·point budget, progress monotonicity, request/generation identity, index range와 finite coordinate를 검증한다. Worker 생성이 불가능한 브라우저에서도 같은 pure runtime을 cooperative main-realm fallback으로 실행한다.

## 브라우저 저장

- CharacterDocument V3: `studio-character-document-v3-v1`
- StudioWebAuthoringProject V3: `studio-web-authoring-project-v3-v1`

기존 `StudioLocalDatabase`를 통해 SQLite WASM + OPFS를 사용한다. OPFS를 사용할 수 없는 환경은 runtime plan에 따라 IndexedDB compatibility store를 선택한다. Repository는 per-document/project write queue, expected revision, revision regression 방지를 제공한다.

## 제품 UI

Character Platform Workbench에 `웹 코어` 탭을 연결했다.

- 실제 브라우저 capability와 kernel provider 표시
- CharacterDocument V3 revision/topology/Groom/Surface Ink/Geometry Stroke/Linked Layer 상태
- V3 저장, JSON import/export, undo/redo
- 실제 Worker 또는 browser fallback에서 Geometry Stroke ribbon을 생성하는 self-test

기존 사용자·자동화의 접근성 계약을 보존하기 위해 기존 launcher/dialog/file-input accessible name은 유지하고 가시 UI에서 V3와 Web First를 표시한다.

## 검증

`pnpm run verify:studio-3d-web-authoring`

실제 브라우저에서 Character Platform V3 UI와 module Worker 메시 생성을 확인하려면 다음을 실행한다.

`pnpm run verify:studio-3d-web-authoring:browser`

검증 범위:

- authority, migration, persistence
- Groom, Geometry Stroke, Linked Layer
- Worker protocol/runtime/client
- browser fallback
- Scene3D + CharacterDocument project contract
- Node/desktop import 금지
- `nativeRequired: true` 금지
- OPFS/IndexedDB browser persistence
- 기존 Character Shaper/Workbench 회귀

전체 TypeScript project typecheck와 architecture validator도 통과해야 한다.

## 후속 확장 원칙

실제 Manifold·OCCT 기능을 확장할 때에도 커널은 browser module Worker 뒤에 유지한다. Native bridge가 생기더라도 동일 문서와 command contract를 입력받는 선택적 exporter 또는 accelerator로만 추가한다. 브라우저에서 프로젝트를 열고 편집할 수 없는 기능은 기본 제품 capability로 승격하지 않는다.
