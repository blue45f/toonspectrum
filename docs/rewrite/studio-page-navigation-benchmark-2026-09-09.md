# ToonStudio 페이지 탐색·관리 벤치마크와 구현 결정

- 조사일: 2026-09-09
- 대상: `/studio` 페이지 목록 패널
- 구현 범위: 대형 웹툰·스토리보드 문서에서 페이지를 찾고, 연속 선택하고, 현재 위치를 잃지 않으며, 안전하게 재정렬하는 흐름

## 1. 현재 제품 기준선

기존 페이지 패널은 이미 다음 기능을 제품 데이터 흐름에 연결하고 있다.

- 빈 페이지 추가, 앞/뒤 삽입
- 일반 복제, 좌우 반전 복제
- 위/아래·맨 위/맨 아래 이동과 HTML5 드래그 재정렬
- 페이지 내용 비우기와 단일/다중 삭제 전 손실 확인
- Command/Ctrl 기반 다중 선택과 일괄 이동·삭제
- 이름·콘티 메모 편집, 샷 타입·카메라 앵글 배지
- 페이지별 검토 상태와 잠금 데이터
- 썸네일 크기 SQLite/OPFS 저장
- 데스크톱 도킹·분리와 모바일 시트

병목은 기능의 절대 개수보다 **페이지가 많아졌을 때 찾기, 범위 선택, 현재 위치 추적, 필터 결과에서의 안전한 순서 변경**이었다.

## 2. 공식 문서 벤치마크

### Clip Studio Paint Page Manager

공식 문서: <https://help.clip-studio.com/en-us/manual_en/570_pages/Page_Manager.htm>

관찰한 패턴:

- Ctrl 개별 선택과 Shift 연속 범위 선택
- 선택한 여러 페이지를 한 번에 이동·복제
- 썸네일 크기 조절과 Navigator 폭 맞춤
- 현재 편집 페이지로 Page Manager를 자동 스크롤하는 옵션
- 웹툰에서는 세로 페이지 흐름을 별도 뷰로 취급
- 실수 방지를 위해 드래그 재정렬에 보조키를 요구할 수 있는 설정

ToonStudio 반영:

- Shift를 단순 토글이 아닌 문서 순서 기반 연속 선택으로 수정
- 현재 페이지 자동 추적을 명시적 토글로 제공
- 검색·필터 중에는 숨은 페이지 사이 오배치를 막기 위해 드래그 재정렬을 잠금
- 기존 썸네일 크기 저장과 세로 웹툰 흐름은 유지

### Toon Boom Storyboard Pro 25

공식 문서:

- Thumbnails View: <https://docs.toonboom.com/help/storyboard-pro-25/storyboard/reference/views/thumbnails-view.html>
- Moving Panels: <https://docs.toonboom.com/help/storyboard-pro-25/storyboard/structure/move-panel.html>
- Selecting All Panels: <https://docs.toonboom.com/help/storyboard-pro-25/storyboard/structure/select-all-panels-scene.html>

관찰한 패턴:

- 패널을 시간 순서로 표시하고 Stage의 현재 패널과 동기화
- Shift 범위 선택, Ctrl/Command 개별 선택, 다중 패널 묶음 이동
- 현재 패널을 썸네일 뷰 중앙에 유지하는 옵션
- 이동 피드백에서 선택 패널 수를 노출
- 장면 단위 전체 선택과 장면 접기

ToonStudio 반영:

- Shift 범위 선택과 Command/Ctrl 추가 선택을 조합 가능한 순수 선택 모델로 분리
- 선택 수와 필터 밖에 숨은 선택 수를 항상 표시
- 방향키, Home/End, Page Up/Page Down 탐색과 Shift 확장 선택 제공
- 표시 결과 전체 선택 제공

장면 접기·장면 단위 그룹 이동은 현재 `PageState`에 장면 계층 권위가 없으므로 UI만 흉내 내지 않고 후속 데이터 모델 과제로 남겼다.

### Figma Design / FigJam

공식 문서:

- Create and manage pages: <https://help.figma.com/hc/en-us/articles/360038511293-Create-and-manage-pages>
- Create and manage pages in FigJam: <https://help.figma.com/hc/en-us/articles/24005082123159-Create-and-manage-pages-in-FigJam>
- Find and replace in Figma: <https://help.figma.com/hc/en-us/articles/9141292269847-Find-and-replace-in-Figma>

관찰한 패턴:

- 더블클릭 이름 변경, 페이지 복제·삭제·재정렬
- 대형 파일에서 검색 결과를 입력 즉시 갱신하고 범위를 필터링
- Command/Ctrl 개별 선택과 Shift 범위 선택
- FigJam의 일괄 이름 변경, 페이지 구분선, 페이지 링크
- 페이지를 파일 로딩·업무 단계·협업 상태의 상위 조직 단위로 사용

ToonStudio 반영:

- 페이지 이름 더블클릭 편집
- 이름·번호·콘티 메모·샷 타입·카메라 앵글·검토 상태·담당자·검토 메모 통합 검색
- 내용 있음, 빈 페이지, 메모 있음, 검토 필요, 승인, 잠금 필터
- `/` 검색 포커스, Escape 초기화, Command/Ctrl+A 표시 결과 전체 선택
- 검색은 `useDeferredValue`로 입력 응답성과 결과 계산을 분리

페이지 구분선·공유 링크·일괄 이름 변경은 문서 스키마 및 권한 계약이 필요한 후속 범위다.

### Adobe Express Organize Pages

공식 문서: <https://helpx.adobe.com/express/web/documents-and-presentations/organize-pages.html>

관찰한 패턴:

- 한 화면에서 페이지 드래그 재정렬, 추가, 삭제를 직접 수행
- 페이지 조작이 별도 복잡한 설정 화면이 아니라 썸네일 조직 화면 안에서 끝남

ToonStudio 반영:

- 기존 카드 안의 삽입·복제·비우기·삭제 동작을 유지
- 새 검색·필터가 활성화되어도 전체 문서 기준 이동 버튼은 계속 사용 가능하게 유지
- 드래그를 잠그는 이유와 대체 조작을 패널 안에 바로 설명

## 3. 구현된 사용자 흐름

### 통합 검색

검색 문자열은 NFKC 정규화, 한국어 소문자 처리, 중복 토큰 제거를 거쳐 최대 12개 토큰으로 제한한다. 모든 토큰이 한 페이지의 검색 문맥에 포함되어야 결과에 노출된다.

검색 문맥:

- 표시 이름과 자동 페이지 번호
- 콘티 메모
- 샷 타입과 카메라 앵글
- 검토 상태 코드와 한국어 라벨
- 검토 담당자와 검토 메모
- 잠금 상태 키워드

### 상태 필터

- 전체
- 내용 있음
- 빈 페이지
- 메모 있음
- 검토 필요: `needs-review`와 `changes-requested`
- 승인됨
- 잠긴 페이지

### 선택 모델

- 일반 클릭: 단일 선택과 앵커 갱신
- Command/Ctrl+클릭: 개별 추가·해제, 기존 범위 앵커 유지
- Shift+클릭: 앵커부터 대상까지 연속 선택
- Command/Ctrl+Shift+클릭: 기존 선택에 범위를 합집합
- Command/Ctrl+A: 현재 표시 결과 전체 선택
- 페이지 삭제·필터 변경 후에도 존재하는 ID만 문서 순서로 정리

### 키보드 탐색

- `/`: 검색창 포커스
- `ArrowUp` / `ArrowDown`: 이전·다음 표시 페이지
- `Home` / `End`: 첫·마지막 표시 페이지
- `PageUp` / `PageDown`: 10페이지 단위 이동
- 위 키 조합 + Shift: 연속 선택 확장
- `Escape`: 검색·필터 초기화 또는 다중 선택 축소

### 현재 페이지 추적

- 기본값은 현재 편집 페이지를 목록 안으로 자동 스크롤
- 사용자가 토글로 중지 가능
- 검색·필터가 현재 페이지를 숨기면 상태를 표시하고 `현재 페이지 보기`로 즉시 전체 목록 복귀

### 재정렬 안전성

필터 결과의 보이는 index는 전체 문서 index와 다르다. 보이는 목록에서 그대로 드롭하면 숨은 페이지 앞뒤 중 어느 위치인지 사용자가 확인할 수 없으므로:

- 검색·필터 활성 중 HTML5 DnD를 비활성화
- 카드의 위/아래·맨 위/맨 아래 버튼은 원래 문서 index로 계속 동작
- 일괄 이동 역시 전체 문서 순서를 유지
- 잠금 이유와 대체 조작을 UI에 노출

## 4. 성능·접근성 결정

- 검색 결과 계산에 `useDeferredValue` 적용
- 선택 포함 여부를 Set으로 조회해 대량 선택 시 카드별 선형 탐색 제거
- 카드에 `content-visibility: auto`와 intrinsic size 힌트를 적용해 긴 목록의 화면 밖 렌더 비용 완화
- 검색 결과에 `aria-busy`, 결과 수에 `aria-live`
- 페이지 카드에 `aria-current`, `aria-pressed`, 검색 도움말 연결
- 잠금 배지를 명시적 이미지 역할과 접근 가능한 이름으로 제공
- 기존 44px 조작 영역과 모바일 inert/modal 계약 유지

## 5. 검증 범위

순수 모델 테스트:

- Unicode/NFKC 검색 정규화와 토큰 제한
- 이름·번호·메모·샷 태그·검토 상태·담당자 검색
- 내용/빈 페이지/메모/검토/승인/잠금 필터
- 토글 및 연속 범위 선택의 문서 순서 보존
- 방향키와 장거리 이동의 경계값

컴포넌트 테스트:

- 검색 결과와 필터 결과 렌더
- 검색·필터 중 DnD 잠금
- Shift 연속 선택과 일괄 이동 ID 순서
- 키보드 탐색, 표시 결과 전체 선택, `/` 포커스
- 현재 페이지 자동 추적 토글과 숨겨진 현재 페이지 복구

기존 페이지 패널 회귀 테스트는 추가·복제·삽입·메타 편집·삭제 확인·모바일 시트·미리보기 크기 저장·44px 타깃을 계속 검증한다.

## 6. 의도적으로 주장하지 않는 범위

이번 변경은 다음 기능을 구현했다고 표시하지 않는다.

- 서버 협업 권한과 연결된 페이지 담당자 일괄 변경
- 장면/시퀀스 계층, 접기, 장면 단위 재정렬
- 선택한 여러 페이지를 한 번의 히스토리 엔트리로 복제
- 페이지 딥링크와 외부 공유 권한
- 페이지 구분선·폴더
- 실제 가상 스크롤러

이 기능들은 UI만 추가하면 문서 직렬화, undo/redo, 협업 잠금, 내보내기 순서와 충돌할 수 있어 별도 데이터·명령 권위 설계가 필요하다.
