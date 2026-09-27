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

내장 `image_gen` 도구로 PNG 6개를 생성해 실제 화면에 연결했다. [아트 원장](../../apps/web/public/assets/virtual-studio/experience-v8/art-manifest.json)에 프롬프트, 파일명, 바이트 수, SHA-256과 생성 출처를 남겼다.

| 자산 | 실제 파일·규격 | 연결 범위 |
| --- | --- | --- |
| 공중섬·숲·해안·야경 원경 | `sky.png`, `forest.png`, `coast.png`, `city.png`; 각 1536×1024 | 네 가지 배경 환경 |
| 가구 16종 | `furniture.png`; 1254×1254, 투명 4×4 atlas | 기존 장식과 드로잉 데스크·책장·원고 리뷰 보드·소파. 공중섬 스타일은 전체, 다른 스타일은 새 가구를 사용한다. |
| 지형 재질 16종 | `terrain.png`; 1254×1254, 4×4 atlas | 내장 공중섬 타일맵의 표시 재질. 사용자 타일맵과 논리 좌표를 보존한다. |

생성 도구가 모델 버전을 노출하지 않아 **ImageGen 2.5 사용 여부를 확인하거나 인증할 수 없다**. 원장의 `modelVersion`은 `null`로 유지한다. 배경·환경과 장소 선택 화면에 노출되던 모델 기술명은 각각 나만의 공간 연출, 다양한 작업 공간으로 바꿔 특정 버전을 보증하는 UI 표현을 제거했다. 요청 해상도와 실제 출력 크기를 구분하고 가구 프레임은 실제 1254px 크기를 기준으로 분할한다. 지형은 313.5px 셀을 표시용으로 사용한다.

원장에 보존한 외부 이미지 생성 프롬프트는 재현 근거이므로 영어 원문을 유지하는 언어 정책 예외다. 사용자 UI와 이 문서의 설명은 한글을 기본으로 한다. 생성 여부와 파일 무결성 확인은 모든 타일 경계가 시각적으로 완전하게 이어진다는 증명과 다르다.

### 웹툰 업무와 접근성

- 오늘의 업무에서 공정·상태를 명시적인 계약으로 분류하고 스토리, 작화, 검수, 제작 관리, 자료실 목적지를 표시한다. 내장 장소 이동 함수를 통해 실제 목적지로 안내한다.
- 모바일 추가 기능 메뉴에 방·팀원 찾기와 마을 활동 진입점을 넣었다. 업무 행과 버튼을 작은 화면에서 읽고 누르기 쉽게 배치했다.
- 동작 선택 창은 네이티브 `dialog.showModal()`을 사용한다. 배경 inert, 모달 내부 포커스, 닫힌 뒤 이전 포커스 복원, 확인 단계의 안전한 초기 포커스, Escape 처리와 스크롤 가능한 내용을 연결했다.
- 가까이 가는 행동만으로 도구나 미디어를 자동 실행하지 않는다. 기존 협업 요청 수락과 마이크·카메라의 명시적 선택 경계를 유지한다.

핵심 소스는 [업무 목적지 계약](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-production-route.ts), [오늘의 업무](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceTodayBoard.tsx), [동작 선택 창](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceActionSheet.tsx)이다.

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

후속 district 재적용·현재 위치를 보호하는 Undo 수정은 1,100테스트 실행 뒤 추가되었다. 해당 수정의 최종 통합 검증은 별도로 확인해야 하며 위 수치를 그대로 최종 HEAD 보증으로 사용하지 않는다.

로컬 4173 포트의 `/studio/space` 경로를 390×844 브라우저 화면에서 열어 가구 수 7→8로 데스크 추가, SVG 지도 가구 선택, 90도 회전, Undo로 0도 복귀를 확인했다. 동작 창의 화면 폭, 44px 터치 영역과 고정 닫기 영역도 확인했다. 화면 근거는 `mobile-furniture-editor.png`다. 844×390 가로 화면에서는 패널 표시, 가로 overflow 없음, Escape로 닫기와 공간·꾸미기 버튼으로의 포커스 복귀를 확인했다. 이 확인은 실제 휴대폰이나 인증된 다중 사용자 검증이 아니다.

초기 통합 검사에서 기존 계약 오류와 lint 오류가 실제로 발생했고 복구했다. 최초 실패 로그를 통과 결과로 숨기지 않는다. `pnpm harness:verify`의 최종 완료, 전체 빌드와 원격 CI 상태는 이 문서 작성 시 아직 미확정이다.

## 남은 검증과 목표 — target

- 후속 수정까지 포함한 최종 통합 게이트와 빌드, 정확한 PR HEAD의 필수 CI 결과를 확인한다.
- 데스크톱 화면, 작은 세로 화면의 장시간 이동, 실제 휴대폰의 메모리·프레임·터치·스크린리더, 동작 창의 키보드 순환·포커스 복원을 확인한다. 뷰포트 에뮬레이션 결과를 실기기 성능으로 보고하지 않는다.
- 새 atlas의 경계·축척·투명 여백·타일 반복 품질을 모든 장소와 스타일에서 시각 검수한다. 입자·배경 연출이 원고 업무 가독성을 방해하지 않는지도 확인한다.
- 로컬 가구와 서버가 게시한 공유 월드의 범위 차이, 실제 팀 참여자 간 이동·권한·협업 수락·미디어 흐름을 인증된 다중 사용자 환경에서 확인한다.
- 장소별 district와 전역 환경 override의 저장 의미를 더 분명히 안내할 여지가 있다. 서버 동기화 가구 배치, 드래그 편집, 임의 가구 업로드는 이번 구현의 완료 항목이 아니다.

이 기록은 제한된 개선 묶음의 근거다. 더 개선할 부분이 없다는 결론을 내리지 않는다. PR 생성·병합과 운영 배포는 별도 상태이며, 이 작업에서는 운영 배포 승인을 받거나 배포를 실행하지 않았다. 운영 반영은 [배포 정책](../operations/minimum-cost-deployment-policy.md)과 [DEPLOY.md](../../DEPLOY.md)의 별도 승인 절차를 따른다.
