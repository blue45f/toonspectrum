# 의존성 방향

- 상태: **마이그레이션**
- 최종 갱신: **2026-09-26**

배포 가능한 애플리케이션은 필요한 focused package를 향해 의존한다. 애플리케이션 소스는 다른 앱의
라이브러리가 아니다.

```text
apps/web       ─┐
apps/admin-web ─┼──> packages/*
apps/api       ─┘
```

금지 경계:

- Web -> Admin/API source
- Admin -> Web/API source
- API -> Admin source
- packages -> application source
- app `shared` -> app `domains`
- `tests/integration` 밖의 앱·package 테스트 -> 다른 앱 source

API -> Web 직접 참조와 Web 내부 cross-domain deep import는 기존 마이그레이션 부채다. 신규 위반은
ratchet으로 차단하고 안정된 조각마다 예산을 낮춘다.

기계 원장:

- `scripts/validate-app-boundaries.mjs`
- `scripts/validate-source-layout.mjs`
- `config/architecture-boundary-ratchet.json`
- `config/architecture-source-ratchet.json`
