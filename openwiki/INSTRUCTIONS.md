# ToonSpectrum OpenWiki 작성 규칙

현재 runtime 동작의 권위는 소스와 테스트다. ADR은 승인된 결정을 기록한다. 아키텍처 문서는 현재와
목표를 함께 설명할 수 있지만 OpenWiki는 탐색·설명·증거 연결 계층일 뿐 소스, 테스트, ADR을 덮어쓰지
않는다.

모든 아키텍처 설명은 다음 상태 중 하나를 명시한다.

- **현재**: 지금 소스와 테스트로 검증 가능
- **마이그레이션**: 레거시와 목표 경로가 함께 존재
- **목표**: 의도한 구조이며 완료로 표현하면 안 됨
- **레거시 예외**: ratchet으로 증가를 막는 의도적 부채
- **역사 자료**: 특정 시점의 감사·실험·보고서

설명 순서는 `애플리케이션 -> 도메인 -> capability -> surface/runtime -> source`를 기본으로 한다.

전략 제약:

1. 논리적 도메인은 `apps/web`, `apps/admin-web`, `apps/api` 안에 둔다.
2. `packages/domains/*`를 만들지 않는다.
3. Web, Admin, API는 서로의 애플리케이션 소스를 import하지 않는다.
4. 실제 두 번째 소비자가 있을 때만 안정된 계약·순수 primitive를 package로 승격한다.
5. `shared`는 비즈니스 domain에 의존하지 않는다.
6. Studio는 document/command/history/storage/rendering 권위를 보존한다.
7. ratchet 수치와 레거시 예외를 숨기지 않는다.
8. `AGENTS.md`의 운영·배포 정책을 생성 문서가 약화하지 않는다.

마이그레이션 문서는 현재 source와 목표 문서를 함께 링크한다. 일반적인 framework 설명보다 실제 경로와
직접 증거를 우선한다. 기본 언어는 한국어다.
