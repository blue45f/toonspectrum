# Asset library SQLite/OPFS benchmark and verification plan

## 이번 자동 검증

- 실제 `@sqlite.org/sqlite-wasm` memory VFS에서 manifest 저장 및 named-file close/reopen.
- fake OPFS에서 CAS 재개방, 같은 길이 hash tamper, missing blob, torn/noncanonical manifest.
- 저장 호출 race, SQLite commit fault rollback, OPFS quota 거부, MIME 충돌, contentHash 불일치.
- bounded 검색/keyset pagination, bounded content-identity lookup, orphan sweep.
- ambient IndexedDB를 설치해도 product repository가 열지 않는 계약.
- 기존 explicit legacy IndexedDB 32개 회귀와 신규 저장소·제품 경계 테스트.
- 루트 TypeScript, 변경 파일 ESLint, `git diff --check`.

## 브라우저 raw benchmark 계획

Chromium production Vite build + Dedicated Worker/OPFS 환경에서 1 KiB, 1 MiB, 12 MiB, 32 MiB
payload를 각각 30회 warm/cold 측정한다.

| Gate | 기록값 | 통과 조건 |
|---|---|---|
| save | p50/p95/p99, CAS dedupe 여부 | 오류 0, manifest-last event order |
| list page | p50/p95/p99, 50/200 item | 중복·누락·순서 불일치 0 |
| verified get | p50/p95/p99 | SHA-256/size/MIME 불일치 0 |
| close/reopen | reopen ms, manifest/blob digest | byte-identical |
| forced terminate | put/owner/manifest/cleanup 각 지점 | 이전 또는 신규 완전 상태만 관측 |
| memory | JS heap/ArrayBuffer/sqlite wasm | 개별 상한 내, 누적 누수 0 |
| quota | OPFS/SQLite fault matrix | 기존 manifest 바이트 불변 |
| multi-tab | 2~4 writers | lost update 0, Web Lock 순서 보존 |

## 아직 완료로 주장하지 않는 게이트

실 Chromium OPFS p50/p95/p99, Worker peak, 브라우저 프로세스 강제 종료, 실제 disk-full/eviction,
Safari/Firefox, Windows/Linux, 8h/24h 자산 반복 soak, P3/HDR 이미지 의미 보존, CSP 실제 동일 작업
비교는 외부·장기 게이트로 남는다.
