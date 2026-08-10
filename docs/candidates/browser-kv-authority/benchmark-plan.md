# Browser KV 권위 benchmark 및 검증 계획

## 현재 자동 게이트

실행 명령:

```bash
pnpm exec vitest run src/domains/creator/studio-browser-kv-authority-boundary.test.ts
```

현재 게이트는 네 계약을 고정한다.

1. 금지 fixture: direct/window/globalThis/alias localStorage, key-obscured `.setItem`, native
   IndexedDB, `IDBObjectStore.put`, Dexie, `idb.openDB`가 모두 검출돼야 한다.
2. 허용 fixture: exact UI preference, session clipboard, cleanup-only, explicit legacy-import가
   allowance 없이는 검출되고 allowance가 정확할 때만 통과해야 한다.
3. allowance hygiene: wildcard 없음, exact file/kind/key, 양수 occurrence, 긴 rationale/proof,
   중복 없음.
4. workspace scan: Creator와 발견된 모든 `packages/studio-*/src`에서 unreviewed finding 0,
   stale allowance 0.

이 테스트는 “코드가 실행되지 않아도 source에 남은 fallback이 제품 권위가 될 수 있다”는 회귀를
빠르게 잡는 unit/architecture gate다. 실제 browser persistence 품질은 아래 integration gate가
담당한다.

## 동일 workload 후보 비교 계획

| Workload | Corpus | 측정 | 품질/복구 판정 |
| --- | --- | --- | --- |
| Small canonical document | 1KiB, 64KiB, 1MiB stable JSON | cold open, save/load p50/p95/p99, peak JS/WASM memory | close/reopen byte SHA 일치, corrupt row fail-closed |
| Unlimited catalog | 10k/100k brush·filter metadata, keyset page | insert/query/search p50/p95/p99, throughput, index bytes | 누락·중복·정렬 오류 0, 숨은 catalog cap 0 |
| Append journal | 10k/100k command, 1% snapshot | append/recover/compact p50/p95/p99, file growth | torn tail 절단, CRC/seq/digest 일치 |
| Large immutable asset | 1/16/128MiB | put/get/hash p50/p95/p99, peak ArrayBuffer, Worker RSS | SHA-256/length/mime exact, manifest-last rollback |
| Multi-tab writer | 2/4/8 writer | lock wait, conflict count, aborted transaction | lost update 0, stale generation commit 0 |
| Quota/fault | open, write, commit, close, Worker terminate 각 지점 | failure latency, recovery latency | silent fallback 0, memory-only label 100% |

후보는 SQLite/OPFS, native OPFS, native IndexedDB, Dexie/IndexedDB를 같은 stable IR corpus와 같은
브라우저 프로필에서 실행한다. localStorage는 UI-size payload만 측정하며 창작 workload 승격 후보로
사용하지 않는다.

## 승격 기준

- canonical bytes와 stable IR semantic digest mismatch 0.
- close/reopen, Worker terminate, tab reload에서 committed generation 손실 0.
- corruption/NaN/overflow/oversize가 정상값으로 조용히 바뀌는 사례 0.
- browser KV fallback 사용 0인 제품 시나리오.
- p50/p95/p99와 peak JS/WASM/ArrayBuffer를 모두 raw JSON에 기록.
- Worker/production bundle byte와 license BOM을 기록.
- SQLite/OPFS 불가 시 memory-only 상태를 제품 UI에서 관측 가능하게 표시.
- localStorage/IndexedDB legacy key 자동 탐색 0 (`LEGACY_DATA_MIGRATION=FALSE`).

## 기존 기준선

- Production Bible 1,010B, Chromium production Worker:
  - save 2.450/2.885/3.685ms
  - load 0.240/0.385/1.465ms
  - cold open 31.565ms, reopen 0.445ms
  - strict round-trip와 reopen SHA 일치, silent fallback false
- Brush 10,000행:
  - 200-row insert batch 44.580/53.580/55.985ms
  - 10,000행 2,105.805ms, 4,748.78 brush/s
  - page-side used JS heap 670,065B→1,295,620B
- Filter 10,000행:
  - 250-row insert batch 50.305/80.810/90.215ms
  - 10,000행 2,071.290ms, 4,827.91 preset/s
  - page-side used JS heap 670,072B→1,298,791B

위 heap 수치는 page context만이며 SQLite Worker/WASM peak로 오표기하지 않는다. 비교 후보의 peak
memory와 browser 간 수치는 아직 미실측이다.

## fault matrix

- OPFS/SyncAccessHandle unavailable
- SQLite WASM load/compile failure
- `BEGIN IMMEDIATE` 이후 quota/IO failure
- manifest commit 직전 CAS failure
- Worker forced termination before/after commit
- corrupt canonical JSON, CRC, hash, byte length, schema version
- two-tab stale generation and lock timeout
- legacy localStorage/IndexedDB key가 존재하는 새 V12 boot

각 fault는 “다른 browser KV로 전환했는가”를 별도 boolean으로 기록한다. 값은 항상 false여야 한다.
