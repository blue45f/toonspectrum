# 따라 그리기 통합 구현 · 2026-09-25

## 완료 범위

따라 그리기는 독립 편집기가 아니라 기존 Studio 레퍼런스와 드로잉 엔진을 연결하는 페이지 소유 작업 흐름으로 구현했다.

- 레퍼런스 패널의 선택 이미지에서 `이 이미지로 따라 그리기`를 실행한다.
- Academy의 `/learn/trace`에서 안내 후 `/studio/canvas?practice=trace`로 진입한다.
- 겹쳐 보기와 옆에 보기, 원본 숨김, 투명도, 흑백, 좌우·상하 반전, 위·아래 배치, 잠금, 맞춤 배치를 제공한다.
- 비교, 완료, 다시 연습, 가이드 제거와 누락 원본 다시 연결을 지원한다.
- 모바일에서는 측정된 편집 도크 위에 배치하고, 조작 대상은 최소 44px를 유지한다.

## 데이터 소유권

`PageState.drawingPractice`는 버전이 있는 작은 문서이며 다음 정보만 보존한다.

- 원본 자산의 canonical SHA-256 descriptor
- 페이지 좌표계 기준 위치·크기·회전·반전·투명도
- 연습/제작 보조 목적, 활성/완료 상태, 현재 회차와 결과 그룹
- 겹침/옆 보기와 원고 위·아래 표시 정책

원본 바이트는 기존 자산 저장소가 소유한다. 사용자가 그린 획은 기존 `El`과 레이어 그룹에만 기록되며 따라 그리기 문서에 복제하지 않는다.
## 결과 보존과 회차

연습을 시작할 때 `따라 그리기 1회차` 일반 레이어 그룹을 만들고 새 획을 그 그룹으로 라우팅한다. `다시 연습`은 다음 회차 그룹을 새로 만들기 때문에 이전 결과와 Undo 이력은 그대로 남는다.

가이드 완료 또는 제거는 원본 표시·연결만 변경한다. 실제 획과 회차별 결과 그룹을 삭제하지 않는다. 기존 원고에 시작하면 `production-assist`, 빈 페이지에서 시작하면 `practice` 목적을 기록한다.

원본 자산이 누락된 프로젝트는 결과를 정상적으로 연다. 사용자가 레퍼런스에서 원본을 다시 선택하면 기존 회차·결과 그룹을 보존한 채 source descriptor만 교체하고 페이지에 다시 맞춘다.

## 렌더링과 출력 경계

가이드는 배경 위, 원고 아래 또는 원고 위에 렌더하는 Konva view-only 그룹이다. 잠긴 상태에서는 pointer input을 듣지 않으며, 잠금을 해제한 경우에만 이동·회전·비율 유지 크기 조절이 가능하다.

다음 두 경계로 원본이 결과 픽셀에 섞이지 않게 했다.

1. export/save/timelapse/compare 상태에서는 React 렌더 경로에서 가이드를 마운트하지 않는다.
2. 동기 `stage.toCanvas()`·`stage.toDataURL()` 계열 읽기 직전 공통 raster preparation fence가 가이드 그룹을 숨기고 `finally` 성격의 restore로 기존 표시 상태를 복구한다.

따라서 내보내기뿐 아니라 썸네일, 스포이트와 기타 문서 래스터 읽기도 같은 제외 계약을 따른다.
## 저장·복구·공동 편집

새 문서는 기존 경로에 연결했다.

- 페이지 정규화·복제·미러링
- 자동 저장과 프로젝트 파일 strict parse
- canonical snapshot, checkpoint와 recovery
- 프로젝트 아카이브 export/import 및 원본 자산 보존
- CRDT page payload 왕복

프로젝트 JSON에는 자산 바이트를 넣지 않는다. 휴대용 아카이브는 레퍼런스 보드뿐 아니라 페이지의 활성 따라 그리기 source hash도 수집해 같은 검증·설치 경계를 사용한다.

## 검증

단위·통합 회귀는 다음 계약을 포함한 11개 파일 149개 테스트가 통과했다.

- 문서 normalize/strict parse/patch/complete/retry/relink/mirror
- hash 우선 자산 해석과 누락 복구
- 캡처 직전 가이드 제외와 정확한 표시 상태 복원
- 회차 그룹 stroke routing과 편집기 wiring
- 레퍼런스 진입 UI와 접근 가능한 조작 바
- autosave/project/archive/snapshot/CRDT/page round-trip
- 전체 문서 raster capture 계약과 pointer admission

브라우저 하네스는 실제 React·Konva 컴포넌트를 사용한다. Chromium 151과 Firefox 153에서 데스크톱·390×700 모바일 흐름, pageerror 0건, console error 0건을 확인했다.
재현:

```sh
./node_modules/.bin/vitest run \
  apps/web/src/domains/creator/studio-drawing-practice-document.test.ts \
  apps/web/src/domains/creator/studio-drawing-practice-runtime.test.ts \
  apps/web/src/domains/creator/studio-drawing-practice-integration-boundary.test.ts \
  apps/web/src/domains/creator/canvas/StudioDrawingPracticeGuide.test.tsx \
  apps/web/src/domains/creator/StudioDrawingPracticeBar.test.tsx

./node_modules/.bin/vite --host 127.0.0.1 --port 5238 --strictPort
node scripts/verify-studio-drawing-practice.mjs http://127.0.0.1:5238 chromium,firefox
```

브라우저 검증은 loopback host만 허용하며 운영 계정·운영 원고를 사용하지 않는다. 결과 보고서와 스크린샷은 `artifacts/drawing-practice/`에 생성된다.
