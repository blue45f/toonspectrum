# ToonSpectrum Desktop Sync

`apps/desktop-sync` is the single desktop synchronization application and library.
It owns conflict-safe bidirectional sync, cloud providers, credentials, release packaging,
and the local folder polling capability that previously lived in a separate workspace.

## Structure

```text
src/
  local-agent/      local folder scan, append journal, polling and short-lived upload grants
  cloud/            Google Drive, Dropbox and OneDrive adapters
  agent.ts          verified plan execution and atomic local/remote mutation
  planner.ts        bidirectional reconciliation and conflict classification
  journal.ts        canonical sync state journal
  conflict-*.ts     explicit conflict review and resolution
  runtime.ts        sync session lifecycle
  cli.ts            packaged command-line entry
```

The package root exports the canonical bidirectional sync API. The local polling API is
available through `@toonspectrum/desktop-sync/local-agent` so its transport types do not
collide with the root execution transport.

## Commands

```sh
pnpm --filter @toonspectrum/desktop-sync typecheck
pnpm --filter @toonspectrum/desktop-sync test
pnpm --filter @toonspectrum/desktop-sync build
```
