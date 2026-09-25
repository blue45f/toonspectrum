# ToonSpectrum 작업 및 배포 정책

## 사용자 결정 — 2026-09-14

이 정책은 이전의 main 자동 배포와 `[deploy]` 예외 지침을 대체한다.
세부 절차는 `docs/operations/minimum-cost-deployment-policy.md`와 `DEPLOY.md`를 따른다.

- PR 생성·병합·브랜치 정리는 배포 승인이 아니다. 운영 배포는 사용자의 별도 명시적 승인 후에만 한다.
- Vercel 런타임·설정·배포 워크플로는 퇴역 상태이며 다시 추가하지 않는다.
- 여러 PR을 검증·병합한 뒤 승인한 40자리 main SHA 하나를 변경된 Cloudflare/Render 배포 단위에만 반영한다.
- PR CI, core/verify 및 기존 테스트·보안·브랜치 보호는 유지한다. 비용 절감을 이유로 검증을 우회하지 않는다.
- 정적 웹은 검증된 `dist/`를 Cloudflare Static Assets에 수동 배포하고, Core API는 Render의 수동 release만 사용한다.
- 원격 자동 source build, dashboard 자동 재배포, `[deploy]` 예외, 동일 SHA 중복 배포·자동 재시도는 금지한다.
- Turbo/유료 동시 빌드/유료 러너/플랜 변경/자동 배포 재활성화는 별도 승인이 필요하다.
- 운영 도메인·데이터·환경변수·DB migration은 이 정책 적용이나 단순 배포의 일부로 변경하지 않는다.
- 실패하면 분석 후 중단하고 기존 정상 배포로의 롤백을 우선 검토한다. 강제 머지/보호 규칙 우회는 하지 않는다.
- 결과에는 승인, SHA, 검증, 빌드 위치, 배포 ID/URL, 남은 비용을 구분해 기록한다.

## 아키텍처 및 OpenWiki 작업 규칙

저장소를 수정하는 Agent는 다음 순서로 맥락을 확인한다.

1. 이 `AGENTS.md`의 운영/배포 정책
2. `ARCHITECTURE.md`의 현재 구조
3. `docs/architecture/modular-monorepo-target.md`의 마이그레이션 목표
4. `openwiki/quickstart.md`와 관련 OpenWiki 페이지
5. 실제 source code와 tests
6. 관련 ADR

권위 순서는 **source/tests → accepted ADR → architecture docs → OpenWiki**다. OpenWiki 설명이 source/tests와 다르면 source/tests가 현재 현실이다.

- 논리적 도메인은 각 앱 내부에 유지하고 `packages/domains/*`를 선제적으로 만들지 않는다.
- `apps/web`, `apps/admin-web`, `apps/api`는 서로의 application source를 직접 import하지 않는다.
- Admin은 독립 배포 가능한 surface로 점진적으로 이동하며 기존 기능을 한 번에 옮기지 않는다.
- 공통 DTO/schema 등 실제 두 번째 소비자가 생긴 범위만 focused contracts package 후보로 승격한다.
- Studio는 page CRUD 규칙보다 runtime authority와 기존 Studio core package 경계를 우선한다.
- `shared -> domains`, cross-domain deep import 등의 레거시는 ratchet으로 측정하고 증가를 막은 뒤 점진적으로 줄인다.
- OpenWiki 생성 문서는 반드시 `current`, `migration`, `target`, `legacy exception` 상태를 구분한다.
