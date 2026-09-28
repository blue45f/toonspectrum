# 검수·협업·홍보 조작 개선

상태: **current** · 기준일: **2026-09-28**

## 적용 범위

`/production/projects/:projectId/production`의 작업 보드·공정 설정,
같은 프로젝트의 `/review` 검수 작업실, `/community/promote`의 작성·수정 화면을 개선한다.
기존 팀 보기에 보드 표시 설정을 추가하며 서버 데이터 계약·권한·DB 연결·환경변수·마이그레이션은 변경하지 않는다.
구형 Studio 작업 관리와 모집 게시판에 새로운 별도 공정 스키마를 만들지 않는다.

## 협업 보드

작업 핸들은 마우스·터치·펜 포인터 캡처를 사용한다. 카드 본문의 터치 스크롤은 유지한다.
포인터 캡처와 네이티브 HTML 드래그가 동시에 시작하는 것을 차단하고, 8px 이동부터 실제 이동으로 처리한다.
키보드는 Space/Enter로 잡기, 좌우 방향키로 목적지 선택, Enter로 실행, Escape/Tab으로 취소한다.
기존 상태 메뉴도 유지한다. 선택한 여러 작업은 같은 배치 명령으로 이동한다.

사전 검사는 실제 `transitionProductionTaskBatch` 계약 함수를 재사용한다.
입력 버전 고정, 선행 작업, 산출물, 공정별 동시 진행 한도, 승인된 제출본 조건을 우회하지 않는다.
중복·삭제된 작업이 섞여 있으면 일부만 이동하지 않고 전체 요청을 거부한다.
외부 드롭, 다른 프로젝트·revision·필터에서 시작한 낡은 제스처를 적용하지 않는다.
미리 보기 피드백은 고정 오버레이여서 드래그 중 보드 상단을 밀지 않는다.

열 순서와 접힘은 `boardColumns`·`boardCollapsed` 보기 값으로 저장한다.
알 수 없는 열 ID는 무시하지만 누락된 실제 상태 열은 복원한다. 열 접기는 상태 삭제가 아니다.
팀 보기 저장과 다시 적용 시 동일한 구성을 사용한다. 보관 열은 기존 보관 필터를 따른다.

## 맞춤 공정·검수

기존 공정 편집기의 역할·완료 기준·선행 공정·동시 진행 한도를 유지하면서 공정 복제와 변경 영향 요약을 추가했다.
복제는 새 공정 키를 발급한다. 프리셋 교체 전 확인을 요구하며 확인 전에는 편집 중 구성을 보존한다.
서버 revision과 다르면 저장을 차단한다. 공정 순서와 의존 관계는 별개이며 기존 작업의 담당자·승인 기록을 재작성하지 않는다.

검수 컷은 번호·구도·카메라 검색, 열린 이슈·차단 질문 필터로 좁힐 수 있다.
해결된 질문과 완료·취소·반려된 수정 요청은 열린 이슈 집계에서 제외한다.
회차·컷별 질문 초안을 분리하고 저장 실패 시 입력을 유지한다. 중복 제출 중에는 조작을 잠근다.
다른 회차의 승인 결정을 현재 검수 라운드에 재사용하지 않는다.
계획 도식을 실제 원고 이미지나 픽셀 차이처럼 표시하지 않는다. 실제 이미지 비교 엔진 추가는 이번 변경에 포함되지 않는다.

## 홍보 작성

표지는 파일 선택·드롭으로 입력하며 단일 JPEG·PNG·WebP, 8MB 이하를 검사한다.
기존 브라우저 변환기를 사용해 표지를 JPEG로 변환하며 원본을 외부 이미지 서비스로 보내지 않는다.
변환·게시 중 파일 재입력을 잠그고 표지 제거 시 진행 중 변환 세대가 낡아지도록 처리한다.
소개·링크/영상·표지/태그·권한의 4개 준비 검사는 실제 `validatePromotion`을 사용한다.
표지와 작품 링크는 선택 사항이며, 홍보 영상 유형의 영상 링크와 게시 권한 동의는 필수다.
독자 미리 보기는 초안일 뿐 자동 게시하지 않는다. 기존 초안 복원·계정 구분·수정 버전 검증을 유지한다.

## 벤치마크

- [Trello 카드·목록 이동](https://support.atlassian.com/trello/docs/moving-cards-or-lists/): 이동 핸들, 다중 선택, 메뉴 대안과 취소 동작을 참고했다.
- [Jira 보드 열 구성](https://support.atlassian.com/jira-software-cloud/docs/configure-columns/): 열 재배치와 공정별 동시 진행 제약을 참고했다.

제품의 시각 요소를 복제하거나 검수 승인 규칙을 일반 칸반 상태 이동으로 대체하지 않는다.

## 재현 가능한 검증

저장소 루트에서 해당 worktree의 의존성을 설치한 뒤 실행한다. 다른 worktree의 `node_modules`를 공유하지 않는다.

```sh
pnpm exec vitest run apps/web/src/domains/creator/production-hub packages/contracts/src/production-workflow.test.ts apps/web/src/domains/promotion --maxWorkers=2
pnpm harness:verify
```

별도 터미널에서 개발 서버와 브라우저 검증을 실행한다. 운영 데이터는 변경하지 않는다.

```sh
pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5196 --strictPort
node apps/web/tools/browser-harnesses/review-collaboration-promotion.browser.mjs
```

브라우저 하네스는 합성 데이터를 사용하며 실제 마우스·키보드·모바일 터치 이벤트, 질문 초안 보존,
PNG→JPEG 변환, 미리 보기, 가로 넘침을 검증한다. 성공 목록과 화면 증거는 `/tmp/toonstudio-workflow-qa`에 저장한다.
`WORKFLOW_QA_URL`·`WORKFLOW_QA_OUTPUT`으로 서버 주소와 출력 위치를 바꿀 수 있다.
실제 인증 서버·운영 DB 저장·여러 사용자 간 동시 수정 검증을 대체하지 않는다.
