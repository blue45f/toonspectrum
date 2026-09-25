# ToonStudio 경쟁 제품 대체 통합 — ProjectGraph v3

- 기준일: 2026-09-17
- 브랜치: `feat/studio-project-graph-v3-20260917`
- 범위: Clip Studio Paint, Photoshop, Procreate, MediBang, SketchUp, ACON3D, Google Drive, Dropbox 및 로컬 PSD·PNG·CLIP 작업을 웹툰 제작 흐름 안에서 통합

## 제품 계약

ToonStudio는 범용 사진 편집기·범용 CAD·범용 드라이브를 외형까지 복제하지 않는다. 웹툰 기획부터 작화, 3D 배경, 소재, 파일, 협업, 검수, 게시까지 동일한 작품 ID와 Revision을 사용하는 제작 운영체제를 제공한다.

1. 대본, 컷, 2D, 3D, 소재, 작업, 댓글, 승인본과 게시본은 동일한 `ScopeRef`를 사용한다.
2. `working`, `checkpoint`, `submission`, `review-snapshot`, `approved`, `release`는 서로 다른 의미의 불변 Revision이다.
3. 과거 상태 복원은 기존 기록을 덮어쓰지 않고 새 checkpoint를 만든다.
4. PSD·PNG·CLIP 원본은 불변 Blob으로 보존하고 손실 항목을 숨기지 않는다.
5. 브라우저 OPFS/SQLite 권위는 클라우드 장애 중에도 편집을 계속할 수 있어야 한다.
6. 기능 존재만으로 경쟁 제품 동등성을 주장하지 않는다. 복구, 권한, 왕복, 성능, 실기기와 전문가 증거를 별도로 관리한다.

## 추가한 통합 경계

### ProjectGraph와 Revision API

- ProjectGraph, Artifact, ScopeRef, Revision, Blob, Operation, Review, CompatibilityReport, Capability Ledger 계약
- PostgreSQL migration 및 Drizzle schema
- expected-head optimistic concurrency
- raw idempotency key 비저장과 mutation receipt replay
- immutable revision/operation/review topology constraint
- source Blob 검사 gate와 anchored review comment
### 비파괴 Version Stack

`검토 > 버전`은 작업본, checkpoint, 검수본, 승인본과 게시본을 구분한다. 과거 Revision 복원은 두 단계 확인 후 선택한 Revision을 부모로 하는 새 checkpoint를 만든다. 현재 head가 달라지면 `If-Match` 충돌로 중단한다.

### 파일 호환성 보고

`소재 > 누락·권리`와 `내보내기 > 사전검사`는 원본 포맷, SHA-256, 보존·변환·래스터화·제외·미지원 항목, A–D 등급을 표시한다. A 이외 보고서는 편집 Revision 연결 전에 명시적 승인을 요구한다. CLIP은 완전 왕복으로 표시하지 않고 migration lane으로 유지한다.

### 제품 셸과 로컬 우선 동작

모든 프로젝트 화면은 로컬, 동기화 중, 동기화 완료, 캐시, 오프라인, 오류 상태와 현재 Artifact/head/approved Revision을 표시한다. 클라우드 메타데이터 조회 실패가 로컬 문서·자동 저장·복구 권위를 중단하지 않는다.

### Desktop Sync Agent 코어

`apps/desktop-sync-agent`는 데스크톱 패키징에서 사용할 독립 코어다.

- linked, mirrored, embedded binding 계약
- root 탈출과 traversal 차단, filesystem root binding 금지
- symlink 무시, bounded file count/size
- 스트리밍 SHA-256과 append-only JSONL journal
- mode `0600`, flush+fsync, 재시작 상태 복원
- upsert/delete delta와 polling
- provider token 비저장
- short-lived HTTPS upload grant만 메모리에서 사용

Tauri shell, 자동 업데이트, OS별 설치 패키지는 이 코어를 소비하는 배포 계층이며 근거가 생기기 전에는 배포 완료로 표시하지 않는다.

### Google Drive와 Dropbox

기존 Personal Cloud 구현을 ProjectGraph 외부 저장 provider로 재사용한다. OAuth2 PKCE, refresh token 서버 암호화, account lookup/revoke, Google Drive resumable upload, Dropbox upload session, 원격 버전 조회와 프로젝트 패키지 업로드가 포함된다.
## 기존 전문 엔진 재사용

이번 변경은 이미 제품에 배선된 Workspace docking/preset, SQLite WASM+OPFS 복구, sparse tile/WebGPU, brush/vector/selection/filter, frame/balloon/tone/ruler, PSD·PNG, Hybrid DCC/BG3D, Asset Hub, realtime presence/lease, review와 production bridge를 재작성하지 않는다. 대신 Capability Ledger의 코드·테스트 증거로 연결해 메뉴 존재와 제품 완성을 구분한다.

## 증거와 릴리스 게이트

`docs/quality/studio-replacement-capability-ledger.json`은 PR-001부터 PR-057까지 정확히 한 항목씩 가진다. `scripts/verify-studio-replacement-capabilities.mts`는 다음을 실패 처리한다.

- 계획 ID 누락·중복
- 존재하지 않는 repository evidence
- passed check가 required check에 없는 경우
- roundtrip/device/expert 상태에 필요한 증거 부재
- `equivalent` 또는 `differentiated`인데 남은 gap이 있는 경우
- 실제 전문 작가 검증 없이 PR-057을 완료 상태로 표시하는 경우
- 릴리스 게이트가 ledger보다 높은 상태를 주장하는 경우

## 검증 명령

```bash
pnpm typecheck
pnpm --filter @toonspectrum/desktop-sync typecheck
pnpm --filter @toonspectrum/desktop-sync test
pnpm --filter @toonspectrum/desktop-sync-agent typecheck
pnpm --filter @toonspectrum/desktop-sync-agent test
pnpm run verify:studio-replacement
pnpm exec vitest run apps/web/src/domains/creator/project-graph/*.test.ts* \
  packages/studio-project-model/src/__tests__/project-graph.test.ts \
  packages/studio-format-gateway/src/__tests__/compatibility-report.test.ts \
  apps/api/src/modules/studio-project-graph/*.test.ts
```

## 저장소 코드만으로 완료 증명하지 않는 항목

- 여러 실기기 펜 latency와 장시간 GPU memory soak
- 실제 2GB 초과 PSB corpus
- 독점 CLIP 객체의 완전 편집 왕복
- 20인 실제 네트워크 협업 fault lab
- 독립 접근성·보안 감사
- 실제 전문 작가의 한 회차 완주 관찰

이 항목은 harness와 evidence slot까지 구현하되 실제 결과가 첨부되기 전에는 `device-validated`, `expert-validated`, `equivalent`, `differentiated`로 승격하지 않는다.
