# ToonStudio × Figma 생산성 기능 감사 및 고도화 기록

- 기준일: 2026-09-05
- 범위: 2D 웹툰 편집기 선택·변형·디자인 시스템·협업·버전 워크플로
- 원칙: Figma UI를 복제하지 않고, 웹툰 제작 흐름에 유효한 상호작용만 기존 Studio 문서·Undo·CRDT 권위에 연결한다.

## 1. 이번 반영

### 숫자 기반 Multi-edit

복수 선택의 인스펙터 변형을 다음까지 확장했다.

- X/Y: 선택 묶음의 내부 간격을 유지한 채 전체 이동
- W/H: 한 축을 입력하면 선택 비율을 유지하며 전체를 균일 확대·축소
- 회전: 현재 상태에서 더하는 상대 각도로, 선택 중심을 기준으로 강체 회전
- 불투명도: 혼합값을 하나의 공통값으로 정규화
- 원자성: 잠금·회전 불가 요소·프레임 불투명도·비균일 W/H 요청이 있으면 일부만 바꾸지 않고 전체 거부
- 일관성: 새 변형 수학을 만들지 않고 캔버스 핸들이 사용하는 `planStudioSelectionTransformCommit` 권위를 재사용
- 기록: 한 번의 입력은 한 번의 Undo/Redo 및 한 번의 협업 문서 커밋으로 남김

관련 구현:

- `src/domains/creator/studio-figma-multi-edit.ts`
- `src/domains/creator/selection/studio-selection-transform-controller.ts`
- `src/domains/creator/StudioFigmaDesignPanel.tsx`
- `src/domains/creator/StudioInspectorAsideBody.tsx`

Figma의 공식 Bulk edit는 여러 프레임·그룹·섹션의 레이어를 함께 선택해 회전·그룹·마스크·Boolean·Auto layout 등의 공통 작업을 적용하고, 텍스트와 Variant에도 Multi-edit를 제공한다.

- https://help.figma.com/hc/en-us/articles/21635177948567-Edit-objects-on-the-canvas-in-bulk

이번 단계는 Studio에서 즉시 효율이 크고 기존 권위를 안전하게 재사용할 수 있는 **공통 기하 변형**부터 닫았다.

## 2. 현재 Studio에 이미 있는 대응 기능

| Figma 계열 기능 | Studio 상태 | 판단 |
| --- | --- | --- |
| 다중 선택·Marquee | 구현됨 | 현재 선택 모델 유지 |
| 숫자 X/Y/W/H/회전/불투명도 | 단일 선택 구현 + 이번에 복수 선택 확장 | 이번 완료 |
| Zoom to selection | 구현됨 | 유지 |
| 선택 중심 Flip | 구현됨 | 유지 |
| 정렬·가로/세로 균등 분배 | 구현됨 | 중복 구현 금지 |
| Smart layout 자동 수정 | `studio-smart-layout-auto-fix.ts` 구현 | 웹툰 패널/식자 흐름으로 계속 특화 |
| 실시간 커서·Presence | 구현됨 | 협업 Provider 권위 유지 |
| 협업자 따라가기 | 구현됨 | 유지 |
| 캔버스 댓글 핀 | 구현됨 | 서버 스레드 영속성은 별도 단계 |
| 명명 버전 비교 | 의미 기반 비교 구현 | 서버 영속 버전 이후 Branch 기반 마련 |
| 명령 검색·단축키·메뉴 통합 | Command registry 기반 구현 | 신규 기능은 동일 명령 ID로 연결 |

협업 세부 현황과 서버 선행조건은 `docs/studio-figma-collaboration-benchmark-2026-07-13.md`를 따른다.

## 3. 추가 가치가 큰 기능 검토

### P0 — 같은 속성 선택 / Matching selection

Figma는 같은 Properties, Fill, Stroke, Effect, Text properties, Font, Instance를 가진 레이어를 일괄 선택할 수 있다.

- https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects

Studio 적용안:

1. 같은 요소 종류
2. 같은 브러시·선 색·선 굵기
3. 같은 채우기·톤·필터 프리셋
4. 같은 글꼴·크기·화자·말풍선 스타일
5. 같은 에셋/캐릭터/3D 장면 원본
6. 현재 패널 또는 현재 컷 범위 선택

선행 작업은 속성별 정규화 키와 숨김·잠금·그룹 경계를 명시하는 것이다. 단순 JSON 전체 비교는 AI provenance·캐시·런타임 receipt까지 묶어 오선택을 만들 수 있으므로 사용하지 않는다.

### P1 — 웹툰 스타일 변수와 Mode

Figma Variable mode는 레이어·프레임·그룹·페이지 등에 모드를 적용하고, Color/Number/String/Boolean 계열 토큰과 Alias를 운용한다.

- https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables

Studio 적용안:

- 색: 작품 팔레트, 시간대, 회상, 야간, 인쇄/웹 게시 모드
- 숫자: 식자 크기, 행간, 테두리, 그림자, 컷 여백, 안전영역
- 문자열: 기본 폰트·효과 프리셋·말풍선 세트
- Boolean: 흑백/컬러, 효과 표시, 가이드 표시, 검수용 주석
- Alias: `character/hero/hair` → `scene/night/hair-highlight`처럼 작품 토큰을 장면 토큰에 연결

문서 요소에 임의의 토큰 문자열을 바로 심지 않는다. 토큰 ID 안정성, 삭제/이름변경 마이그레이션, 공유 라이브러리 권한, 오프라인 해석값과 CRDT 병합 규칙이 먼저 필요하다.

### P1 — 반복 요소 Component / Variant / Instance

Figma Variant는 비슷한 Component를 속성·값 조합으로 묶고, Instance에서 관련 상태를 찾고 바꾸기 쉽게 만든다.

- https://help.figma.com/hc/en-us/articles/360056440594-Create-and-use-variants

Studio 적용안:

- 말풍선: 화자 × 감정 × 꼬리 방향 × 강조 상태
- 식자: 독백/대사/효과음 × 크기 × 세로쓰기 × 언어
- 컷 템플릿: 1열/2열/교차/회상/액션 Variant
- 캐릭터: 의상 × 표정 × 포즈 × 시간대
- 반복 크레딧·회차 헤더·작가 코멘트·플랫폼 워터마크

Instance override는 원본 갱신과 사용자 수정이 충돌하지 않도록 `source value / override / detached` 3상태가 필요하다. 기존 에셋 프리셋을 Component라고 이름만 바꾸는 방식은 금지한다.

### P2 — 영속 Version / Branch / Review / Merge

Figma Branch는 생성→공유→업데이트→리뷰 요청→검토→병합→관리 흐름을 가지며, 리뷰에서 변경 목록·나란히 보기·Overlay 비교를 제공한다.

- https://help.figma.com/hc/en-us/articles/5668839659415-View-and-manage-branches
- https://help.figma.com/hc/en-us/articles/5691189138839-Merge-branch-into-main-file

Studio 적용안:

- 콘티안 / 작화안 / 식자안 / 편집부 수정안을 독립 Branch로 관리
- 컷·레이어·대사 단위 변경 목록
- Before/After, Overlay, 깜박임 비교
- 댓글·승인·수정 요청을 Branch revision에 고정
- 병합 충돌을 픽셀 덮어쓰기보다 요소/텍스트/레이어 의미 단위로 표시

이 기능은 서버 영속 명명 버전과 Canonical CRDT revision ID가 선행되어야 한다. 로컬 스냅샷만으로 Branch UI를 먼저 만들면 협업자마다 다른 기준점을 보게 되므로 보류한다.

## 4. 우선순위 결정

| 순위 | 기능 | 효과 | 위험 | 결정 |
| --- | --- | --- | --- | --- |
| P0 | 숫자 Multi-edit | 반복 배치·크기 통일·회전 작업 즉시 단축 | 낮음: 기존 변형 권위 재사용 | 이번 완료 |
| P0 | 같은 속성 선택 | 대규모 회차 일괄 수정의 핵심 진입점 | 중간: 의미 비교 키 필요 | 다음 안전 단계 |
| P1 | 스타일 변수/Mode | 작품 전역 룩·식자 일관성 | 중상: 문서 스키마/공유 권한 | 토큰 권위 설계 후 |
| P1 | Component/Variant/Instance | 반복 요소 재사용과 원본 갱신 | 높음: override/분리/병합 | 독립 문서 모델로 |
| P2 | Branch/Review/Merge | 편집부 협업과 대안 관리 | 매우 높음: 서버 revision 필수 | 영속 버전 이후 |

## 5. 완료 조건

이번 Multi-edit는 다음을 모두 만족할 때 완료로 본다.

- 단일 요소 인스펙터 동작에 회귀가 없다.
- 복수 선택 W 또는 H 입력이 한 비율로만 변형된다.
- 복수 선택 회전은 중심 기준이며 모든 멤버가 회전 가능한 경우에만 활성화된다.
- 잠긴 멤버가 하나라도 있으면 이동·크기·회전·불투명도 어느 것도 일부 적용되지 않는다.
- 프레임이 포함된 혼합 선택의 불투명도는 비활성/거부된다.
- 선택 밖 요소는 객체 참조까지 유지하여 불필요한 CRDT diff를 만들지 않는다.
- 한 입력이 한 Undo 단계와 한 접근성 안내로 기록된다.
- 순수 계획기 테스트와 Inspector DOM 테스트가 통과한다.
