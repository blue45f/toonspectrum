# Studio 보기 기능 벤치마크 및 고도화 설계

- 기준일: 2026-09-09
- 대상: `/studio` 보기(View) 기능
- 원칙: 문서 편집과 보기 상태를 분리하고, 검수 속도와 현재 상태의 가시성을 높인다.

## 1. 벤치마크 요약

| 제품 | 확인한 강점 | ToonStudio 적용 판단 |
| --- | --- | --- |
| Clip Studio Paint 5 | Navigator 안에서 확대·축소, 화면 맞춤, 회전, 반전, 회전 초기화를 함께 제공한다. `Reset Display`는 배율·회전·반전을 한 번에 정상화한다. 보기 반전은 캔버스 데이터를 변형하지 않는다. | 기존 Navigator 진입점에 보기 검수 허브를 결합한다. 배율·회전·반전 상태를 항상 표시하고 선택 맞춤·폭 맞춤·100%·초기화를 한곳에 모은다. |
| Krita 5.3 | Canvas Only, Full Screen, Detach Canvas, Wrap-around, Instant Preview, Soft Proofing, Out-of-gamut, Mirror View, Ruler/Guide/Grid/Pixel Grid 등 제작과 검수를 구분한 보기 명령이 폭넓다. | 현재 구현된 집중 모드·색각 미리보기·가이드 기능은 재사용한다. 이번 변경은 픽셀 검수와 성능 진단을 우선하고, ICC 소프트 프루프는 별도 색관리 프로젝트로 분리한다. |
| Adobe Photoshop | Navigator의 proxy 영역, 비파괴 Rotate View, 화면 모드, 100% Actual Pixels를 명확히 구분한다. 100%는 이미지 픽셀과 디스플레이 픽셀을 1:1로 확인하는 핵심 검수 지점이다. | 기존 실제 픽셀 명령을 보기 허브의 1차 액션으로 승격하고, 회전·반전이 비파괴 보기 상태임을 UI 문구로 명확히 한다. |
| Figma Design | Zoom/View 메뉴에 Pixel preview 1x/2x, Pixel grid, outline 보기 등을 모은다. Pixel preview는 벡터를 래스터 결과로 검수하고, 보기 설정은 개인 뷰에만 적용한다. | 보기 설정을 세션 전용으로 유지한다. 이번 1차 버전은 래스터 표면 보간을 끄는 픽셀 경계 모드이며, 벡터 1x/2x 래스터 프루프는 후속 렌더 파이프라인 과제로 명시한다. |
| Photopea | Space 임시 Hand, 빠른 Zoom, 비파괴 Rotate View, Reset, Ruler를 웹 편집기에서 일관되게 제공한다. | 이미 존재하는 Hand/Zoom/Rotate 명령을 새로 복제하지 않고 동일 핸들러를 보기 허브에서 호출한다. |

## 2. 공식 자료

- Clip Studio Paint, Navigating the canvas: <https://help.clip-studio.com/en-us/manual_en/270_canvas/Navigating_the_canvas.htm>
- Krita Manual, View Menu: <https://docs.krita.org/en/reference_manual/main_menu/view_menu.html>
- Adobe Photoshop, View images: <https://helpx.adobe.com/photoshop/using/viewing-images.html>
- Adobe Photoshop, Rotate View tool: <https://helpx.adobe.com/photoshop/using/tool-techniques/rotate-view-tool.html>
- Figma, Adjust your zoom and view options: <https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options>
- Figma, View layer outlines: <https://help.figma.com/hc/en-us/articles/5724448965527-View-layer-outlines-in-Figma-Design>
- Photopea, Navigation: <https://www.photopea.com/learn/navigation>

## 3. 기존 기능 인벤토리

코드 기준으로 다음 기능은 이미 존재한다.

- 확대·축소, 폭 맞춤, 실제 픽셀
- 선택 영역 맞춤 확대
- 좌우 반전, 90도 회전, 보기 초기화
- 전체 화면과 캔버스 집중 모드
- 원본·흑백·적색맹·녹색맹·청색맹 미리보기
- 보기 저장·복원
- 원근 가이드, 그리드, 밑그림 오버레이
- Navigator/미니맵

기능 자체보다 다음 문제가 컸다.

1. 선택 맞춤·100%·회전·반전·초기화가 서로 다른 UI에 흩어져 있다.
2. 현재 배율·회전·반전·선택 상태를 한 번에 확인하기 어렵다.
3. 픽셀 경계 검수와 실제 렌더 성능을 빠르게 확인할 진입점이 없다.
4. 새 메뉴 행을 늘리면 강한 명령 카탈로그·IA 드리프트 가드와 충돌한다.

## 4. 구현 결정

### 4.1 기존 Navigator 명령을 보기 검수 허브로 고도화

`View > 미니맵 · 탐색`의 명령 ID와 기존 Navigator 동작을 유지한다. 선택 시 Navigator를 열면서 캔버스 위에 `보기 진단` companion HUD를 함께 연다.

이 방식의 장점은 다음과 같다.

- 명령 ID·메뉴 순서·접근 경로를 바꾸지 않는다.
- 기존 단축키와 명령 카탈로그의 안정성을 유지한다.
- 실제 캔버스 핸들러를 재사용하므로 중복 상태가 생기지 않는다.
- 사용자는 탐색과 검수를 같은 맥락에서 수행한다.

### 4.2 통합 보기 액션

보기 진단 패널에서 다음 기존 핸들러를 직접 호출한다.

- 선택 영역 맞춤
- 폭에 맞춤
- 실제 픽셀 100%
- 보기 초기화
- 왼쪽/오른쪽 90도 회전
- 좌우 반전 검수

패널 상단에는 확대율, 정규화된 회전각, 반전 여부, 선택 개수를 표시한다. 선택 항목이 없거나 뷰 변환이 잠긴 경우 버튼을 비활성화하고 이유를 `title`로 제공한다.

### 4.3 래스터 픽셀 경계 모드

캔버스 스크롤 뷰포트에 `image-rendering: pixelated`와 `data-studio-pixel-preview`를 세션 동안 적용한다. 확대 상태에서 브라우저 보간으로 흐려지는 래스터 경계를 빠르게 확인하는 기능이다.

정확한 제품 경계는 다음과 같다.

- 문서 픽셀, 레이어, 벡터, 텍스트, 내보내기 결과를 수정하지 않는다.
- ICC 색관리 또는 Figma 방식의 벡터 1x/2x 전체 래스터화가 아니다.
- 패널을 닫아도 사용자가 켠 검수 모드는 유지되고, 상단 chip에서 즉시 끌 수 있다.

### 4.4 저부하 렌더 성능 HUD

`requestAnimationFrame` 샘플을 약 750ms 단위로 집계해 다음 값을 보여준다.

- FPS
- 평균 프레임 시간
- P95 프레임 시간
- 60Hz 기준 느린 프레임 비율
- devicePixelRatio
- 뷰포트 크기
- 확대율, 회전각, 반전 상태

숨겨진 탭의 장시간 프레임과 1초를 초과한 중단 구간은 제외한다. 최대 180개 최근 샘플만 계산하고, 측정이 꺼지면 루프도 해제한다.

## 5. 상태 및 데이터 경계

보기 진단은 작은 external store로 관리한다.

- React `useSyncExternalStore` 계약을 따른다.
- snapshot은 immutable이다.
- 실제 상태 전환 때만 subscriber를 알린다.
- 브라우저 세션을 벗어나면 초기화된다.

의도적으로 다음 영역에는 저장하지 않는다.

- 작품 문서 및 레이어 데이터
- CRDT/실시간 협업 payload
- autosave와 draft
- Neon/Postgres
- 내보내기 metadata

보기 설정은 개인 관찰 상태이므로 협업자에게 전파하거나 작품 데이터로 영속화하면 안 된다. 따라서 이번 변경에는 Neon migration이 없다.

## 6. 접근성 및 조작 원칙

- 모든 액션은 실제 `button` 요소와 명시적인 라벨을 사용한다.
- toggle은 `aria-pressed`로 상태를 노출한다.
- panel 제목은 `aria-labelledby`로 연결한다.
- 동적으로 갱신되는 성능 값은 live region으로 선언하지 않아 스크린리더 알림 폭주를 막는다.
- overlay 바깥은 `pointer-events: none`으로 캔버스 입력을 차단하지 않는다.
- 진단을 꺼도 원래 캔버스 스타일과 data attribute를 복원한다.

## 7. 검증 범위

추가 단위 테스트는 다음을 보장한다.

- panel open/close와 진단 toggle이 독립적으로 동작한다.
- no-op 상태 변경은 subscriber를 중복 호출하지 않는다.
- immutable snapshot을 유지한다.
- 잘못된/중단된 프레임 샘플을 제외한다.
- FPS, 평균, P95, 느린 프레임 비율 계산이 결정적이다.
- percentage/scale 형태의 확대율을 모두 정규화한다.
- 기존 Navigator 명령이 Navigator와 보기 진단을 함께 연다.

## 8. 후속 고도화 후보

이번 범위를 넘는 기능은 별도 설계가 필요하다.

1. ICC profile 기반 CMYK/인쇄 소프트 프루프와 out-of-gamut overlay
2. 벡터·텍스트를 포함한 1x/2x 전체 래스터 프루프
3. 레이어 outline/X-ray 보기와 숨김·clip 포함 옵션
4. 멀티모니터 detachable canvas
5. 세로 반전, 임의 각도 입력, 사용자 회전 step
6. pixel grid의 실제 캔버스 좌표 정렬 및 400% 이상 자동 표시
7. 성능 HUD의 렌더러별 CPU/GPU breakdown과 long-task 연계
