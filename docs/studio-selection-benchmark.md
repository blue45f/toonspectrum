# ToonStudio 선택 기능 벤치마크 및 고도화 기록

- 기준일: 2026-09-09
- 범위: `/studio`의 요소 선택은 유지하고, 이미지 레이어 내부의 **픽셀 선택** 제작·정리·재사용 흐름을 고도화한다.
- 원칙: 기존 `PixelSelection` 벡터 정본, 선택 전용 Undo/Redo, 마술봉·색상 범위의 결합 의미론과 캔버스 safe-area 배치 엔진을 재사용한다. 새 기능 때문에 문서 스키마나 재생 호환성을 깨지 않는다.

## 1. 경쟁 제품에서 확인한 패턴

| 제품 | 공식 자료에서 확인한 패턴 | ToonStudio 반영 |
|---|---|---|
| Adobe Photoshop | 자동/피사체/오브젝트 선택, 선택 경계 확대·축소·페더·스무딩, 선택 이동과 콘텐츠 이동의 구분 | 기존 수동·색상 선택에 로컬 AI 피사체 소스를 추가하고 경계 스무딩을 동일 히스토리에 연결 |
| Clip Studio Paint | 선택 경계 가까이에 이동·커스터마이즈 가능한 Selection Launcher를 노출하고 해제·반전·확대·축소·복사·변형을 실행 | 픽셀 선택 전용 HUD를 선택 대상 근처에 고정 오버레이로 배치하고 요소 선택 바와 상호 배타적으로 표시 |
| Krita | 현재 레이어의 불투명 픽셀을 Replace/Add/Subtract/Intersection으로 선택하며 Grow/Shrink/Border/Smooth 제공 | 레이어 알파 선택을 기존 네 가지 결합 모드에 직접 연결하고 면적 보존 스무딩 제공 |
| Procreate | Automatic/Freehand/Rectangle/Ellipse, 실시간 Threshold, Select Layer Contents, Save & Load 제공 | 기존 제스처 도구는 유지하고 AI 임계값, 레이어 알파, 이름 기반 저장·불러오기 제공 |
| Affinity Photo | Flood/Paint/Range/Luminosity/Channel/Subject ML/Refine/Outline/Save-Load 등 다중 선택 소스와 수정 흐름 | 이번 변경은 알파·피사체·경계 정리·로컬 재사용을 우선하고 채널/광도/영구 문서 채널은 후속 범위로 기록 |
| GIMP | Replace/Add/Subtract/Intersect, 안티앨리어싱·페더, 선택 프레임 이동과 선택 콘텐츠 이동을 명확히 구분 | 기존 결합 규칙을 유지하고 HUD의 명령을 선택 상태 변환으로만 제한해 콘텐츠 변형 명령과 혼동하지 않음 |

### 공식 참고 자료

- Adobe Photoshop — [Make selections](https://helpx.adobe.com/photoshop/desktop/make-selections.html)
- Adobe Photoshop — [Expand or contract a selection](https://helpx.adobe.com/photoshop/desktop/make-selections/refine-modify-selections/expand-or-contract-selection.html)
- Clip Studio Paint — [Selection Launcher](https://help.clip-studio.com/en-us/manual_en/330_selection/Selection_Launcher.htm)
- Clip Studio Paint — [Advanced Selection Functions](https://help.clip-studio.com/en-us/manual_en/330_selection/Advanced_Selection_Functions.htm)
- Krita — [Select Menu](https://docs.krita.org/en/reference_manual/main_menu/select_menu.html)
- Krita — [Contiguous Selection Tool](https://docs.krita.org/en/reference_manual/tools/contiguous_select.html)
- Procreate — [Selections](https://help.procreate.com/procreate/handbook/selections/selections)
- Procreate — [Advanced Selections](https://help.procreate.com/procreate/handbook/selections/selections-advanced)
- Affinity Photo — [Selections](https://affinity.help/photo2/en-US.lproj/index.html?page=pages/Selections/selections.html)
- GIMP — [Selection Tools](https://docs.gimp.org/3.0/en/gimp-tools-selection.html)

## 2. 기존 제품 기준선

ToonStudio는 이미 다음 기능을 제공한다.

- 사각형·타원·자유형 올가미·다각형 올가미·브러시·마술봉·색상 범위 선택
- 새 선택/추가/빼기/교차와 Shift·Alt/Option 조합
- 선택 전용 Undo/Redo, 전체 선택·해제·반전
- 페더·확장·축소·이동·회전·반전·스케일
- 선택 콘텐츠 복사/잘라내기·새 레이어 추출·부분 보정·콘텐츠 인식 채우기
- 퀵 마스크, 레이어 마스크 생성, 선택 경계 오버레이

따라서 이번 변경은 기존 도구를 다시 만드는 대신 **선택 소스, 경계 품질, 맥락형 조작, 재사용**의 결손을 메운다.

## 3. 구현 결과

### 3.1 선택 소스

#### 레이어 불투명도 선택

- 검증된 이미지 소스를 긴 변 최대 640px로 읽고 RGBA 중 알파만 추출한다.
- 반투명 픽셀을 유지한 소프트 마스크를 기존 색상 범위 윤곽 추적기로 벡터 선택으로 변환한다.
- 좌우·상하 반전된 레이어는 표시 좌표계에 맞게 마스크를 뒤집는다.
- 이미지 축 최대 8,192px, 전체 16,777,216픽셀의 명시적 안전 상한을 둔다.

#### 온디바이스 AI 피사체 선택

- 기존 `studio-bg-remove`의 MediaPipe Image Segmenter를 동적 로드한다.
- 원본 이미지 바이트는 서버로 업로드하지 않고 기기에서 전경 신뢰도를 계산한다.
- 10–90% 범위의 경계 임계값과 부드러운 전이 구간을 사용한다.
- 가능하면 모델 신뢰도와 원본 알파를 곱해 투명 패딩이 피사체로 선택되는 것을 막는다.
- CORS로 픽셀 읽기가 막히면 의미 분할 결과는 유지하되 상태 메시지에 원본 알파 결합 생략을 알린다.
- 작업 교체·레이어 전환·언마운트 시 `AbortController`로 진행 중 분석을 취소한다.

#### 결합 의미론 통합

레이어 알파와 AI 피사체 결과는 별도 선택 모델을 만들지 않는다. 사각·올가미·마술봉·색상 범위와 같은 코어 경로를 통해 다음 작업을 수행한다.

1. 새 선택(Replace)
2. 추가(Add)
3. 빼기(Subtract)
4. 교차(Intersection)

교차는 경계 박스 근사가 아니라 기존 선택으로 마스크 픽셀을 필터링한 뒤 윤곽을 다시 추적한다. 새 선택에서도 사용자가 설정한 페더 값은 보존한다.

### 3.2 선택 경계 정리

- 가볍게/균형/강하게 세 단계의 결정적 스무딩 프리셋을 제공한다.
- 닫힌 폴리곤은 제한된 라플라시안 완화 후 중심과 면적을 복원한다.
- 브러시 선택은 시작점·끝점·반경을 보존한다.
- 점 수를 증가시키지 않고 패스 수 1–6회, 강도 0.05–0.45로 제한한다.
- 모든 결과 좌표를 유한 범위로 정규화하고 입력 객체를 변경하지 않는다.
- 선택 전용 Undo/Redo 스택에는 기존 `transform` 작업으로 기록한다.

### 3.3 선택 작업대

이미지 인스펙터의 선택·리터치 탭에 다음을 한 곳으로 모은다.

- 레이어 불투명도로 선택
- 로컬 AI로 피사체 선택
- AI 경계 임계값
- 경계 스무딩 프리셋
- 이름을 붙인 선택 저장·불러오기·삭제
- 현재 새 선택/추가/빼기/교차 모드 표시
- 작업 중·소스 없음·경계 없음·저장소 차단 상태의 명시적 설명

모든 비동기 상태는 `aria-busy`, 결과·오류는 `role=status`와 polite live region으로 전달한다.

### 3.4 캔버스 Pixel Selection HUD

- 픽셀 선택이 존재할 때 선택 대상 가까이에 body 포털·`position: fixed` 오버레이로 표시한다.
- 기존 요소 선택 컨텍스트 바와 같은 safe-area/뷰포트/장애물 회피 배치기를 사용한다.
- 포인터 이동·스크롤·확대/축소·시각 뷰포트 변화에 `requestAnimationFrame`으로 위치를 갱신한다.
- 협업 프레즌스 독을 장애물로 인식하고 250ms 캐시로 과도한 DOM 측정을 피한다.
- 새 선택/추가/빼기/교차, 확장, 축소, 스무딩, 페더 ±2px, 페더 직접 수치 입력, 반전, 해제를 제공한다.
- 요소 선택 바는 픽셀 선택 HUD가 떠 있는 동안 숨겨 겹침과 명령 의미 혼동을 방지한다.
- 검토 잠금·페이지 잠금·픽셀 작업 중에는 모든 변경 명령을 잠근다.
- coarse pointer에서 40–44px 수준의 터치 타깃을 사용하고 좁은 화면에서는 HUD 내부만 가로 스크롤한다.
- 캔버스 레이아웃 흐름 밖에 있으므로 선택 생성·해제 때 캔버스 원점이나 높이를 바꾸지 않는다.

### 3.5 저장된 선택

- 현재 선택을 이름으로 저장하고 같은 이미지에서 다시 불러오거나 삭제한다.
- 이미지 단위·기기 로컬 저장이며 프로젝트/협업 데이터에는 포함하지 않는다.
- 버전 1 스키마, 16개 상한, 이름 48자, 직렬화 512KB 상한을 둔다.
- 로드 시 기존 `normalizePixelSelection`으로 좌표·서브패스·페더를 다시 검증한다.
- 동일 이름은 대소문자와 무관하게 갱신해 중복 폭주를 막는다.
- localStorage 접근·용량·보안 예외는 UI 오류로 격리하고 편집기 렌더를 깨지 않는다.
- 다른 탭에서 같은 범위가 갱신되면 `storage` 이벤트로 라이브러리를 다시 읽는다.

## 4. 데이터·호환성 결정

`PixelSelection`은 폴리곤/브러시 서브패스와 전역 `featherPx`를 저장하는 벡터 모델이다. AI/알파 소스는 내부에서 소프트 마스크를 만들지만 문서 정본으로 들어갈 때 임계 경계에서 벡터 윤곽으로 변환한다.

이 결정을 유지한 이유는 다음과 같다.

- 기존 마술봉·색상 범위·퀵 마스크·부분 조정·콘텐츠 변형과 즉시 호환된다.
- 문서 스키마, CRDT, 재생 및 내보내기 형식을 바꾸지 않는다.
- 선택 전용 Undo/Redo가 그대로 작동한다.
- 대용량 원본 마스크를 문서나 협업 스트림에 보관하지 않아 저장·동기화 비용이 예측 가능하다.

제약도 숨기지 않는다. 부위별 소프트 알파를 영구 보존하지 않으므로 최종 가장자리 부드러움은 전역 페더가 담당한다.

## 5. 후속 범위

다음 기능은 별도 데이터·명령 설계가 필요하므로 이번 변경에서 구현된 것처럼 표시하지 않는다.

- 프로젝트/CRDT에 영구 저장되는 Named Selection 채널
- 저장 선택 썸네일과 폴더·검색·동기화
- Border Selection과 안쪽/중앙/바깥쪽 경계 선택은 [2026-09-12 고도화 기록](studio-selection-border-benchmark-2026-09-12.md)에서 구현했다.
- 모든 표시 레이어·라벨 레이어·광도·채널 기반 선택
- 선택 런처 명령 커스터마이즈
- 라이브 피사체 미리보기와 정교한 전경/배경 브러시 보정
- 선택 경계와 선택 콘텐츠 이동 모드의 캔버스 직접 토글

## 6. 검증 게이트

- 순수 코어: 스무딩 거칠기 감소, 면적·중심·점 수 보존, 브러시 끝점·반경 보존
- 마스크: RGBA 알파 추출, 신뢰도 소프트 임계, 알파 곱, 반전 좌표 정합
- 의미론: Replace/Add/Subtract/Intersection과 페더 유지
- 저장소: 직렬화 왕복, 중복 갱신, 16개 상한, 손상·과대 입력 방어, 저장소 예외 격리
- UI: 작업대/HUD 접근 가능한 이름, 잠금, 전체 선택, 정밀 페더 입력
- 배치: body 포털·fixed 오버레이, safe-area, 거리 예산, 투영 불가 시 숨김
- 통합: 인스펙터 연결, 선택 히스토리 연결, 요소 선택 바 충돌 방지, 메뉴 감사표의 정직한 partial 상태
- 리포지토리: 변경 파일 ESLint, workspace TypeScript, 아키텍처·메뉴·캔버스 표면 검증, 프로덕션 빌드
