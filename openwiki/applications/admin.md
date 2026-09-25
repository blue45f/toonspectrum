# Admin Web 애플리케이션

- 상태: **마이그레이션**
- 최종 갱신: **2026-09-26**

`apps/admin-web`은 독립 pnpm workspace package다. 자체 Vite, TypeScript, Vitest, Playwright 설정과
`apps/admin-web/dist/` 출력을 소유한다. 빌드나 머지가 운영 배포를 의미하지 않는다.

```text
src/app       bootstrap, route, shell, 앱 전역 스타일
src/domains   관리자 capability
src/platform  HTTP, auth, telemetry, browser adapter
src/shared    domain을 모르는 Admin 전용 primitive
```

현재 `apps/web/src/domains/admin`에 남아 있는 운영 기능은 마이그레이션 부채다. route, API client,
번역, 테스트를 capability 단위로 함께 이전한다. Admin은 Web/API source를 import하지 않는다.
공유 DTO·schema는 실제 두 번째 소비자가 생긴 뒤에만 `packages/contracts`로 승격한다.
