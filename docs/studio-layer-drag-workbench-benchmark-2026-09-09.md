# ToonStudio 레이어 드래그 워크벤치 벤치마크 · 2026-09-09

## 목표

검색·필터·스마트 보기·로컬 solo·마스크·클리핑·블렌드·병합·협업 소유권까지 갖춘 기존 레이어
내비게이터에, 전문 편집기에서 가장 자주 쓰는 **직접 순서 조작**을 안전하게 연결한다. 저장소의
`docs/perf/canvas-findings.md`에도 드래그 재정렬 어피던스 부재가 미해결 항목으로 기록돼 있었다.

## 공식 제품 관찰

| 제품 | 관찰한 레이어 조작 | ToonStudio 적용 판단 |
| --- | --- | --- |
| Clip Studio Paint | 검색 레이어 팔레트에서 종류·이름·표시·잠금·알파 잠금·참조·초안·폴더 범위를 조합한다. | 기존 #976 검색 DSL·스마트 보기를 유지한다. 순서 변경 중에는 필터 결과가 전체 순서를 숨기므로 드래그를 잠근다. |
| Adobe Photoshop | Layers 패널에서 그룹, 복제, 선택, 링크, 마스크, 레이어 스타일, Smart Object와 정렬 명령을 한 계층에서 다룬다. | 이미 존재하는 마스크·효과·병합 패널은 중복하지 않고, 선택 묶음의 z-order 명령을 레이어 패널에 직접 노출한다. |
| Krita | 레이어를 드래그해 순서를 바꾸고 그룹 안팎으로 이동하며, 색 라벨 필터와 비파괴 마스크를 제공한다. | 드롭 선은 순서, 그룹 중앙 강조는 소속 변경으로 의미를 분리한다. |
| Procreate | 다중 선택 뒤 Group/Merge/Duplicate/Delete를 일괄 실행하고, visibility를 길게 눌러 solo 한다. | 기존 다중 선택·solo·병합을 유지하고 일괄 맨 앞/뒤 명령을 추가한다. |
| Figma | Smart selection은 다중 항목을 드래그할 때 이동 가능 위치를 명확한 indicator로 보여 준다. | dragover마다 문서를 쓰지 않고 의도만 계산하며, 놓는 순간 한 번만 commit한다. |
| ibisPaint | 전용 reorder handle을 좌우로 밀어 폴더 안팎으로 이동한다. | 행 전체가 아니라 전용 핸들만 draggable로 만들어 표시·잠금·불투명도 조작과 충돌하지 않게 한다. |
| MediBang Paint | 레이어 순서 변경을 기본 레이어 작업으로 제공한다. | 데스크톱 드래그뿐 아니라 터치용 일괄 맨 앞/뒤 버튼과 키보드 명령을 함께 제공한다. |

참고 문서: Krita Layers docker, Procreate Layers Interface, Figma Arrange layers with Smart selection,
ibisPaint Layer Folders, MediBang How to Change the Layer Order, Adobe Photoshop Layers panel,
Clip Studio Paint Search Layer palette.

## 구현 결정

### 1. 한 드롭 = 한 문서 커밋

드래그 중에는 `StudioLayerDropIntent`만 갱신한다. 실제 `El[]` 변경은 drop 시점에 기존
`StudioLayerNavigatorAction → createStudioLayerOperations → commit()` 경로로 한 번만 전달한다.
따라서 undo 스택, dirty/autosave 세대, 검토 잠금, 선택 정리 계약을 우회하지 않는다.

### 2. 연속 그룹 불변식

문서 정본은 `BACK → FRONT` 평탄 배열이며 같은 `groupId`는 반드시 연속 구간이다.
`reorderLayerSelectionToTarget`은 다음 두 범위를 명시한다.

- `units`: 그룹 자식 하나가 선택돼도 그룹 전체를 한 단위로 이동
- `siblings`: 같은 그룹 자식끼리 또는 그룹 밖 형제끼리만 정확히 이동

비연속으로 손상된 그룹, 자기 자신 드롭, 범위가 다른 대상은 원본 참조를 반환해 fail-closed 한다.

### 3. 드롭 의미

- 레이어 행 위/아래 절반: 대상 앞/뒤 삽입
- 같은 그룹 자식 행: 그룹 내부 순서 변경
- 다른 그룹 자식 행: 해당 그룹으로 이동하면서 그 위치에 삽입
- 그룹 행 중앙: 그룹 소속 변경
- 그룹 행 위/아래 가장자리: 그룹 밖/그룹 블록 주변 순서 변경
- 그룹 핸들: 그룹 전체 블록 이동, 중첩 그룹 생성은 금지

### 4. 접근성과 입력 방식

- 모든 레이어/그룹 treeitem에 표준 `⌘/Ctrl + [`·`]` 및 Shift 조합을 노출
- `Alt + ↑/↓`, `Shift + Alt + ↑/↓`를 방향키 대안으로 제공
- 드롭 결과를 polite live region으로 알림
- 포인터가 정밀한 환경에서만 24px drag handle을 표시
- 터치에서는 선택 일괄 toolbar의 맨 앞/뒤 버튼과 기존 작업 메뉴 사용
- 검색·필터, 읽기 전용, 타인 소유 lease 상태에서는 drag/reorder를 명시적으로 비활성화

## 의도적으로 제외한 범위

- 현재 데이터 모델이 평면 그룹이므로 중첩 폴더 스키마 마이그레이션은 포함하지 않는다.
- 실제 캔버스 미리보기 썸네일 생성은 렌더러 캐시·메모리 예산 설계가 먼저 필요해 아이콘 표현을 유지한다.
- HTML Drag and Drop의 터치 브라우저 편차를 억지로 숨기지 않고, 터치 명령 경로를 별도로 유지한다.
- 복제는 요소 타입별 연결 데이터·애니메이션 트랙·3D bundle provenance까지 함께 복제해야 하므로 기존
  복제 명령 정본을 패널에 연결하는 별도 작업으로 남긴다.

## 검증 행렬

- 순수 엔진: 임의 위치 이동, 다중 선택 안정 순서, 그룹 전체 이동, 그룹 내부 이동, root 이동,
  손상 그룹 fail-closed
- 의도 해석기: 행 위/아래, 그룹 중앙, 같은/다른 그룹, 혼합 선택, 자기 드롭
- jsdom 상호작용: 표준 단축키, drag/drop action payload, 삽입선, 그룹 중앙 강조,
  일괄 맨 앞/뒤, 필터 중 비활성화
- 정적 검증: ESLint, TypeScript, Vite production bundle, `git diff --check`
