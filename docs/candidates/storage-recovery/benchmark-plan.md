# ToonStudio V12 — storage-recovery 벤치마크 계획과 실측

## 1. 원칙

- 제품과 같은 repository/open 함수를 Vite production build에서 실행한다.
- OPFS 측정은 `vfs:"opfs"`, exact `studio-local-v12.db`, Dedicated Worker를 증명한다.
- memory VFS 수치는 SQL 로직 회귀 기준일 뿐 브라우저 내구성 수치로 승격하지 않는다.
- p50/p95/p99는 raw sample과 percentile method를 JSON에 함께 저장한다.
- 브라우저가 메모리를 노출하지 않으면 추정하지 않고 `null`을 기록한다.
- canonical byte/digest, 누락·중복·정렬, 손상 fail-closed가 성능보다 먼저 통과해야 한다.

## 2. 완료된 하니스

| 하니스 | 실제 입력 | 품질·내구성 게이트 | p50/p95/p99 | 결과 |
| --- | --- | --- | --- | --- |
| `brush-library-opfs-browser` | 브러시 10,000개, 16,924,275B source payload, batch 200, page 257 | close/reopen, 39 page full scan, 10k unique, missing/duplicate/order mismatch 0, memory/localStorage fallback 0 | insert batch **44.580/53.580/55.985ms**; page **21.170/43.375/44.020ms**; ID **0.280/0.410/0.495ms** | 통과 |
| `filter-library-opfs-browser` | 필터 10,000개, 3,761,900B source payload, batch 250, page 257 | exact V12 filename 2회 open, non-V12/memory open 0, 39 page full scan 무손실 | insert batch **50.305/80.810/90.215ms**; page **4.825/26.000/30.690ms** | 통과 |
| `animatic-sqlite-opfs-browser` | 180 segment, 2,880 camera keyframe, 1,139 cue, canonical 799,973B, save/load 각 120회 | product exporter/importer, 120 sequential edit final-state, close/reopen byte/digest equality, 별도 corrupt row `invalid`, legacy read 0 | save **22.700/24.520/25.345ms**; load **4.805/5.135/6.705ms**; cold open 32.165ms, reopen 0.810ms | 통과 |
| `translation-memory-sqlite-opfs-browser` | 승인 TM 512개, canonical 296,700B, save 30회/load 50회 | 제품 factory, close/reopen SHA equality, exact/fuzzy 검색 의미·언어쌍 격리, legacy key/namespace read 0, memory/localStorage fallback 0 | save **7.965/13.860/16.255ms**; load **8.715/9.915/10.075ms**; cold open 33.630ms, reopen 0.535ms | 통과 |
| `production-bible-sqlite-opfs-browser` | strict canonical 1,010B, save/load 각 60회, owner/work 3 scope | 제품 factory, close/reopen, `worker.terminate()` 뒤 새 Worker 복구, owner/work 격리, corrupt/non-canonical fail-closed, legacy key read 0 | save **2.450/2.885/3.685ms**; load **0.240/0.385/1.465ms**; normal reopen 0.445ms, forced-worker reopen 9.215ms | 통과 |
| `recovery-package-cas` | seq 33, snapshot 32, attachment 8개·1,048,576B, package 1,055,639B | deterministic ZIP, CRC/SHA/IR 인증, 새 sqlite-wasm DB seq/project digest 일치, CAS attachment 8/8 | export **4.545/4.970/5.034ms**; import 인증 **27.922/34.303/40.996ms**; restore **0.298/0.419/0.419ms** | 통과 — 외부 파일, cloud 아님 |
| SQLite journal fault suite | 실제 sqlite-wasm memory DB 위 CommandBus, journal, A/B snapshot | 5 command reopen seq/digest 동일, torn row/CRC 절단, B 손상 시 A fallback, 이어쓰기 중복 seq 0 | 성능 분포 미측정 | 기능 게이트 통과 |
| autosave/history SQLite suite | 제품 autosave store와 pages-history recovery port | writer lease, seq frontier, CRC, checkpoint, generation fencing, recovery issue 표면화 | 성능 분포 미측정 | 기능 게이트 통과 |

Raw data:

- `tests/benchmarks/results/brush-library-opfs-browser.json`
- `tests/benchmarks/results/filter-library-opfs-browser.json`
- `tests/benchmarks/results/animatic-sqlite-opfs-browser.json`
- `tests/benchmarks/results/translation-memory-sqlite-opfs-browser.json`
- `tests/benchmarks/results/production-bible-sqlite-opfs-browser.json`
- `tests/benchmarks/results/recovery-package-cas.json`

계약:

- `tests/visual/brush-library-opfs-browser-contract.test.ts`
- `tests/visual/filter-library-opfs-browser-contract.test.ts`
- `tests/visual/translation-memory-sqlite-opfs-browser-contract.test.ts`
- `tests/visual/production-bible-sqlite-opfs-browser-contract.test.ts`
- `tests/visual/recovery-package-cas-contract.test.ts`
- `src/domains/creator/studio-pages-history-sqlite-recovery.test.ts`
- `src/domains/creator/studio-autosave-sqlite-store.test.ts`
- `src/domains/creator/studio-v12-data-discard-policy.test.ts`

## 3. 제품 문서별 게이트

번역 메모리와 Production Bible은 Node memory VFS 기능 테스트에 이어 실제 Chromium Dedicated
Worker·OPFS close/reopen을 통과했다. 아래 판정은 위 raw artifact의 브라우저 수치이며 memory VFS
p50을 OPFS 수치로 대체하지 않는다.

| 문서 | 코퍼스 | 필수 판정 |
| --- | --- | --- |
| Translation Memory | 승인 항목 512개·296,700B, exact/fuzzy·잘못된 언어쌍 probe | canonical round-trip, legacy localStorage/namespace read 0, save queue 순서, close/reopen, 검색 결과 동일 — **통과** |
| Production Bible | character/location/prop/rule/promise strict canonical, owner/work 3 scope | strict schema와 canonical bytes, owner/work isolation, legacy IDB/localStorage read 0, close/reopen·강제 Worker 종료 복구 — **통과** |
| Creator Pack receipts | brush/filter pack install/uninstall, 같은 package version 충돌, 중간 종료 | rows+receipt 일치, partial install은 `repair-required`, downgrade/오염 차단 |
| Tournament | 여러 fingerprint/deviceHash와 warm/cold cost sample | winner/cache 구조화 복원, kill list 즉시 퇴출, 손상 행만 drop, hot path 저장 실패 비전파 |

## 4. fault-injection 매트릭스

| 장애 | 주입 | 통과 기준 |
| --- | --- | --- |
| SQLite migration 중단 | migration statement 실패 | 해당 version 전체 rollback, 이전 version/data 보존, 다음 open 재시도 가능 |
| torn journal payload | payload/CRC/seq 하나 변조 | 첫 손상에서 tail 절단, 이전 frontier digest 동일 |
| snapshot B 손상 | slot 1 payload/CRC 변조 | slot A + tail로 복구, ignored slot 보고 |
| writer crash | transaction 중 Worker terminate | 이전 또는 새 완성 commit만 관측, 부분 JSON/row 없음 |
| quota | VFS write/kvSet가 quota error 반환 | UI에 저장 실패, memory 편집과 durable 상태 구분, localStorage 복제 0 |
| OPFS/SAH 미지원 | API 제거/VFS install reject | `SqliteUnavailableError`, 자동 memory DB open 0 |
| 다중 탭 writer | 두 writer가 같은 document lease 요청 | 단일 writer epoch, loser read-only/retry, 무언 병합 0 |
| corrupt canonical document | JSON/unknown field/oversize/duplicate | 전체 `invalid`, 일반 save로 자동 덮어쓰기 금지 |
| creator pack 중단 | rows 이후 receipt 전 throw | `repair-required`, 설치 완료 표시 0 |
| destructive cutover 오입력 | flag/env/phrase 중 하나 누락 | 삭제 0 |

## 5. 장치 매트릭스

현재 실제 OPFS 결과는 Chromium 140/macOS 한 장치다. 다음을 별도 raw artifact로 추가한다.

1. Chromium stable Windows와 Linux
2. Safari의 OPFS/worker capability 및 명시적 unavailable UX
3. Firefox 지원 상태와 capability 결과
4. 낮은 quota/저장 공간, private browsing, site-data eviction
5. 두 탭/두 worker 경쟁
6. 8시간 저장·검색·checkpoint 반복 후 file growth와 recovery time

브라우저가 SAH-pool을 지원하지 않는 환경을 억지로 “통과”시키지 않는다. 기능 축소 모드와
내구성 부재를 사용자에게 표시하고 release support matrix에 기록한다.

## 6. 승격·회귀 기준

성능 gate는 품질 gate 뒤에 적용한다.

1. canonical/IR 의미 손실 0, engine object 저장 0
2. 누락·중복·정렬 mismatch 0
3. close/reopen digest equality
4. corruption/torn write fail-closed
5. interactive render hot path SQL/OPFS I/O 0
6. UI가 bounded page만 보유
7. p95가 이전 승인 결과의 25% 이상 퇴행하면 원인·장치 부하를 조사
8. peak memory/API unavailable은 null로 유지; 추정값으로 gate를 통과시키지 않음

## 7. CSP와 외부 검증

저장 엔진의 완성은 CSP 브러시 감각 비열위를 대신하지 않는다. SUT/SUTG/Krita bundle을 SQL에
무손실 저장했다는 사실과 CSP/Krita가 동일 획을 만든다는 주장은 별도다. 실제 target-app roundtrip,
permissioned asset corpus, 물리 태블릿 blind lab이 없으면 포맷/품질 게이트는 미통과로 남긴다.
