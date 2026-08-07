# ToonStudio V11 — storage-recovery 후보 역량 조사 (Capability Survey)

- 담당 서브시스템: **storage-recovery** (로컬 저장·크래시 복구·검색 인덱스·협업 문서)
- 관련 배치 매트릭스 행: **E24 (Yjs 또는 Loro), E25 (OPFS + SQLite WASM)**
- 상위 권위 문서: `docs/architecture/ToonStudio_검증엔진우선_하이브리드최적조합_선택적자체구현_최종아키텍처_V11_2026-08-07.md` §2, §10.5, §11
- 작성 원칙: V11 "검증 엔진 우선 평가 → 장점별 하이브리드 조합 → 증거 기반 선택적 자체 구현"

## 0. 현재 구현 상태 (사실 고정)

**1차 구현은 이미 자체 구현으로 존재한다.** `project-model-v11` crate가 다음을 제공한다.

- **append-only CommandJournal**: 명령 단위 추가 전용 저널.
- **two-slot snapshot**: 스냅샷 이중 슬롯 기록으로 torn-write 시 이전 슬롯으로 복귀.
- **CRC32 복구**: 레코드·스냅샷 무결성 검증과 손상 지점 절단(truncate) 복구.
- **저널 스토어 3종**: 메모리(테스트·프리뷰) / 파일(네이티브·CI) / OPFS(브라우저 프로덕션).

따라서 본 조사에서 외부 후보의 역할은 "1차 구현을 대체"가 아니라 **1차 구현 위·옆에 얹는 계층(메타데이터 인덱스, CRDT 협업, CAS, 클라우드 백업)과 교차 검증 기준**이다. 단, V11 §3.3에 따라 외부 후보가 벤치마크에서 우위를 입증하면 해당 계층의 주력 승격을 막지 않는다.

## 1. 후보 역량 표

성능 수치는 전부 **미실측**이다. 수치를 추정해 적지 않는다. 정성 사실은 공개 문서 근거를 각주로 남긴다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 자체 CommandJournal + two-slot snapshot + CRC32 (`project-model-v11`) | ToonStudio IR에 직결된 append-only 저널·이중 슬롯 스냅샷·CRC32 절단 복구가 이미 구현·테스트됨. 메모리/파일/OPFS 스토어 3종으로 동일 계약을 검증 | SQL 수준 질의·검색 인덱스 없음. CRDT 병합 없음(단일 작성자 전제). 클라우드 백업·CAS는 별도 계층 필요. 해시가 CRC32라 위·변조 감지는 아님(무결성 오류 감지 전용) | N/A — 저장 계층. 판정 기준은 복구 후 렌더 결과의 픽셀 무손실(diff 0) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음 — Rust crate, WASM 시 추가 의존 최소 | 높음 — 동일 저널 리플레이는 결정적(명령+seed 기준) | 내부 코드 (프로젝트 라이선스) | 최저 — IR·RecoveryIR 네이티브 | 낮음 — 자체 통제. 단 파일 포맷 진화 시 마이그레이션 부담은 자체 부담 | **1차 주력** — 저널·스냅샷·복구의 소유 계층 |
| OPFS (Origin Private File System) | 브라우저 로컬에 대형 blob·타일·저널을 파일 단위로 저장. Worker 전용 `createSyncAccessHandle`로 동기 read/write/flush 제공[^opfs] | 백업 아님(브라우저 데이터 삭제 시 소실 — E25 위험란 명시). 디렉터리 잠금·다중 탭 동시 쓰기 조정은 앱 책임. Safari/구형 브라우저 편차 존재 | N/A — 저장 계층 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 없음 — 웹 표준 API, 번들 비용 0 | 높음 — 파일 시맨틱. flush 시점은 앱이 통제 | 웹 표준 (라이선스 비대상) | 낮음 — 1차 구현의 OPFS 저널스토어가 이미 사용 | 낮음 — 표준 API. 단 브라우저별 quota·eviction 정책 추적 필요 | **생산 저장 기반** — blob·타일·저널 물리 계층 |
| SQLite WASM (공식 sqlite.org 빌드, opfs / opfs-sahpool VFS) | 검증된 SQL 엔진을 브라우저에서 사용. opfs VFS는 COOP/COEP(SharedArrayBuffer) 필요, opfs-sahpool VFS는 COOP/COEP 불필요 대신 단일 컨텍스트 배타 접근[^sqlite-wasm] | 대형 blob 저장에는 비효율(타일은 OPFS 직저장이 원칙 — E25 조합란). 다중 탭 동시 쓰기는 VFS별 제약. 저널 계층 자체를 대체하지 않음 | N/A — 저장 계층 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간 — 단일 wasm+JS 글루. 정확한 크기·초기화 시간은 하니스에서 실측 | 높음 — SQL 시맨틱 결정적 | Public Domain[^sqlite-license] | 중간 — metadata/asset index 스키마 설계와 IR 매핑 필요 | 낮음 — sqlite.org 공식 유지보수. WASM 빌드도 공식 배포 | **메타데이터·인덱스·검색 주력 (2차 도입)** |
| wa-sqlite | SQLite WASM의 대안 빌드. IndexedDB·OPFS 등 복수 VFS 구현을 제공해 폴백 체인 실험에 유리[^wa-sqlite] | 공식 빌드 대비 커뮤니티 프로젝트. 공식 opfs-sahpool과 기능 중복 | N/A — 저장 계층 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간 — 공식 빌드와 별도 wasm. 동시 채택 시 중복 비용 | 높음 | MIT | 중간 — 공식 빌드와 API 차이 흡수 필요 | 중간 — 단일 메인테이너 성격의 커뮤니티 프로젝트 | **교차 검증·폴백 실험 후보** — 공식 빌드와 벤치 비교 후 한쪽만 채택 |
| IndexedDB | 전 브라우저 보편 지원. OPFS 미지원·제한 환경의 최후 로컬 폴백 | 대형 바이너리·고빈도 append에 구조적으로 불리(트랜잭션·직렬화 오버헤드). 동기 접근 불가 | N/A — 저장 계층 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 없음 — 웹 표준 API | 중간 — 트랜잭션 시맨틱은 결정적이나 eviction 정책은 브라우저 재량 | 웹 표준 (라이선스 비대상) | 낮음 — 저널스토어 인터페이스 뒤 추가 구현 1개 | 낮음 | **폴백 체인 하단** — 기능 축소 모드 전용 |
| Yjs | 가장 성숙한 웹 CRDT 생태계. y-indexeddb·y-websocket·y-webrtc 등 provider가 풍부하고 undo·presence·subdocument 지원[^yjs] | 픽셀·대형 바이너리 동기화 부적합(E24 조합란: tile/asset은 CAS로 분리). 히스토리 전체 보존형 버전관리는 별도 설계 필요 | N/A — 협업 문서 계층 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음~중간 — JS 라이브러리. provider별 추가 비용은 실측 | 높음 — CRDT 수렴 보장(동일 op 집합 → 동일 상태) | MIT | 중간 — LayerGraphIR·ComicGraph·AnimationGraph의 의미 객체를 Y.Map/Y.Array로 매핑하는 어댑터 필요 | 낮음 — 광범위한 프로덕션 사용 실적 | **협업 CRDT 1순위 후보** — Loro와 동일 코퍼스 비교 후 단일 선택 |
| Loro | Rust 코어 + WASM. movable tree, rich text, 버전 히스토리 내장, shallow snapshot 등 문서 버전관리 지향 기능[^loro] | Yjs 대비 생태계·provider가 얇음. 서버 릴레이·영속 어댑터를 자체 구축해야 할 가능성 | N/A — 협업 문서 계층 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간 — WASM 번들 크기·초기화는 하니스에서 실측 | 높음 — CRDT 수렴 보장 | MIT | 중간 — Rust 코어라 `project-model-v11`과 언어 정합. 레이어 트리(movable tree)와 상성 좋음 | 중간 — Yjs보다 짧은 이력, 활발한 개발 중 | **협업 CRDT 경쟁 후보** — 특히 레이어 트리 이동·버전관리 시나리오에서 비교 |
| Automerge | Rust 코어 CRDT. 문서 전체 히스토리 보존과 patch 기반 동기화[^automerge] | 대형 문서·고빈도 편집에서의 비용을 자체 검증해야 함. 웹 생태계는 Yjs 대비 얇음 | N/A — 협업 문서 계층 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간 — WASM 번들. 실측 필요 | 높음 — CRDT 수렴 보장 | MIT | 중간 | 중간 | **비교 기준 후보** — Yjs/Loro 벤치의 3번째 축. 우위 미입증 시 탈락 |
| 자체 CAS (BLAKE3) + Cloud Backup | 타일·에셋을 content-addressed 불변 blob으로 저장해 중복 제거·무결성 검증·부분 동기화. BLAKE3는 병렬 해시로 대형 blob에 적합[^blake3]. 클라우드 오브젝트 스토리지로 "OPFS는 백업이 아니다" 갭 해소 | 아직 미구현. 서버 비용·인증·충돌 정책(백업 vs 협업 저장소) 설계 필요 | N/A — 저장 계층 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음 — blake3 crate는 소형. 업로드 파이프라인은 Worker 격리 | 높음 — 동일 내용 → 동일 주소 | blake3 crate: CC0-1.0 OR Apache-2.0 | 낮음 — 1차 저널·스냅샷과 같은 crate 계열에 통합 | 낮음(클라이언트) / 중간(서버 운영) | **2차 자체 구현 계층** — 저널·스냅샷 위의 백업·중복 제거 |

## 2. 표에 넣지 않은 탈락·보류 후보

- **absurd-sql**: IndexedDB 위 SQLite. OPFS 시대 이전의 우회로이며 공식 SQLite WASM OPFS VFS가 존재하는 현재는 채택 근거가 없다. 보류 없이 제외.
- **PGlite(Postgres WASM)**: 로컬 메타데이터 용도에 SQLite 대비 번들·기능 과잉. 제외.
- **RxDB / Dexie 등 상위 추상화**: 저널·스냅샷 소유권이 자체 구현에 있으므로 중간 추상화 계층은 복사 비용과 소유권 혼선만 늘린다. 제외.

## 3. 핵심 판단 요약

1. **저널·스냅샷·복구는 자체 구현이 이미 1차 주력이다.** 외부 후보 중 이 계층을 통째로 대체할 후보는 없고, V11 §3.3 조건(우위 입증)을 만족하는 도전자도 현재 없다.
2. **SQLite WASM은 저널을 대체하는 것이 아니라 메타데이터·관계·검색을 담당한다** (E25 조합란: "OPFS는 blob·tile, SQLite는 metadata·관계·검색, cloud object storage는 백업·협업").
3. **CRDT는 한 문서에 하나만** (E24 위험란). Yjs와 Loro를 동일 코퍼스로 비교해 단일 선택하고, 픽셀·타일은 CRDT에 넣지 않는다 — command+seed+bake와 의미 객체만 동기화한다.
4. **OPFS는 백업이 아니다** (E25 위험란). 클라우드 백업·복구 패키지는 출시 게이트(V11 §10.5 release blocker) 요건이다.

---

[^opfs]: MDN, Origin Private File System — `createSyncAccessHandle`은 dedicated Worker 전용이며 동기 read/write/flush/truncate를 제공한다. https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
[^sqlite-wasm]: sqlite.org WASM 문서 — opfs VFS는 COOP/COEP 헤더(SharedArrayBuffer/Atomics)를 요구하고, opfs-sahpool VFS는 헤더 불요 대신 동시 다중 컨텍스트 접근을 지원하지 않는다. https://sqlite.org/wasm/doc/trunk/persistence.md
[^sqlite-license]: SQLite는 퍼블릭 도메인으로 배포된다. https://www.sqlite.org/copyright.html
[^wa-sqlite]: wa-sqlite — 복수 VFS(IndexedDB, OPFS 계열) 구현을 제공하는 SQLite WASM 빌드. https://github.com/rhashimoto/wa-sqlite
[^yjs]: Yjs — MIT, provider 생태계(y-indexeddb, y-websocket, y-webrtc), UndoManager·subdocument 지원. https://github.com/yjs/yjs
[^loro]: Loro — Rust 코어 CRDT, movable tree·rich text·버전 히스토리·shallow snapshot. https://github.com/loro-dev/loro
[^automerge]: Automerge — Rust 코어 CRDT, 문서 히스토리 보존. https://github.com/automerge/automerge
[^blake3]: BLAKE3 — 병렬화 가능한 암호학적 해시, 공식 Rust crate는 CC0-1.0 OR Apache-2.0. https://github.com/BLAKE3-team/BLAKE3
