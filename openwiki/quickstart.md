# ToonSpectrum 저장소 빠른 시작

- 상태: **탐색 시작 페이지**
- 최종 갱신: **2026-09-26**

## 읽는 순서

1. `AGENTS.md` — 운영·배포 정책과 agent 규칙
2. `ARCHITECTURE.md` — 현재 저장소 구조
3. `docs/README.md` — 문서 분류와 권위
4. `docs/architecture/modular-monorepo-target.md` — 합의된 목표
5. 관련 앱·도메인 source와 테스트
6. 관련 ADR

## 애플리케이션

- `apps/web`: 사용자·창작자 브라우저 앱
- `apps/admin-web`: 독립 관리자 브라우저 앱, 기능 이전 중
- `apps/api`: NestJS backend
- `apps/mobile`: Capacitor Android/iOS wrapper
- `apps/desktop-sync`: 로컬·클라우드 동기화 앱
- `services/creator-inference`: 선택형 GPU 추론 서비스

논리적 도메인은 앱 안에 둔다. `packages/domains`는 목표가 아니다.

## Studio

Studio는 일반 페이지 중심 구조의 예외다. `docs/architecture/studio-current-boundaries.md`와
`docs/engines/renderer-roles.md`를 읽고 document, command, history, storage, rendering 권위를 따른다.
폴더 모양만 맞추기 위해 Studio 코드를 이동하지 않는다.

## OpenWiki 갱신

```sh
npm install -g openwiki@0.5.2
openwiki --init
openwiki --update
```

저장소에는 `.agents/skills/openwiki`와 `.codex/config.toml` 기반 통합도 포함되어 있다. checkout 뒤
Codex를 다시 시작하고 이 저장소의 OpenWiki 초기화 또는 갱신을 요청한다.

주기 workflow는 비용과 검토를 위해 자동 병합하지 않는다. 생성 문서는
`openwiki/INSTRUCTIONS.md`의 정책과 현재 아키텍처 문서를 따라야 한다.
