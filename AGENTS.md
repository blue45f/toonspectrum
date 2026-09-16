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
