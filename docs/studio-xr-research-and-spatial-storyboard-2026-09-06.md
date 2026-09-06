# ToonStudio XR 리서치와 공간 콘티 1차 구현

조사 기준일: 2026-09-06. 공개 공식 제품 문서·개발자 문서·제작자 사례를 우선했다. 표의 기능은 공급자가 공개한 기능이며, 모든 제품을 직접 사용해 성능을 비교했다는 의미는 아니다. 국내 초기 VR 웹툰과 2024년 콘텐츠 사례는 역사적 참고로 구분했다. 비공개 기능과 전체 시장을 망라했다고 주장하지 않는다.

## 결론

헤드셋 전용 편집기를 별도로 만드는 것보다 **기존 웹툰 제작 → 공간 콘티 계획 → 현재 장면의 AR/VR 검토 → 일반 웹툰 출력**의 연결을 우선한다. 이것은 아래 사례와 현재 저장소 구조를 바탕으로 한 제품 판단이다. 일반 화면에서도 쓸 수 있어야 하고, 장면 복사나 별도 저장소 없이 기존 샷·Undo·내보내기 경로를 유지해야 한다.

현재 저장소에는 WebXR 세션 관리자, Three 렌더러 연결, AR 미니어처와 VR 장면 미리보기, 저장 샷, 멀티패스·PSD·콘택트시트 출력이 이미 있다. 이번 변경은 그 구현을 대체하지 않는다.

기준 저장소: `blue45f/toonspectrum`, 기준 커밋 `a81db1dda72a744248dfbdb0a74baf27ab4a4dcd`.
검토한 핵심 파일:
- `src/domains/creator/studio-webxr-session.ts`
- `src/domains/creator/bg3d/StudioBg3dWebXrSessionBridge.tsx`
- `src/domains/creator/bg3d/StudioBg3dImmersivePanel.tsx`
- `src/domains/creator/bg3d/StudioBg3dViewPanel.tsx`
- `src/domains/creator/bg3d/studio-bg3d-pro-suite-runtime-context.tsx`
- `src/domains/creator/bg3d/studio-bg3d-scene-document.ts`

## 비교: 무엇을 가져오고 무엇을 피할 것인가

| 사례 / 구분 | 공식 자료에서 확인한 특징 | ToonStudio 적용 판단 | 이번 구현 상태 |
|---|---|---|---|
| ShapesXR / 공간 창작 플랫폼 | 프레임 기반 공간 스토리보드, 클릭·호버 등 인터랙션, 브라우저 편집, 실제 크기 검토 [1–3] | PC에서 콘티를 계획하고 XR 검토로 연결. 헤드셋 없이도 편집 가능하게 구성 | 배치 계획·기존 샷 연결 구현. 실제 공간 프레임 재생은 후속 |
| ShapesXR / 협업 | 공간 앵커와 동일 장소 공동 작업, 공간 공유 권한 [4] | 공용 장면 상태와 기기별 공간 오프셋 분리. 공간 공유는 명시적 동의 이후 | 미구현 |
| Quill / 창작 도구·제작 사례 | VR 드로잉·프레임 애니메이션. Beyond the Fence는 관객의 속도에 맞춘 장면별 VR 그림책 [5] | 자동 카메라 이동보다 수동 컷 선택. 장면별 연출과 제작 콘티 재사용 | 수동 선택·명시적 적용 구현. VR 애니메이션은 미구현 |
| Gravity Sketch / 3D 설계 | 공간 스케치, 메시·곡면 작업, 공동 검토 [6] | 3D 배경 배치·포즈·실척 검토 UX 참고. 기존 메시 파이프라인 유지 | 이번 변경에 새 모델링 엔진 없음 |
| Open Brush / 오픈소스 | 공간 드로잉과 GLB 등 내보내기. 일부 포맷은 PC에서만 가능 [7] | 3D 효과선·공간 필기용 확장 후보. 브러시 재질·알파·애니메이션 호환 검증 필요 | 미통합 |
| Wonder Unit Storyboarder / 콘티 | Shot Generator로 구도·캐릭터·장면을 만들고 드로잉 참고로 사용 [8] | 기존 3D 샷 저장·적용을 중심으로 설계. 새 장면 사본을 만들지 않음 | 기존 명령 재사용 |
| Storyboarder.ai / AI 콘티 | 2026-04-20 공식 도움말: 카메라 위치를 선택하고 Generate로 다른 시점 이미지 생성 [9] | AI 시점 생성은 실제 3D 복원과 구분. 깊이·노멀·캐릭터 일관성 검증을 둠 | 새 AI 호출 없음 |
| Disney·Marvel·ILM / 메이저 IP | 2024년 What If…?는 MR↔VR 전환, 손·시선 입력, 공간 음향, 선택형 이야기 [10] | 분기 웹툰·음향·포털 연출의 장기 참고. IP·에셋은 복제하지 않음 | 미구현 |
| Apple / WebXR | 공식 세션은 사용자 동작·권한·종료 경로·transient pointer를 설명 [11] | 기기명으로 지원 단정 금지. 모드별 지원 확인, 종료 복구, 입력 추상화 | 기존 세션 경로 유지 |
| Google / Android XR | Chrome WebXR, 손 입력, hit-test·앵커·깊이. 양안 렌더링과 양안 깊이 처리 필요 [12] | 손·컨트롤러·마우스 공통 동작 모델, 실기기 양안 검증 | 후속 기기 검증 필요 |
| 국내 초기 VR 웹툰 / 역사적 사례 | 만화규장각 2021년 제작자 기고의 VR 웹툰·N스크린 경험 [13] | 읽기 순서·컷 가독성·2D 배포를 유지. 현재 운영·수익성의 증거로 사용하지 않음 | 좌우 읽기 방향·순서 보존 구현 |
| Adobe Aero / 종료 서비스 | 2025-11-06 배포 종료, 12-03 서비스 폐기, 12-16 서버 데이터 삭제 일정 [14] | 신규 의존성에서 제외. 내보내기 가능한 사용자 소유 데이터 형식 지향 | 도입하지 않음 |
| 8th Wall / 전환 사례 | 2026-02-28 편집 플랫폼 접근 종료. 오픈소스 도구로 전환하되 SLAM 포함 바이너리는 별도 라이선스. 기존 호스팅은 2027-02-28까지 [15–17] | 종료된 클라우드 편집 서비스에 신규 통합 금지. 오픈소스·바이너리 라이선스를 나눠 재검토 | 도입하지 않음 |

## 기능 백로그와 수용 조건

아래 우선순위는 제품 판단이며, 아직 구현하지 않은 기능을 포함한다.

| 우선순위 | 기능군 | 세부 기능 | 수용 조건 |
|---|---|---|---|
| 1 / 이번 변경 | 공간 콘티 계획 | 한 컷·곡면·평면 배치, LTR/RTL, 거리·폭·간격·높이·비율·각도, 페이지 나누기, 위에서 본 도식 | 동일 입력의 결정적 좌표, 원본 배열·장면 불변, 모바일 목록 대체 조작 |
| 1 / 이번 변경 | 기존 스튜디오 연결 | 샷 목록, 이전·다음 선택, 현재 구도 저장, 명시적 샷 적용 | 선택만으로 카메라 변경 없음. 기존 잠금과 명령 경로 사용 |
| 1 / 이번 변경 | 교환·검증 | v1 계획 JSON, 설정만 가져오기, 파일 크기·숫자 검증 | 외부 컷 ID가 장면 명령으로 실행되지 않음. 런타임 추적 정보 없음 |
| 2 | 실제 공간 컷 뷰어 | 현재 샷의 검증된 이미지 텍스처, 한 컷 집중·곡면 관람, 좌우 입력 | 텍스처 수명·해제, 양안 출력, 2D 대체 보기, 종료 시 원래 편집기 복구 |
| 2 | MR 미니어처 개선 | 표면 hit-test, 배치 확인·취소, 스케일·재중심, 바닥 높이 | 권한 거절·추적 유실·지원 불가 시 기존 보기 유지. 별도 장면 저장 없음 |
| 2 | 입력·접근성 | 손 핀치·컨트롤러 select·키보드·터치, 읽기 크기, 앉은 자세, 음소거·모션 줄이기 | 어느 입력이 없어도 필수 명령 수행 가능. 자동 이동·필수 시선 추적 없음 |
| 3 | 입체 웹툰 연출 | 전경/인물/배경 깊이 레이어, 패럴랙스 상한, 말풍선 깊이 고정 | 일반 화면 대체, 양안 말풍선 가독성, 깊이 순서 검증 |
| 3 | 분기·타임라인 | 컷 이벤트, 조건부 분기, 자막·대사·BGM 큐, 다시 보기 | 분기 유효성·고립 장면 검사, 일시정지·무음·정적 대체 |
| 3 | 공간 드로잉 | 3D 효과선·주석·가이드, 스트로크→메시, GLB 교환 | 좌표·재질·라이선스·용량 검증. 평면 드로잉 엔진 성능 유지 |
| 3 | 공동 검토 | 샷별 댓글, 발표자 모드, 변경 충돌 처리, 사용자별 시점 | 공유 문서와 기기 포즈 분리. 영속 앵커·공간 스캔은 별도 동의·삭제 정책 |
| 4 | 공간 캡처·AI | 스캔/생성 배경, 구도 조건부 이미지, 포즈 참고 | 원본 권리·품질·척도·재질·용량 검사. 생성 이미지와 실제 기하 복원 구별 |
| 4 | 배포·분석 | 일반 웹툰 출력, 독립 웹 뷰어, 선택적 익명 사용 분석 | 장치 없이 접근 가능, 사용자 소유 내보내기. 원시 시선·손·방 데이터 수집 안 함 |

## 이번 구현의 경계

진입점은 **3D 배경 편집기 → 보기 탭 → 공간 콘티 · XR 배치 계획**이다. 버튼을 열기 전에는 새로운 패널 청크를 가져오지 않는다. 기존 뷰 패널의 runtime context를 소비하며 별도 영속 장면 모델을 만들지 않는다.

이 도구의 SVG는 실제 컷 이미지나 3D 장면 렌더가 아니라 배치 도식이다. 번호와 강조선은 선택한 컷을 뜻한다. 실제 AR/VR 진입 버튼·세션 브리지·렌더러는 기존 기능 그대로다. 이번에 공간 컷 플레이어, hit-test 배치, 손 추적 편집, 앵커, 공간 음향, AI 3D 생성, 공동 편집을 완성했다고 주장하지 않는다.

좌표는 m 단위, +Y 위쪽, -Z 정면, 패널 앞면 +Z이다. 곡면 패널은 관람자를 향한다. RTL은 읽기 ID 순서를 바꾸지 않고 물리적 배치만 반전한다. 마지막 페이지는 중앙에 정렬한다. 96개 유효 고유 컷을 한도로 계획한다. 더 많은 컷이나 잘못된 참조를 제외하면 개수와 이유를 표시한다.

내보낸 JSON은 `status: planning-only`, `immersiveRuntimeIncluded: false`, `transition: manual-cut`를 명시한다. 최대 256KiB 입력, v1·종류·필수 숫자·enum을 검사한다. 가져오기는 설정만 복원한다. 내보내기에는 사용자가 지정한 컷 이름·ID·계획 좌표가 포함되지만 원본 에셋 URL 필드·카메라 설정·센서·공간 스캔·세션 객체는 포함되지 않는다. 공급자 코드나 에셋을 복사하지 않는다.

계획은 임시 UI 상태다. 패널을 닫거나 보기 탭을 벗어나면 초기화된다. 저장하려면 JSON 내보내기를 사용한다. 치수 경고는 편집 참고 규칙이지 기기 호환성이나 사용자 안전에 관한 인증이 아니다.

## 검증 결과와 남은 게이트

실행 완료:
- 순수 TypeScript 모델에 `--strict --noUncheckedIndexedAccess` 컴파일 적용.
- 동일 테스트 본문을 Node 내장 test runner로 실행: **39개 통과 / 실패 0 / 건너뜀 0**.
- 테스트는 좌표·패널 방향·RTL·마지막 페이지·원본 불변·96컷 한도·잘못된 ID·숫자 경계·256KiB·왕복 직렬화·외부 명령 무시·81개 배치 조합을 포함한다.
- 로직 검증 중 `-0` 좌표 정규화와 다국어 최대 계획 파일의 재가져오기 크기 문제를 수정했다.
- 추가/수정 TS/TSX 파일의 TypeScript 구문 변환 확인. 이는 전체 프로젝트 타입 검사와 다르다.

미실행:
- Vitest 자체 실행 및 React UI 테스트 8개. 테스트 소스는 추가했다.
- 전체 프로젝트 타입 검사·lint·production build·전체 회귀.
- 앱 내 데스크톱/모바일 시각 검수, 실제 다운로드 동작, 실제 WebXR 장치·양안 출력·권한 거절·종료 복구.

환경 제약: 연결된 원격 개발 기기는 offline이었다. 로컬 환경은 Node 22.16.0이며 저장소 요구 Node >=24.16.0 / pnpm 11 환경이 아니다. React/Vitest 패키지가 없고 외부 npm/GitHub DNS 접속이 실패하여 전체 저장소 설치·빌드는 실행하지 않았다. GitHub의 소스 읽기/쓰기 연결과 로컬 독립 로직 검증은 별도로 사용할 수 있었다. 검증 미완료 상태에서 운영 배포를 완료했다고 표시하지 않는다.

재현 명령:
```sh
# 저장소의 표준 개발 환경
pnpm exec vitest run src/domains/creator/bg3d/studio-bg3d-spatial-storyboard.test.ts src/domains/creator/bg3d/StudioBg3dSpatialStoryboardPanel.test.tsx
pnpm run typecheck
pnpm run lint:quick
pnpm run build

# 의존성 없는 순수 로직 확인: 설치된 TypeScript 필요
NODE_PATH="$(npm root -g)" node scripts/verify-studio-spatial-storyboard.cjs
```

## 출처

[1] ShapesXR 제품: https://www.shapesxr.com/
[2] ShapesXR 프레임·입력: https://www.shapesxr.com/product/prototype
[3] ShapesXR 웹 편집기: https://learn.shapesxr.com/web-editor
[4] ShapesXR 공유 앵커: https://learn.shapesxr.com/mixed-reality-and-passthrough/room-scale-collaboration-shared-anchors
[5] Quill 제작자 사례: https://quill.art/stories_beyond_the_fence.html
[6] Gravity Sketch 제품: https://gravitysketch.com/products/
[7] Open Brush 내보내기: https://docs.openbrush.app/user-guide/exporting-open-brush-sketches-to-other-apps/configuring-export
[8] Wonder Unit Storyboarder: https://wonderunit.com/storyboarder/
[9] Storyboarder.ai, 2026-04-20: https://help.storyboarder.ai/en/articles/14691476-the-new-3d-camera-angle-feature-in-storyboarder-ai
[10] Disney 공식 발표, 2024-05-22: https://press.disneyplus.com/news/disney-plus-marvel-studios-ilm-immersive-announce-first-ever-interactive-story-free-for-limited-time
[11] Apple WWDC24 WebXR: https://developer.apple.com/videos/play/wwdc2024/10066/
[12] Android XR WebXR 공식 가이드: https://developer.android.com/develop/xr/web
[13] 만화규장각, 2021년 제작자 기고: https://www.kmas.or.kr/webzine/column/28289
[14] Adobe Aero 종료 FAQ: https://helpx.adobe.com/aero/aero-end-of-support-faq.html
[15] 8th Wall 전환 발표, 2026-03-02: https://8thwall.org/blog/8th-wall-open-source
[16] 8th Wall 이관 FAQ: https://8thwall.org/docs/migration/faq
[17] Niantic Spatial 전환 발표: https://info.nianticspatial.com/blog/8th-wall-open-source

추가 기술 확인: Context7 `/mrdoob/three.js`의 WebXRManager `setSession`·`getCamera` 공식 문서를 조회했다. XR 카메라의 시야를 일반 `camera.fov`로 간주하지 않고, 실제 투영행렬·기기 세션 검증을 별도 과제로 둔다.
