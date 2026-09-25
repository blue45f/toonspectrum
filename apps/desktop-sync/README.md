# ToonSpectrum Desktop Sync

`apps/desktop-sync`는 단일 desktop 동기화 애플리케이션이자 library다. 충돌 안전 양방향 동기화,
cloud provider, credential, release packaging과 과거 별도 workspace였던 local folder polling을 소유한다.

## 구조

```text
src/
  local-agent/   폴더 스캔, append journal, polling, 단기 upload grant
  cloud/         Google Drive, Dropbox, OneDrive adapter
  agent.ts       검증된 plan 실행과 원자적 local/remote mutation
  planner.ts     양방향 reconciliation과 충돌 분류
  journal.ts     동기화 상태 원장
  conflict-*.ts  명시적 충돌 검토·해결
  runtime.ts     sync session 수명주기
  cli.ts         배포 CLI 진입점
```

package root는 canonical bidirectional sync API를 공개한다. local polling API는
`@toonspectrum/desktop-sync/local-agent` subpath로 분리해 root 실행 transport와 타입이 충돌하지 않게 한다.

## 명령

```sh
pnpm --filter @toonspectrum/desktop-sync typecheck
pnpm --filter @toonspectrum/desktop-sync test
pnpm --filter @toonspectrum/desktop-sync build
```
