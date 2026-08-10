# ToonStudio V12 — storage-recovery 후보 역량 조사

- 담당: 로컬 SQL 권위, 명령 저널, 스냅샷, 카탈로그, 제품별 로컬 문서
- 권위: `IN_PLACE_GREENFIELD_REWRITE=TRUE`, `LEGACY_DATA_MIGRATION=FALSE`,
  `DISCARD_EXISTING_STUDIO_DATA=TRUE`
- 제품 파일: OPFS `toonspectrum-studio-sqlite` / SQLite `studio-local-v12.db`
- SQLite 핀: `@sqlite.org/sqlite-wasm` 3.53.0-build1

## 후보 비교

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 공식 SQLite WASM + OPFS SAH-pool | 검증된 SQL 트랜잭션·인덱스·constraint와 브라우저 로컬 파일 내구성을 한 엔진에서 제공. 제품 코드가 실제 `openStudioLocalDatabase({vfs:"opfs"})`를 사용 | OPFS는 백업이 아니며 SAH-pool은 단일 컨텍스트 소유가 필요. 브라우저가 WASM/GPU 총 메모리를 모두 노출하지 않음 | 저장 계층 N/A. 의미 품질은 canonical JSON/IR byte equality와 복구 digest로 판정 | 브러시 10k batch-200 **44.580/53.580/55.985ms**, 필터 10k batch-250 **50.305/80.810/90.215ms**, 애니매틱 save **22.700/24.520/25.345ms**, TM save/load **7.965/13.860/16.255·8.715/9.915/10.075ms**, Bible save/load **2.450/2.885/3.685·0.240/0.385/1.465ms** | 브러시/필터 Worker WASM 총치는 API 미노출이라 null. 애니매틱 물리 OPFS 1,794,048B, TM 794,624B, Bible 204,800B | dynamic import WASM + Dedicated Worker. 브러시/필터/애니매틱/TM/Bible 모두 production Vite build에서 실구동 | SQL transaction과 canonical payload가 결정적. close/reopen byte equality 및 10k order digest 일치; Bible은 강제 Worker 종료 후 재개방 일치 | SQLite core public domain, npm wrapper Apache-2.0 | 낮음. 한 app-lifetime DB handle을 제품 repository가 공유 | 낮음. 단 VFS·Chromium 정책과 quota eviction 추적 필요 | **선정: V12 로컬 데이터 주 권위** |
| 자체 stable-IR CommandJournal + CRC32 + two-slot snapshot, SQLite 물리화 | ToonStudio command/IR 의미, 연속 seq, torn tail 절단, A/B snapshot fallback을 제품 복구 계약에 직접 맞춤 | CRC32는 악의적 변조 방지가 아님. 클라우드 백업·다중 사용자 CRDT는 별도 계층 | 복구 후 IR digest/seq 동일, 손상 이후 명시 truncation. 엔진 객체는 저장하지 않음 | 기능·fault gate 실측 완료, 별도 p50/p95/p99 성능 하니스는 아직 없음 | 미실측 | 별도 엔진 번들 없음. SQLite statement/JSON 비용만 추가 | 동일 snapshot+tail은 동일 IR을 재생성 | 내부 코드; SQLite 의무는 위 행 | 최저. CommandBus/Recovery 포트에 직접 연결 | 자체 포맷 진화와 migration 유지보수 | **선정: 저널 의미·복구 알고리즘 소유자** |
| localStorage JSON envelope | 구현이 단순하고 일부 구형 브라우저에서 동작 | 동기 main-thread I/O, 낮은 quota, 검색/transaction/부분 갱신 부재, 큰 카탈로그 전체 역직렬화, 손상 원자성 취약 | N/A | 제품 후보로 미측정 | 전체 문자열 복제 비용 | 번들 0 | 단일 값 교체만 결정적 | 웹 표준 | 낮지만 규모가 커질수록 React/GC 비용 큼 | 매우 높음: 키 산탄·버전 드리프트 | **제품 기본에서 기각**. 명시 테스트/embed seam 또는 SQLite unavailable 메모리 모드만 허용; 기존 Studio 키 자동 읽기 금지 |
| IndexedDB | 광범위한 브라우저 지원, 비동기 object store | SQL 질의·constraint가 약하고 기존 Production Bible 구현은 IDB+localStorage 이중 권위를 만들어 상태가 모호했음 | N/A | V12 제품 후보로 재측정하지 않음 | 구조화 복제·blob 비용은 브라우저 의존 | 번들 0 | transaction 범위 안에서 결정적 | 웹 표준 | 중간 | 이중 권위와 스키마 중복 위험 | **기각: V12 제품 기본 아님**. Production Bible의 명시적 legacy import seam만 유지 |
| wa-sqlite | 여러 커뮤니티 VFS를 비교하기 쉬움 | 공식 sqlite.org WASM과 중복 번들·API. 현 제품 경로보다 우위 증거 없음 | N/A | 미실측 | 미실측 | 별도 WASM 중복 | SQLite 의미 | MIT | 공식 API와 어댑터 추가 | 커뮤니티 VFS 추적 | **도전자 보류**. 공식 빌드 실패 또는 동일 하니스 우위 전까지 번들하지 않음 |
| 메모리 DB/메모리 repository | 테스트가 빠르고 OPFS 없는 환경에서 편집 세션을 계속할 수 있음 | 새로고침·크래시 후 데이터 소실 | N/A | Node 테스트 기준만 존재; 제품 내구성 수치로 사용 금지 | 프로세스 heap | 추가 번들 0 | 세션 내 결정적 | 내부 코드 | 최저 | 저장 완료로 오인할 위험 | **테스트 및 명시적 임시 세션만**. UI에 “메모리 임시·저장되지 않음” 표시 |
| Yjs / Loro | 의미 객체 협업과 오프라인 병합 | V12 로컬 권위·백업을 대체하지 않으며 raster tile/대형 asset에 부적합 | 협업 수렴 품질 축 | 현 V12 저장 범위 미실측 | 미실측 | JS 또는 WASM 추가 | CRDT 수렴 | MIT | IR↔CRDT 어댑터 필요 | provider/서버 운영 | **별도 collaboration 후보**. 한 문서에 하나만 선정하며 로컬 SQLite와 역할 혼합 금지 |
| deterministic recovery ZIP + SHA-256 CAS | stable IR snapshot/journal과 rights-bearing attachment를 origin 밖의 단일 검증 파일로 이동. 기존 `sha256:` 주소·archive writer 재사용 | cloud upload·암호화·bulk atomic journal restore·브라우저 대용량 file picker는 별도 | 복원 seq/project digest와 attachment bytes 완전 일치 | 1.056MB export **4.545/4.970/5.034ms**, import 인증 **27.922/34.303/40.996ms**, 새 SQLite restore **0.298/0.419/0.419ms** | Node RSS/ArrayBuffer delta 113.59/58.02MB; browser peak는 미측정 | 증분 런타임 dependency 0; WebCrypto+기존 ZIP writer | 동일 입력 ZIP byte-identical, SHA/CRC/IR recovery 전수 인증 | 내부 코드·Web Platform API | 낮음. 명시 file port만 제공 | ZIP32 상한·manifest version·atomic restore 후속 관리 | **선정: 외부 로컬 재해 복구 파일**. cloud backup으로 표시 금지 |

## 제품에 실제 연결된 V12 표면

`studio-local-database.ts`의 순차 migration은 현재 다음을 소유한다.

1. v1: `kv`, `tournament_winners`, `cost_samples`
2. v2: `journal_entries`, `snapshots`
3. v3: `brush_library_records`와 bounded keyset 인덱스
4. v4: `filter_library_records`와 bounded keyset/검색 인덱스

공유 KV는 임의의 엔진 객체 저장소가 아니다. 각 제품 어댑터가 stable JSON을 검증한 뒤
namespace를 분리해 저장한다.

- `studio-animatic-v12`
- `studio-translation-memory-v12`
- `studio-production-bible-v12`
- `studio-creator-pack-v12`
- `studio-emeres-library-v12`
- `studio-scene-snapshots-v12`
- writer lease 및 V12 autosave/checkpoint/workspace namespace

브러시와 필터는 검색·정렬·페이지가 필요한 대형 카탈로그이므로 구조화 테이블을 사용한다.
애니매틱·번역 메모리·Production Bible처럼 bounded canonical document인 표면은 KV를 사용한다.

## 실측 증거와 해석 한계

- `tests/benchmarks/results/brush-library-opfs-browser.json`
- `tests/benchmarks/results/filter-library-opfs-browser.json`
- `tests/benchmarks/results/animatic-sqlite-opfs-browser.json`
- `tests/benchmarks/results/translation-memory-sqlite-opfs-browser.json`
- `tests/benchmarks/results/production-bible-sqlite-opfs-browser.json`
- `tests/benchmarks/results/recovery-package-cas.json`
- `tests/visual/brush-library-opfs-browser-contract.test.ts`
- `tests/visual/filter-library-opfs-browser-contract.test.ts`
- `tests/visual/translation-memory-sqlite-opfs-browser-contract.test.ts`
- `tests/visual/production-bible-sqlite-opfs-browser-contract.test.ts`
- `tests/visual/recovery-package-cas-contract.test.ts`
- `src/domains/creator/studio-pages-history-sqlite-recovery.test.ts`
- `src/domains/creator/studio-autosave-sqlite-store.test.ts`

위 브라우저 수치는 Chromium 140/macOS의 한 장치 결과다. Safari/Firefox, Windows/Linux,
quota eviction과 다중 탭 충돌은 장치·fault 매트릭스가 더 필요하다. 메모리 API가 값을
노출하지 않은 항목은 추정하지 않고 `null`로 남긴다.

## 최종 판정

V12 제품 기본은 **공식 SQLite WASM + OPFS SAH-pool + 자체 stable-IR 저널/복구 계약**이다.
localStorage와 IndexedDB는 자동 fallback 또는 자동 migration 권위가 아니다. SQLite를 열지
못하면 호출자는 실패를 표면화하고 명시적 메모리 세션을 선택할 수 있지만, 이를 내구성 저장으로
표시해서는 안 된다. 외부 JSON/브러시 파일을 사용자가 직접 선택해 가져오는 것은 내부 legacy
마이그레이션과 구분한다.
