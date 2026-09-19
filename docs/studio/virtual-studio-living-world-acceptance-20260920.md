# Virtual Studio Living World 구현 및 검증 기록 — 2026-09-20

상태: **current / 구현 범위와 로컬 검증 기록**. 이 문서는 같은 날짜의 [상세 설계](virtual-studio-living-world-design-20260920.md)를 대체하지 않는다. 상세 설계는 최초 조사 시점의 사실과 **target**을 담은 역사적 설계 문서이며, 아래 표가 이번 변경의 실제 범위를 설명한다. 이 기록 자체는 main 병합, 운영 배포, 전체 목표 달성의 증거가 아니다. 최종 커밋의 CI·타입 검사·프로덕션 빌드 결과는 PR에서 별도로 확인한다.

## 구현 범위

| 영역 | 상태 | 이번 변경에 포함한 동작 | 검증 범위와 남은 한계 |
| --- | --- | --- | --- |
| 제품 진입과 상태 표시 | current | 기존 프로젝트·Classic/Virtual 전환과 제작 기능 연결을 유지한다. 실제 참가자와 로컬 NPC를 구분하고, 서버 연결 안내를 작은 상태 표시로 정리했다. 월드 불러오기 중 이동·미니맵·방 동작·NPC 도구 진입을 막고 이전 이동 의도를 지운다. | 제품 라우트의 데스크톱·모바일 화면과 React 통합 테스트. 모든 기존 제작 도구의 전 구간 회귀를 뜻하지 않는다. |
| 배경과 캐릭터 | current, 아트 목표 일부 미완료 | 인물이 배경에 고정된 원본 crop에서 사람·말풍선 등을 제거하도록 생성한 clean plate를 기본 월드에 연결했다. 4종 캐릭터의 4방향 정지 이미지와 8프레임 cutout-rig 보행 atlas를 사용한다. | 출력 SHA-256·크기·해상도 검증. clean plate는 생성 복원이며 원본 픽셀 동일성이 없다. 기존 atlas는 개별 작화 보행 pose가 아니다. |
| 플레이어 조작 | current | Phaser 월드에서 키보드, 클릭 경로, 터치 joystick, standard gamepad 입력을 처리한다. 원형 충돌, 가감속, fixed-step 표시 보간, 이동거리 기반 보행, 가까운 경로점 steering, follow 취소를 사용한다. 입력창 포커스에서는 게임 입력을 소비하지 않는다. | 순수 모델·입력 테스트 및 제품 브라우저 확인. 물리 gamepad, 다양한 실제 휴대기기, 30/60/120Hz 장기 조작감 측정은 별도 목표다. |
| 생활 NPC | current / 로컬 ambient | 기본 월드에 안내·작가·그림·자료 역할의 NPC 4명을 둔다. 작업·참조 확인·휴식·이동·양보·인사·대기 상태와 충돌 가능한 경로를 사용하고, 실제 사용자가 가까우면 양보한다. canvas 또는 키보드/터치용 NPC 목록에서 기존 제작 도구를 명시적으로 연다. | NPC director 및 접근성 가능한 목록 테스트. NPC는 온라인 사람 수에 포함하지 않으며, 공유 authoritative NPC 상태 또는 LLM 대화라고 표시하지 않는다. |
| 분위기와 접근성 | current | Focus / Balanced / Lively 조절, 집중·자리 비움 시 초대 차단과 기존 활동 종료, reduced-motion에 맞춘 NPC 활동 억제, 명시적인 참가자·NPC 버튼을 제공한다. | 컴포넌트·정책 테스트. 제품 전체의 스크린리더 적합성 인증 또는 모든 동작의 수동 접근성 감사 완료를 뜻하지 않는다. |
| 실제 사용자 초대 | current | 대화·따라가기·함께 검토·축하 요청에 수락/거절/취소/만료를 둔다. 사용자 선택이나 rerender만으로 활동을 시작하지 않는다. 기존 활동 교체, controller 교체, 상대 이탈, 집중 전환, 수동 이동과 일치하는 Huddle 종료 때 소유한 활동을 정리한다. | paired controller, hook, 실제 Page 통합 테스트와 native RTCDataChannel fixture. 서로의 브라우저를 강제 이동하거나 문서를 자동 수정하지 않는다. |
| Social 전송 | current | 별도 `toonspectrum-space-social-v1` schema와 ordered/reliable direct lane을 사용한다. 실제 transport 참가자, target, epoch, sequence, 요청 ID·만료, 전체 manifest SHA-256을 확인하고 terminal 기록의 재시작을 막는다. 메시지 2048B, pending 4건, 보관 64건 등의 한도를 둔다. | malformed/다른 world/replay·중복·취소·연결 종료 테스트. 기존 방 admission을 재사용하며 별도 게임 서버·TURN·SFU·DB 동기화를 추가하지 않는다. |
| 동의된 Huddle | current | social 요청 ID를 conversation ID로 사용하고 승인된 정확한 멤버 집합에만 scoped media link를 만든다. 외부 사용자·다른 scope의 신호/미디어를 거부하며 mic/camera는 자동 활성화하지 않는다. scope 변경·탈퇴·종료는 관련 track과 연결을 닫고 matching 종료 알림을 보낸다. 일반 toolbar Huddle 동작을 유지한다. | controller·launcher 테스트로 대상 제한과 track 정리 확인. 서로 다른 실제 장치에서 카메라/마이크 권한, ICE, 미디어 품질을 종단 간 입증한 것은 아니다. |
| Presence와 재접속 | current | 위치·아바타·reaction을 기존 저지연 presence로 전달한다. 잃어버린 leave 뒤 controller 또는 모듈이 재생성되어도 session별 sequence가 감소하지 않도록 브라우저 session storage와 메모리에 보존한다. storage 차단 시 로컬 동작을 계속한다. | lost leave·재접속·모듈 reload·storage 차단 회귀 테스트. presence 전송률은 아래 fixture에서 측정한 값이며 WAN 성능 보장은 아니다. |
| 월드 편집과 안전한 진입 | current | 로컬 authoring preview와 production 위치 저장을 분리한다. JSON/Tiled import/export, asset URL·필수 필드·실제 skin·좌표·충돌·spawn·portal 목적지 검증을 둔다. 홀수 픽셀 크기도 정수 Tiled 크기로 내보낸다. NPC 순찰 각 구간의 연결성을 공통 충돌 규칙과 탐색 한도 안에서 검사한다. room portal은 spawn 이름 대신 실제 위치의 방을 확인한다. | 맵/authoring/pathfinding 테스트. 탐색 한도 초과는 검증 오류이며 도달 가능하다고 낙관하지 않는다. collider 수정은 flattened 배경 속 가구 이미지를 이동시키지 않는다. |

## 검증 근거

검증 작업 디렉터리는 격리된 `virtual-studio-living-world/toonspectrum`이다. 다른 진행 중 worktree의 파일은 수정하지 않았으며, 기존 polish 변경은 최초 snapshot과 이후 source delta를 비교해 필요한 수정만 통합했다. 생성 리포트·스크린샷과 `/tmp` 로그는 로컬 증거이며 배포 산출물이 아니다.

- 최종 기능 통합 후 Virtual Space·Huddle·Vite interop의 **23개 파일, 256개 테스트가 모두 통과**했다 (`/tmp/virtual-studio-final-suite.log`). 아래 개별 검사 수는 이 결과와 중복되므로 합산하지 않는다.
- Huddle 관련 7개 파일의 **80개 테스트 통과**: exact conversation membership, outsider inbound 거부, scope 변경 시 캡처/수신 track 정리, pending/active 종료, matching close와 reentrant 종료 알림, 일반 toolbar 유지.
- social hook·Page 통합 테스트의 최초 **19개 테스트 통과**: 명시적 수락, 최신 callback 사용, StrictMode 정리, focus, controller 교체, accepted 활동 교체, 엔진/사용자 선택에 따른 follow 취소, Huddle 종료 scope, 실제 참가자 목록. renderer·auth·transport 경계를 mock하므로 실제 미디어 시험으로 해석하지 않는다.
- 이후 source delta를 통합하고 presence·world·authoring·NPC·Page의 **5개 파일, 62개 테스트 통과**를 확인했다. lost leave/reload 재접속, odd-size Tiled export, sealed-wall NPC 경로, misleading spawn ID, delayed-load 중 NPC·월드 조작 차단을 포함한다. 이 수에는 위 Page 테스트가 중복되므로 별도 결과를 합산해 전체 테스트 수로 표시하지 않는다.
- 해당 Huddle 및 social UI 범위 ESLint `--max-warnings 0`와 `git diff --check` 통과. 프로덕션 bundle와 postbuild의 성공을 확인했다. 전체 web·API 타입 검사도 통과했다 (`/tmp/virtual-studio-typecheck-final.log`). 최종 커밋 CI 성공은 이 기록에서 미리 선언하지 않는다.

브라우저 harness `scripts/validate-virtual-studio-runtime.mjs`의 로컬 `.qa/virtual-studio-runtime-acceptance/report.json`에서 **14개 성공, 0개 실패, browserErrors 빈 배열**을 확인했다. 서버 origin과 listening PID의 실제 cwd를 검사해 같은 worktree를 대상으로 한 실행임을 기록한다. 마지막 presence/authoring/readiness 및 social 만료·기록 보존 보강 후 전체 14개 시나리오를 다시 실행해 모두 통과했다 (`/tmp/virtual-studio-runtime-final.log`).

| 브라우저 확인 | 관측한 결과 | 해석 한계 |
| --- | --- | --- |
| 제품 키보드와 입력창 | 가속·입력 해제 후 정지, typing 중 WASD/E 이동 방지 | 특정 Chromium 로컬 실행 |
| gamepad | standard gamepad 이동 | `simulatedStandardGamepad: true`; 물리 장치 아님 |
| 아트·WebGL·레이아웃 | 제품 canvas WebGL, 데스크톱 1312×1199, 가로 overflow 없음, 아트 manifest 출력 36개와 대표 served asset hash 일치 | private 원화 master는 이번 실행에서 다시 검증하지 않음; clean plate provenance는 별도 manifest |
| 큰 authoring 월드 | 1240,950 위치 hydration과 캐릭터 변경 후 보존 | 로컬 편집 fixture |
| 모바일 joystick | 모바일 viewport에서 native touch 이벤트, 이동과 overflow 확인 | 실제 iOS/Android 기기 테스트 아님 |
| 충돌과 NPC | 원형 충돌, 접근 불가능한 NPC 순찰 정지 | fixture geometry |
| portal·상호작용 | portal 한 번 실행/도착 bounce 방지, 문맥 동작과 static fallback | 현재 fixture 시나리오 |
| native RTC presence | 아바타·reaction·위치 보간, 약 1.73초 동안 16개 위치 패킷(약 9.22/s), idle 중 1개 패킷 | 같은 브라우저 안의 실제 RTCDataChannel과 로컬 signaling fixture; 운영 인증이나 WAN 아님 |
| native RTC social | ordered, reliable, unlimited retransmission 채널에서 양쪽 수락·취소·연결 종료, 다른 manifest 거부 | in-page signaling fixture; `mediaStarted: false` |
| lifecycle와 오류 | StrictMode 중복 canvas 없음, 핵심 asset 실패 후 retry 회복 | 제품의 모든 실패 경로를 포괄하지 않음 |

관련 실행 명령은 저장소 루트에서 실행한다. `STUDIO_QA_BASE_URL`은 해당 checkout에서 띄운 로컬 dev server의 실제 origin으로 지정한다. 다른 worktree의 서버를 재사용하지 않는다.

```sh
pnpm exec vitest run apps/web/src/domains/creator/virtual-space apps/web/src/domains/creator/live/huddle
pnpm exec eslint apps/web/src/domains/creator/virtual-space apps/web/src/domains/creator/live/huddle --max-warnings 0
node scripts/verify-virtual-studio-art-manifest.mjs
STUDIO_QA_BASE_URL=http://127.0.0.1:5247 node scripts/validate-virtual-studio-runtime.mjs
```

출력 아트의 상세 provenance는 `apps/web/public/assets/virtual-studio/production-v2/art-manifest.json`과 `living-world/art-manifest.json`에 있다. clean plate는 기존 crop을 참조한 image generation edit이며 1296×1213, lossless WebP 출력이다. 가려진 바닥·가구는 생성 복원되었고 background는 단일 flattened layer다. 준비 시 PNG와 인코딩 픽셀을 비교한 기록과 저장소 verifier가 다시 수행하는 출력 hash 검사를 구분한다.

## 계속 target인 수락 조건

아래 항목은 기능을 달성한 것으로 표시하거나 현재 CI 성공만으로 완료 처리하지 않는다.

1. **실제 작화 보행과 동작 clip**: 방향별 독립 contact/down/passing/up pose, 일관된 얼굴·의상과 foot pivot, turn·sit-down·stand-up·greet·공동 high-five 손 접촉을 검수해야 한다. 현재 high-five 요청은 수락 후 짧은 축하 reaction을 표시하고 종료한다.
2. **가구 앞뒤 가림과 이동 가능한 시각 객체**: 현재 생성 clean plate 위에 actor를 배치한다. 일반 prop depth 지원과 별개로 기본 배경 가구가 독립 foreground layer로 모두 분리되어 있지 않다. furniture·collider·anchor·시각 transform을 함께 이동시키는 완성형 월드 편집은 남아 있다.
3. **공유 좌석과 authoritative lease**: lease/CAS coordinator·seat grant·partition 안전성은 구현하지 않았다. 로컬 앉기 표현이나 접근 위치가 공유 자리의 배타적 소유권을 뜻하지 않는다.
4. **버전에 고정된 공동 검토**: 현재 review 초대 수락과 기존 검토 진입을 연결한다. 특정 document/cut revision을 고정하고 양쪽 열람 권한·버전 변경·댓글/결정 반영을 일관되게 확인하는 공동 검토 workflow는 별도 목표다. world manifest hash는 문서 revision 고정의 대체물이 아니다.
5. **여러 사용자·WAN·실제 장치 성능**: 8/16/24명의 실제 연결, 4인 미디어, NAT 다양성, packet loss·재접속·지연, 모바일 Safari/Android·물리 gamepad, 장시간 메모리·GPU·thermal과 p95 입력 지연을 검증해야 한다. 공간 인원 상수나 로컬 loopback fixture로 이를 보장하지 않는다.
6. **원화·시각 최종 검수**: clean plate의 그림 복원 품질, 각 NPC 위치와 그림 속 가구의 정합성, 모든 clip의 장시간 자연스러움은 별도 시각 수락 대상이다. 새 엔진·해상도·파일 무결성만으로 고품질 원화 검수가 끝나지 않는다.

## 병합과 배포

이번 작업은 기존 기능을 보강하는 PR 단위다. 보호 규칙, 필수 CI, 타입 검사와 빌드를 우회하지 않는다. 사용자 요청의 main 병합 범위와 운영 배포는 분리한다. 운영 배포, TURN/SFU·새 서버·유료 추론·요금제 추가는 이 문서가 승인하지 않으며 저장소의 수동 배포 정책을 따른다.
