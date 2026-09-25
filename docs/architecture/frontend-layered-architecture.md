# Web·Admin 계층형 프런트엔드 구조

- 상태: **현재 적용 중**
- 최초 채택: 2026-09-04
- 최종 갱신: 2026-09-26

## 목적

Web과 Admin의 최상위 소유권을 `app`, `domains`, `platform`, `shared` 네 영역으로 고정한다.
이 구분은 폴더 모양을 맞추기 위한 것이 아니라 의존성 방향과 변경 책임을 분명하게 하기 위한 것이다.

## 현재 구조

```text
apps/web/src/
  app/
  domains/
  platform/
  shared/

apps/admin-web/src/
  app/
  domains/
  platform/
  shared/
```

Web의 `@/*` alias는 `apps/web/src/*`를 가리킨다. Admin은 자체 Vite·TypeScript 설정에서 Admin 전용
경로를 해석한다.

## 영역별 책임

### `app`

- 부트스트랩과 provider 조립
- 전역 route와 앱 셸
- 전역 오류·격리·서비스 워커 경계
- 앱 전체 스타일과 환경 초기화

`app`은 도메인 구현을 소유하지 않고 조립한다.

### `domains`

- 사용자가 인지하는 제품 도메인과 capability
- capability 전용 UI, hook, model, API adapter, 테스트
- 도메인 내부의 `public` 또는 호출자 `integrations` 경계

재사용 가능성만으로 도메인 구현을 `shared`나 패키지로 옮기지 않는다.

### `platform`

- HTTP transport
- 브라우저 API와 저장소 adapter
- 인증·telemetry·환경 adapter
- 외부 SDK의 제품 중립 래퍼

`platform`은 비즈니스 규칙을 소유하거나 `domains`를 import하지 않는다.

### `shared`

- 둘 이상의 도메인이 실제로 사용하는 앱 내부 UI primitive
- 순수 helper와 범용 hook
- navigation, SEO, 접근성, 공용 타입

`shared`는 `domains`와 `app`을 알지 못한다. 특정 도메인의 이름이나 상태 전이를 포함하면 해당
도메인으로 되돌린다.

## 의존성 방향

```text
app      -> domains, platform, shared
domains  -> 같은 domain, 명시적 public/integrations, platform, shared
platform -> shared
shared   -> shared
```

금지:

- `shared -> domains`
- `platform -> domains`
- `shared -> app`
- 한 도메인에서 다른 도메인의 page·component·internal model deep import
- Web과 Admin 사이의 소스 import

기존 위반은 `scripts/validate-app-boundaries.mjs`와 ratchet으로 수치화한다. 예산을 올려 신규 위반을
허용하지 않는다.

## capability 배치 예시

```text
apps/web/src/domains/marketplace/
  browse/
    MarketplaceBrowsePage.tsx
    marketplace-browse-model.ts
    marketplace-browse.test.ts
  resource-detail/
  public/
    index.ts

apps/admin-web/src/domains/operations/
  operation-policy/
    OperationPolicyPage.tsx
    operation-policy-api.ts
    operation-policy.test.ts
```

component, hook, model, test는 해당 capability 옆에 둔다. 최상위 `components`, `hooks`, `types`,
`utils` 폴더를 다시 만들지 않는다.

## 공유 패키지 승격 조건

다음 조건을 모두 만족할 때만 `packages/*`로 승격한다.

1. 두 개 이상의 배포 가능한 앱이 실제로 같은 구현을 사용한다.
2. React·DOM·NestJS·DB·transport 구현과 분리할 수 있다.
3. 공개 API가 좁고 안정적이다.
4. 앱 소스 직접 import를 감추는 우회가 아니다.

DTO, schema, protocol 상수와 순수 validation은 `packages/contracts` 후보가 될 수 있다.
도메인 구현을 `packages/domains/*`로 옮기지는 않는다.

## 테스트 소유권

앱 내부 테스트는 자기 앱만 검증한다. 다른 앱 소스를 함께 검사하는 테스트는
`tests/integration/<boundary>`로 옮긴다.

## 마이그레이션 규칙

- 변경하는 capability부터 규칙을 적용한다.
- 이동과 동작 변경을 가능하면 별도 commit으로 나눈다.
- alias만 추가해 과거 폴더를 영구 보존하지 않는다.
- 한 조각이 안정되면 source-layout과 dependency ratchet을 실제 수치로 낮춘다.
- Studio는 문서·명령·저장·렌더 권위를 우선하므로 억지로 페이지 중심 폴더로 재배치하지 않는다.
