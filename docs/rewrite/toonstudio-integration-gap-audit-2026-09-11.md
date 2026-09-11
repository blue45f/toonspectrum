# ToonStudio 최근 7일 통합 공백 감사

- 감사 범위: 2026-09-04 00:00 KST ~ 2026-09-11 23:59 KST
- 대상: `blue45f/toonspectrum`의 GitHub에서 관측 가능한 브랜치, 열린/닫힌 PR, `main` 비조상 커밋, 복구·승계 PR, PR 없는 브랜치, 제품 코드와 라우트·호스트·저장·내보내기 사이의 연결
- 기준 브랜치: PR #1307 `feat/toonstudio-final-ia-20260911`
- 제외: 개발자 컴퓨터에만 있고 push되지 않은 파일 및 GitHub에 ref/patch/artifact로 남지 않은 로컬 작업. 이 범위는 원격 저장소만으로 존재를 증명할 수 없다.

## 판정 규칙

파일 또는 테스트가 존재하는 것만으로 통합 완료로 보지 않는다. 기능별로 다음 고리를 확인한다.

1. 사용자가 도달 가능한 route/menu/command가 있는가.
2. route가 placeholder 또는 설명 화면이 아니라 실제 구현을 mount하는가.
3. 실제 편집기 host가 callback과 상태 소유권을 연결하는가.
4. 저장·복원 또는 명시적으로 제한된 임시 상태 계약이 있는가.
5. live/commit/export 중 해당 기능이 약속한 단계가 연결되는가.
6. 영구 CI가 이 연결을 검증하며, 일회성 workflow가 제품 변경을 대신하지 않는가.

## 확인된 반복 실패 패턴

### 1. materializer만 병합되고 제품 소스는 뒤늦게 복구

픽셀펜, 레이어 드래그, 포즈/IK, AI Comic Director 등에서 일회성 스크립트 또는 workflow가 먼저 병합되고 실제 제품 파일이 후속 PR에서 복구된 기록이 있었다. 제품 소스가 `main`에 직접 존재하고 route/host에서 사용되는지 따로 확인해야 했다.

### 2. planner/model은 존재하지만 실제 runtime host가 누락

Smart Shape, grip runtime, import handoff, AI project handoff, 프로젝트 기능 모듈에서 순수 계획기와 테스트가 먼저 존재하고 실제 화면/편집기 연결이 후속 작업으로 남은 사례가 반복됐다.

### 3. 닫힌 PR 자체는 미병합이지만 상위 통합 PR로 승계

브러시 품질 포트폴리오와 GPU 품질 선거처럼 원래 PR의 `merged=false`만 보면 손실로 보이지만, 후속 통합 PR이 고유 제품 diff를 흡수한 사례가 있었다. PR 번호가 아니라 현재 `main`/PR #1307의 파일·호출 경로를 기준으로 판정했다.

### 4. 별도 작업대에서만 동작하고 정본 편집기 권위와 분리

Brush Studio V5/V6가 대표 사례다. V5 72종 카탈로그와 V6 그래프/레시피는 현재 하나의 Brush Studio route에서 접근 가능하고 marketplace snapshot도 제공한다. 그러나 V6 작업대의 local program과 일반 Studio 캔버스의 brush snapshot/live/commit renderer는 같은 권위가 아니다. 이 제한은 숨기지 않고 UI와 코드 경계에 유지한다. 완전한 픽셀 authority 승격은 별도 렌더러·저장 포맷 마이그레이션과 실측 회귀가 필요한 제품 작업이지, 닫힌 브랜치를 단순 병합해 해결할 수 있는 누락으로 취급하지 않는다.

### 5. CI가 제품 실패 전에 메모리 종료

PR #1307의 `ToonStudio integration`은 Node 기본 힙 약 4 GiB에서 TypeScript가 OOM으로 종료되어 lint와 통합 테스트가 전부 skipped 됐다. 타입 오류가 아니라 검증 경로 자체의 공백이다. 영구 workflow에 8 GiB 힙을 부여하고 route/host/persistence 연결 테스트를 포함한다.

### 6. 자기 수정형 일회성 workflow가 제품 브랜치에 잔존

`pr1307-final-squash-rebase.yml`과 `pr1307-integration-validation-v2.yml`은 `contents: write`, source mutation, 자기 삭제, push 또는 force-with-lease를 수행했다. 전자는 존재하지 않는 과거 테스트 파일도 실행 목록에 포함했다. 검증은 읽기 전용 영구 workflow 한 곳으로 수렴시키고 두 helper를 제거한다.

## 영역별 현재 판정

### 브러시

- V5 품질 카탈로그와 V6 프로그램은 `StudioBrushLabPage`에서 각각 legacy catalogue와 integrated workbench로 도달 가능하다.
- V5 항목은 V6 recipe로 결정적으로 연결되며 V6 프로그램 변경은 marketplace bridge가 읽는 snapshot에 반영된다.
- 일반 캔버스의 기존 brush authority와 V6 물리 그래프는 아직 별도다. UI가 이를 완성된 renderer 승격으로 주장하지 않으므로 작업 손실이 아니라 명시된 제품 경계로 분류한다.

### 가져오기와 AI

- 통합 가져오기 화면은 메모리 handoff token을 만들고 실제 `StudioCuttoonEditorHosts`의 `StudioImportHandoffHost`가 image/brush pack/interchange/project JSON/PSD callback에 연결한다.
- AI 프로젝트 handoff 역시 같은 실제 캔버스 host에서 도구, 배경, 캐릭터, 구성, 대사, 팔레트 상태로 연결된다.
- planner-only 상태가 아니라 route에서 편집기 mutation 경계까지 닫혔다.

### 프로젝트 셸과 최근 추가 기능

- canonical project route는 이름과 달리 bare shell이 아니라 `StudioProjectIntegratedPage`를 lazy-load한다.
- integrated page는 프로젝트 기능 suite, 현지화, 시리즈 키트, 리뷰, 내보내기, AI assistant를 route-reachable surface에 mount한다.
- shell은 diagnostics bridge와 readiness panel을 mount한다.
- analytics, automation, presentation audit, production pipeline, story continuity, storyboard, template application, voice/motion, webtoon 3D render, webtoon quality 모듈은 `StudioProjectFeatureSuitePanel`에서 실제 사용자 action과 project-scoped persistence에 연결된다.

### 에셋·캐릭터·3D·마켓·게시

- 최근 복구 PR의 고유 제품 변경은 #1289/#1290 통합 계보와 현재 `main` 파일 존재를 대조했다.
- 현재 원격에 남은 `ops/pr1289-ci-delta-optimizer-20260911` 브랜치는 `main` 대비 제품 파일 diff가 없고 PR #1289 전용 CI workflow만 가진 운영 브랜치다. 제품 손실 후보에서 제외한다.
- 외부 3D/AI provider 중 실제 네트워크 자격증명 또는 네이티브 커널이 필요한 항목은 provider foundation과 production-ready 실행을 구분한다. foundation만 있는 상태를 완전한 provider 실행으로 표시하지 않는다.

## PR #1307에서 보완한 내용

1. `ToonStudio integration` workflow의 Node 힙을 8 GiB로 고정해 typecheck 이후 lint와 테스트가 실제 실행되게 했다.
2. route, project integrated runtime, diagnostics/readiness, import/AI canvas host, V5/V6 brush route를 함께 검증하는 `studio-integration-closure.test.ts`를 추가했다.
3. 프로젝트 기능 suite의 실제 구현 모듈과 runtime panel을 영구 lint/test 대상에 포함했다.
4. source를 수정·삭제·force-push하던 PR 전용 workflow 두 개를 제거했다.
5. 영구 workflow가 `contents: read`만 사용하고 transient workflow가 다시 생기면 테스트가 실패하도록 고정했다.

## 남은 경계와 후속 판정 기준

다음은 이번 감사에서 숨은 브랜치 손실로 확인된 항목이 아니라, 구현 범위를 명시해야 하는 제품 경계다.

- Brush V6 프로그램을 일반 캔버스의 canonical brush snapshot/live/commit/export authority로 승격하는 작업
- 실물 Apple Pencil/S Pen/Wacom 및 물리 GPU에서만 검증 가능한 입력·렌더러 품질
- 외부 provider 자격증명, 비용, 권리 확인이 필요한 실제 호출
- 협업 서버/DB가 필요한 cross-device 영속성

이 경계를 완료로 바꾸려면 route 존재가 아니라 실제 host mutation, 저장 round-trip, live/commit/export 결과, 실패 복구와 영구 CI 증거를 함께 제출해야 한다.

## 최종 원격 감사 결과

GitHub에서 관측 가능한 최근 7일의 닫힌·열린 PR, 현재 원격 브랜치, 복구/승계 계보를 기준으로, 별도 제품 브랜치에만 남아 있는 설명되지 않은 고유 제품 diff는 추가로 확인되지 않았다. PR #1307에서 새로 추가된 다수의 모델 모듈은 프로젝트 기능 suite와 전용 패널/저장소로 연결됐고, 이 연결을 영구 회귀 테스트로 고정했다.

단, push되지 않은 개인 로컬 워킹트리는 GitHub 원격 감사로 존재 여부를 판단할 수 없다. 이후에도 작업 종료 시 제품 소스 commit, PR 또는 원격 backup ref 중 하나를 반드시 남기는 운영 규칙이 필요하다.
