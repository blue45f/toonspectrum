# Studio 다중 이미지 삽입 프리플라이트 벤치마크와 구현 결정

기준일: 2026-09-09  
대상: `https://www.toonstudio.cloud/studio`의 삽입 허브

## 1. 현재 기준선

Studio에는 이미 텍스트, 말풍선, 기기 이미지, 스톡, 템플릿, 콜라주, 요소,
장면, 클립, 효과, 이메레스, 3D, AI를 한곳에서 검색하는 통합 삽입 허브가 있다.
즐겨찾기, 최근 사용, 한국어·영어 동의어, 페이지·선택 영역 배치, 검토 잠금,
기존 Undo·저장·출처·3D 재편집 경로도 보존한다.

이번 변경은 이 기능을 다시 복제하지 않는다. 기존 벤치마크에서 후속 과제로 남긴
**다중 이미지 준비·검증·배치**를 하나의 완결된 제작 흐름으로 추가한다.

## 2. 공식 제품 벤치마크

### Figma Design / Slides

- 여러 이미지와 영상을 한 번에 선택하면 커서에 남은 개수와 다음 미리보기를 표시한다.
- 클릭 위치 또는 드래그한 크기로 순차 배치하고, `Place all`로 남은 항목을 한 번에 둔다.
- 프레임·도형 위에 놓으면 Fill로 교체할 수 있고, Escape로 남은 큐를 버린다.
- 파일 선택, 운영체제 드래그앤드롭, 클립보드 붙여넣기를 모두 지원한다.

전용 커서 세션은 빠르지만 캔버스 입력 소유권과 한 단계 Undo 트랜잭션이 필요하다.
현재 Studio의 팝오버에서 이를 흉내 내면 드로잉·선택·협업 입력과 충돌할 수 있으므로,
이번 수직 기능은 같은 장점을 **확정 전 큐 + 자동 배치 프리플라이트**로 안전하게 옮겼다.

### Adobe Photoshop Place

- 파일을 문서에 바로 래스터화하지 않고 배치 경계와 변형 핸들을 먼저 보여 준다.
- 원본 비율을 유지하고 큰 파일은 캔버스 안에 맞춘다.
- Enter로 확정하고 Escape로 취소하며, 확정 전에는 문서 상태를 바꾸지 않는다.
- 배치된 파일은 Smart Object로 보존해 원본 품질과 재편집 가능성을 지킨다.

Studio에서는 이미지 요소가 계속 독립 레이어로 남고 기존 이미지 삽입기가 Undo·저장
권위를 소유한다. 이번 프리플라이트는 Photoshop의 핵심인 **확정 전 검토와 취소 가능성**을
적용하되 새 문서 포맷이나 별도 이미지 저장소는 만들지 않는다.

### Canva / Adobe Express

- 콘텐츠 패널에서 업로드와 라이브러리 탐색을 같은 제작 문맥에 둔다.
- 여러 파일의 업로드 진행 상태와 실패를 개별적으로 보여 주고, 성공한 항목은 계속 쓸 수 있다.
- 레이아웃과 프레임을 이용해 여러 이미지를 빠르게 정렬한다.

Studio는 이미 삽입 허브와 콜라주 도구를 갖고 있으므로 패널을 하나 더 만들지 않는다.
다중 파일 준비 상태를 삽입 허브 상단에 접을 수 있는 작업대로 넣고, 개별 실패가 전체 준비
목록을 폐기하지 않도록 했다.

### CLIP STUDIO PAINT / Toon Boom / MediBang

- 소재·템플릿은 검색과 재사용, 장면·레이어 구조 보존에 강하다.
- 캔버스에 넣기 전 소재의 종류와 속성을 확인하고, 삽입 후에도 독립 요소로 편집한다.

이번 구현도 이미지마다 독립 요소를 만들며 기존 Studio의 소재·템플릿·3D 삽입 소유권을
건드리지 않는다. 다중 이미지 기능이 기존 소재 시스템의 우회 저장 경로가 되지 않도록 했다.

## 3. 구현한 사용자 흐름

1. `파일 선택`, 운영체제 드래그앤드롭, 클립보드 붙여넣기 중 아무 경로로 이미지를 추가한다.
2. 최대 24개, 원본 합계 128MB 안에서 중복·형식·파일 크기를 즉시 선별한다.
3. 동시에 최대 2개만 디코딩하며 기존 `loadImageFileForCanvas`를 통해 해상도 예산,
   12MB 일반 이미지 제한, 64MB 고급 래스터 제한, GIF 애니메이션 보존을 그대로 적용한다.
4. 각 파일의 미리보기, 최종 픽셀 크기, 준비 중·완료·오류 상태를 확인하고 순서를 바꾼다.
5. `현재 페이지` 또는 유효한 `선택 영역`을 고른다.
6. `균형 그리드`, `가로 스트립`, `세로 스트립`, `계단식`과 세 단계 간격을 선택한다.
7. 현재 순서·대상·레이아웃을 반영한 축소 배치 미리보기를 확인한다.
8. 명시적 확정 전에는 캔버스, Undo, 자동 저장, 협업 문서를 전혀 변경하지 않는다.
9. 확정하면 원본 비율을 유지하고 저해상도 이미지를 강제로 확대하지 않은 채 기존
   `addRenderedImage` 경로로 순서대로 삽입한다.
10. 일부 삽입이 실패하면 성공 항목만 목록에서 제거하고 실패 항목은 남기며,
    디코딩 오류는 목록에서 바로 다시 시도할 수 있다.

## 4. 안전성과 접근성

- 검토 잠금 페이지에서는 준비·미리보기는 가능하지만 문서 삽입은 차단한다.
- 잘못된 좌표, 0 크기, NaN, 최대 개수 초과는 순수 배치 모델에서 거절한다.
- 파일 식별자는 이름·MIME·크기·수정 시각으로 중복 제거하며 목록 데이터는 메모리에만 둔다.
- 키보드로 파일 순서를 위·아래로 바꿀 수 있고, 이 순서가 미리보기와 삽입 순서에 즉시 반영된다.
- 모든 핵심 버튼은 최소 44px 조작 영역을 갖고 `aria-expanded`, `aria-pressed`,
  `aria-live`, 오류 `alert`를 제공한다.
- 준비 목록의 순서가 최종 레이어 삽입 순서이며, 각 결과는 독립적으로 Undo할 수 있다.
- 이미지 디코딩은 2개 워커로 제한해 대용량 일괄 선택 중 메인 편집기 정체를 줄인다.

## 5. 검증 범위

### 순수 모델

- 지원 형식, 중복, 빈 파일, 일반/고급 래스터 용량, 총량, 최대 개수
- 네 가지 배치의 결정성, 입력 순서 보존, 영역 내 포함, 비율 보존, 비확대
- 잘못된 이미지와 타깃 기하 거절

### UI

- 다중 파일은 확정 전 캔버스를 변경하지 않음
- 파일 선택, 드롭, 붙여넣기가 동일한 안전 로더 사용
- 두 이미지의 실제 배치 인자 전달과 준비 목록 순서 반영
- 현재 옵션을 반영한 접근 가능한 배치 미리보기
- 검토 잠금에서 삽입 차단
- 중복과 디코딩 실패를 표시하면서 정상 항목 유지

## 6. 의도적으로 분리한 후속 수직 기능

- 캔버스 클릭마다 다음 이미지를 놓는 Figma식 커서 배치 세션
- 프레임 Fill 교체와 현재 이미지 내용만 교체
- 배치 전체를 하나의 원자적 Undo 단계로 묶는 편집기 트랜잭션
- 컷·페이지 썸네일에 직접 드롭해 페이지별로 분배
- 팀 즐겨찾기·최근 사용 동기화와 시각 유사 검색

이 항목들은 현재 팝오버 내부 UI만으로 안전하게 흉내 내지 않는다. 캔버스 입력 소유권,
문서 트랜잭션, 협업 CRDT 계약을 먼저 확장한 뒤 별도 회귀 검증과 함께 구현한다.

## 7. 공식 참고 자료

- Figma, Add images and videos in bulk:
  https://help.figma.com/hc/en-us/articles/360041089973-Add-images-and-videos-in-bulk
- Figma, Add images and videos to designs:
  https://help.figma.com/hc/en-us/articles/360040028034-Add-images-and-videos-to-designs
- Figma Slides, Add images and videos:
  https://help.figma.com/hc/en-us/articles/25427361244183-Add-images-and-videos-to-slides
- Figma, Copy and paste objects:
  https://help.figma.com/hc/en-us/articles/4409078832791-Copy-and-paste-objects
- Adobe Photoshop, Place files:
  https://helpx.adobe.com/photoshop/using/placing-files.html
- Canva Visual Suite:
  https://www.canva.com/visual-suite/
- Adobe Express, Add content while editing:
  https://helpx.adobe.com/express/web/video-creation-and-editing/create-videos/video.html
- CLIP STUDIO PAINT, How to load materials:
  https://help.clip-studio.com/en-us/manual_en/630_material/How_to_load_materials.htm
- Toon Boom Storyboard Pro, Importing templates:
  https://docs.toonboom.com/help/storyboard-pro-24/storyboard/library/import-template.html
- MediBang Paint, How to use materials:
  https://medibangpaint.com/en/use/2021/06/how-to-use-medibang-paint-materials/
