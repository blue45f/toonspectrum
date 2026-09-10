# ToonStudio 효과 작업공간 벤치마크 및 구현 결정

- 기준일: 2026-09-09
- 대상: `https://www.toonstudio.cloud/studio`
- 기준 브랜치/커밋: `main` / `00fef2cc40ed5dbe07cd4ca7df4f13483fe78aa7`
- 구현 범위: 이미지 요소의 기존 `StudioAdjustmentStack`을 정본으로 사용하는 비파괴 효과 조합·관리·진단 UX

## 1. 목표

이번 변경의 목표는 필터 종류를 무작정 늘리는 것이 아니다. 현재 Studio에는 이미 77개의 로컬 스마트 필터 엔진, 순서 변경, 항목별 활성화와 불투명도, 필터 마스크, Worker 기반 렌더 경로가 있다. 부족한 부분은 사용자가 제작 의도에 맞는 조합을 빠르게 만들고, 스택의 순서·중복·비용 위험을 이해하며, 실수 없이 교체·복제·정리하는 상위 작업 흐름이다.

따라서 다음 원칙으로 구현한다.

1. 두 번째 효과 문서 모델을 만들지 않는다.
2. 레시피도 현재 렌더러가 실제 지원하는 엔진만 조합한다.
3. 모든 쓰기는 기존 `admitStudioAdjustmentStack` 입장 검증을 거친다.
4. 저장, Undo, 필터 마스크, Worker, 내보내기 경계를 우회하지 않는다.
5. 기기별 밀리초를 추정하는 척하지 않고 상대적 부하 점수만 제공한다.
6. 아직 렌더러 계약이 없는 기능은 UI만 만들어 지원한다고 표시하지 않는다.

## 2. 공식 문서 기반 경쟁 제품 조사

| 제품 | 공식 동작 | 제품 설계에 반영한 점 |
| --- | --- | --- |
| Adobe Photoshop Smart Filters | Smart Object 아래에 비파괴 필터를 쌓고, 설정 수정·숨김·순서 변경·복제·삭제가 가능하다. 필터 마스크와 개별 혼합 옵션도 제공한다. | 기존 비파괴 스택을 유지하고 **복제**, 안전한 전체 정리, 순서 위험 진단을 추가한다. 개별 블렌드 모드는 현재 렌더 계약이 없어 후속 과제로 남긴다. |
| Krita Filter Layers / Filter Masks | 필터 레이어는 원본을 바꾸지 않고 하위 합성 결과에 필터를 적용하며, 필터 마스크는 마스크 영역에만 비파괴 효과를 적용한다. | 새 범위 모델을 중복 생성하지 않고 이미 연결된 `filterMaskSrc` 흐름을 정본으로 유지한다. |
| Clip Studio Paint Layer Property | 표현색 임계값, 텍스처 합성, 레이어 컬러, 이미지/마스크 이미지 효과 범위와 단계형 마스크 표현을 제공한다. | 웹툰 제작 목적 중심의 **선화·톤·인쇄·질감 레시피**를 제공하고, 알파·단색 변환 순서 위험을 진단한다. |
| ibisPaint | 필터를 썸네일·카테고리·최근 사용으로 탐색하며, 렌즈/회전 블러, 글리치, 블룸, 고드레이, 만화 배경처럼 일러스트·만화 목적형 필터와 파라미터 기억을 제공한다. | 기존 검색·최근 사용 흐름 위에 **제작 의도별 레시피 분류**를 얹고, 속도·네온·빛줄기·글리치·인쇄 조합을 빠른 시작점으로 제공한다. |
| MediBang Paint | 선택 레이어에 색조, 가우시안 블러, 모자이크, 단색화, 선화 추출을 적용하며, Unsharp Mask와 Lens Blur를 반경·강도로 조절한다. | 스캔 복원·또렷한 먹선·인물 초점 분리처럼 만화 후처리 작업을 엔진 조합으로 제공하고, 과도한 샤픈·블러 중첩을 진단한다. |
| Procreate Adjustments | 전체 레이어 필터와 Pencil 기반 국소 적용을 구분하고, 변경 중 Preview, Apply, Reset, Undo, Cancel 흐름을 제공한다. | 적용 범위를 명확히 설명하고, 레시피의 **추가/교체 모드**를 명시적으로 분리한다. 전체 삭제는 2단계 확인을 요구한다. 국소 적용은 기존 필터 마스크로 연결한다. |
| Infinite Painter | 전체 레이어/선택 영역 필터, 일부 비파괴 Adjustment Layer, 길게 누르는 원본 비교, 초점·틸트·명부·중간톤·암부·채도 빠른 마스크를 제공한다. | 현재 정본 마스크를 재사용하고 비용·순서 진단을 우선 구현한다. 안전한 전후 분할과 톤 기반 빠른 마스크는 렌더 계약 확장 항목으로 명시한다. |
| Affinity Photo Live Filters | 비파괴 Live Filter, 필터 불투명도, 입력 선택과 split before/after 확인을 제공한다. | 항목별 기존 불투명도를 유지하고, 스택 비용과 결과 순서 문제를 작업 전에 표시한다. 진짜 split preview는 캔버스 합성 경계 작업으로 분리한다. |
| Figma Effects | 효과 순서가 렌더 결과에 영향을 주고 효과 복제가 가능하다. 다수의 블러는 성능을 떨어뜨릴 수 있어 가시성 제어가 중요하다. | 항목 복제, 블러/왜곡 중첩 경고, 고비용 효과 수, 권장 미리보기 배율을 추가한다. |
| Photopea Smart Filters | 브라우저 안에서 Smart Object 필터를 수정·비활성화하고 전용 래스터 마스크로 범위를 제한한다. | 서버 왕복 없는 기존 로컬 렌더 경로를 보존하고, 브라우저 작업에 맞는 검색 가능한 조합 카탈로그를 제공한다. |
| GIMP 3 | GEGL 기반 비파괴 필터를 스택으로 다루는 흐름을 제품화했다. | 엔진별 단발 실행이 아니라 **작업 단위의 스택 구성과 상태 진단**을 핵심으로 둔다. |

### 공식 근거

- Photoshop Smart Filters: https://helpx.adobe.com/photoshop/using/applying-smart-filters.html
- Krita Filter Layers: https://docs.krita.org/en/reference_manual/layers_and_masks/filter_layers.html
- Krita Filter Masks: https://docs.krita.org/en/reference_manual/layers_and_masks/filter_masks.html
- Clip Studio Paint 레이어 속성: https://help.clip-studio.com/ko-kr/manual_kr/180_layers/%EB%A0%88%EC%9D%B4%EC%96%B4_%EC%86%8D%EC%84%B1_%ED%8C%94%EB%A0%88%ED%8A%B8___91_PRO__47_EX__93_.htm
- ibisPaint 필터 목록/최근 사용/파라미터 기억: https://ibispaint.com/newFeature.jsp
- ibisPaint 만화 배경 필터: https://ibispaint.com/lecture/index.jsp?no=185
- MediBang Paint 필터 목록: https://medibangpaint.com/en/tutorial/android/filter-tool/
- MediBang Paint Unsharp Mask: https://medibangpaint.com/en/trial/filter02/
- MediBang Paint Lens Blur: https://medibangpaint.com/en/trial/filter01/
- Procreate Adjustments: https://help.procreate.com/procreate/handbook/adjustments/adjustments-interface
- Infinite Painter 필터/원본 비교/Adjustment Layer: https://docs.infinitestudio.art/painter/filters/
- Infinite Painter 필터 빠른 마스크: https://docs.infinitestudio.art/painter/filters/masking/
- Affinity Photo Displace Live Filter: https://affinity.help/photo2ipad/en-US.lproj/pages/Filters/filter_displace.html
- Figma Effects: https://help.figma.com/hc/en-us/articles/360041488473-Apply-effects-to-layers
- Photopea Adjustments & Filters: https://www.photopea.com/learn/adjustments-filters
- GIMP 3.0 RC3 non-destructive filters: https://www.gimp.org/news/2025/02/10/gimp-3-0-RC3-released/

## 3. 현재 저장소 기준선

### 이미 제품 경로에 연결된 기능

- `StudioAdjustmentStack` 기반 비파괴 스마트 필터 문서 모델
- 77개 로컬 필터 엔진 및 검색 가능한 카탈로그
- 항목별 활성화, 불투명도, 위/아래 이동, 삭제
- 이미지 요소 `smartFilters` 저장과 Konva/Worker 렌더 투영
- 필터 마스크 생성·활성화·편집 경로
- 개별 색 보정, 선화, 톤, 재질, 블러, 왜곡 패널

### 확인된 간극

- 엔진이 많지만 제작 목적별 시작점이 없어 사용자가 조합을 직접 탐색해야 한다.
- 필터 순서가 결과에 미치는 영향과 고비용 중첩을 작업 중에 설명하지 않는다.
- 항목 복제가 없어 비슷한 다단 효과를 만들 때 값을 다시 입력해야 한다.
- 전체 스택 교체와 추가의 의도가 레시피 수준에서 구분되지 않는다.
- 기존 `studio-layer-effects-stack.ts`와 패널은 자체 테스트 외 제품 인스펙터·문서·렌더러에 연결되지 않은 별도 모델이다. 이번 변경에서는 이를 억지로 노출하지 않는다.

## 4. 구현

### 4.1 효과 작업공간

`StudioSmartFiltersPanel` 상단에 `StudioEffectsWorkspacePanel`을 배치한다.

- 활성 효과, 꺼진 효과, 0% 효과, 고비용 효과 수
- 상대적 부하 등급과 점수
- 편집 중 권장 미리보기 배율 100% / 75% / 50%
- 스택 위험 메시지 최대 4개 우선 노출
- 추가/교체 모드가 명확한 레시피 적용
- 한국어·영문 태그 검색과 제작 목적 분류
- 기본 화면은 대표 레시피만 노출하고 전체 목록은 명시적으로 확장
- 전체 제거는 같은 버튼을 두 번 눌러야 실행
- 적용 결과와 실패를 `aria-live` 상태 메시지로 제공

### 4.2 제작 레시피 15종

레시피는 기존 엔진의 보수적인 초깃값이며, 최종 결과를 확정하는 파괴적 프리셋이 아니다.

| 분류 | 레시피 | 실제 엔진 조합 |
| --- | --- | --- |
| 복원 | 스캔 원고 복원 | JPEG 압축 깨짐 제거 → 윤곽 보존 노이즈 제거 → 선화 정리 → 스마트 샤픈 |
| 선화 | 또렷한 먹선 | 레벨 → 가우시안 차분 선화 → 스마트 샤픈 |
| 색감 | 사진 → 부드러운 웹툰 | 표면 보존 블러 → 컷아웃 → 스마트 샤픈 |
| 색감 | 셀 채색 팝 | 포스터라이즈 → 밝기/대비 → 색조/채도 → 스마트 샤픈 |
| 색감 | 시네마틱 컷 | 커브 → 섀도우/하이라이트 → 컬러 밸런스 → 필름 그레인 |
| 빛·초점 | 야간 네온 | 컬러 밸런스 → 빛나는 외곽선 → 확산 글로우 → 색수차 |
| 빛·초점 | 회상·몽환 블룸 | 가우시안 블러 → 확산 글로우 → 컬러 밸런스 → 필름 그레인 |
| 빛·초점 | 극적 빛줄기 | 빛줄기 → 확산 글로우 → 컬러 밸런스 |
| 빛·초점 | 인물 초점 분리 | 영역 초점 블러 |
| 동작·왜곡 | 속도·충격 | 모션 블러 → 색수차 → 스마트 샤픈 |
| 동작·왜곡 | 디지털 글리치 | 물결 왜곡 → RGB 노이즈 → 색수차 |
| 인쇄·톤 | 흑백 스크린톤 | 흑백 → 레벨 → 컬러 하프톤(단색) |
| 인쇄·톤 | 레트로 컬러 인쇄 | 포스터라이즈 → 컬러 하프톤 → 레트로 필름 |
| 인쇄·톤 | 복사기 진(Zine) | 포토카피 → 오더드 디더 → 필름 그레인 |
| 재질·화풍 | 수채 종이 | 수채화 → 필름 그레인 |

### 4.3 결정적 스택 진단

점수는 렌더 시간이나 FPS 예측이 아니다. 엔진 종류와 반경·샘플 수·디테일처럼 현재 문서에 저장된 값만 사용하는 하드웨어 독립 휴리스틱이다.

진단 항목:

- 활성 항목 12개 이상의 긴 스택
- 고비용 엔진 3개 이상 중첩
- 블러·복원 계열 3개 이상 중첩
- 기하 왜곡 2개 이상 중첩
- 색상 투명화 뒤에 후속 효과가 있는 알파 경계 위험
- 단색/임계 변환 뒤 색 보정이 놓인 순서 의미
- 같은 엔진 3회 이상 반복
- 활성 상태지만 불투명도 0%인 정리 가능 항목

부하 등급:

- `0..8`: 가벼움, 100% 미리보기
- `9..26`: 균형, 75% 미리보기
- `27+`: 고부하, 50% 미리보기

### 4.4 항목 복제·초기화

각 필터 행에 반복 조합을 위한 복제와 안전한 초기값 복원을 추가한다.

- 복제는 원본 바로 다음 위치에 삽입
- 엔진, 활성화, 불투명도, 파라미터를 그대로 복사
- ID는 `-copy`, `-copy-2` 순으로 충돌 없이 생성
- 초기화는 ID와 활성화 상태를 유지하고 엔진 기본 파라미터·100% 불투명도로 복원
- 모든 쓰기는 기존 1 MiB 직렬화 예산 입장 검증을 통과해야 한다

### 4.5 원자적 레시피 적용

- `append`: 현재 스택 뒤에 전체 레시피를 추가
- `replace`: 기존 스택을 새 레시피로 한 번에 교체
- 각 실행은 `fxr-{recipe}-{run}-{step}` ID를 사용해 반복 적용 충돌을 피한다
- 직렬화 예산 초과나 구조 거부 시 부분 적용하지 않고 기존 스택을 보존한다

## 5. 접근성·사용성

- 검색 입력과 분류·모드 선택에 명시적 레이블/pressed 상태 사용
- 적용·복제·전체 삭제 버튼에 작업 대상이 포함된 접근 가능한 이름 제공
- 포인터 정밀도와 무관하게 최소 터치 높이 유지
- 색만으로 상태를 전달하지 않고 등급 텍스트·점수·경고 제목을 함께 제공
- 삭제는 2단계 확인, 적용은 결과 상태 메시지 제공
- 빈 스택도 “활성 효과 없음” 안내와 시작 방법을 제공

## 6. 의도적으로 제외한 기능

다음은 경쟁 제품에 존재하지만 현재 정본 렌더 계약을 넓혀야 하므로 이번 MR에서 UI만 흉내 내지 않는다.

- 필터별 블렌드 모드: `StudioAdjustmentEntry`와 Worker 합성 프로토콜 확장 필요
- 캔버스 split before/after: 렌더 캐시 두 벌과 드래그 가능한 합성 경계 필요
- 브러시로 직접 칠하는 효과: 기존 필터 마스크 브러시 UX를 확장해야 함
- 그룹/페이지 범위 조정 레이어: 레이어 트리 합성 및 PSD 왕복 계약 필요
- 외부 LUT·플러그인 실행: 파일 입장 검증, 샌드박스, 라이선스·CSP 검토 필요
- 연결되지 않은 별도 `StudioLayerEffectsStack`의 제품 노출: 문서 마이그레이션과 실제 픽셀 합성 구현이 먼저 필요

## 7. 검증 계획

### 자동 테스트

- 모든 레시피 ID 유일성
- 모든 레시피 엔진이 현재 엔진 레지스트리에 존재
- NFKC·구두점 정규화와 다중 키워드 AND 방식의 한국어/영문 태그 검색
- append/replace 적용과 반복 실행 ID 충돌 방지
- 알 수 없는 레시피의 기존 스택 보존
- 항목 복제·초기화와 ID 충돌 처리
- 경량·고부하 등급 및 미리보기 배율
- 블러·왜곡·알파·0%·순서 경고
- UI에서 대표 레시피, 검색, 추가/교체, 2단계 전체 삭제
- 기존 필터 행에 복제 접근성 이름 노출

### 회귀 경계

- 새 엔진 없음
- 저장 스키마 버전 변경 없음
- 데이터베이스/API 변경 없음
- 기존 `smartFilters` 필드와 렌더 투영 사용
- 기존 필터 마스크 경로 변경 없음
- 기존 77개 카탈로그와 파라미터 컨트롤 유지

## 8. 후속 권장 순서

1. 실제 캔버스에서 split before/after를 렌더 캐시 경계와 함께 구현
2. 필터별 블렌드 모드와 Worker 합성 프로토콜을 스키마 버전 업으로 도입
3. 필터 마스크에 Procreate식 Paint/Smudge/Erase 모드와 오버레이 색 제공
4. 사용자 레시피 저장·이름 변경·내보내기/가져오기
5. 문서·페이지 범위 Adjustment Layer를 PSD/ORA 왕복 계약과 함께 구현
6. 실제 장치별 벤치마크에서 휴리스틱 점수를 보정하되 점수와 실측 시간을 계속 구분
