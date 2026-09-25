# 관리자 웹 작업 규칙

이 디렉터리에서는 루트 `AGENTS.md`와 이 규칙을 함께 적용한다.

- Admin은 사용자 웹과 독립 빌드·배포 가능한 surface를 목표로 한다.
- `apps/web` 또는 `apps/api`의 application source를 직접 import하지 않는다.
- 공유 계약은 승인된 runtime-neutral package만 사용한다.
- 관리자 기능은 모든 화면과 API에서 인증·인가 실패를 fail-closed로 처리한다.
- 파괴적 작업은 대상, 영향, 확인 단계, 성공·실패 피드백과 감사 가능성을 제공한다.
- 사용자 웹의 컴포넌트를 복사하기보다 Admin의 목적과 정보 밀도에 맞는 패턴을 사용한다.
- 최소 검증은 `pnpm harness:verify`, `pnpm typecheck:admin`, 관련 Admin 테스트다.
- 독립 빌드 경계에 영향이 있으면 `pnpm build:admin`을 실행한다.
