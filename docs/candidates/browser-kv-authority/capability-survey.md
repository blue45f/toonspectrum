# Browser KV 권위 후보 역량 조사

- 서브시스템: `browser-kv-authority`
- 결정 범위: `/studio`의 로컬 창작 데이터, 복구 저널, 카탈로그, UI 설정
- 관련 결정: ADR-0012, ADR-0013, ADR-0014
- 정책: `LEGACY_DATA_MIGRATION=FALSE`, `DISCARD_EXISTING_STUDIO_DATA=TRUE`
- 조사일: 2026-08-10

## 결론

구조화된 창작 metadata와 manifest의 제품 권위는
`@sqlite.org/sqlite-wasm 3.53.0-build1` + OPFS SAH-pool로 유지한다. 대형 immutable byte는 OPFS
SHA-256 CAS, append/recovery workload는 native OPFS journal 또는 SQLite transaction이 소유한다.
`localStorage`는 UI preference·동의·튜토리얼·세션 clipboard에만 허용한다. IndexedDB와
localStorage에 남아 있는 이전 구현은 제품 기본 경로가 아니라 파일별 explicit legacy/import/test
경계로만 유지하며, 정적 테스트가 해당 파일·호출·키·호출 수를 고정한다.

## 후보 비교

저장 계층에는 시각 렌더 결과가 없으므로 `Visual Quality`는 “stable IR/canonical byte의 의미와
정밀도를 손실 없이 보존하는가”로 해석한다. 숫자가 없는 칸은 비교 하니스에서 같은 payload로
측정하지 않았다는 뜻이며 추정치를 기입하지 않는다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SQLite WASM 3.53.0-build1 + OPFS SAH-pool | transaction, constraint, index, keyset query, `PRAGMA user_version`, reopen 가능한 단일 구조화 권위 | secure context·OPFS·SyncAccessHandle 필요. 대형 Blob 자체를 SQL TEXT로 넣지 않음 | canonical JSON/stable IR을 byte-exact 검증하고 corruption을 fail-closed 처리 | Production Bible 1,010B: save **2.450/2.885/3.685ms**, load **0.240/0.385/1.465ms**. 10k brush 200-row insert batch **44.580/53.580/55.985ms** | Production Bible peak 미실측. 10k brush page JS heap 670,065B→1,295,620B이나 Worker 전체 peak는 미실측 | 설치 artifact: wasm 864,752B, ESM 578,559B, worker 571,858B, OPFS proxy 32,289B. 실제 production chunk는 별도 빌드 실측 대상 | canonical serializer + SQL transaction + hash/CRC gate. 동일 입력 순서와 byte digest를 테스트 | wrapper Apache-2.0; bundled manifest와 notices 필요. SQLite core 고지 정책도 유지 | stable IR↔row codec 1회. 대형 byte는 CAS hash만 SQL에 저장해 copy를 제한 | schema migration·WASM/브라우저 OPFS 호환성 관리 필요 | **구조화 제품 권위.** 카탈로그, manifest, 작은 canonical document, lease/index |
| Native OPFS journal + SHA-256 CAS | 큰 immutable byte, append journal, atomic file replacement, content-addressed dedup | SQL query/index 부재. 파일명·lease·CRC·compaction은 앱 계약 필요 | 원본 byte를 base64 변환 없이 보존; SHA-256/CRC mismatch를 거부 | autosave/asset별 기존 실측은 ADR-0012 증거 참조. 후보 간 공통 microbench는 미실측 | payload 크기에 좌우. Worker/stream peak를 기능별 gate로 측정해야 함 | 브라우저 내장 0B. SyncAccessHandle은 Worker와 격리 헤더 필요 | CAS 주소와 journal seq/CRC로 결정성 검증 가능 | Web Platform API, 별도 third-party license 없음 | SQLite에는 hash/manifest만 전달하므로 낮음. renderer 객체는 저장 금지 | Safari/Firefox·quota·profile 손상 대응을 별도 검증해야 함 | **대형 byte와 append 복구 전용.** SQLite와 하이브리드 |
| `localStorage` | 매우 작은 동기 key/value, UI 부팅 전에 즉시 읽기 쉬움 | transaction/index/stream/worker 부재, 낮은 quota, main-thread 동기 I/O, 문자열 전용 | 창작 payload는 JSON/base64 변환·전체 envelope overwrite 위험 때문에 부적합 | 공통 비교 미실측. 제품 창작 경로 성능 후보에서 기각 | 브라우저 구현 의존; 전체 문자열 복사 peak 미실측 | 브라우저 내장 0B, Worker 사용 불가 | 단일 key set은 원자적일 수 있으나 여러 key·tab writer 의미는 앱이 보장 못함 | Web Platform API | JSON encode/decode와 binary base64 비용이 큼 | key drift와 조용한 quota 실패 위험이 높음 | **UI preference/consent/tutorial/session clipboard와 삭제-only cleanup.** 창작 권위 금지 |
| Native IndexedDB | structured clone, transaction, index, Blob 저장, 넓은 브라우저 지원 | schema/codec이 기능별로 분산되기 쉬움. SQL·공통 migration/inspection 부재 | 타입 검증을 별도 구현하면 보존 가능하나 legacy 구현마다 정책이 달랐음 | 현재 V12 제품 후보로 동일 workload 비교 미실측 | 브라우저 구현 의존, 공통 peak 미실측 | 브라우저 내장 0B; async API지만 callback/transaction lifetime 관리 비용 | transaction 범위 안에서는 결정적이나 저장 envelope canonicality는 앱 책임 | Web Platform API | SQLite/OPFS와 병행하면 이중 권위·복사·migration 비용이 커짐 | 브라우저별 transaction/upgrade/blocked 처리와 기능별 wrapper 유지보수 | **제품 기본 기각.** 명시적 pre-V12 import/test 또는 관측 가능한 emergency rollback만 |
| Dexie over IndexedDB | Promise query API, schema version DSL, transaction 사용성 개선 | IndexedDB의 이중 권위·OPFS CAS 부재를 해결하지 않음. 현재 직접 의존하지 않음 | 앱 schema/codec에 달림; stable IR 의미 보존을 자동 보장하지 않음 | 미실측 | 미실측 | 미도입이라 production bundle/Worker 비용 미실측 | 앱 ordering/canonical serializer에 달림 | 후보 upstream Apache-2.0; 도입 시 exact pin과 package manifest 재검증 필요 | 기존 SQLite repository와 두 번째 query 계층을 만들어 높음 | 별도 ORM lifecycle과 migration 체인을 추가 | **기각/격리.** SQLite 대비 품질·복구·운영 우위 증거가 생길 때만 재검토 |
| Memory-only Map/repository | 테스트 격리, 저장소 불가 시 편집을 계속할 수 있음 | reload/crash 복구 없음, durability 0 | 현재 탭 동안만 byte 보존 | 단위 테스트 외 공통 비교 미실측 | payload에 비례, bounded admission 필수 | 0B | 같은 프로세스에서만 결정적 | 자체 코드 | 낮음 | 저장 성공으로 오표기할 위험 | **명시적 degraded session.** UI에 “저장되지 않음”을 표시하고 durable generation을 올리지 않음 |

## 품질·내구성 우선 판정

1. 저장 성공은 실제 SQLite transaction 또는 OPFS journal/CAS receipt가 있을 때만 보고한다.
2. SQLite/OPFS가 실패하면 memory-only 편집을 허용할 수 있지만 localStorage나 IndexedDB로
   조용히 전환하지 않는다.
3. 저장되는 것은 stable IR/canonical document/provider descriptor뿐이다. CanvasKit, Vello,
   Three.js 같은 엔진 객체는 저장하지 않는다.
4. legacy DB/key는 제품 boot에서 자동 탐색하지 않는다. explicit import 도구가 어댑터를 직접
   주입한 경우만 읽는다.
5. UI key가 창작 payload를 담기 시작하면 이름이 같아도 허용되지 않는다. 정적 가드의 허용 항목은
   권위 승인이 아니라 현재 호출 모양을 고정한 제거 대기 원장이다.

## 실측 근거

- `tests/benchmarks/results/production-bible-sqlite-opfs-browser.json`
- `tests/benchmarks/results/brush-library-opfs-browser.json`
- `tests/benchmarks/results/filter-library-opfs-browser.json`
- `tests/benchmarks/results/animatic-sqlite-opfs-browser.json`
- `tests/benchmarks/results/translation-memory-sqlite-opfs-browser.json`
- `src/domains/creator/studio-browser-kv-authority-boundary.test.ts`
