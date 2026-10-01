# UX 플로우 백로그 (2026-10-01)

전 기능 안정성 점검 과정에서 발견한 구조적 개선 항목. 당장 고치지 않고 우선순위와 함께 기록.

## P1 — 백엔드 다운 시 초기 로딩 행(hang)

- **현상**: E2E에서 API 백엔드(4001) 없이 `/market`, `/market/browse` 진입 시 페이지 로딩이 120초 타임아웃까지 멈춤.
- **원인 추정**: 앱 셸이 `/api/auth/session`, `/api/health/capabilities` 등 초기 호출에 의존. 마켓 리소스 훅 자체는 AbortController·캐시 폴백·재시도 UI가 잘 되어 있으나, 페이지 셸 레벨의 초기 게이트가 실패를 우아하게 처리하지 못함.
- **게스트-퍼스트 관점**: 로그인 없이 둘러보기가 핵심 가치인데, 백엔드 장애 시 공개 페이지마저 먹통이 되면 안 됨.
- **제안**: 초기 세션/헬스 체크에 타임아웃(예: 5초)을 두고, 실패 시 게스트 모드로 폴백하여 공개 페이지는 렌더링. `RouteFallback`의 4.5초 지연 안내와 연결.

## P2 — E2E 로컬 실행 환경

- **현상**: `apps/web/config/`가 sparse-checkout에서 빠져 있어 vite 기동 불가. inotify 와처 고갈(ENOSPC)로 dev 서버 크래시.
- **조치**: worktree에 `apps/web/config/` sparse 패턴 추가함. 와처 문제는 `server.watch: null` 래퍼로 우회 가능.
- **제안**: E2E용 worktree 셋업 문서에 sparse-checkout 필수 패턴 명시. CI가 아닌 로컬/VM E2E에서 와처 한도를 초과하지 않도록 `server.watch` 비활성화 옵션 고려.

## P3 — 인증 E2E의 로컬 커버리지 부재

- **현상**: `e2e/auth-account-matrix.spec.ts`는 live 게이트(`TOONSPECTRUM_MARKET_LIVE_E2E=1`)로 로컬에서 스킵. 로컬에서 돌릴 수 있는 인증 플로우(가입 검증·로그인·로그아웃) E2E가 없음.
- **제안**: mock 세션 API 기반의 로컬 인증 스모크 스펙 추가. 게스트→로그인 유도→세션 만료 플로우를 로컬에서 검증.

## 확인 완료 (수정 불필요)

- 에러 바운더리: 라우트 레벨 + 스튜디오 서피스 레벨 모두 동작 (vitest 7/7 통과).
- 마켓 리소스 훅: AbortController·stale 캐시 폴백·재시도 UI 완비 (vitest 7/7 통과).
- 라이브 협업 재연결: 지수 백오프(2s/5s/10s) 후 exhausted 상태로 중단, offline/visibility 존중.
- 초대 링크 복사 UI: `StudioLiveCollaborationPanel`에 이미 존재.
- 라우트 폴백: 4.5초 지연 시 설명 + 빠른 이동 링크 제공.
- CRDT 문서 동기화: 52/52 테스트 통과.
