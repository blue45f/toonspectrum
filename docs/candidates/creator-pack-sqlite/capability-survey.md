# Creator Pack 로컬 권위 후보 조사

## 결론

브러시·필터 Creator Pack은 기존 Studio `localStorage` 묶음을 제품 권위로 사용하지 않는다.
V12 `/studio`는 검증된 pack entry를 각 무제한 SQLite repository에 저장하고, 브러시 팩의
버전·fingerprint 영수증만 공유 V12 SQLite KV에 둔다. 팔레트·템플릿·3D preset은 이 결정의
범위 밖이며 기존 경로를 유지한다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SQLite WASM + OPFS SAH-pool | 무제한 행, keyset 검색, 트랜잭션, 같은 `/studio-local-v12.db`에서 pack 영수증과 카탈로그 유지 | 브러시 행+영수증을 한 공개 repository 트랜잭션으로 묶는 API는 아직 없음 | canonical `StudioSavedBrush`/Effect preset을 그대로 재검증하므로 의미 손실 0이 목표 | 브러시 10k 실 Chromium: insert-200 **44.580/53.580/55.985ms**, page-257 **21.170/43.375/44.020ms**, ID **0.280/0.410/0.495ms** | 브라우저 Worker memory API 미제공으로 미실측; 물리 OPFS 22,183,936B | sqlite3 WASM·OPFS proxy는 기존 공유 자산, Creator Pack 증분 번들 비용은 TS glue 수준 | canonical JSON, package version/fingerprint와 결정적 entry ID로 재개방 일치 | SQLite public domain, `@sqlite.org/sqlite-wasm` 배포 고지 | 낮음: 기존 brush/filter repository 직접 사용 | 중간: crash 시 receipt와 행 사이 repair 절차 필요 | **브러시·필터 제품 권위** |
| IndexedDB object store | 브라우저 기본 API, 별도 WASM 불필요 | SQL keyset/복합 검색과 기존 shared DB 원자성 부재 | JSON 보존은 가능하나 인덱스-본문 불일치 검증을 별도 구현해야 함 | 본 subsystem 미실측 | 미실측 | 낮음 | 구현에 따라 다름 | 웹 표준 | 중간: brush/filter repository 이중화 | 중간~높음 | 독립 자산 blob 후보, pack 카탈로그 권위로 미채택 |
| V12 전용 localStorage | 동기·간단, 제한 환경 폴백 구현이 쉬움 | 용량·검색·트랜잭션·대량 카탈로그에 부적합, 메인 스레드 차단 | 소형 JSON은 보존 가능 | 본 subsystem 미실측 | 브라우저별 quota, 미실측 | 0 | 단일 탭에서는 높음 | 웹 표준 | 높음: SQL 카탈로그와 이중 진실 | 높음 | SQLite 불가 시 명시적 호환 저장소에만 제한 |
| 기존 Studio localStorage 자동 import | 이전 내부 데이터가 보이는 것처럼 동작 | `LEGACY_DATA_MIGRATION=FALSE`와 충돌, 손상·구 스키마를 새 권위로 오염 | 검증 불가 | 측정 대상 아님 | 측정 대상 아님 | 0 | 낮음 | 웹 표준 | 매우 높음 | 매우 높음 | **기각·자동 읽기 금지** |

실측 원문은 `tests/benchmarks/results/brush-library-opfs-browser.json`과
`tests/visual/brush-library-opfs-browser-contract.test.ts`가 소유한다. Creator Pack 수치를 별도
벤치처럼 복제하지 않는다.
