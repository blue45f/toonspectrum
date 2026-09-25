# 모듈형 모노레포 목표

- 상태: **마이그레이션 목표**
- 최종 갱신: **2026-09-26**

이 문서는 현재 상태와 목표 상태를 구분한다. 목표 항목을 이미 완료된 사실로 표현하지 않는다.

## 결정

- 하나의 저장소와 하나의 모듈형 Core API를 유지한다.
- 배포 단위는 `web`, `admin-web`, `api`, `mobile`, `desktop-sync`, 선택형 서비스로 명시한다.
- 논리적 비즈니스 도메인은 각 앱 안에 둔다. `packages/domains/*`는 만들지 않는다.
- 실제 두 번째 소비자가 생긴 안정된 계약·순수 모델만 공유 패키지로 승격한다.
- Studio는 page 중심 폴더보다 문서·명령·history·저장·렌더링 권위를 우선한다.

## 현재 상태

- `apps/web`은 앱 전용 Vite 설정과 `app/domains/platform/shared` source 구조를 소유한다.
  다만 루트 `package.json`이 Web의 dependency/tool command surface를 함께 소유한다.
- `apps/admin-web`은 독립 workspace와 빌드·타입 검사·테스트 설정을 갖는다. 실제 관리자 기능의
  상당 부분은 아직 `apps/web/src/domains/admin`에 남아 있다.
- `apps/api`는 독립 workspace와 Drizzle 설정을 소유한다. API -> Web 직접 참조와
  `server/common/infrastructure/db` 배치는 마이그레이션 부채다.
- `apps/mobile`은 Capacitor, Android/iOS, launch shell, resource, native 검증을 소유한다.
- `apps/desktop-sync`는 local agent와 cloud provider를 한 workspace에 통합했다.
- 교차 앱 테스트는 `tests/integration`이 소유한다.
- authoring·automation·DCC 도구는 `tools`, 비교 자료는 `tests/benchmarks`가 소유한다.
- 대형 정적 에셋은 일부가 여전히 Git/Web static asset 경계에 있으며 manifest-addressed object
  storage로 이동하는 후속 조각이 남아 있다.

## 목표 레이아웃

```text
apps/
  web/
    src/{app,domains,platform,shared}
  admin-web/
    src/{app,domains,platform,shared}
  api/
    src/{app,modules,platform,shared}
  mobile/
  desktop-sync/

services/
  creator-inference/

packages/
  contracts/
  <실제 두 번째 소비자가 있는 좁은 순수 패키지>

tests/
  integration/
  benchmarks/
```

API의 목표 이름인 `app/platform/shared`는 아직 완료된 현재 구조가 아니다. 기존
`server/common/infrastructure/db`를 기능별로 분류해 점진적으로 수렴한다.

## 의존성 목표

```text
web       ─┐
admin-web ─┼──> focused packages
api       ─┘
```

- 앱은 다른 앱 소스를 import하지 않는다.
- package는 앱 소스를 import하지 않는다.
- `shared`는 `domains`에 의존하지 않는다.
- platform adapter는 비즈니스 규칙을 소유하지 않는다.
- 도메인 간 deep import는 좁은 `public` 또는 `integrations` 경계로 수렴한다.
- 교차 앱 검증은 `tests/integration`에 둔다.

## 공유 패키지 목표

`packages/contracts`는 다음만 공개한다.

- DTO와 schema
- protocol 상수
- 실행 환경에 중립적인 순수 validation
- 두 개 이상의 앱이 실제로 사용하는 안정된 계약

React, DOM, NestJS, DB client, storage, HTTP transport 구현은 넣지 않는다. Catalog의 순수 모델처럼
Web/API가 같은 구현을 실제로 소비하는 경우에만 별도 focused package를 검토한다.

## 마이그레이션 순서

1. Admin Web 독립 경계를 유지하고 Web의 관리자 capability를 기능 단위로 이전한다.
2. API -> Web 직접 참조를 계약, 순수 모델, runtime adapter로 분류해 제거한다.
3. Web의 `app/domains/platform/shared` 경계가 다시 평탄화되지 않게 한다.
4. API의 `server/common/infrastructure/db` 코드를 modules와 platform 경계로 이동한다.
5. Creator domain 최상위 파일을 capability·authority 단위로 줄인다.
6. `packages/core`의 실제 소비자를 재검토해 앱 전용 구현과 안정된 공용 계약을 분리한다.
7. 대형 불변 에셋을 검증된 manifest와 object storage로 이동한다.
8. 안정된 조각마다 ratchet을 낮춘다.

## 현재 ratchet 기준

정확한 값은 다음 파일이 권위다.

- `config/architecture-boundary-ratchet.json`
- `config/architecture-source-ratchet.json`

2026-09-26 기준 주요 부채는 API -> Web 145, Web `shared -> domains` 44,
Web cross-domain deep import 54, Creator 최상위 직접 파일 3,440이다. Admin과 package의 신규 교차 앱
결합은 0으로 고정한다.

## Studio 예외

Studio는 document, commands, history, persistence, rendering, collaboration, durability, assets,
tools 같은 수명주기 권위를 기준으로 구성한다. 기존 focused engine/model package를 유지하며
`packages/domains`로 옮기거나 범용 component/hook/util 폴더로 평탄화하지 않는다.

## 완료 판정

다음이 모두 만족돼야 목표가 완료된 것으로 본다.

- 애플리케이션 간 직접 소스 참조 0
- package -> app 참조 0
- 교차 앱 테스트가 모두 `tests/integration`에 위치
- Admin 기능 이전 완료와 Web Admin 잔여 0
- API 레거시 source-layout 예산 0 또는 명시적으로 승인된 새 구조
- 문서, ratchet, 테스트와 실제 tree가 같은 상태
