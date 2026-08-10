# ADR 0007 — 저장: append-only CommandJournal + two-slot snapshot + CRC32 + OPFS, 클라우드 백업은 후속

## 상태

승인 (2026-08-07)

## 맥락

V11의 장시간 안정성 요구(§10.5): "Append-only journal, immutable CAS, snapshot, two-slot superblock, CRC/BLAKE3, OPFS working store, cloud backup, tab/GPU/Worker/quota/network/collab fault injection을 release blocker로 유지한다."

매트릭스 E25(OPFS + SQLite WASM)는 "대형 파일·타일을 브라우저 로컬 파일로 저장하고 metadata/index/journal을 구조화"를 고유 장점으로, "append journal, snapshot, tile chunks, asset index, crash recovery"를 최적 담당으로 판정하며, 위험으로 "OPFS는 백업이 아니므로 외부 복구 패키지와 cloud sync가 필요하다"를 명시한다. 판정: 생산 저장 계층.

IR 계열에 CommandJournal/RecoveryIR이 1급 시민으로 정의되어 있고(§2), Phase 0이 "append journal과 crash recovery vertical slice"를 첫 단계 산출물로 요구한다. 저장 계층은 창작 도구의 신뢰 기반이므로 탭 강제 종료·브라우저 크래시·quota 초과 어느 시점에 잘려도 문서가 복구되어야 한다.

## 결정

1. **문서 영속화의 1차 구조는 append-only CommandJournal이다.** 모든 문서 변경은 IR 커맨드(ADR 0002의 Stable IR 계약)로 저널에 추가 기록되며, 기존 레코드는 수정·삭제하지 않는다. 각 레코드는 길이 프레임 + **CRC32** 체크섬을 갖는다 — 꼬리 잘림(torn write)은 마지막 유효 레코드까지 재생하는 것으로 복구한다.
2. **snapshot은 two-slot 방식이다.** 스냅샷(저널 재생 비용 절단용 materialized IR)은 슬롯 A/B에 교대로 기록하고, superblock이 마지막 검증 완료 슬롯을 가리킨다. 슬롯 쓰기 도중 크래시가 나도 이전 슬롯이 항상 유효하다. 슬롯 전환은 체크섬 검증 후에만 수행한다.
3. **저장 매체는 OPFS다.** blob·tile·저널·스냅샷은 OPFS 파일, metadata·관계·검색 인덱스는 SQLite WASM(E25 권장 분담). 대형 raster tile·asset은 content-addressed 저장(CAS)으로 저널과 분리한다.
4. **복구 절차**: superblock → 유효 스냅샷 슬롯 로드 → 스냅샷 이후 저널 재생(CRC 실패 레코드에서 중단) → RecoveryIR로 복구 리포트 생성. 이 수직 슬라이스가 Phase 0 산출물이다.
5. **클라우드 백업은 후속 슬라이스다.** OPFS는 백업이 아니라는 E25 위험을 인정하되, 1차 출하 범위는 로컬 내구성(크래시·torn write·quota)에 한정한다. cloud object storage 백업·협업 동기화(§2 저장 구조의 Cloud Backup, Yjs/Loro 연동)는 저널·CAS 포맷을 전송 단위로 재사용하는 후속 ADR로 다룬다.
6. 체크섬은 1차로 CRC32(레코드 무결성 — 오류 검출 목적)를 쓰고, CAS 컨텐츠 주소·백업 무결성처럼 충돌 저항이 필요한 곳은 §10.5의 BLAKE3를 후속 도입 시 적용한다.

## 근거

- append-only + 재생은 "어느 시점에 잘려도 직전 상태까지 복구"를 구조적으로 보장한다 — fault injection(tab/GPU/Worker/quota) release blocker(§10.5)를 통과할 수 있는 가장 단순한 구조다.
- two-slot superblock은 §10.5가 명시한 항목이며, 단일 스냅샷 파일의 제자리 갱신이 갖는 파괴적 실패 모드(쓰기 도중 크래시 = 스냅샷 전손)를 제거한다.
- CommandJournal은 저장 형식이면서 동시에 undo/redo·협업(command+seed+bake 동기화, E24)·회귀 재생(기록 입력 스트림)의 공통 기반이다 — IR에 CommandJournal이 1급으로 정의된 이유와 정합한다.
- CRC32 선택은 목적 적합성이다: 저널 레코드의 위협 모델은 악의적 변조가 아니라 torn write·비트 부패이며, CRC32는 저비용으로 이를 검출한다. §10.5의 "CRC/BLAKE3" 병기는 용도별 선택을 허용한다.
- 클라우드 백업 후속화는 범위 통제다: 로컬 내구성 없이 클라우드를 먼저 만들면 동기화가 손상 상태를 복제한다. 반대 순서(로컬 저널·스냅샷 확정 → 그 포맷을 백업 전송 단위로)가 안전하다.

## 결과

- `crates/storage-core-v11`이 저널 포맷(레코드 프레이밍·CRC32·버전), two-slot superblock, OPFS/SQLite 바인딩을 소유한다.
- 스냅샷 주기·저널 컴팩션 정책(저널 길이 임계에서 스냅샷 후 오래된 세그먼트 아카이브)이 필요하다 — 컴팩션도 append-then-switch로만 수행하고 제자리 삭제는 하지 않는다.
- fault injection 스위트(`/tests/fault-injection`)가 탭 킬·quota 소진·쓰기 중단을 주입해 복구 절차를 검증한다 — release blocker.
- SQLite 인덱스는 저널로부터 항상 재구축 가능해야 한다(인덱스 손상은 데이터 손실이 아님 — 원본은 저널·CAS).
- 클라우드 백업 부재 기간 동안 사용자에게 로컬 저장의 한계(기기 분실 = 데이터 손실)를 UI로 고지하고, 외부 복구 패키지 내보내기(문서를 저널+CAS 아카이브로 export)를 임시 백업 수단으로 제공한다.

## 재검토 조건

- 클라우드 백업·협업 동기화 슬라이스 착수 시(전송 포맷·암호화·충돌 해소를 다루는 후속 ADR로 본 ADR의 경계 갱신).
- 저널 재생 시간이 대형 문서(8K·100 layer, 30,000px 스트립) 실측에서 복구 UX 허용치를 넘을 때(스냅샷 주기 단축·세그먼트 병렬 재생 재설계).
- CRC32 검출력이 실제 장애 데이터에서 불충분함이 관찰될 때(레코드 체크섬을 BLAKE3 계열로 상향).
- OPFS quota·성능 특성이 주요 브라우저에서 유의하게 변할 때(저장 계층 프로필 재측정).
