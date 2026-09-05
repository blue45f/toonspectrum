# ToonStudio × Figma 인스펙터 생산성 감사 및 고도화 기록

- 기준일: 2026-09-05
- 범위: 2D 웹툰 편집기의 선택·변형·레이어 정리·접근성·협업 안전성
- 원칙: 경쟁 제품의 모양을 복제하지 않고, 반복 작업을 줄이는 상호작용만 기존 Studio 문서·Undo·CRDT 권위에 연결한다.

## 1. 이번 완료 범위

### 1.1 숫자 기반 Multi-edit

복수 선택의 Inspector 변형을 다음까지 확장했다.

- X/Y: 내부 간격을 유지한 채 선택 묶음 전체 이동
- W/H: 한 축을 입력하면 선택 비율을 유지하며 전체를 균일 확대·축소
- 회전: 현재 상태에서 더하는 상대 각도로 선택 중심 기준 강체 회전
- 불투명도: 혼합값을 하나의 공통값으로 정규화
- 묶음 작업: 정렬, 분배, 앞/뒤 순서, 복제, 삭제를 단일·복수 선택 공용 액션으로 제공
- 원자성: 잠금, 회전 불가 요소, 프레임 불투명도, 비균일 W/H, 오래된 선택 스냅샷, 비정상 숫자가 있으면 일부만 바꾸지 않고 전체 거부
- 일관성: 새 변형 수학을 만들지 않고 캔버스 핸들이 사용하는 `planStudioSelectionTransformCommit` 권위를 재사용
- 기록: 한 번의 숫자 입력은 한 번의 Undo/Redo 및 한 번의 협업 문서 커밋으로 기록

관련 구현:

- `src/domains/creator/studio-figma-multi-edit.ts`
- `src/domains/creator/selection/studio-selection-transform-controller.ts`
- `src/domains/creator/StudioFigmaDesignPanel.tsx`
- `src/domains/creator/StudioInspectorMultiSelectionSection.tsx`
- `src/domains/creator/StudioInspectorOrderAlignSection.tsx`

Figma Bulk edit 참고:

- https://help.figma.com/hc/en-us/articles/21635177948567-Edit-objects-on-the-canvas-in-bulk

### 1.2 같은 속성 선택 / Matching selection

단일 요소를 고르면 현재 페이지의 표시 레이어에서 실제로 두 개 이상 존재하는 기준만 제안한다.

- 같은 유형: 이미지, 텍스트, 말풍선, 선화, 프레임 등 같은 모델 종류
- 같은 외형: 채우기, 선, 선 굵기, 그라데이션, 그림자, 합성 모드, 말풍선 Variant 등 렌더 속성
- 같은 글꼴·조판: 글꼴, 크기, 행간, 방향, 정렬, 텍스트 경로
- 같은 원본: 번들 에셋, 분리 3D LT 묶음, 브러시 카탈로그, 스티키 노트 프리셋
- 표시 범위: 공유 숨김과 ‘나만 숨기기’ 레이어는 후보에서 제외
- 선택 권위: 결과는 레이어 내비게이터와 캔버스가 함께 사용하는 `selectLayersFromNavigator` 어댑터로만 반영
- 읽기 전용 지원: 선택은 문서 mutation이 아니므로 리뷰 잠금이나 협업 편집 잠금 상태에서도 사용 가능
- 성능: 기준 요소의 의미 키를 한 번만 계산하고 후보를 선형 순회
- 접근성: 선택 기준과 실행 버튼을 현재 설명에 연결하고 Inspector DOM 밀도 감사에 등록

비교 키는 문서 객체 전체가 아니라 요소 종류별 렌더 의미 allow-list로 만든다. 좌표, 텍스트 내용, 잠금, AI provenance, 래스터 원본 영수증, 런타임 캐시는 비교에서 제외한다. 패턴과 그라데이션처럼 렌더 우선순위가 있는 값은 실제로 화면에 적용되는 값만 비교한다.

관련 구현:

- `src/domains/creator/studio-select-matching.ts`
- `src/domains/creator/StudioSelectionMatchingPanel.tsx`
- `src/domains/creator/StudioInspectorAsideBody.tsx`

Figma Select matching 참고:

- https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects

### 1.3 레이어 일괄 이름 변경

복수 선택 전용 Inspector에 미리보기 기반 Batch Rename을 추가했다.

- 형식 토큰: `{n}` 번호, `{type}` 요소 유형, `{name}` 현재 이름
- 번호 제어: 시작값, 증가값, 1~6자리 0 패딩
- 순서 기준: 레이어 위→아래, 레이어 아래→위, 캔버스 위→아래, 캔버스 왼쪽→오른쪽
- 찾기·바꾸기: 전체 치환, 대소문자 구분 선택
- 미리보기: 적용 전 최대 5개 결과와 나머지 개수 표시
- 충돌 안내: 이번 변경으로 생기는 중복 이름만 경고
- 원자성: 잠긴 멤버, 사라진 선택 ID, 0 증가값, 빈 결과 이름이 있으면 전체 거부
- 문서 효율: 선택 밖 요소는 객체 참조를 유지해 불필요한 CRDT diff 방지
- 기록: 전체 이름 변경을 한 번의 `commit`과 한 Undo/Redo 단계로 처리
- 접근성: 실제 disclosure 계약, live status, 고유 control ID, 44px 터치 타깃 적용

관련 구현:

- `src/domains/creator/studio-batch-rename.ts`
- `src/domains/creator/StudioInspectorBatchRenameSection.tsx`
- `src/domains/creator/StudioInspectorMultiSelectionSection.tsx`

Figma Rename layers 참고:

- https://help.figma.com/hc/en-us/articles/360039958934-Rename-Layers

## 2. 현재 인스펙터 대응 상태

| 기능 | Studio 상태 | 판단 |
| --- | --- | --- |
| 다중 선택·Marquee | 기존 선택 모델 사용 | 유지 |
| 숫자 X/Y/W/H/회전/불투명도 | 복수 선택 원자 편집으로 확장 | 이번 완료 |
| 정렬·분배·순서·복제·삭제 | 단일·복수 선택 공용 액션으로 통합 | 이번 완료 |
| 같은 속성 선택 | 유형·외형·조판·원본 기준 구현 | 이번 완료 |
| 레이어 일괄 이름 변경 | 형식·번호·순서·치환·미리보기 구현 | 이번 완료 |
| Zoom to selection / 중심 Flip | 기존 공통 변형 패널 사용 | 유지 |
| Smart layout 자동 수정 | `studio-smart-layout-auto-fix.ts` 구현 | 웹툰 패널·식자 흐름으로 계속 특화 |
| 실시간 커서·Presence / 따라가기 | 기존 협업 Provider 권위 사용 | 유지 |
| 캔버스 댓글 핀 | 구현됨 | 서버 스레드 영속성은 별도 단계 |
| 명명 버전 비교 | 의미 기반 비교 구현 | 서버 영속 revision 이후 Branch 기반 마련 |
| 명령 검색·단축키·메뉴 | Command registry 기반 | 신규 전역 명령도 동일 ID로 연결 |

협업 세부 현황과 서버 선행조건은 `docs/studio-figma-collaboration-benchmark-2026-07-13.md`를 따른다.

## 3. 다음 대형 기능과 선행조건

### P1 — 웹툰 스타일 변수와 Mode

Figma Variable mode는 레이어·프레임·그룹·페이지 등에 모드를 적용하고 Color/Number/String/Boolean 계열 토큰과 Alias를 운용한다.

- https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables

Studio 적용 후보:

- 색: 작품 팔레트, 시간대, 회상, 야간, 인쇄/웹 게시 모드
- 숫자: 식자 크기, 행간, 테두리, 그림자, 컷 여백, 안전영역
- 문자열: 기본 폰트, 효과 프리셋, 말풍선 세트
- Boolean: 흑백/컬러, 효과 표시, 가이드 표시, 검수용 주석
- Alias: 작품 토큰을 장면 토큰에 연결

선행조건은 토큰 ID 안정성, 삭제·이름변경 마이그레이션, 공유 라이브러리 권한, 오프라인 해석값, CRDT 병합 규칙이다. 이 권위 없이 임의 토큰 문자열을 요소에 심지 않는다.

### P1 — 반복 요소 Component / Variant / Instance

Figma Variant 참고:

- https://help.figma.com/hc/en-us/articles/360056440594-Create-and-use-variants

Studio 적용 후보:

- 말풍선: 화자 × 감정 × 꼬리 방향 × 강조 상태
- 식자: 독백/대사/효과음 × 크기 × 세로쓰기 × 언어
- 컷 템플릿: 1열/2열/교차/회상/액션 Variant
- 캐릭터: 의상 × 표정 × 포즈 × 시간대
- 반복 크레딧, 회차 헤더, 작가 코멘트, 플랫폼 워터마크

Instance override는 원본 갱신과 사용자 수정이 충돌하지 않도록 `source value / override / detached` 세 상태가 필요하다. 기존 에셋 프리셋의 이름만 Component로 바꾸는 방식은 금지한다.

### P2 — 영속 Version / Branch / Review / Merge

Figma Branch 참고:

- https://help.figma.com/hc/en-us/articles/5668839659415-View-and-manage-branches
- https://help.figma.com/hc/en-us/articles/5691189138839-Merge-branch-into-main-file

Studio 적용 후보:

- 콘티안, 작화안, 식자안, 편집부 수정안을 독립 Branch로 관리
- 컷·레이어·대사 단위 변경 목록
- Before/After, Overlay, 깜박임 비교
- 댓글, 승인, 수정 요청을 Branch revision에 고정
- 병합 충돌을 픽셀 덮어쓰기보다 요소·텍스트·레이어 의미 단위로 표시

서버 영속 명명 버전과 canonical CRDT revision ID가 선행되어야 한다. 로컬 스냅샷만으로 Branch UI를 먼저 만들면 협업자마다 다른 기준점을 보게 되므로 보류한다.

## 4. 우선순위 결정

| 순위 | 기능 | 효과 | 위험 | 결정 |
| --- | --- | --- | --- | --- |
| P0 | 숫자 Multi-edit | 반복 배치·크기 통일·회전 작업 단축 | 낮음: 기존 변형 권위 재사용 | 이번 완료 |
| P0 | 복수 선택 공용 액션 | Inspector 왕복과 메뉴 탐색 감소 | 낮음: 기존 명령 경로 재사용 | 이번 완료 |
| P0 | 같은 속성 선택 | 대규모 회차 일괄 수정의 핵심 진입점 | 중간: 의미 비교 키 필요 | 이번 완료 |
| P0 | 레이어 일괄 이름 변경 | 컷·식자·에셋 정리 시간 단축 | 중간: 원자 배치 계획 필요 | 이번 완료 |
| P1 | 스타일 변수/Mode | 작품 전역 룩·식자 일관성 | 중상: 문서 스키마·공유 권한 | 토큰 권위 설계 후 |
| P1 | Component/Variant/Instance | 반복 요소 재사용과 원본 갱신 | 높음: override·분리·병합 | 독립 문서 모델 후 |
| P2 | Branch/Review/Merge | 편집부 협업과 대안 관리 | 매우 높음: 서버 revision 필수 | 영속 버전 이후 |

## 5. 완료 조건

### Multi-edit와 묶음 작업

- 단일 요소 Inspector 동작에 회귀가 없다.
- 복수 선택 W 또는 H 입력이 한 비율로만 변형된다.
- 복수 선택 회전은 중심 기준이며 모든 멤버가 회전 가능한 경우에만 활성화된다.
- 잠긴 멤버가 하나라도 있으면 이동, 크기, 회전, 불투명도 어느 것도 일부 적용되지 않는다.
- 프레임이 포함된 혼합 선택의 불투명도는 비활성 및 계획기 전체 거부된다.
- 삭제된 ID가 남은 오래된 선택 스냅샷은 나머지 요소만 변경하지 않는다.
- 선택 밖 요소는 객체 참조까지 유지한다.
- 한 입력이 한 Undo 단계와 한 접근성 안내로 기록된다.
- 분배는 3개 이상 선택에서만 활성화되고 이유를 제공한다.
- 단일·복수 선택 액션은 같은 접근성 이름과 명령 권위를 사용한다.

### Matching selection

- 현재 선택을 포함해 같은 기준이 둘 이상일 때만 패널이 보인다.
- 결과 ID는 문서 z-order를 유지한다.
- 색상 표기 대소문자와 기본값 차이는 의미가 같으면 같은 외형으로 본다.
- 좌표와 텍스트 내용은 외형·조판 비교에 영향을 주지 않는다.
- 패턴·그라데이션·솔리드 값은 실제 렌더 우선순위로 비교한다.
- 기준 요소의 렌더 의미 키는 후보마다 반복 계산하지 않는다.
- 안정 에셋 ID가 있으면 데이터 URL보다 우선한다.
- 공유 숨김 및 로컬 숨김 요소는 선택 후보에서 제외한다.
- 결과는 기존 캔버스·레이어 선택 어댑터로만 반영한다.
- 선택 기준과 실행 버튼은 현재 설명을 스크린리더에 제공하고 DOM 밀도 감사에서 미분류되지 않는다.

### Batch rename

- 형식 토큰, 번호 시작·증가·자릿수, 네 가지 정렬 순서가 미리보기와 실제 결과에서 동일하다.
- 찾기·바꾸기는 전체 일치와 대소문자 구분을 정확히 처리한다.
- 잠금, 오래된 선택 ID, 0 증가값, 빈 결과 이름은 전체를 거부한다.
- 기존 문서의 무관한 이름 중복은 경고하지 않고 이번 변경으로 충돌하는 결과만 경고한다.
- 적용은 한 번의 문서 커밋이며 선택 밖 요소 참조가 유지된다.
- disclosure 상태, live status, control ID, 우선순위, 터치 타깃이 Inspector 접근성 계약을 충족한다.

순수 계획기, Inspector DOM, 선택 경계, 접근성, 전체 Vitest, 타입 검사, 린트, 프로덕션 빌드와 Studio 런타임 CI가 모두 통과해야 완료한다.
