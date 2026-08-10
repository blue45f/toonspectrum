# Animatic SQLite OPFS benchmark plan

## 목적

`createStudioAnimaticSqlitePersistence`가 실제 Chromium Dedicated Worker에서 제품 V12 SQLite
OPFS SAH-pool을 사용하고, 한도 경계 애니매틱의 canonical 의미를 재개방 후 보존하는지 검증한다.
UI 작업 흐름, 영상 렌더 품질, 오디오 재생 또는 CSP 제품 비열위는 이 계획의 범위가 아니다.

## 재현 명령

```bash
pnpm exec tsx tests/benchmarks/harness/animatic-sqlite-opfs-browser.ts
pnpm exec vitest run tests/visual/animatic-sqlite-opfs-browser-contract.test.ts
```

첫 명령은 임시 Vite production bundle, 임시 Chromium profile, 임시 preview server를 만들며
raw artifact를 `tests/benchmarks/results/animatic-sqlite-opfs-browser.json`에 기록한다. runner의
`finally`가 browser/server를 종료한다.

## 정확 workload

- 180/180 segments.
- 각 segment 16/16 camera keyframes: 총 2,880.
- cue는 0..5,760 범위에서 이진 탐색한다. 16×180 camera metadata를 유지한 채 export 가능한
  최대 cue count를 선택하고 다음 cue가 실패해야 한다.
- 실측 corpus: 1,139 cues, 799,973B. 다음 cue는 800KB gate에서 거부.
- 120개 fixed-width sequential label edits를 각각 저장.
- explicit close 후 같은 `/studio-local-v12.db` 재개방.
- 제품 load를 120회 수행.
- 별도 corruption scope에 malformed JSON을 기록해 fail-closed를 검증.

## 필수 raw 지표

- SQLite WASM init, cold DB open, reopen.
- save/load 모든 raw sample과 nearest-rank-ceil p50/p95/p99.
- 저장 전, SQLite raw, 재개방 export의 byte count 및 SHA-256.
- segment/camera/cue count, export byte gate와 next-cue rejection.
- OPFS file entry와 physical byte 합, `navigator.storage.estimate()`.
- Worker/page memory API 결과. API가 없으면 추정하지 않고 `null`과 오류를 보존.
- opened DB filenames, installed SAH-pool directories, memory DB constructor count.
- console error/warning, page error, failed request, HTTP 4xx/5xx, CSP violation.

## 수용 게이트

- 모든 open은 `/studio-local-v12.db`; `/studio-local.db`와 memory DB open은 0.
- Dedicated Worker에는 localStorage API가 없고 fallback 사용은 false.
- COOP/COEP/CORP/CSP headers가 production preview 응답에 존재.
- 120 save와 120 load가 모두 성공하고 raw sample이 누락되지 않음.
- canonical byte count와 세 SHA-256이 동일, load mismatch 0.
- separate-key corruption은 invalid/null, 주 문서는 그대로.
- OPFS physical files/bytes > 0.
- diagnostics/worker·page CSP violation 0.
- broad regression alert: cold open <5s, reopen <1s, save p99 <500ms, load p99 <250ms.
  이 alert는 raw 수치를 대체하지 않으며 장치 간 SLA를 주장하지 않는다.

## 2026-08-09 Apple Chromium 결과

| Metric | Result |
| --- | ---: |
| Chromium | 140.0.7339.186 |
| SQLite WASM init | 44.080ms |
| Cold DB open | 32.165ms |
| Reopen | 0.810ms |
| Save p50/p95/p99 | 22.700 / 24.520 / 25.345ms |
| Load p50/p95/p99 | 4.805 / 5.135 / 6.705ms |
| Save/load success | 120/120, 120/120 |
| Canonical payload | 799,973B |
| Canonical SHA-256 | `5464eedd43b849831d77cf5e9a3fbd299bd98c05046a0e093f91c40eab66bd16` |
| Physical OPFS | 6 files, 1,794,048B |
| Storage estimate | 1,795,410B fileSystem usage |
| Worker memory | API unavailable, `null` |
| Diagnostics | console/page/network/CSP 0 |

## 잔여 검증

- Windows/D3D와 Linux 물리 장치 브라우저 매트릭스.
- Safari/Firefox에서 동등 OPFS/SQLite strategy 후보 검토.
- 8h/24h 반복 저장 soak와 quota pressure/device crash fault injection.
- Worker/WASM peak memory를 노출하는 표준 API가 생기면 분리 계측.
- 실제 `/studio` timeline interaction과 CSP blind 작업 품질은 별도 제품·인간 평가 게이트.
