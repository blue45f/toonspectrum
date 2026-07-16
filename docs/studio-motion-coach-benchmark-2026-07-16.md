# Studio Motion Coach benchmark — 2026-07-16

툴 아이콘의 의미를 추측하게 두지 않고, **무엇을 하는지 · 어떻게 움직이는지 · 왜 지금 쓸 수
없는지**를 캔버스 흐름 안에서 설명하는 상호작용 계층을 정리한다. 이 문서는 현재 작업 트리에서
확인되는 구현만 기록하며, 경쟁 제품의 화면이나 영상을 복제했다는 의미의 동등성 주장은 하지
않는다.

## 공식 문서에서 확인한 패턴

| 공식 문서 | 확인한 제품 패턴 | ToonSpectrum에 적용한 원칙 |
| --- | --- | --- |
| [Magma Editor User Interface](https://help.magma.com/en/articles/6871160-magma-s-editor-user-interface) | 툴바 아이콘에 마우스를 올리면 툴 설명과 영상 설명을 제공하고, 상단 Quick Actions에는 자주 쓰는 동작과 단축키를 함께 배치한다. | 아이콘 이름만 반복하지 않고, 설명·단축키·작업 팁과 툴별 의미 SVG 동작을 2단계 코치로 제공한다. 호스팅 영상 복제 대신 가벼운 자체 미리보기를 사용한다. |
| [Procreate QuickMenu](https://help.procreate.com/procreate/handbook/5.3/interface-gestures/quickmenu) | 여섯 방향 버튼과 호출 제스처를 사용자화하고, 터치-드래그로 자주 쓰는 동작을 빠르게 고른다. | 터치에서 우연한 탭과 학습 제스처를 분리한다. 480ms 길게 누르기는 코치만 열고 뒤따르는 합성 클릭은 소비한다. **사용자화 방사형 메뉴 자체는 이 슬라이스에 포함하지 않는다.** |
| [Clip Studio Paint Quick Access Palette](https://help.clip-studio.com/en-us/manual_en/690_interface/Quick_Access_Palette.htm) | 도구·기능 검색, 용도별 세트, 명령/자동 액션/색 등록을 지원하고 실행할 수 없는 검색 결과를 흐리게 구분한다. | 표시 문구가 바뀌어도 안정적인 명령 ID로 미리보기를 결정하고, 비활성 동작을 숨기지 않고 정확한 사용 조건을 노출한다. **Quick Access 세트 편집과 통합 검색은 이번 범위가 아니다.** |
| [Krita Pop-up Palette](https://docs.krita.org/en/reference_manual/popup-palette.html) | 포인터 위치의 원형 팔레트에 즐겨찾기 브러시, 색상·색상 기록, 회전·줌, 캔버스 전용 모드와 반전을 모은다. | 하단 그리기 옵션 도크에서 현재 브러시·즐겨찾기·크기·불투명도·반전·보정·대칭을 문맥형 코치로 학습할 수 있게 한다. **Krita식 원형 팝업을 구현했다는 뜻은 아니다.** |
| [Figma Actions](https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design) | `Command/Ctrl + K` Actions에서 명령, 자산, 플러그인 등을 검색하고 일관된 동작 이름으로 실행한다. | 자유 설명문이 아니라 안정적인 action/engine ID를 의미 판정의 우선 근거로 사용한다. 이번 슬라이스는 코치의 명령 식별 계층이며 Actions 검색 기능을 새로 추가하지 않는다. |
| [Figma keyboard navigation](https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard) | 툴바를 키보드로 포커스하고 방향키로 이동할 수 있으며, 호버에서 단축키를 확인할 수 있다. | 키보드·보조기술 포커스는 코치를 즉시 펼치고, UI 컨트롤에 포커스가 있을 때 `Tab`을 캔버스 전용 모드 단축키가 가로채지 않게 한다. |

## 구현 판정

| 영역 | 현재 구현 | 코드 근거 | 판정 |
| --- | --- | --- | --- |
| 2단계 설명 | 호버 280ms 뒤 제목·설명·단축키가 먼저 열리고, 620ms 머무르면 동작 미리보기와 작업 팁으로 확장된다. 포커스와 완료된 길게 누르기는 즉시 확장한다. | `StudioToolHint.tsx`, `StudioToolHintBubble.tsx` | **구현** |
| 의미 기반 동작 미리보기 | `select`, `ink`, `erase`, `fill`, `sample`, `shape`, `text`, `bubble`, `image`, `filter`, `lasso`, `brush-size`, `opacity`, `stabilizer`, `pressure`, `symmetry`, `zoom-view`, `history`, `layer`의 **19종** SVG 미리보기를 각각 설계했다. | `components/StudioToolHintPreview.tsx` | **구현** |
| 안정적인 의미 판정 | 명시적 preview → filter engine ID → stable action ID → 등록된 hint ID → 정확한 identity token 순으로 판정한다. 도움말 본문의 우연한 단어는 판정에 쓰지 않아 `sharpen`을 pen으로, `invert`를 도형으로 오인하는 식의 충돌을 막는다. 판정 테이블은 rich coach 요청 뒤에만 로드한다. | `studio-tool-hint-preview-routing.ts`, `studio-tool-hints.ts` | **구현** |
| 필터 일관성 | 스마트 필터 카탈로그의 engine ID를 우선해 블러·톤·컬러·디테일 필터가 모두 `filter` 동작으로 연결된다. | `studio-tool-hint-preview-routing.ts`, `studio-filter-catalog.ts`, `StudioSmartFiltersPanel.tsx` | **구현** |
| 모션 접근성 | 운영체제의 `prefers-reduced-motion: reduce`를 구독한다. 감소 모션 상태에서는 `<animate>`/`<animateTransform>`/`<animateMotion>`을 렌더링하지 않고 의미가 보이는 정지 상태를 제공한다. | `components/StudioToolHintPreview.tsx` | **구현** |
| 비활성 기능 설명 | native disabled 컨트롤은 유지하되 래퍼가 키보드 포커스를 받고 `aria-disabled`, `aria-describedby`를 제공한다. 클릭은 차단하면서 `사용 조건`과 정확한 사유를 읽을 수 있다. 활성 컨트롤에는 불필요한 래퍼 tab stop을 만들지 않는다. | `StudioToolHint.tsx`, `components/StudioToolHintBubble.tsx`, `studio-chrome-ui.tsx` | **구현** |
| 키보드 흐름 | 포인터 클릭으로 생긴 포커스 재개방은 억제하지만, 키보드·보조기술 포커스는 `:focus-visible` 지원 여부에 기대지 않고 코치를 연다. `Tab`/`Shift+Tab`은 캔버스에서도 브라우저 포커스 이동으로 보존하고 캔버스 chrome 토글은 `` ` `` 키로 분리한다. | `StudioToolHint.tsx`, `studio-drawing-shortcuts.ts`, `StudioPage.tsx` | **구현** |
| 터치 계약 | 480ms 길게 누르면 코치만 즉시 열고, 손을 뗀 뒤 합성 클릭으로 도구가 의도치 않게 실행되지 않게 한다. 취소·바깥 탭·Escape 경로를 분리했다. | `StudioToolHint.tsx` | **구현** |
| 포인터 안정성 | 도구 선택으로 버튼이 교체돼도 같은 좌표에서 코치가 다시 튀어나오지 않으며, 포인터가 6px 넘게 실제로 이동하면 억제를 해제한다. 툴팁으로 이동하는 동안에는 280ms 닫기 지연으로 내용을 가리킬 수 있다. | `StudioToolHint.tsx` | **구현** |
| 뷰포트 대응 | portal로 `document.body`에 렌더링하고 실제 크기를 측정해 상·하·좌·우 공간에 맞춘다. 545px보다 낮은 화면에서는 잘린 미리보기를 약속하지 않고 설명형 compact 코치로 축소한다. | `StudioToolHint.tsx`, `StudioToolHintBubble.tsx`, `studio-tool-hint-position.ts` | **구현** |
| 초기 번들 경계 | 상호작용 셸은 가볍게 유지하고 rich bubble과 preview 모듈을 의도 시점에 lazy import/prefetch한다. | `StudioToolHint.tsx`, `components/StudioToolHintBubble.tsx` | **구현** |

## 이 슬라이스에서 연결된 제품 표면

| 표면 | 실제 연결 범위 | 근거 |
| --- | --- | --- |
| 하단 그리기 옵션 | 펜/지우개/도형 모드, 현재 브러시와 라이브러리, 즐겨찾기, 도형 채우기, 크기, 불투명도, 세부 옵션, 캔버스 반전, 브러시 스튜디오, 스마트 도형, 대칭 방식, 브러시 슬롯, 손떨림 보정과 방식, 획 후처리, 필압 반응 | `StudioDrawOptionsBar.tsx` |
| 왼쪽 툴 레일 | 공통 rich hint를 유지하면서 이미지 레이어 필요, 픽셀 선택 필요, 편집/검토 잠금 등 실제 비활성 사유를 별도 문장으로 제공한다. 이미지 추가와 참고 이미지 설명도 rich hint 경로로 통합했다. | `StudioPage.tsx`, `studio-chrome-ui.tsx` |
| 모바일 주 도크 | 공통 dock hint와 함께 실행취소/다시실행의 문서 잠금 또는 기록 없음 사유를 제공한다. native `title`과 rich hint가 겹치지 않게 한다. | `StudioPage.tsx`, `studio-chrome-ui.tsx` |
| 선택 문맥 바 | 복제, 앞으로/뒤로, 잠금, 삭제 동작을 layer 미리보기와 작업 설명으로 감싼다. | `StudioSelectOptionsBar.tsx` |
| 레이어 일괄 동작 | 선택 레이어 표시/숨김, 잠금/해제, 선택 병합, 보이는 레이어 평면화, 더보기의 7개 동작에 코치와 비활성 사유를 연결한다. | `StudioLayerNavigator.tsx` |
| 픽셀 선택 패널 | 자유/다각형 올가미와 픽셀 선택 방식에 안정적인 ID와 `lasso`/`select` 미리보기를 명시한다. | `StudioSelectionToolsPanel.tsx` |
| 스마트 필터 | 필터 이름에 `pen`, `shape`, `invert` 같은 문자열이 포함돼도 필터 엔진 identity를 우선해 `filter` 미리보기로 고정한다. | `StudioSmartFiltersPanel.tsx`, `studio-filter-catalog.ts` |

## 검증 계약

| 테스트 | 보장하는 회귀 방지 |
| --- | --- |
| `StudioToolHint.test.tsx` | 2단계 compact/expanded 표시, 낮은 뷰포트 축소, touch long-press 클릭 소비, disabled focus/ARIA/사용 조건, 보조기술 포커스 |
| `components/StudioToolHintPreview.test.tsx` | 19종의 animated/reduced 상태, reduced 상태의 animate 태그 제거, SVG ID 충돌 방지 |
| `studio-tool-hints.test.ts` | stable action/engine 우선순위, 필터 카탈로그 매핑, 잘못된 부분 문자열 분류 방지 |
| `StudioDrawOptionsBar.test.tsx` | 고빈도 primary/advanced 컨트롤의 rich target 수, 의미 preview 종류, 중복 native title 제거 |
| `StudioSelectOptionsBar.test.tsx`, `StudioLayerNavigator.test.tsx` | 선택·레이어 액션의 rich coach 연결과 읽기 전용/선택 없음 조건 |
| `studio-chrome-ui.test.tsx` | disabled rail/dock의 포커스 가능 상태, `aria-disabled`, 중복 title 방지 |
| `studio-drawing-shortcuts.test.ts` | 버튼·입력·문서 첫 진입·캔버스에서 `Tab`/`Shift+Tab` 포커스 보존, 실제 포커스된 캔버스 viewport에서만 `` ` `` chrome 토글 허용 |

## 남은 범위와 비주장

이 슬라이스는 Motion Coach 기반과 고빈도 2D 편집 동작을 고도화했지만 전체 Studio 명령을 모두
덮었다고 주장하지 않는다.

- 3D 장면, VRM 포즈·소품 결합, 카메라·조명·gizmo의 세부 동작 코치는 아직 전수 연결되지 않았다.
- 애니메이션 타임라인·프레임/키프레임 편집의 세부 명령 코치는 아직 전수 연결되지 않았다.
- 모바일의 페이지·속성·줌 등 보조 chrome은 주 도크 수준의 비활성 사유/미리보기 계약이 아직
  일관되게 적용되지 않았다.
- Procreate식 사용자화 방사형 QuickMenu, CSP식 사용자화 Quick Access 세트, Figma식 통합
  Actions 검색은 이 슬라이스에서 새로 구현하지 않았다.
- Magma의 호스팅 영상 설명과 동일한 영상 자산을 만들지 않았다. 현재는 각 툴의 결과를 설명하는
  자체 SVG 모션이며, 3D/타임라인처럼 공간·시간 설명이 필요한 영역에는 별도 미리보기 설계가
  필요하다.
- 도움말 노출 빈도 개인화, “다시 보지 않기”, 사용자 숙련도별 compact/coach 기본값, 전체 명령
  coverage 리포트는 후속 범위다.

따라서 현재 판정은 **Motion Coach 코어와 고빈도 2D 표면 구현 완료, Studio 전체 표면 확장은
진행 중**이다.
