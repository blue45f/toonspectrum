# ToonStudio 작업 패널 벤치마크와 구현 결정

- 기준일: 2026-09-09
- 대상: `/studio` 우측 작업 패널(Inspector)
- 범위: 패널 탐색, 컨텍스트 전환, 탭 밀도, 사용자 선호, 접근성, 상태 복구

## 1. 현재 제품 기준선

현재 작업 패널은 이미 다음 기반을 갖고 있다.

- 선택 항목·레이어·페이지의 3개 기본 탭과 이미지/페이지 하위 탭
- 선택·도구·게시 상태에 따른 컨텍스트 라우팅
- F1 통합 검색과 검색 결과의 세부 컨트롤 포커스 이동
- 접힌 섹션 상태 기억, 활성 설정 개수 표시, progressive disclosure
- 420px 이상에서 속성과 레이어를 함께 보여 주는 넓은 패널 레이아웃
- 우측 도크 접기/펼치기, 폭 조절, 플로팅 분리, 가장자리 도킹, 위치·크기 잠금
- 모바일 bottom sheet와 44px 터치 타깃
- 작업공간 프리셋과 owner-scoped SQLite/OPFS 저장

따라서 경쟁 제품 기능을 이름만 바꿔 중복 구현하지 않고, 실제 왕복 클릭과 컨텍스트 이탈을 줄이는 빈틈만 보강한다.

## 2. 공식 문서 기반 벤치마크

| 제품 | 확인한 패널 패턴 | ToonStudio 적용 판단 |
| --- | --- | --- |
| Clip Studio Paint | 팔레트 도크 생성, 스택 이동, 폭·높이 조절과 잠금, 위치 잠금, 도크 접기 | 플로팅·도킹·잠금·폭 조절은 이미 구현되어 중복하지 않는다. 패널 표시 선호와 작업공간 복구 원칙만 유지한다. |
| Clip Studio Paint | 팔레트 배치·단축키·Command Bar 등을 작업공간으로 저장하고 단계별로 여러 작업공간을 전환·재로드 | ToonStudio 기존 작업공간 모델이 더 넓은 범위를 이미 소유한다. 새 로컬 “가짜 작업공간”은 만들지 않는다. |
| Photoshop | 패널을 아이콘으로 접어 공간을 절약하고, 필요한 패널만 확장 | 기본 탭의 접근 가능한 이름을 유지한 아이콘 전용 표시 모드를 추가한다. |
| Photoshop | 패널 도킹·언도킹·그룹화, 사용자 작업공간 저장 | 기존 `StudioDetachablePanelSlot`과 작업공간 정본을 유지한다. |
| Blender 5.0 | Properties Editor pin, Outliner 동기화 정책, Visible Tabs 필터 | 선택 변화에 따른 전문 탭 자동 초기화를 멈추는 안전한 “탭 고정”, 기본 탭 표시 필터를 추가한다. |
| Krita | Docker 배치·그룹을 작업공간으로 저장하고 다중 창/모니터 레이아웃을 별도 세션으로 관리 | 영속 작업공간과 세션 상태를 구분한다. 탭 고정은 sessionStorage, 표시 탭·아이콘 모드는 localStorage에 둔다. |
| Figma | 선택 유무·레이어 유형·권한에 따라 우측 속성 패널 내용이 바뀌고, 선택 레이어의 이름과 속성을 함께 보여 줌 | 기존 컨텍스트 라우팅·선택 요약을 유지한다. 사용자 지정 탭이 현재 컨텍스트를 가리지 않도록 활성 탭은 자동 복구한다. |
| Storyboard Pro | View를 tab/dock/undock하고, Panel View에서 현재 패널·다중 선택 정보를 접을 수 있음 | 배치 기능은 기존 플로팅 패널과 다중 선택 섹션으로 충족한다. 새 기능은 정보 구조와 전환 비용 감소에 집중한다. |

### 확인한 공식 문서

- Clip Studio Paint — Palettes: https://help.clip-studio.com/en-us/manual_en/690_interface/Palettes.htm
- Clip Studio Paint — Register and manage your workspace: https://help.clip-studio.com/en-us/manual_en/690_interface/Register_and_manage_your_workspace.htm
- Adobe Photoshop — Expand or collapse panel icons: https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/collapse-expand-icons.html
- Adobe Photoshop — Dock or undock panels: https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/dock-undock-panels.html
- Adobe Photoshop — Save custom workspaces: https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/save-custom-workspaces.html
- Blender 5.0 — Properties Editor: https://docs.blender.org/manual/en/5.0/editors/properties_editor.html
- Krita 5.3 — Workspaces: https://docs.krita.org/en/reference_manual/resource_management/resource_workspace.html
- Figma — Design, prototype, and explore layer properties in the right sidebar: https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar
- Storyboard Pro 25 — About the User Interface: https://docs.toonboom.com/help/storyboard-pro-25/storyboard/getting-started/interface.html
- Storyboard Pro 24 — Panel View: https://docs.toonboom.com/help/storyboard-pro-24/storyboard/reference/views/panel-view.html

## 3. 구현한 개선

### 3.1 안전한 전문 탭 고정

Blender의 객체 pin을 그대로 복제하면 캔버스에서 새 대상을 선택했는데도 이전 객체를 편집하는 위험이 생긴다. ToonStudio에서는 다음처럼 범위를 좁힌다.

- 고정 대상은 선택 객체가 아니라 `quick/fill/transform/retouch/mask` 이미지 전문 탭이다.
- 선택 종류가 바뀌어도 전문 탭을 Quick으로 자동 초기화하지 않는다.
- 현재 선택 모델, mutation gate, transaction, undo/redo는 그대로 사용한다.
- 사용자가 이미지 전문 도구를 명시적으로 실행하면 고정보다 우선한다.
- 고정 여부와 설명을 상태 배너와 `aria-pressed`로 동시에 노출한다.
- 문서를 다시 열어 오래된 객체 컨텍스트가 남지 않도록 브라우저 탭 세션에만 저장한다.

### 3.2 기본 탭 표시 구성

- 선택 항목·레이어·페이지 탭을 개별 표시/숨김할 수 있다.
- 정본 순서는 항상 선택 항목 → 레이어 → 페이지로 유지한다.
- 마지막 하나는 숨길 수 없다.
- 현재 열려 있는 탭은 다른 탭으로 이동하기 전에는 숨길 수 없다.
- 검색·딥링크·작업공간이 숨긴 탭을 열면 그 탭을 자동으로 다시 표시한다.
- 표시 선호는 프로젝트 내용과 분리해 브라우저 로컬 UI 선호로 저장한다.

### 3.3 아이콘 전용 기본 탭

- 기본 탭의 시각적 텍스트만 `sr-only`로 접는다.
- 탭의 접근 가능한 이름, `role=tab`, `aria-selected`, roving tabindex, 방향키/Home/End 탐색은 유지한다.
- 레이어 개수 배지와 활성 탭 강조도 유지한다.

### 3.4 복구와 실패 격리

- “패널 기본값 복원”으로 표시 탭, 아이콘 모드, 탭 고정을 한 번에 복원한다.
- 알 수 없는 버전·탭 id·중복·빈 배열을 정규화한다.
- 저장소 읽기/쓰기 실패는 기본값 또는 현재 세션 동작으로 fail closed 한다.
- 저장 상태는 문서의 저장 완료로 오인될 문구를 사용하지 않는다.
- 여러 패널 컴포넌트는 하나의 `useSyncExternalStore` 스냅샷을 구독해 pin UI와 자동 라우팅이 어긋나지 않는다.

## 4. 의도적으로 하지 않은 것

- 선택 객체 자체를 pin하지 않는다. 잘못된 대상 편집 가능성이 이득보다 크다.
- 별도 작업공간 저장 체계를 만들지 않는다. 기존 V12 작업공간 정본과 충돌한다.
- 기존 플로팅·도킹·잠금 기능을 복제하지 않는다.
- 숨긴 탭의 기능을 비활성화하지 않는다. 검색·메뉴·딥링크로 연 기능은 자동 복구된다.
- 패널 선호 변경을 프로젝트 dirty 또는 저장 완료 상태로 취급하지 않는다.

## 5. 검증 계약

- 정규화: 알 수 없는 값 제거, 정본 순서, 최소 1개 탭
- 저장소: local/session 분리, 차단 시 fail closed
- 반응성: Navigator와 ContextRouteSync가 동일 스냅샷 구독
- 라우팅: pin 상태에서도 명시적 도구 실행 우선
- 접근성: `aria-pressed`, `aria-expanded`, `aria-controls`, `role=region`, 활성 탭 숨김 사유
- 밀도: 옵션을 닫았을 때 기존 DOM 감사의 최대 chrome 12개 예산 유지
- 터치: 상단 액션과 구성 옵션은 최소 44px
