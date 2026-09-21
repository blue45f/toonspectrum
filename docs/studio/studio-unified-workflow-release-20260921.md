# 가상 스튜디오 중심 공통 업무 화면 통합

상태: **current implementation / release verification pending**. 2026-09-21.
이 문서는 경쟁사 통합 설계의 실제 구현 단위를 기록한다. 전체 F01–F40 완료 선언이 아니다.

## 최종 화면 방향과 구현 범위

가상 스튜디오는 기존 실제 Phaser 공간과 원본 아트를 유지한다. 공간·작품 목록·팀·둘러보기는 같은 네 가지 전역 목적을 사용한다. 전문 원고·3D 편집기는 독립적인 런타임 소유권을 유지한다.

- `WorkspaceTaskFrame`은 새 작품, 가져오기, 소재, 검수, 버전, 제작과 주요 탐색·도움 화면에 같은 브랜드·GNB·검색·계정·현재 위치를 제공한다.
- `workspaceTaskRoute`는 명시적인 경로 목록이다. 원고/3D 편집기·공유 토큰·외부 검토·알 수 없는 경로를 넓은 prefix로 감싸지 않는다.
- 프레임 유무가 바뀌어도 자식의 ancestry와 key를 보존한다. UI 프레임이 원고를 생성하거나 권한을 부여하지 않는다.
- 작품 ID는 기존 navigation adapter가 전달하는 pointer다. 라이브러리 project ID, 서버 work ID, 그래프 ID를 임의 등치하지 않는다.
- 신규 제작은 종류·이름·형식·시작 행동을 먼저 제공하고, 제작 계획·예시는 선택해서 펼친다. 생성 전 저장 완료 배지를 제거한다.
- 소재 홈은 실제 소재 범주를 먼저 제공한다. 원본 소재 소개 아트는 삭제하지 않고 선택형 가이드로 이동하며 누락된 stylesheet import를 복구한다.
- OST는 업무 화면의 헤더 안에 배치해 모바일 하단 콘텐츠와 GNB를 가리지 않는다. 재생 정책은 유지하고 Escape와 초점 복귀를 지원한다.

## 검수와 제작 흐름

기존 고정 검수본 API, 30초 미리보기 lease, 권한 갱신, 앵커, 수정 완료 증빙, 승인/내보내기 계약을 재사용한다.

- 비교: 나란히, A/B, 같은 원본과 같은 크기가 검증된 겹쳐 보기, 불투명도, 확대.
- 연결: 원본 페이지 ID가 유일하게 대응할 때만 페이지 선택을 연결한다. 다른 순번·새 페이지·legacy·모호한 ID를 같은 내용으로 간주하지 않는다.
- 스크롤: 동일 페이지 내부 상대 위치를 사용한다. 컷 정렬·이미지 유사도·자동 품질 평가를 구현했다고 표시하지 않는다.
- 의견: 전체/미해결/필수/내 요청/해결 보기, 검색, 이전·다음 의견 탐색. 필터는 필수 의견과 승인 조건을 변경하지 않는다.
- 제작: 전체/내 할 일/오늘까지/선행·지연/미배정/완료 보기와 검색·공정 필터. 현재 role-assignment ID와 legacy user ID를 구별한다.
- 회차·공정 표: 실제 hierarchy의 ancestry에서 작업을 조회한다. 사이클·없는 부모·중복 ID는 추정하지 않는다. 항목에서 기존 작업 편집으로 돌아간다.
- 보기 변경은 저장되지 않은 작업 입력을 없애지 않는다. 목록 편집 인스턴스는 유지된다.
- 저장 확인 전·저장 중 중복 변경을 막는다. 확인되지 않은 데이터는 0건이나 승인된 상태로 표시하지 않는다.
- 모든 작업 완료와 필수 검토 확인을 제작 체크리스트로 표현한다. 이것은 원고 최종 승인·게시·외부 수신 완료가 아니다.

## 원설계 추적과 남은 범위

| 설계 묶음 | 이번 상태 |
| --- | --- |
| F02/F04/F05/F06 | 공통 프레임·시작·반응형·오디오 배치 구현. 기존 공간 홈은 유지·재검증 |
| F03/F07/F16 | 기존 식별자/권한/저장 계약 보존과 UI 보강. 인증·저장 원장 교체 없음 |
| F08–F10 | 고정본·원본 페이지 대응·A/B/겹침·확대 구현. 자동 컷 매핑·픽셀 diff는 미구현 |
| F11–F13 | 기존 위치 의견·수정 왕복·완료 증빙을 유지하고 탐색 보강. 초안 묶음 발행 신규 구현은 없음 |
| F14/F15/F17/F18 | 기존 검수·공유·출력 계약 재사용. 다중 승인 그룹·새 공식 납품 정책까지 완료한 것은 아님 |
| F19/F20 | 동일 작업의 조건별 보기·회차 공정 표 구현. 임의 사용자 저장 보기·캘린더 신규 구현 없음 |
| F21/F22 | 선행 작업 확인 표시. 자동 일정 변경·새 알림 묶음 기능은 미구현 |
| F23–F29 | 기존 기획·콘티·소재·파일 연동 유지. 이번 변경에서 해당 전체 고도화를 새로 완성했다고 주장하지 않음 |
| F30–F36 | 기존 공동 세션·인수인계·AI 경계 유지. 새 동기 리뷰 프로토콜·AI 과금·webhook 자동화는 미구현 |
| F37/F38 | 공통 도움말 진입. 새로운 요금·무료 한도·지원 보증을 만들지 않음 |
| F01/F39/F40 | exact SHA·추가형 변경·회귀와 브라우저 증거·기존 수동 배포 정책 유지 |

## 재현과 검증 경계

`pnpm exec vitest run --maxWorkers=2`로 변경된 모델과 컴포넌트 및 기존 검수·권한 회귀를 실행한다. `pnpm run typecheck`, 변경 파일 ESLint, `pnpm validate:architecture`, `pnpm verify:free-infrastructure`, static preflight를 유지한다. 8GiB TypeScript 시도는 메모리 부족이었고 저장소의 기존 12GiB 예산을 사용한다.

`STUDIO_QA_BASE_URL=<owned loopback origin> node scripts/qa-studio-unified-workflow.mjs`는 네 viewport의 운영 화면 10개, 새 작품 접근성, 실제 개인 로컬 작품 생성→목록 재확인을 검증한다. `scripts/qa-studio-main-release.mjs`는 기존 가상 공간의 실제 캔버스·입력·네 가지 GNB를 여섯 viewport에서 확인한다.

기존 review / review-editor-handoff / review-production / review-task-completion / review-export 브라우저 하네스는 intercepted HTTP fixture를 사용한다. 실제 운영 인증·DB 저장·WAN 다계정 협업·전체 보안 인증의 증거로 일반화하지 않는다. 캡처와 JSON은 Git에 커밋하지 않고 QA 출력 디렉터리에 보관한다.

## 릴리스 경계

사용자가 이 대화에서 운영 배포를 요청했고 후속 메시지에서 main 머지를 요청했다. PR 검증 후 정확한 main SHA를 수동 배포한다. CI·보호 규칙 우회, 기존 원고/DB migration, 환경변수 변경, 플랜 변경, Vercel 배포, 자동 source rebuild 활성화는 하지 않는다. 이번 코드의 변경 배포 단위는 정적 Web이며 API/DB를 이 기능의 이름으로 불필요하게 재배포하지 않는다.

PR과 배포 기록은 실제 결과가 생긴 뒤 별도로 기록한다. 이 문서 자체는 병합·배포 성공 증빙이 아니다.

## main merge continuation — 2026-09-21

- Continued PR #1903 in an isolated worktree and integrated main `8ad0f0d73` without changing another session's checkout.
- Added explicit, localized accessible names to search buttons in home, work library and task chrome. The name survives narrow-screen icon-only rendering; existing text-labelled consumers are unchanged.
- Kept one package-link test suite runnable under both Node's standalone runner and root Vitest. The preflight remains required in build/test commands.
- Updated structural regression contracts to follow the delegated transform entry and inline drawing workbench, while retaining lock, pixel-target and no-page-composite checks.
- Made the external-calendar fixture clock deterministic and added a stale-response rejection case. The production response expiry policy is unchanged.
- Updated browser journeys to use the current four-item GNB, compact creation form and exact resume links. Kept real file creation, authored stroke, durable save, document identity, zoom and scroll restoration assertions.
- Floating-layout proof uses the mounted optional arrangement control for visibility, docking and locks. During pen/mouse strokes the view launcher becomes inert and restores afterwards; the inline workbench and forced offline/save warnings remain visible. Safety overrides are verified, not bypassed.
- Local targeted regression run: **17 files / 198 tests passed**, including the original six diagnostic failure files and the new accessibility regression.
- Local production bundle completed with normal prebuild/postbuild, generated notices and CSP verification. To avoid duplicating large static assets on a low-space APFS volume, unchanged public files were cloned copy-on-write and Vite did not recopy/erase that local artifact directory. No repository build policy was weakened.
- These local browser fixtures are not authenticated production, external reviewer, DB, WAN, billing or provider-success verification.
- Current user request is to continue and merge main. This continuation does not initiate a production deployment, migration, secret change, infrastructure change or plan change.
- The F01–F40 exclusions above remain in force; merging this increment is not a claim that every competitive feature is complete.

### Verified continuation evidence

- Root TypeScript `tsc --noEmit -p tsconfig.json`: passed after the accessibility test's query types were corrected.
- Changed-file ESLint with zero warnings: passed; `git diff --check`: passed.
- Standalone `node --test scripts/verify-workspace-package-links.test.mjs`: 4 passed, confirming the same cases also run outside Vitest.
- Previously failing creator/non-studio browser journeys: all 6 passed across the initial targeted run and one corrected creation-selector rerun. These retain real local document creation/drawing/save and exact document/zoom/scroll recovery.
- Public pages: **42/42 passed** (14 routes × 1440/390/320px), including actual Phaser/list home switching, artwork loading, current navigation and horizontal overflow checks.
- Public interaction/fault-injection cases: **16/16 passed**, including history, keyboard destinations, 404 recovery, theme/primary actions and optional chunk failure isolation.
- `verify-studio-menus.mts`: passed with 10 default tools, 9 primary menus, reference toggle, popovers, platform canvas resize/Undo, 5 input-device modes, floating hide/show and docking/locks, pen and mouse stroke focus, safety-warning visibility and export controls.
- All browser evidence above is the local production candidate. No authenticated production, database migration, external service billing or WAN verification is implied.
