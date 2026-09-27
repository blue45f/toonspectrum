# 가상 스튜디오 경험 개선·검증 기록 — 2026-09-27

상태: **migration**. 현재 작업 브랜치에 구현된 변경과 실행한 검증을 기록한다. 운영 반영, 최종 CI 통과, 모든 개선 과제의 완료를 뜻하지 않는다.

기준 브랜치는 `codex/virtual-studio-experience-20260927`, 작업 시작 HEAD는 `2ac94220c9b0115348a734d0b7f7769e800d42db`다. 아래 `current`는 해당 브랜치의 source/tests로 확인한 구현이고, `target`은 추가로 확인하거나 구현해야 할 범위다. 검증 수치는 실행 시점의 결과이며 이후 수정까지 자동으로 보증하지 않는다.

## 관찰과 문제의 근거

2026-09-27 운영 [가상 스튜디오](https://www.toonstudio.cloud/studio/space)를 390×844 뷰포트로 열어 입장했다. 캐릭터와 바닥이 크게 확대되어 주변 공간과 이동 방향을 파악할 수 있는 범위가 좁았다. 운영 스크린샷은 이 기록 작성 시 저장하지 않았으므로 정량 성능이나 운영 전반의 장애로 확대해 해석하지 않는다.

현재 저장소에서는 별도로 다음 연결 문제를 확인했다.

| 영역 | 변경 전 코드에서 확인한 문제 | 사용자 영향 |
| --- | --- | --- |
| 카메라 | 확대 비율이 렌더링 해상도와 DPR에 얽혀 작은 화면의 가시 영역을 충분히 고려하지 않았다. | 세로 화면에서 주변 맥락이 좁아진다. 운영 관찰과 일치하는 원인 후보다. |
| 이동·가구 | 사용자 가구의 렌더링 충돌과 경로 탐색이 같은 월드 정보를 쓰지 않았고 경유점 단축도 지형 규칙을 일관되게 적용하지 않았다. | 경로가 가구나 통행 불가 지형을 통과할 수 있다. |
| 배치 저장·편집 | 장식 저장 키가 전역이고 기존 1280×960 좌표를 작은 장소에 그대로 쓰며 개별 이동·회전·크기 편집 연결이 부족했다. | 다른 작품·장소의 배치가 섞이거나 지도 밖 배치와 제한적인 편집 경험이 생긴다. |
| 업무 안내 | 공정 이름의 부분 문자열로 목적지를 판단하고 현재 월드의 spawn을 찾았다. 상태 식별자가 그대로 보이는 항목도 있었다. | storyboard 등 공정이 잘못 분류되거나 다른 장소로 가야 할 업무가 현재 장소에 머문다. |
| 모바일·모달 | 작은 글씨와 부족한 모바일 검색 진입점, 명시적인 모달 포커스·복원 계약이 없는 동작 선택 창이 있었다. | 방·팀원 탐색과 키보드·터치 조작의 연속성이 떨어진다. |

로컬 검증 중 API를 실행하지 않아 표시된 온라인 기능 제한 안내는 운영 장애의 증거가 아니다. 공통 계약 패키지의 기존 import 실패도 별도의 선행 복구 범위로 기록한다.

## 현재 구현 — current

### 이동과 화면 표현

- `studioWorldCanTraverse`로 경로 계획과 경유점 단축의 충돌·지형·높이 판단을 통일했다.
- 가구의 회전·크기를 반영한 발밑 충돌 범위를 Arcade Physics, 플레이어 길찾기, NPC 경로 갱신이 공유한다. 가구 변경 시 NPC의 생활 상태를 유지하며 막힌 동선만 다시 계획한다.
- 카메라 배율은 CSS 뷰포트 크기로 계산하고 DPR은 렌더링 해상도에 반영한다. 세로 화면에서 주변 이동 공간을 확보한다.
- 원경은 종횡비를 유지해 표시하고 배경 밀도 선택은 주변 생물·날씨·조명 연출량에 연결한다. 기능이나 협업 권한을 줄이는 설정이 아니다.

핵심 소스는 [Phaser 렌더러](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx), [경로 탐색](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-pathfinding.ts), [표현 계산](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-presentation.ts), [NPC 감독](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-npc-director.ts)이다.

### 장소와 가구 편집

- 가구 배치를 작품, 월드 범위, 편집 모드별로 저장한다. 저장 실패 시 현재 화면의 변경을 보존하고 기기 저장 실패를 알린다. 이 저장은 브라우저 로컬 설정이며 서버의 공유 월드 게시 권한을 대신하지 않는다.
- 저장본에 월드 크기를 포함하고 기존 1280×960 배치를 현재 장소 크기로 한 번 투영한다.
- 가구 선택, 지도 바닥 클릭 이동, 방향 버튼, 화살표 키, Shift 미세 조정, 90도 회전, 크기 조절, 삭제를 제공한다. 주요 모바일 조작 버튼은 최소 44px 높이다.
- 추가·이동·회전·프리셋·블루프린트 배치는 가구 겹침, 지도 경계, 플레이어, 출입구, 작업 자리와 연결 동선을 검사한다. 묶음 배치는 전체가 안전할 때 한 번에 적용한다.
- 배치 실행 취소·다시 실행은 최대 24개 과거 상태를 보관한다. 후속 수정으로 복원할 가구가 현재 플레이어 위치를 덮으면 복원을 거부하고 이동 후 재시도를 안내한다.
- 일곱 배경 장소 선택을 원경·시간·날씨 조합에 연결했다. 같은 장소를 다시 눌러도 해당 분위기를 다시 적용할 수 있도록 명시적인 선택 콜백을 추가했다. 환경은 이후 개별 조정할 수 있다.

핵심 소스는 [배치 모델](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-decoration-layout.ts), [편집 UI](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceDecorationEditor.tsx), [꾸미기 패널](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceCustomizationPanel.tsx), [장소 환경 연결](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-scene-direction.ts)이다.

### 생성 아트와 출처

첫 생성 묶음으로 내장 `image_gen` 도구의 PNG 6개를 실제 화면에 연결했다. 이후 추가한 테마 캐릭터와 NPC는 아래에 구분한다. [아트 원장](../../apps/web/public/assets/virtual-studio/experience-v8/art-manifest.json)에 프롬프트, 파일명, 바이트 수, SHA-256과 생성 출처를 남겼다.

| 자산 | 실제 파일·규격 | 연결 범위 |
| --- | --- | --- |
| 공중섬·숲·해안·야경 원경 | `sky.png`, `forest.png`, `coast.png`, `city.png`; 각 1536×1024 | 네 가지 배경 환경 |
| 초기 가구 16종 | `furniture.png`; 1254×1254, 투명 4×4 atlas | 기존 장식과 드로잉 데스크·책장·원고 리뷰 보드·소파의 초기 연결. 이후 스타일별 원본 자산을 추가했다. |
| 지형 재질 16종 | `terrain.png`; 1254×1254, 4×4 atlas | 내장 공중섬 타일맵의 표시 재질. 사용자 타일맵과 논리 좌표를 보존한다. |

생성 도구가 모델 버전을 노출하지 않아 **ImageGen 2.5 사용 여부를 확인하거나 인증할 수 없다**. 원장의 `modelVersion`은 `null`로 유지한다. 배경·환경과 장소 선택 화면에 노출되던 모델 기술명은 각각 나만의 공간 연출, 다양한 작업 공간으로 바꿔 특정 버전을 보증하는 UI 표현을 제거했다. 요청 해상도와 실제 출력 크기를 구분하고 가구 프레임은 실제 1254px 크기를 기준으로 분할한다. 지형은 313.5px 셀을 표시용으로 사용한다.

원장에 보존한 외부 이미지 생성 프롬프트는 재현 근거이므로 영어 원문을 유지하는 언어 정책 예외다. 사용자 UI와 이 문서의 설명은 한글을 기본으로 한다. 생성 여부와 파일 무결성 확인은 모든 타일 경계가 시각적으로 완전하게 이어진다는 증명과 다르다.

후속으로 웹툰·파스텔·레트로·먹선·네온마다 하늘·숲·해안·야경 원경 4개를 별도 생성해 PNG 20개를 추가했다. 기존 공중섬 원경 4개와 합쳐 **6개 스타일 × 4개 배경의 24개 독립 원본**이며 모두 실제 1536×1024다. 환경 선택 URL은 현재 스타일의 원본을 가리킨다. 가구·랜드마크·바닥과 함께 원경도 스타일별 작화를 사용한다.

현재 일반 아트 원장에는 PNG 50개, 별도 NPC 원장에는 4개가 등록되어 있다. [전체 자산 무결성 테스트](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-experience-integrity.test.ts)는 디렉터리의 PNG 54개와 두 원장의 목록이 일치하는지, 모든 파일의 SHA-256·바이트 수·PNG 형식·치수가 일치하는지 확인한다. 원경 URL 도우미를 직접 사용해 24개 URL의 실제 파일과 원장 연결, 서로 다른 원본 해시도 검사했다. 이번 게이트는 PNG를 압축하거나 편집하지 않았다.

### 테마 캐릭터와 전용 NPC

- 공중섬·웹툰·파스텔·레트로·먹선·네온에 서로 다른 원본 플레이어 PNG 6개를 등록했다. 다섯 원본은 1536×1024, 네온은 1774×887이다. 각 원본은 아래·오른쪽·왼쪽·위의 네 방향과 걷기 4장, 대화, 인사, 앉기, 작화·검수 동작을 담은 32개 프레임을 제공한다.
- 테마 대표 캐릭터는 명시적으로 선택해야 적용된다. 테마 전환으로 기존 사용자의 캐릭터 정체성을 자동 교체하지 않으며 전용 원본을 다른 테마 색으로 다시 칠하지 않는다.
- 실제 생성 위치가 균등 격자와 일치하지 않는 원본은 알파 영역을 읽어 측정한 정수 사각형으로 표시한다. PNG를 재가공하지 않고 프레임별 폭·높이, 발 기준, 머리 상부 중심을 메타데이터로 기록한다. 팔 동작이 넓어져도 전체 외곽 너비가 캐릭터 가로 기준을 끌고 가지 않도록 했다.
- 안내 로봇·검수 코디네이터·자료 사서·카페 직원에 전용 NPC 원본 4개를 연결했다. 각각 1774×887의 32프레임이며 합계 6,989,292바이트다. 기존 8개 NPC의 식별자와 업무 목적·동선을 보존하고, 신규 네 캐릭터는 플레이어 선택 목록에 노출하지 않는다. 한 NPC의 걷기와 업무 동작은 동일 텍스처 하나를 공유한다.
- 플레이어 6개 원본은 SHA-256·크기·RGBA, 32개 정수 프레임의 비중첩, `alpha > 100`인 원본 픽셀 누락 0, 네 방향 걷기 프레임의 상이성, 발 기준과 머리 중심을 자동 검사했다. NPC도 원본 해시·크기와 32개 영역·동작 연결을 검사하고 알파 분석에서 누락 0을 확인했다. 이는 모든 행동의 예술적 완성도나 실기기 성능 검증을 대신하지 않는다.

핵심 근거는 [플레이어 원본 좌표](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-theme-character-sources.ts), [플레이어 무결성 테스트](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-theme-character-integrity.test.ts), [NPC 등록](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-npc-native-art.ts), [NPC 원장](../../apps/web/public/assets/virtual-studio/experience-v8/npc-art-manifest.json)이다. NPC 원장도 실제 모델 버전은 확인할 수 없어 `actualModelVersion: null`, `modelVersionVerified: false`로 기록한다.

### 웹툰 업무와 접근성

- 오늘의 업무에서 공정·상태를 명시적인 계약으로 분류하고 스토리, 작화, 검수, 제작 관리, 자료실 목적지를 표시한다. 내장 장소 이동 함수를 통해 실제 목적지로 안내한다.
- 모바일 추가 기능 메뉴에 방·팀원 찾기와 마을 활동 진입점을 넣었다. 업무 행과 버튼을 작은 화면에서 읽고 누르기 쉽게 배치했다.
- 동작 선택 창은 네이티브 `dialog.showModal()`을 사용한다. 배경 inert, 모달 내부 포커스, 닫힌 뒤 이전 포커스 복원, 확인 단계의 안전한 초기 포커스, Escape 처리와 스크롤 가능한 내용을 연결했다.
- 가까이 가는 행동만으로 도구나 미디어를 자동 실행하지 않는다. 기존 협업 요청 수락과 마이크·카메라의 명시적 선택 경계를 유지한다.

핵심 소스는 [업무 목적지 계약](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-production-route.ts), [오늘의 업무](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceTodayBoard.tsx), [동작 선택 창](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceActionSheet.tsx)이다.

### 서버 상태 표시와 재연결

2026-09-27 19:05~19:06 KST에 운영 상태를 인증 정보 없이 읽기 전용으로 확인했다. `/api/health/live`와 실시간 coordinator의 `/health`, `/api/auth/session`, `/api/health/capabilities`는 모두 HTTP 200을 반환했다. capabilities 응답의 프로젝트 읽기·클라우드 저장·실시간 협업은 `available`이었다. Edge liveness는 Core API·DB 성공을 뜻하지 않으며, 이 응답들은 인증된 참여·다중 사용자 동기화·저장 내구성 검증이 아니다. 사용자 내용·쿠키를 기록하거나 운영 데이터를 변경하지 않았다.

클라이언트 테스트에서는 다음 오류를 재현하고 수정했다.

- capabilities 본문이 비어 있거나 잘못된 형태인데도 사용 가능으로 받아들이던 판단을 수정했다. 프로젝트 읽기와 클라우드 저장이 각각 `available` 또는 `degraded`인지 확인한다.
- 이전 상태 점검의 JSON 처리가 늦게 끝나면 새로운 상태나 실제 API 성공·실패를 덮어쓸 수 있었다. JSON 처리 후에도 현재 요청인지 확인하고, 실제 API 결과가 들어오면 대기 중인 상태 점검을 취소한다. 중단·시간 초과 이후의 늦은 응답도 상태를 되돌리지 못한다.
- 연결 후 네트워크가 끊어진 상황에서 재접속이 권한 거부 또는 복구 불가능한 이력 상태로 끝나도 재시도 타이머가 이어질 수 있었다. 종료 상태인 `revoked`에서는 예약과 실행을 모두 차단한다. 일시적 오류의 기존 재연결 동작은 유지한다.

회귀 테스트로 느린 본문 응답과 실제 요청 결과의 순서 역전, 중단·시간 초과, 재연결 뒤 권한 거부·이력 복구 불가 상태를 검증했다. 핵심 소스는 [연결 상태 판단](../../apps/web/src/domains/creator/offline/studio-connectivity.ts), [순서 역전 회귀](../../apps/web/src/domains/creator/offline/studio-connectivity.runtime.test.ts), [실시간 재연결](../../apps/web/src/domains/creator/studio-realtime-provider-runtime.ts)이다. 이 변경은 클라이언트 오류 수정이며 운영 서버 설정·환경변수·DB·배포를 변경하지 않았다.

## 공식 서비스 벤치마크와 적용

2026-09-27 공식 문서를 확인했다. 기능의 존재를 참고한 것이며 경쟁 서비스 전체와의 품질 동등성을 측정한 결과는 아니다.

| 공식 근거 | 참고한 패턴 | 이번 적용과 경계 |
| --- | --- | --- |
| [Gather 시작 안내](https://support.help.gather.town/articles/1982412443-getting-started-guide) | 사람·장소 검색, 목적지 이동, 개인 책상, 상세/간소 화면, Wave·Meet 등 명시적 접근과 기본 꺼진 미디어 | 모바일 검색 진입점, 업무별 장소 안내, 화면 밀도 조절, 동의 후 협업과 직접 미디어 선택을 유지했다. Gather의 자동 주변 대화 청취 옵션을 새 기본값으로 도입하지 않았다. |
| [WorkAdventure 가구 배치](https://docs.workadventu.re/map-building/inline-editor/entity-editor/) | 가구 선택·회전·삭제, 격자 배치, 충돌·깊이와 오브젝트 동작 선택 | 클릭과 키보드·버튼으로 배치를 편집하고 물리 충돌과 경로를 공유한다. 이번 편집기는 드래그 앤드 드롭이나 임의 자산 업로드 구현을 주장하지 않는다. |
| [WorkAdventure 영역 편집](https://docs.workadventu.re/map-building/inline-editor/area-editor/) | 회의·집중·개인·잠금 등 목적이 구분된 장소 | 스토리·작화·검수·자료 목적지를 업무와 연결했다. 서버 게시·접근 권한·실제 미디어 라우팅은 기존 계약을 따른다. |

## 선행 계약 패키지 복구 — current

가상 스튜디오 실행 검증을 진행하면서 기존 main의 contracts 중앙화 오류를 발견했다. UI 기능 확장과 별개인 실행 선행조건으로 복구했다.

- 앱 도메인 경로로 잘못 forward하던 Studio 계약 15개와 상대 의존 계약 4개의 원본 구현을 `packages/contracts` 소유로 복원하고 앱의 기존 경로는 패키지 forward로 유지했다. 19개 구현의 원본 동일성을 import 순서 정규화 후 확인했다.
- core 브리지의 잘못된 상대 경로, 누락된 creator-resources·SHA 참조를 기존 독립 모듈에 연결했다.
- WebCrypto attestation과 공통 타입을 독립 contracts로 옮겼다. 앱 codec의 타입 API는 재export로 보존했다.
- 자기 자신을 다시 export하던 rate-limit은 중앙화 직전 Git 이력의 원본으로 복원했다. rate-limit 전체와 WebCrypto 실행 구현의 원본 동일성을 확인했다.
- 실제 직접 의존성과 export를 선언하고 pnpm으로 lockfile을 갱신했다. DOM·Node 타입 환경을 정비했다. 앱 source에 대한 새 deep import를 추가하지 않았다.
- reference-assets의 기존 제어문자 정규식 lint 오류는 동등한 문자 코드 검사로 수정하고 제어문자 거부·한글·이모지 보존 테스트를 추가했다.

## 실행한 검증과 근거

로컬 증거 디렉터리는 `.qa/virtual-studio-experience-v8/`다. 로그는 커밋 대상 제품 파일이 아니며 실행 시점 근거다. 아래 테스트 실행은 일부 범위가 겹치므로 숫자를 합산하지 않는다.

| 검증 | 확인한 결과 | 근거 |
| --- | --- | --- |
| 가상 스튜디오 회귀 suite | 132파일, 1,100테스트 통과 | `virtual-tests-final.log` |
| 최종 동결 가상 스튜디오 회귀 suite | 2026-09-27 20:22:47 KST 시작, 144파일·1,309테스트 통과 | `virtual-suite-final-frozen.log` |
| 확장 가상 스튜디오 회귀 suite | 2026-09-27 20:10:15 KST 시작 실행에서 142파일, 1,242테스트 통과 | `virtual-suite-expanded.log` |
| 공통 core·서명·요청 제한 소비자 | 10파일, 132테스트 통과 | `contracts-core-tests.log` |
| Studio 원본 계약 | 11파일, 78테스트 통과 | `studio-contracts-tests.log` |
| API/Web 계약 소비자 | 5파일, 134테스트 통과 | `studio-contract-consumers-tests.log` |
| contracts 독립 타입 검사 | 통과 | `contracts-typecheck-restored.log` |
| contracts 공개 진입점 import | 63개 중 63개 성공, 실패 0 | `contracts-entrypoints.log` |
| 계약 복구 파일 ESLint | 경고 0 기준 통과 | `contracts-core-lint.log`, `contracts-owned-lint.log` |
| 앱 경계 검증 | 통과; contracts→apps 및 금지 import 0 | `contracts-app-boundaries.log` |
| 보안 감사 | advisory 제외 없음, 알려진 취약점 없음 | `security.log` |
| 라이선스 감사 | 저장소 감사 도구 통과 | `licenses.log` |
| 생성 자산 | PNG 서명·바이트·해시, 배경 URL·16개 가구 frame 연결 테스트 통과 | `studio-virtual-space-experience-art.test.ts`, 위 가상 스튜디오 suite |
| 연결 상태와 상태 점검 회귀 | 5파일, 55테스트 통과 | `connectivity-sync-tests.log` |
| 실시간 재연결과 관련 계약 | 5파일, 77테스트 통과 | `realtime-sync-tests.log` |
| 동기화 최종 집중 회귀 | 2026-09-27 20:10:17 KST 시작 실행에서 3파일, 32테스트 통과 | `sync-suite-final.log` |
| NPC 기존 동선·업무와 원본 등록 | 6파일, 40테스트 통과 | `npc-native-tests.log` |
| NPC 원본 무결성·캐릭터 asset 계약 | 2파일, 22테스트 통과 | `npc-native-integrity-tests.log` |
| 6종 플레이어 원본 무결성·테마·asset 계약 | 3파일, 30테스트 통과 | `avatar-native-integrity-tests.log` |
| 전체 PNG와 스타일별 원경 통합 무결성 | 2026-09-27 20:15:22 KST 시작 실행에서 1파일, 62테스트 통과; 일반 아트 50개+NPC 4개, 원경 URL 24개 확인 | `experience-full-integrity.log` |
| 변경 범위 하네스와 Web·API 타입 검사 | 해당 실행 시점의 변경 범위 검증 통과; 새 전체 자산 테스트는 별도 대상 타입 검사·ESLint·Secretlint 통과 | `harness-verify-final-expanded.log`, `experience-full-integrity-typecheck.log`, `experience-full-integrity-lint.log`, `experience-full-integrity-secretlint.log` |
| 확장 정적 빌드 | 5분 28초, 라이선스 고지와 CSP 검사 통과 | `build-final-expanded.log`, `static-csp-final-frozen.log` |
| 빌드 자산 복사 무결성 | PNG 54개 142,925,381바이트와 원장 JSON 2개가 원본과 SHA-256·크기 일치 | `asset-copy-final-frozen.json` |
| 번들 구조 게이트 | 기준 27개 범위 내, 회귀 0개; 비차단 관찰 13개. startup 수치는 기존 2026-09-14 기록으로 이번 측정 아님 | `studio-bundle-final-frozen.log` |
| 운영 상태 읽기 전용 확인 | 2026-09-27 19:05~19:06 KST의 네 경로 HTTP 200; 인증된 협업 검증 아님 | `sync-readonly-probes.json` |

후속 district 재적용·현재 위치를 보호하는 Undo, 동기화 오류, 새 캐릭터·NPC 수정은 초기 1,100테스트 실행 뒤 추가되었다. 20:10의 확장 suite와 동기화 집중 회귀는 그 시점의 소스에 대한 결과다. 원경 20개와 전체 원장 게이트는 별도 62테스트 결과로 확인했다. 이 수치를 이후 수정이나 최종 PR HEAD의 통합 CI 보증으로 사용하지 않는다.

로컬 4173 포트의 `/studio/space` 경로를 390×844 브라우저 화면에서 열어 가구 수 7→8로 데스크 추가, SVG 지도 가구 선택, 90도 회전, Undo로 0도 복귀를 확인했다. 동작 창의 화면 폭, 44px 터치 영역과 고정 닫기 영역도 확인했다. 화면 근거는 `mobile-furniture-editor.png`다. 844×390 가로 화면에서는 패널 표시, 가로 overflow 없음, Escape로 닫기와 공간·꾸미기 버튼으로의 포커스 복귀를 확인했다. 이 확인은 실제 휴대폰이나 인증된 다중 사용자 검증이 아니다.

초기 통합 검사에서 기존 계약 오류와 lint 오류가 실제로 발생했고 복구했다. 최초 실패 로그를 통과 결과로 숨기지 않는다. 후속 `pnpm harness:verify` 실행은 변경 범위 하네스와 Web·API 타입 검사까지 통과했다. 확장 정적 빌드는 통과했으며 원격 CI 상태는 이 문서 작성 시 아직 미확정이다.  하네스 통과를 운영 인증·권한·다중 사용자 검증 완료로 해석하지 않는다.

## 후속 화면 검수 — 2026-09-27

정적 빌드 5180에서 공중섬→파스텔→픽셀→흑백→네온→웹툰 테마를 UI로 전환해 각각 ready 상태와 실제 건물·가구·원경을 확인했다. 테마를 바꿔도 직접 고른 클레이 메이커는 유지됐다. 스카이 포트의 안내 로봇, 리뷰 갤러리의 편집자, 트리 라이브러리의 부엉이 사서를 확인했다. `final-*-build.png`에 화면을 보존했다.

390×844에서 캐릭터 6종 카드가 155px 너비로 표시되고 닫기 버튼은 44×44px, 문서 가로 overflow는 없었다. 별도 844×390 검수에서는 패널 360×302px, 가로 overflow 없음, Escape 닫기 후 공간·꾸미기 버튼 포커스 복귀를 확인했다. 초기 뷰포트 설정이 다른 탭에 적용된 관찰은 결과에서 제외하고 실제 innerWidth/innerHeight로 크기를 확인했다.

모바일 실검수에서 가구 지도 SVG 그룹의 원본 아틀라스 경계 때문에 8번 데스크 클릭이 다른 가구를 선택하는 문제를 발견했다. 선택 역할을 실제 사각형으로 옮긴 뒤 5181 소스 화면에서 같은 클릭이 정확히 드로잉 데스크를 선택했다. 다른 가구와 겹치는 회전과 출입구 배치는 설명과 함께 거부됐다. 빈 바닥 X816/Y512로 이동한 뒤 0°→90° 회전, Undo 0° 복귀가 정상 동작했다. 원본 그림과 배치 좌표는 변경하지 않았다. 관련 3파일 10테스트가 통과했다.

몰입 화면의 온라인 기능 제한 배너는 640px 미만에서 불투명 배경과 별도 버튼 행을 사용하도록 수정했다. 390px 소스 화면에서 배경과 겹치지 않는 본문·44px 버튼을 확인했고 일반/몰입 모드 4테스트가 통과했다. 이 로컬 경고는 API 서버를 실행하지 않은 환경의 관찰이며 운영 장애의 증거가 아니다.

CI 준비 중 현재 main 소스와 낡은 단언·격리 import가 어긋난 기존 실패도 별도 커밋으로 복구했다. finishing 18파일 181테스트, 관련 Studio 9파일 54테스트, sparse 계약 21개, 실제 raster fixture 6개, 격리 creator Node 85개·Chromium 91개가 통과했다. 테스트 삭제·skip·권한 단언 완화는 하지 않았고 실제 DB 스크립트는 실행하지 않았다.

## 남은 검증과 목표 — target

- 2026-09-27 20:26 KST의 개발 탭은 테마 변경 뒤 초기화 실패와 HMR 미반영·브라우저 응답 지연을 보였다. 같은 확장 정적 빌드(5180)에서는 파스텔·픽셀·흑백·네온 전환이 모두 ready로 완료됐다. 제품 결함으로 단정하지 않았으며, 원인·부팅 단계·취소된 초기화의 격리를 진단하는 회귀 2개를 보강했다. 정확한 PR HEAD의 필수 CI는 추가 확인한다.
- 데스크톱 화면, 작은 세로 화면의 장시간 이동, 실제 휴대폰의 메모리·프레임·터치·스크린리더, 동작 창의 키보드 순환·포커스 복원을 확인한다. 뷰포트 에뮬레이션 결과를 실기기 성능으로 보고하지 않는다.
- 새 atlas의 경계·축척·투명 여백·타일 반복 품질을 모든 장소와 스타일에서 시각 검수한다. 입자·배경 연출이 원고 업무 가독성을 방해하지 않는지도 확인한다.
- 로컬 가구와 서버가 게시한 공유 월드의 범위 차이, 실제 팀 참여자 간 이동·권한·협업 수락·미디어 흐름을 인증된 다중 사용자 환경에서 확인한다.
- 장소별 district와 전역 환경 override의 저장 의미를 더 분명히 안내할 여지가 있다. 서버 동기화 가구 배치, 드래그 편집, 임의 가구 업로드는 이번 구현의 완료 항목이 아니다.

이 기록은 제한된 개선 묶음의 근거다. 더 개선할 부분이 없다는 결론을 내리지 않는다. PR 생성·병합과 운영 배포는 별도 상태이며, 이 작업에서는 운영 배포 승인을 받거나 배포를 실행하지 않았다. 운영 반영은 [배포 정책](../operations/minimum-cost-deployment-policy.md)과 [DEPLOY.md](../../DEPLOY.md)의 별도 승인 절차를 따른다.
