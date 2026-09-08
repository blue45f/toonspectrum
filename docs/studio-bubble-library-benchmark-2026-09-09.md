# ToonStudio 말풍선 라이브러리 고도화 벤치마크

- 기준일: 2026-09-09
- 대상: `/studio` 말풍선 삽입 도구
- 범위: 말풍선 발견, 선택, 재사용, 대사 맥락 추천, 접근성
- 비범위: 기존 캔버스 렌더러·문서 스키마·CRDT·말풍선 기하 데이터의 변경

## 1. 현재 제품 기준선

현재 ToonStudio 말풍선 편집기는 이미 다음의 전문 제작 기능을 갖춘 상태다.

- 16종 역할 기반 말풍선: 기본 대사, 이어 말하기, 생각, 외침, 속삭임, 공포, 내레이션, 상태창, 메신저, 감정·장르형 변형
- 단일/다중 꼬리, 방향, 위치, 길이, 폭, 굽힘, 화자 앵커
- 가로·세로쓰기, 행간, 자간, 정렬, 루비, 범위 서식
- 텍스트 자동 축소와 최소 글자 크기
- 선 색·굵기·스타일, 채움·그라디언트, 그림자, 블러, 거친/흔들린 외곽선
- 커스텀 실루엣 포인트와 캔버스 핸들 편집
- 스크립트 일괄 삽입, 번역, Undo/Redo, 저장·로드, 협업 스키마

즉 이번 고도화는 새 기하 엔진을 중복 구현하는 대신, 이미 강한 편집 기능에 도달하는 시간을 줄이는 데 집중한다.

## 2. 경쟁 제품 비교

| 제품 | 관찰한 강점 | ToonStudio 기존 상태 | 이번 반영 |
| --- | --- | --- | --- |
| Clip Studio Paint | 전용 Balloon/기하/꼬리 도구, 제어점 편집, 같은 레이어의 겹친 말풍선 결합, 말풍선 소재, 소재 검색·태그·즐겨찾기·정렬 | 기하·꼬리·커스텀 실루엣은 이미 강함. 삽입 목록 개인화가 약함 | 검색, 즐겨찾기, 최근 사용, 역할 그룹 유지 |
| Comic Life | 드래그 앤드 드롭 삽입, 꼬리 곡률 핸들, 다중 꼬리, 연결/확장 말풍선, 스크립트 중심 제작 | 드래그 삽입·다중 꼬리·이어 말하기·스크립트 일괄 삽입 보유 | 최근 다시 넣기와 스크립트 맥락 추천으로 반복 작업 단축 |
| MediBang Paint / Paletta | 타원·폭발·구름·물결·생각·사각·전자음·플래시 등 만화 문법 다양성, 클라우드 소재, 모바일 제작 | 16종 프리셋이 대부분의 문법을 포괄 | 한국어/영어/일본어 용도 동의어와 초성 검색 추가 |
| Canva | 검색 가능한 대형 말풍선 소재, 색/방향/유형 필터, 유사 소재, 즐겨찾기, 입력량 기반 텍스트 크기 조정, 모바일/태블릿 | 자동 텍스트 축소와 반응형 카드 보유. 검색·개인화 부족 | 검색, 즐겨찾기 전용 보기, 44px 조작 영역, 빈 결과 복구 |
| Storyboard That | 전용 Speech Bubbles 탭, 드래그 배치, 객체처럼 리사이즈·회전·색 변경, 단순한 학습 곡선 | 더 깊은 편집 기능은 보유하지만 목록 진입 비용이 큼 | 단계적 공개: 기본 목록은 단순하게, 고급 기능은 삽입 뒤 인스펙터에서 유지 |
| Toon Boom Storyboard Pro | 패널별 Dialogue/Action/Notes 캡션, 스크립트에서 패널 캡션으로 드래그, 프로젝트 전체 캡션 검색 | 대사 일괄 삽입·배치 편집·번역 보유 | 마지막 유효 대사를 추천 입력으로 사용. 프로젝트 전체 대사 검색은 후속 과제로 유지 |
| Procreate | 집중형 텍스트 패널, 벡터 텍스트 유지, 실시간 서체·자간·행간 조정 | 말풍선 텍스트는 편집 가능 상태로 유지 | 삽입 단계에서는 정보 밀도를 늘리지 않고 추천·재사용만 추가 |

## 3. 구현 결정

### 3.1 다국어·의도 기반 검색

단순 라벨 부분일치가 아니라 다음 필드를 모두 색인한다.

- 말풍선 ID, 표시 이름, 설명, 역할 그룹
- 한국어 제작 용어: `속마음`, `긴 대사`, `전자음`, `상태창`, `나레이션` 등
- 영어 제작 용어: `dialogue`, `whisper`, `narration`, `hologram`, `impact` 등
- 일본어 제작 용어: `セリフ`, `ささやき`, `ナレーション`, `電子音` 등
- 한글 초성: `ㅅㅅㅇ` → `속삭임`

복수 검색어는 AND로 처리한다. 정확 일치, 접두 일치, 단어 접두, 부분 일치 순으로 점수를 부여해 결과를 안정적으로 정렬한다. 검색어 길이는 제한해 키 입력마다 수행되는 계산량을 상한 안에 둔다.

### 3.2 즐겨찾기와 최근 사용

- 즐겨찾기는 카드의 독립된 별 버튼으로 토글한다.
- 최근 사용은 클릭 삽입 직후 또는 드롭이 성공한 드래그 종료 시에만 MRU로 기록한다. 취소된 드래그는 기록하지 않는다.
- 기본 보기 순서: 즐겨찾기 → 최근 사용 → 기존 역할 그룹.
- 같은 말풍선은 화면에 한 번만 나타나도록 섹션 간 중복을 제거한다.
- 최근 사용은 최대 6개로 제한한다.
- 마지막 사용 말풍선은 한 번에 다시 넣을 수 있다.

### 3.3 로컬 대사 분위기 추천

기존 `StudioAiEmotionBubbleMatcher`를 새로 복제하지 않고 실제 삽입 도구에 연결한다.

- 스크립트의 마지막 비어 있지 않은 줄을 사용한다.
- `이름: 대사` 또는 `이름：대사` 형식이면 화자 접두어를 제외한다.
- 추천 결과는 기존 편집 가능한 16종 말풍선으로 매핑한다. 단, `(지문)`·`（지문）`은 기존 일괄 삽입 문법을 우선해 내레이션으로 추천한다.
- 추천 신뢰도와 사람 확인 필요 여부를 노출한다.
- 분석은 브라우저 안에서 결정적으로 수행되며 대사를 외부로 전송하지 않는다.

### 3.4 접근성과 모바일

- 라이브러리는 `menu/menuitem`이 아닌 `list/listitem`으로 표현한다. 카드 안에 삽입과 즐겨찾기라는 서로 다른 행동이 있기 때문이다.
- 삽입 버튼과 별 버튼을 형제 요소로 구성해 중첩 버튼을 만들지 않는다.
- 검색, 즐겨찾기, 최근 다시 넣기, 별 버튼은 최소 44px 조작 영역을 확보한다.
- `/` 키로 검색창에 포커스하고, 검색창의 `Esc`는 검색어만 지운다.
- 검색 결과 수를 `aria-live` 상태로 알린다.
- 즐겨찾기 상태는 `aria-pressed`로 전달한다.
- 검색 결과가 없을 때 이유별 메시지와 전체 보기 복구 버튼을 제공한다.

### 3.5 데이터 안전성

개인 선호는 문서 데이터가 아니라 브라우저 로컬 선호로 저장한다.

- 버전이 있는 JSON 포맷
- 알려진 말풍선 ID만 허용
- 중복 제거, 즐겨찾기/최근 사용 개수 상한
- 원문 크기 상한
- 손상 JSON, 미래 버전, private browsing, 스토리지 접근 거부, 용량 오류에서 fail-open
- `storage` 이벤트로 같은 출처의 다른 탭과 동기화
- 문서 스키마와 협업 CRDT에는 영향을 주지 않음

## 4. 변경 파일

- `apps/web/src/domains/creator/lettering/studio-bubble-library.ts`
  - 검색 색인, 초성 검색, 점수화, 섹션 조립, 선호 저장/정규화, 추천 어댑터
- `apps/web/src/domains/creator/lettering/studio-bubble-library.test.ts`
  - 검색·랭킹·다국어·초성·중복 제거·MRU·저장 장애·추천 매핑 회귀 테스트
- `apps/web/src/domains/creator/lettering/StudioBubbleLibraryPanel.tsx`
  - 검색 UI, 즐겨찾기, 최근 사용, 다시 넣기, 드래그 성공 기록, 접근성
- `apps/web/src/domains/creator/lettering/StudioBubbleToolPopoverBody.tsx`
  - 로컬 대사 추천, 선호 저장/탭 동기화, 기존 대사 삽입 흐름과 라이브러리 조합
- `apps/web/src/domains/creator/lettering/StudioBubbleToolPopoverBody.test.tsx`
  - 정적 렌더 계약, 16종 노출, 중첩 버튼 방지, 추천 엔진 연결

## 5. 의도적으로 유지한 경계

이번 변경은 아래 기존 계약을 바꾸지 않는다.

- `BubbleEl` 직렬화와 저장 문서 버전
- Konva 렌더러와 말풍선 경로 생성
- 꼬리/커스텀 실루엣/텍스트 맞춤 알고리즘
- 캔버스 드롭 좌표 계산
- Undo/Redo와 협업 CRDT
- 기존 16종 ID와 오래된 문서 호환

## 6. 후속 후보

1. 팀/계정 단위 즐겨찾기 동기화. 현재는 기기 로컬 선호만 저장한다.
2. 사용자가 만든 말풍선 스타일 프리셋에 태그·썸네일·검색을 확장한다.
3. 프로젝트 전체 대사 검색/바꾸기와 화자별 일괄 스타일 변경을 결합한다.
4. 검색/삽입 계측을 익명 집계해 무결과 검색어와 가장 많이 반복되는 작업을 확인한다.
5. 추천 엔진을 한 줄이 아닌 선택된 여러 대사의 분포로 확장하되, 자동 적용이 아닌 검토 가능한 제안 원칙을 유지한다.

## 7. 성공 지표

- 원하는 말풍선 삽입까지의 중앙 클릭/탭 수
- 검색 후 5초 안에 삽입한 세션 비율
- 최근 다시 넣기와 즐겨찾기 재사용률
- 무결과 검색률
- 대사 추천의 수동 변경률
- 키보드만으로 검색→삽입 가능한 비율
- 320px 폭과 coarse pointer 환경에서의 오조작률

## 8. 공식 참고 자료

- Clip Studio Paint, Balloons: https://help.clip-studio.com/en-us/manual_en/540_comic/Balloons.htm
- Clip Studio Paint, Material palette: https://help.clip-studio.com/en-us/manual_en/630_material/Material_palette.htm
- Clip Studio Paint, Organizing materials: https://help.clip-studio.com/en-us/manual_en/630_material/Organizing_materials.htm
- Comic Life, Place and style balloons and captions: https://help.plasq.com/mobile/comiclife/1.0/en/place/balloons.html
- Comic Life 3, Features: https://plasq.com/apps/comiclife/macwin/features-galore/
- MediBang Paint, Manga tutorial for speech-bubble types: https://medibangpaint.com/en/use/2021/11/mangatutorialforbeginners08/
- MediBang Paletta, Flash bubble: https://medibangpaint.com/en/medibang-pro/manual/effects/flash_bubble/
- Canva, Speech bubbles: https://www.canva.com/ko_kr/features/speech-bubble/
- Canva, Search/filter/favorite speech-bubble materials: https://www.canva.com/ja_jp/features/speech-bubble-material/
- Storyboard That, Add Speech Bubbles: https://help.storyboardthat.com/text/add-textables
- Storyboard That, Format Text: https://help.storyboardthat.com/text/format-text
- Toon Boom Storyboard Pro 24, Searching text in captions: https://docs.toonboom.com/help/storyboard-pro-24/storyboard/caption/searching-text-caption.html
- Toon Boom Storyboard Pro 25, Displaying captions: https://docs.toonboom.com/help/storyboard-pro-25/storyboard/pitch/display-caption.html
- Procreate Handbook, Text: https://help.procreate.com/procreate/handbook/text
