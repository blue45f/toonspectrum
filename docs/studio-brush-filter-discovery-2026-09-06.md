# 브러시·필터 탐색 개선 — 2026-09-06

## 비교 근거

공식 사용 설명서를 기준으로 조작 패턴만 참고했다. 외부 브러시, 텍스처, 화면 디자인 자산을 복제하지 않는다.

| 서비스 | 확인한 패턴 | 이번 적용 |
| --- | --- | --- |
| CLIP STUDIO PAINT | 서브 도구 그룹, 획/타일/이름 보기, 기본 속성과 상세 설정 분리 | 간편 분류, 획 특징 예시와 용도 설명, 작은 선택면 |
| Procreate | 최근 사용, 브러시 이름 검색, 이전 라이브러리 보존 | 개인 목록 검색 범위 유지, 옛 이름 검색, 기존 ID 보존 |
| Krita | 태그·이름 검색과 브러시 미리보기 | 여러 단어 AND 검색, 한글 정규화, 재질 이름 통일 |
| Photoshop | 필터 범주, 이미지 미리보기, 필터별 조절 | 흐림/빛/복원/스타일의 분리, 카드 예시와 실제 결과 구별 |
| Affinity | 조정 가능한 라이브 필터와 필터 계열 분리 | 비파괴 적용 경로는 유지하고 탐색 정보만 개선 |
| MediBang Paint | 브러시 선택과 설정·미리보기 구분 | 짧은 이름과 설명을 분리하고 현재 선택을 보존 |

공식 자료:
- https://help.clip-studio.com/en-us/manual_en/150_tools/Customizing_the_Tool_and_Sub_Tool_palettes.htm
- https://help.procreate.com/procreate/handbook/brushes/brush-library
- https://help.procreate.com/articles/OIxjx1-where-did-my-brushes-go
- https://docs.krita.org/en/user_manual/tag_management.html
- https://docs.krita.org/en/reference_manual/resource_management/paintoppresets.html
- https://helpx.adobe.com/photoshop/desktop/effects-filters/get-started-with-filters/filter-gallery.html
- https://www.affinity.studio/help/layers-livefilters/
- https://medibangpaint.com/en/tutorial/pc/other-tools/
- https://react.dev/reference/react/useId

## 브러시 축소의 정확한 범위

간편 서브 도구는 23개에서 18개로 줄였다. 물감 채색에서 빠져 있던 반투명 마커를 추가하고, perfect-ink/pencil-grain/inkwash-pen/inkwash-water-brush/brush/hard-airbrush 여섯 항목은 간편 목록에서 제외했다. 이는 서로 같은 렌더링이라는 판정이 아니다. 먼저 보이는 선택지를 줄이는 편집 결정이다. 해당 여섯 항목은 검색·전체 라이브러리·저장된 문서에서 계속 원래 ID로 사용한다.

등록 ID 330개, 선택 가능 항목 187개, 기존 품질 대표 목록 48개, 격리 정책은 변경하지 않는다. 브러시 숫자 축소를 위해 검사 대상, 품질 임계값, 렌더러, 필압 곡선, 불투명도, 기본 굵기를 변경하지 않는다.

간편 분류는 펜·선화 / 연필·목탄 / 채색·물감 / 분사·입자 / 지우개 / 만화·톤이다. 각 행은 짧은 이름, 차이가 드러나는 용도 설명, 기존 런타임 계약에서 파생한 획 특징 예시를 갖는다. 이 SVG는 정밀한 실제 획 캡처가 아니다. 실제 렌더 결과는 브라우저 획 검증의 증거와 별도로 확인한다.

검색은 전각 영문·조합형 한글을 NFKC로 정규화하고 공백으로 나눈 모든 단어를 찾는다. 정규식으로 실행하지 않는다. 즐겨찾기·최근 사용 안에서 검색할 때는 범위가 전체 목록으로 바뀌지 않고, 중복 ID는 첫 번째 순서를 유지하여 한 번만 노출된다.

## 필터 재분류와 명칭

77개 엔진과 49개 대화상자 kind는 유지한다. 범주는 밝기·명암 / 색상 보정 / 흐림·초점 / 선명도 / 선화·복원 / 빛·렌즈 / 그림체·스타일 / 질감·노이즈 / 변형·왜곡이다. 빛줄기·글로우는 흐림에서 분리하고, 복원과 스타일 변환을 선명도에서 분리했다.

번역투 명칭은 영역 초점 블러, 이음매 없는 블러, JPEG 압축 깨짐 제거, 윤곽 보존 노이즈 제거, 물결 왜곡, 동심원 물결, 소용돌이, 오므리기 / 부풀리기, 점묘화, 복사기 효과, 빛줄기, 흑백 이진화로 개선했다. 이전 명칭을 검색 별칭으로 유지한다. 메뉴 레지스트리·파라미터 스키마·갤러리 표시는 같은 명칭을 사용한다.

카드 이미지는 효과의 개념 예시이며 실제 작품의 적용 결과가 아님을 명시한다. 기존 적용·취소·원본 비교·비파괴 처리 엔진은 변경하지 않는다.

## 검증 범위

단위 테스트는 ID 보존, 기본 물성, 이전 명칭, 검색 범위, 한글/영문 정규화, 18개 간편 항목, 9개 필터 그룹, 명칭 일치, 키보드 포커스와 선택의 분리, 인스턴스별 접근성 ID를 검증한다.

`verify-studio-discovery-ux.mts`는 실제 컴포넌트를 320/390/1440px와 밝은/어두운 테마에서 검사하고, 별도로 production bundle의 실제 스튜디오 인스펙터와 필터 갤러리를 조작한다. 격리 컴포넌트 결과를 전체 스튜디오 모바일 검증으로 표현하지 않는다.

기존 브러시 verifier의 명시적 18개 부분집합과 필터 verifier를 그대로 사용한다. 모든 187개 브러시의 장기 안정성 확보나 모든 브라우저·펜 하드웨어의 검증을 의미하지 않는다. 실행 결과는 Actions 로그와 업로드된 receipt/스크린샷에서 확인한다. 문서 작성 자체를 테스트 통과로 간주하지 않는다.
