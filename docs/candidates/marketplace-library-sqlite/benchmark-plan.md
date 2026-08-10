# Original marketplace package-library benchmark plan

## 현재 자동 증거

- real sqlite-wasm memory VFS canonical round-trip 및 repository 재생성 후 동일성
- malformed JSON, duplicate ID, extra field, pretty/noncanonical JSON 전체 거부
- 두 repository writer의 stale snapshot 병합과 explicit removal 보존
- 200개 초과 mutation 거부 후 기존 canonical bytes 불변
- overlapping write 직렬화, commit 이후에만 subscriber notification
- SQLite open 실패 시 localStorage/memory 영속 fallback 0
- 제품 source contract: `repository.list/save`, `localStorage` 참조 0

재현:

```text
pnpm exec vitest run \
  src/domains/creator/studio-marketplace-library-sqlite-repository.test.ts \
  src/domains/creator/studio-marketplace-packages.test.ts \
  src/domains/creator/StudioOriginalAssetMarketplacePanel.test.tsx \
  src/domains/creator/studio-v12-data-discard-policy.test.ts
```

## 승격 유지 게이트

1. Chromium Dedicated Worker/OPFS SAH-pool에서 200개 manifest를 100회 save/load한다.
2. 정상 close/reopen 및 Worker 강제 종료 뒤 canonical SHA-256이 일치해야 한다.
3. p50/p95/p99와 peak WASM/JS memory를 측정 가능한 항목만 raw JSON으로 기록한다.
4. localStorage/IndexedDB/memory fallback count는 0이어야 한다.
5. corrupted row는 읽기 실패를 표면화하고 자동 덮어쓰지 않아야 한다.

이 manifest는 작고 bounded이므로 독립 Worker 벤치가 제품 정확성 승격의 선행 조건은 아니다.
공유 DB의 Production Bible·animatic·catalog OPFS 증거를 함께 적용하되, 수치를 이 레인에서
실측한 것처럼 재사용하지 않는다.
