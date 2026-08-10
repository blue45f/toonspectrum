# Recovery package CAS benchmark plan

## 목적

V12 stable IR history와 content-addressed attachment를 외부 복구 파일로 내보낸 뒤, 모든 integrity
gate를 통과한 패키지만 새 SQLite DB에 복원해 seq/project digest가 같은지 측정한다. 이 벤치는
cloud upload, 브라우저 OPFS 파일 picker UX 또는 CSP 대비 창작 품질을 증명하지 않는다.

## 재현 명령

```bash
pnpm exec vitest run src/domains/creator/studio-v12-recovery-package.test.ts
pnpm exec tsx tests/benchmarks/harness/recovery-package-cas.ts
pnpm exec vitest run tests/visual/recovery-package-cas-contract.test.ts
```

두 번째 명령은 JSON을 stdout에 출력한다. 커밋된 권위 raw artifact는
`tests/benchmarks/results/recovery-package-cas.json`이며, 결과 갱신 시 출력 전체와 계약 테스트를
함께 검토한다. benchmark가 package.json/lockfile 또는 제품 DB를 수정하지 않는다.

## workload

- 실제 `@sqlite.org/sqlite-wasm 3.53.0-build1` memory DB 두 종류: source와 fresh destination.
- 2,048×2,048 SceneIR, CommandBus seq 33.
- two-slot 자동 snapshot anchor seq 32, journal tail 1개.
- 서로 다른 128KiB attachment 8개, 합계 1,048,576B.
- manifest/history/attachment 포함 ZIP 1,055,639B.
- export 30회, full import authenticate 30회, fresh SQLite restore 12회.
- 동일 입력 export 2회 byte comparison.
- hash 후보는 8MiB 입력 40회씩 측정.

## 지표와 계산

- nearest-rank ceil p50/p95/p99, min/max와 raw sample 수.
- deterministic archive bytes.
- source/restored seq 및 `projectDigest` exact equality.
- 인증된 attachment hash 수.
- Node process RSS/ArrayBuffer 시작·관측 peak·종료. 브라우저 OPFS/WASM peak로 재명명 금지.
- WebCrypto SHA-256과 로컬 설치 `blake3-wasm` 후보 버전/라이선스/browser WASM bytes.

## 2026-08-09 결과

| Metric | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Recovery ZIP export | 4.545ms | 4.970ms | 5.034ms |
| Full import authenticate | 27.922ms | 34.303ms | 40.996ms |
| Restore to fresh SQLite | 0.298ms | 0.419ms | 0.419ms |
| WebCrypto SHA-256, 8MiB | 3.527ms | 3.666ms | 4.302ms |
| `blake3-wasm` 2.1.5 candidate, 8MiB | 10.476ms | 10.877ms | 13.420ms |

품질 결과:

- deterministic export bytes: pass.
- source/restored seq: 33/33.
- source/restored project digest: `d51567ff40f6da8e` / 동일.
- attachment SHA-256 verified: 8/8.
- Node observed peak RSS delta: 113,590,272B.
- Node observed peak ArrayBuffer delta: 58,019,780B.

## fault gate corpus

집중 Vitest는 다음을 각각 독립적으로 실패시킨다.

- `../` path traversal.
- case/normalization extraction duplicate와 duplicate manifest hash ordering.
- ZIP bomb 크기 선언, 숨은/unmanifested entry.
- ZIP CRC32 mismatch.
- CRC를 다시 쓴 뒤에도 attachment SHA-256 mismatch.
- unknown manifest version.
- outer SHA-256을 다시 계산한 CRC-torn journal.
- 서명된 snapshot 안의 engine object.
- 낮춘 attachment/archive budget.
- pre-abort와 Blob read 사이 mid-abort.
- non-empty destination overwrite와 attachment target hash mismatch.

모든 공격은 일부 payload를 성공 결과로 반환하지 않아야 한다.

## 수용 기준

- export/import/restore 모든 raw sample 존재, p50 ≤ p95 ≤ p99.
- byte-identical export와 digest/seq equality.
- attachment hash 전부 인증.
- 17개 집중 test와 raw artifact contract 통과.
- 제품 runtime dependency·package/lock 변경 0.
- 메모리 수치의 환경 라벨 보존.

## 잔여 실측

- 실제 Chromium File System Access/OPFS에서 128MB 단일 및 192MB 합계 경계.
- low-memory mobile 장치와 Safari/Firefox Blob/hash 경계.
- 파일 picker 취소, 외장 디스크 제거, 쓰기 도중 quota/IO fault.
- 8h/24h 반복 export/import soak.
- 클라우드 provider가 생긴 뒤 암호화·multipart·재개·서버 hash 검증 benchmark.
