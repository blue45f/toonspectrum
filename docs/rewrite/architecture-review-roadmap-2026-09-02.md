# 아키텍처 검토 반영 로드맵 (2026-09-02)

- 근거: [외부 검토 2026-09-02](../architecture/studio-architecture-review-2026-09-02.md) §11·§12·최우선 실행 항목
- 결정: [ADR-0019](../adr/0019-renderer-role-ledger-single-authority.md), [ADR-0020](../adr/0020-editor-client-ui-command-boundary.md),
  [ADR-0021](../adr/0021-stroke-budget-myb-disposition-execution-profiles.md)
- 현재 경계 사실: `current-studio-boundary.md`(2026-08-11), `docs/engines/renderer-roles.md`(원장 생성본)
- 원칙: 새 앱·새 URL 금지(ADR-0001·V11.1 in-place), 자동 엔진 폴백 금지(ADR-0018), 품질·손맛·필압 우선(ADR-0010),
  실험 엔진은 원장 `lab`으로만 진입(ADR-0019)

## 진행 표

| 단계 | 항목 | 상태 | 완료 조건 / 근거 |
| --- | --- | --- | --- |
| P0 | `.myb` spacing·smudge 계약 수정, disposition 5분류, 실제 코퍼스 테스트 | **완료** | 적용한 설정을 unmapped로 표시하는 사례 0건(`myb-corpus.test.ts`) |
| P0 | Renderer Role Ledger 고정(primary/provider/reference/lab), lab 제품 import 0건 | **완료** | `renderer-roles.test.ts`, `studio-renderer-role-boundary.test.ts` |
| P0 | 엔진 문서 자동 생성, 매뉴얼 "WebGPU 기반" 문구 정정 | **완료** | `verify:studio-renderer-roles`가 드리프트를 잡음 |
| P0 | 신규 UI의 `any`·raw setter·host import 금지 | **완료(ratchet)** | `studio-host-architecture-ratchet.test.ts`, `eslint.legacy-exceptions.json` 원장 |
| P0 | Quick Start 비모달, 신규 문서 기본 브러시 진입, 마지막 도구 복원 | **완료** | `StudioQuickStartPanel.test.tsx`, `studio-initial-primary-tool.test.ts` |
| P0 | 실험 진입점 `tools/browser-harnesses/` 이동, 패키지 설명 책임 기반 문구 | **완료** | `validate:architecture` |
| P0 | Hokusai route 수 문서 불일치 정리 | 미확인 | 검토가 지목한 문서 위치를 찾지 못함 — 발견 시 `renderer-roles.md`에 흡수 |
| P1 | `EditorClient` 계약 + `useEditorSelector`/`useEditorCommand` | **완료(계약)** | `editor-client.test.ts`, `src/domains/creator/editor-client/*.test.tsx` |
| P1 | 호스트에 `EditorClient` 배선, 툴 레일 → selector+command 전환 | **완료(툴 레일)** | 레일 raw React setter 16 → 0. `StudioLeftToolRail`은 `EditorClient` 하나만 받고 모든 클릭을 CommandRegistry 리시트 경로로 전달 |
| P1 | 런타임 소유자 분해(`StudioDocumentRuntime`, `ToolRuntime`, `ViewportRuntime`, `DurabilityRuntime`, `CollaborationRuntime`) | 미착수 | 호스트 500–1,000행, feature 공개 타입 `any` 0, `ViewSessionCore/Rest` 삭제 |
| P1 | `studio-project-model` 분리(`studio-document`/`studio-command`/`studio-history`/`studio-runtime`/`studio-storage`) | 미착수 | `studio-document`가 React/DOM/Worker/OPFS를 import하지 않음(경계 테스트 먼저) |
| P1 | 웹 앱을 `apps/studio-web`·`apps/discovery-web`로 분리 | 미착수 | 번들·배포 분리. `validate:architecture`의 병렬 앱 금지 조항과 충돌하지 않도록 in-place 이동으로 설계 |
| P2 | WebGPU shadow compositor(Worker GPUDevice, committed tile composite, dirty tile, pixel diff, device-loss) | 미착수 | 주요 브러시 visual corpus 허용 오차 통과, 획 hot path GPU readback 0회, pointer 중 main-thread long task 0회 |
| P2 | 단일 `GPUDevice` 리소스 관리자(Pipeline/Texture/TileAtlas/UniformRing/StagingPool/DeviceLoss) | 부분 | `studio-gpu-fabric.ts` lease가 존재. Pixi·Vello·자체 WebGPU의 device 공유를 원장 evidence로 검사 |
| P2 | `StrokeBudget` chunked accepted prefix를 실제 커밋 경로에 연결 | 미착수 | 32,768 상한이 "잘림"에서 "분할"로 바뀜; 30분 연속 스트로크 stress |
| P3 | WebGPU writable tile authority(신규 문서부터), Konva는 선택/텍스트 overlay | 미착수 | 새 문서에서 Canvas2D 브러시 commit 0회, device loss 후 checkpoint 복구 |
| P3 | OPFS command journal + tile shard + accepted-prefix durability | 부분 | SQLite WASM + OPFS SAH-pool은 이미 제품 권위(경계 감사 §1). tile shard·journal 연결이 잔여 |
| P3 | 실행 프로필 capability probe 고정(`pro-webgpu-worker`/`webgpu-worker-lite`/`webgl2-compat`/`cpu-reference`) | 미착수 | Memory64는 조건부(ADR-0021 C) |
| P4 | BrushGraph V2(Tip/Material/Deposition/Simulation graph, native payload + editable projection) | 미착수 | 1,000px 실제 브러시, 30분 스트로크, 수채 settle 중 UI 응답성, live/commit/export 일치 |
| P4 | libmypaint parity 게이트 확장(코퍼스 2 → oss-hybrid 포함, 1,000px, 장시간 wet, smudge, random dynamics) | 미착수 | `libmypaint-parity.json` 결정 필드 확장 |
| P4 | 플러그인 브러시 DSL(WESL subset, 정적 resource budget, 서명 패키지) | 미착수 | WESL은 원장 `lab` 유지 |
| P5 | Konva 브러시 픽셀 권위·Canvas2D 긴 획 경로·source-string 테스트·closure bag·린트 예외·실험 패키지 제품 import 삭제 | 미착수 | ratchet 상한이 0에 도달 |

## 운영 지표(검토 §12 채택)

- 입력·표시: 120 Hz p95 pointer-to-visible ≤ 1 frame, 60 Hz 저사양 ≤ 2 frame, pointer move 중 50 ms 이상
  main-thread long task 0건. 실제 sample과 predicted sample 분리 측정.
- GPU: 획 hot path GPU→CPU readback 0회, frame당 pipeline 생성 0회, texture는 pool, byte budget 초과 시
  명시적 degradation, device loss 복구 테스트.
- 메모리: 문서 전체 raster resident 금지, visible + active wet + undo window만 resident, per-stroke 고정
  dab 상한 대신 byte/time 예산(ADR-0021), 8시간 soak에서 증가 추세 없음(`studio-soak-10h.yml`).
- 내구성: accepted command prefix가 checkpoint 이후 항상 재생 가능, pointerup 직후 탭 종료 복구, quota
  부족 복구, OPFS corruption 시 마지막 정상 checkpoint 복구, follower → leader 전환 중 중복 저장 방지.
- 품질: 실제 MyPaint corpus, pen/pencil/watercolor/oil/smudge/eraser, 작은 점·긴 선·고속 flick·느린 곡선,
  압력 0→1·1→0, tilt/twist, 1,000px 브러시, Chrome/Safari/Firefox + 주요 GPU vendor.

## 배포 조건 회귀 테스트(검토 §5 "배포 조건")

COOP `same-origin` + COEP `credentialless` + CSP `wasm-unsafe-eval`은 `vercel.json`에 이미 있다. 다음 회귀
테스트는 P2 shadow compositor 전에 추가한다: Google 로그인·OAuth, 외부 이미지 credential 제거 영향,
signed URL 이미지·3D texture, marketplace asset, WebSocket·Realtime, service worker update, iframe·팝업 opener.

## 검토와 다르게 결정한 것

| 검토 권고 | 이 저장소의 결정 | 이유 |
| --- | --- | --- |
| Vello CPU=reference, Hybrid=lab만 언급, Raw WebGPU가 GPU 주 권위 | 문서 벡터 island primary=Vello Classic(이미 기본 활성, ADR-0018 유지), 래스터 브러시 커밋은 Canvas2D(현재)→raw WebGPU(목표) | 권위를 나누면 양립. ADR-0010은 차세대 엔진 리스크를 이미 수용 |
| Pixi는 Raw WebGPU와 분리된 overlay/provider | Pixi=선택 오버레이 island의 단독 primary | 상시 마운트 오버레이 호스트이고 브러시·hit-test 권위는 없음(원장 근거) |
| Paper.js는 편집 친화 기하로 유지 | provider(동적 import 호출부 존재) | 검토가 본 "호출부 없음"은 stale |
| `apps/studio-web` 신설 | in-place 이동으로 설계(병렬 앱·URL 금지) | ADR-0001·V11.1 §12.1 strangler 원칙 |
| 호스트 61,947행 | 실측 30,961행 기준 ratchet | 수치 오류 정정 |
| Quick Start "blocking modal" | 이미 pointer-through였음. 비모달 카드로 완전 전환 | 08-08 감사 이후 부분 수정이 있었음 |
