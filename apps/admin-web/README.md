# ToonSpectrum Admin Web

`apps/admin-web`은 독립 빌드 가능한 관리자 브라우저 애플리케이션이다. pnpm workspace 이름은
`@toonspectrum/admin-web`이며 source와 빌드 설정을 이 디렉터리가 소유한다.

## 명령

```sh
pnpm --filter @toonspectrum/admin-web dev
pnpm --filter @toonspectrum/admin-web typecheck
pnpm --filter @toonspectrum/admin-web test
pnpm --filter @toonspectrum/admin-web build
pnpm --filter @toonspectrum/admin-web test:e2e
```

생성물은 `apps/admin-web/dist/`에 쓴다. 빌드와 머지는 운영 배포 승인이 아니다.

## 소유권

```text
src/app       bootstrap, provider, route, shell, 전역 스타일
src/domains   업무 책임별 관리자 capability
src/platform  HTTP, 인증, telemetry, browser/runtime adapter
src/shared    domain 의존성이 없는 Admin 전용 UI·순수 helper
```

Admin은 `apps/web`이나 `apps/api` source를 import하지 않는다. 실행 환경에 중립적인 안정된 DTO·schema는
실제 두 번째 소비자가 생긴 뒤 `packages/contracts`로 승격한다. 기존 Web 관리자 console은 기능
단위로 이전하며 Admin의 공유 source로 사용하지 않는다.
