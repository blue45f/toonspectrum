# ToonStudio V11 — storage-recovery 하이브리드 설계 (Hybrid Design)

- 담당 서브시스템: **storage-recovery** (E24·E25)
- 전제: 1차 구현 = `project-model-v11`의 **append-only CommandJournal + two-slot snapshot + CRC32 복구** (메모리/파일/OPFS 저널스토어 3종). 본 설계는 이 소유 계층을 중심에 두고 SQLite WASM(인덱스), CAS+클라우드(백업), Yjs/Loro(협업)를 장점별로 조합한다.

## 1. 단계별 파이프라인 (입력 → 처리 → 렌더 → 출력)

저장 서브시스템에서 각 단계는 다음으로 해석한다.

```text
[입력]  편집 이벤트
  CommandRegistry가 발행한 Command (stroke commit, layer op, effect op, ...)
  + 협업 세션이면 원격 CRDT op 스트림
        │
        ▼
[처리]  내구성 계층 (storage island 소유)
  1. Command → CommandJournal append (append-only, 레코드별 CRC32)
  2. 주기·임계 도달 시 snapshot 생성 → two-slot 교대 기록
  3. 타일·에셋 blob → CAS 청크 (BLAKE3 주소) → OPFS blob store
  4. 메타데이터·에셋 인덱스·검색어 → SQLite WASM upsert
  5. 협업 모드: 의미 객체 diff → Yjs/Loro doc 반영 (픽셀·타일 제외)
        │
        ▼
[렌더]  복구·하이드레이션 (읽기 경로)
  1. superblock/슬롯 검증 → 유효 snapshot 선택 (two-slot 중 CRC 통과분)
  2. snapshot 이후 저널 리플레이 → CRC 실패 지점에서 절단
  3. 복원된 IR → HybridExecutionPlanner → 엔진 캐시(SkPath, vello::Scene 등) 재생성
     (V11 §2.1: 엔진 객체는 저장 원본이 아니라 재생성 가능한 cache)
  4. 협업 모드: CRDT 상태 벡터 교환 → 누락 op 수신 → 병합
        │
        ▼
[출력]  외부화
  1. 클라우드 백업: journal segment + snapshot + CAS 청크 업로드 (내용 주소 기반 증분)
  2. 복구 패키지 export: 단일 파일 아카이브 (superblock + snapshot + tail journal + 참조 CAS 청크)
  3. 협업 서버: CRDT update 릴레이·영속화
```

## 2. Preview / Final 분리

V11 §1.2의 Preview/Final 분리를 저장 계층에 그대로 적용한다. **프레임 예산을 쓰는 경로와 내구성을 보장하는 경로를 분리**하는 것이 핵심이다.

| 구분 | Preview 내구성 (편집 중) | Final 내구성 (커밋 지점) |
| --- | --- | --- |
| 대상 | 진행 중 스트로크·드래그의 임시 상태 | 완료된 Command, 스냅샷, export |
| 스토어 | 메모리 저널스토어 (링 버퍼) | OPFS 저널스토어 + flush |
| 보장 | 탭 생존 시 undo 연속성 | 크래시·탭 종료 후 복구 가능 |
| hot path 규칙 | append는 비동기 큐 적재만. 렌더 루프에서 OPFS I/O 0회 (V11 §9.1 hot path 원칙의 저장판) | flush는 storage worker에서만. `createSyncAccessHandle` 동기 쓰기 후 flush |
| 스냅샷 | 없음 (저널만) | two-slot 교대 + CRC32, 완료 후 이전 세대 저널 세그먼트 compaction |
| 백업 | 없음 | 클라우드 증분 업로드 (idle·주기 트리거) |

스트로크 커밋 시점에 Preview 저널의 확정 구간이 Final 저널로 승격된다. 이 경계는 핫패스 탈React 계약(커밋 지연 파이프라인)과 동일한 리듬을 탄다 — 프레임당 갱신은 메모리, 커밋 시 내구성.

## 3. Island 소유권

V11 §1.1 "한 Surface 또는 큰 Island에 주 소유자 하나" 원칙을 저장에 적용한다.

```text
Storage Island = dedicated Worker 1개 (문서당)
├─ 소유: OPFS sync access handle (저널·스냅샷·CAS 파일 전부)
├─ 소유: SQLite WASM 연결 (opfs-sahpool 채택 시 배타 접근이 강제되므로 정확히 일치)
├─ 소유: CRC 검증·compaction·백업 업로더 스케줄
└─ 외부 계약: 메시지 채널 (append batch / snapshot request / hydrate / query)

Main thread
├─ 소유 금지: OPFS 핸들 직접 접근 금지
└─ CommandRegistry → append batch 전송만

CRDT doc (협업 모드)
├─ 소유: 의미 객체 트리 (레이어·벡터·텍스트·댓글·컷·키프레임)
├─ 소유 금지: raster tile·대형 asset (CAS 참조 해시만 보유)
└─ 영속화: CRDT update도 CommandJournal의 한 레코드 타입으로 Storage Island에 위임
```

**단일 작성자(single-writer) 규칙**: 한 문서의 Final 저널 작성자는 항상 정확히 하나의 Storage Island다. 다중 탭이 같은 문서를 열면 Web Locks로 writer를 선출하고, 나머지 탭은 read-only + CRDT 경유로만 편집을 전파한다. 이 규칙 덕분에 opfs-sahpool VFS의 배타 접근 제약이 제약이 아니라 설계와 일치하게 된다.

## 4. 폴백 체인

CapabilityRegistry가 부팅 시 프로브해 아래 체인에서 가장 높은 단계를 선택한다. 각 강등은 사용자에게 내구성 수준 변화를 고지한다.

### 4.1 물리 저장 체인

```text
1. OPFS + dedicated worker sync access handle   ← 기본 (Final 내구성 전체 제공)
2. OPFS 비동기 핸들 (createWritable)            ← sync handle 실패 시. flush 빈도 하향
3. IndexedDB 저널스토어                          ← OPFS 불가 브라우저. 세그먼트 단위 blob 기록
4. 메모리 저널스토어 + 강제 클라우드 백업 권고    ← 최후. "이 세션은 로컬 복구 불가" 명시 경고
```

### 4.2 메타데이터·검색 체인

```text
1. SQLite WASM (opfs-sahpool VFS)               ← 기본. COOP/COEP 불요, 단일 writer와 정합
2. SQLite WASM (opfs VFS)                        ← COOP/COEP 배포 프로필에서 비교 채택 가능
3. SQLite WASM (메모리 DB) + 저널에서 재구축      ← OPFS 불가 시. 인덱스는 세션 휘발
4. 인덱스 비활성 (선형 스캔)                      ← 검색·최근 목록 기능 축소 모드
```

메타데이터 체인이 어느 단계로 떨어져도 **정합성의 원천은 항상 CommandJournal**이다. SQLite 인덱스는 저널에서 언제든 전량 재구축 가능한 파생 데이터로 취급한다(손상 시 drop & rebuild).

### 4.3 협업 체인

```text
1. CRDT(Yjs 또는 Loro, 벤치 후 단일 선택) + 서버 릴레이   ← 실시간 협업
2. CRDT 로컬 + 오프라인 큐                                  ← 네트워크 단절. 재접속 시 병합
3. 저널 단독 (협업 비활성)                                  ← CRDT 로드 실패. 단독 편집은 무손상 유지
```

### 4.4 백업 체인

```text
1. 클라우드 증분 백업 (CAS 주소 기반 dedup 업로드)
2. 수동 복구 패키지 export (단일 파일 다운로드)
3. 백업 없음 경고 배너 (OPFS는 백업이 아님을 상시 고지)
```

## 5. 복구 시나리오별 동작 계약

V11 §10.5의 fault injection 항목(tab/GPU/Worker/quota/network/collab)을 저장 관점 계약으로 고정한다.

| 장애 | 계약 |
| --- | --- |
| 탭 크래시·강제 종료 | 재시작 시 two-slot 스냅샷 중 CRC 통과 슬롯 + 저널 tail 리플레이. 손실 허용 범위 = 마지막 flush 이후 구간만 |
| 저널 torn write | 레코드 CRC32 실패 지점에서 절단. 절단 이전까지 전부 복원 |
| 스냅샷 torn write | 손상 슬롯 폐기, 이전 슬롯 + 더 긴 저널 리플레이로 복원 |
| quota 초과 | append 실패를 상위로 전파, 편집 차단 대신 백업·정리 유도. 부분 기록 잔여물은 다음 부팅 CRC가 제거 |
| Worker 크래시 | Storage Island 재기동 → 핸들 재획득 → 미확정 큐 재전송 (Command에 멱등 seq 부여) |
| 네트워크 단절 (협업) | CRDT 오프라인 큐. 로컬 저널은 영향 없음 |
| 클라우드 장애 | 백업만 지연. 로컬 내구성 계약 불변 |

## 6. 자체 구현 경계 (V11 §3.3 적용)

- **유지하는 자체 구현**: 저널·two-slot·CRC 복구(이미 존재), CAS 청크·복구 패키지 포맷, 백업 스케줄러. 근거: 비파괴 의미 보존과 복구 계약이 제품 경쟁 우위 영역이고, 이를 통째로 제공하는 검증 엔진이 없다.
- **재사용하는 검증 엔진**: SQLite WASM(질의·인덱스를 자체 B-tree로 재발명하지 않는다), Yjs/Loro(CRDT 수렴 알고리즘을 자체 구현하지 않는다), BLAKE3/CRC32 crate(해시 자체 구현 금지).
- **경쟁 벤치 대상**: CRC32 → BLAKE3 저널 체크섬 승격 여부, Yjs vs Loro, 공식 SQLite WASM vs wa-sqlite. 전부 `tests/benchmarks` 하니스 실측으로만 결정한다.
