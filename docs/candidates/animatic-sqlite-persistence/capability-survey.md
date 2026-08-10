# Animatic persistence capability survey

작성일: 2026-08-09
권위 raw data: `tests/benchmarks/results/animatic-sqlite-opfs-browser.json`

이 표의 `Visual Quality`는 화면 픽셀 품질이 아니다. 애니매틱의 세그먼트, cue, 카메라,
전환 메타데이터를 검증·정규화한 뒤 **동일 canonical JSON bytes와 의미로 보존하는 품질**을
뜻한다. 이 실험은 Studio UI 작업 흐름이나 CSP 대비 창작 품질을 증명하지 않는다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SQLite 3.53.0 WASM + OPFS SAH-pool, 제품 `createStudioAnimaticSqlitePersistence` | Worker에서 동기 파일 핸들 기반 SQLite 트랜잭션, 재개방 내구성, 공유 V12 DB, 별도 오염 키 fail-closed | OPFS/SyncAccessHandle 없는 브라우저, 브라우저 간 물리 장치 매트릭스, 전체 Worker/WASM peak memory 표준 API | **통과**: 799,973B canonical bytes와 SHA-256이 저장 전·재개방 후 동일. 180 segments, 2,880 camera keyframes, 1,139 cues. 손상 문서는 partial 반환 없이 invalid | save **22.700/24.520/25.345ms** (120); load **4.805/5.135/6.705ms** (120). cold DB open 32.165ms, reopen 0.810ms | Worker `performance.memory`와 UA-specific memory API 미노출이어서 **null**. 물리 OPFS 1,794,048B. 페이지 heap은 670,288→1,275,519B지만 Worker peak로 오표기하지 않음 | standalone production bundle: client 251,115B + SQLite worker 210,936B + OPFS proxy 32,289B + WASM 864,752B; source map 제외 | canonical bytes/digest exact, 120/120 load mismatch 0, 재개방 exact | SQLite public domain. 배포 WASM/도구 체인은 고지·SBOM 유지 | 제품 문서 ↔ canonical JSON ↔ SQLite KV 한 경계. UI thread와는 async Worker 메시지 경계 | sqlite-wasm/OPFS API 및 브라우저 정책 변화, shared DB migration 관리 | **제품 기본 권위**. V12 `/studio-local-v12.db`의 `studio-animatic-v12` namespace |
| 기존 synchronous localStorage adapter (`saveStudioAnimaticDocument`/`loadStudioAnimaticDocument`) | 브라우저 기본 API, 작은 embed/test에서 단순 | 동기 main-thread I/O, quota/eviction, 트랜잭션·Worker 권위·파일 내구성 없음. 기존 Studio 데이터는 자동 마이그레이션 금지 | export/import 검증은 공유하지만 이번 Chromium persistence corpus로 미실측. canonical 보존을 제품 권위로 증명하지 않음 | 미실측 | 미실측 | 별도 WASM 0B, 앱 코드만 | 동일 문자열 저장 시 결정적이나 storage eviction/availability는 환경 의존 | Web Platform API; ToonSpectrum 코드 라이선스 | 낮음이나 UI thread block 및 문자열 복사 | 중간: 사용은 쉽지만 legacy 재유입 위험 | **명시적 test/embed adapter만**. 제품 기본·자동 fallback·legacy import 금지 |
| Memory-only SQLite (`vfs: "memory"`) 또는 in-memory port | 빠른 단위 테스트, schema/validation 재현 | 탭 종료 즉시 손실, OPFS·재개방 내구성 없음 | 단위 테스트 의미 보존에는 적합하지만 durable canonical 보존 증거가 아님 | 이번 브라우저에서 의도적으로 미실행·미실측 | 미실측 | SQLite WASM을 쓰면 OPFS 제외 비용, 순수 map이면 앱 코드만 | 프로세스 생존 동안 결정적 | 구현별 라이선스; SQLite 사용 시 public domain | 낮음 | 낮음이나 제품에서 오사용할 위험 | **테스트 전용**. 제품 failover로 승격 금지 |

## 실측 판정

- 제품 경로는 `openStudioLocalDatabase({ vfs: "opfs", loadSqlite })`를 정확히 두 번 열었다.
- 두 open 모두 `/studio-local-v12.db`였다. `/studio-local.db` open, memory constructor,
  localStorage API 및 localStorage fallback은 모두 0이었다.
- 1,140번째 cue를 추가한 문서는 실제 제품 export에서 `800KB` 초과로 거부됐다. 따라서
  1,139 cue는 16×180 camera metadata를 유지한 이번 스키마/직렬화에서의 최대 실용 경계다.
- 실제 사용자 UI, CSP blind 평가, 영상/오디오 payload, P3/HDR 또는 다른 브라우저/OS는 이
  persistence 승격 판정의 범위가 아니다.
