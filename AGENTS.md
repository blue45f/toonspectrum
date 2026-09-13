# ToonSpectrum 작업 및 배포 정책

## 사용자 결정 — 2026-09-14

이 정책은 이전의 main 자동 배포와 `[deploy]` 예외 지침을 대체한다.
세부 절차는 `docs/operations/minimum-cost-deployment-policy.md`와 `DEPLOY.md`를 따른다.

- PR 생성·병합·브랜치 정리는 배포 승인이 아니다. 운영 배포는 사용자의 별도 명시적 승인 후에만 한다.
- Vercel Git 연결, 자동 빌드·배포, Preview, Deploy Hooks, push/cron/workflow_run 배포를 켜지 않는다.
- 여러 PR을 검증·병합한 뒤 승인한 40자리 main SHA 하나를 한 번 배포한다.
- PR CI, core/verify 및 기존 테스트·보안·브랜치 보호는 유지한다. 비용 절감을 이유로 검증을 우회하지 않는다.
- 기본 배포는 Linux 호환 로컬 환경 또는 무료 사용 자격을 확인한 표준 GitHub 러너에서 한 번 빌드하고,
  검증된 `.vercel/output`을 `vercel deploy --prebuilt --prod`로 한 번 업로드하는 방식이다.
- 저장소의 `deploy-vercel.yml`은 수동 전용이며 정확한 SHA와 확인 문구가 필요하다.
- 원격 source build, dashboard Redeploy 재빌드, `[deploy]` 예외, 동일 SHA 중복 배포·자동 재시도는 금지한다.
- Turbo/유료 동시 빌드/유료 러너/플랜 변경/자동 배포 재활성화는 별도 승인이 필요하다.
- 운영 도메인·데이터·환경변수·DB migration은 이 정책 적용이나 단순 배포의 일부로 변경하지 않는다.
- 실패하면 분석 후 중단하고 기존 정상 배포로의 롤백을 우선 검토한다. 강제 머지/보호 규칙 우회는 하지 않는다.
- 결과에는 승인, SHA, 검증, 빌드 위치, 배포 ID/URL, 남은 비용을 구분해 기록한다.
