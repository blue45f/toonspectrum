# ToonStudio V12 — storage-recovery 하이브리드 설계

## 1. 결정

V12는 로컬 저장을 다음 두 책임으로 나눈다.

```text
의미·복구 계약
  stable ToonStudio IR / CommandBus
  append journal + CRC32 + two-slot snapshot
                 │
                 ▼
물리·질의 권위
  @sqlite.org/sqlite-wasm 3.53.0-build1
  OPFS SAH-pool /toonspectrum-studio-sqlite/studio-local-v12.db
```

SQLite는 단순 파생 인덱스가 아니라 V12 로컬 제품 데이터의 물리 권위다. 그러나 SQLite 행에
renderer/engine 객체를 저장하지 않는다. 복구 가능한 stable IR, canonical JSON, provider ID와
실측 비용만 저장한다. 저널 의미와 손상 복구 판정은 ToonStudio가 소유하고, B-tree·transaction·
constraint·keyset query는 SQLite가 소유한다.

## 2. 단일 런타임 소유권

```text
acquireStudioLocalDatabase()
  └─ app lifetime Promise<StudioLocalDatabase> 1개
      ├─ history journal / A·B snapshots
      ├─ autosave / checkpoint / workspace metadata
      ├─ renderer tournament winners / cost samples
      ├─ brush_library_records
      ├─ filter_library_records
      └─ validated KV documents
          ├─ animatic
          ├─ translation memory
          ├─ production bible
          └─ creator-pack install receipts
```

lazy feature chunk마다 SAH-pool을 다시 설치하거나 별도 DB를 열지 않는다. 제품은 app-lifetime
공유 handle을 사용하고 테스트/명시적 종료에서만 `closeStudioLocalDatabaseRuntime()`을 호출한다.
브라우저 하니스는 Dedicated Worker에서 같은 제품 open/repository 코드를 실행해 close/reopen을
증명한다.

다중 탭 writer 정책은 Web Locks 또는 lease epoch로 한 writer를 선출한다. history recovery는
document identity와 30초 lease, writer epoch, process queue를 사용한다. 명시적 협업 프로토콜이
없는 서로 다른 탭의 변경을 임의 last-write-wins로 “병합 완료” 표시하지 않는다.

## 3. 쓰기와 복구 흐름

### 3.1 명령 저널

```text
accepted command
  → canonical journal payload + seq + CRC32
  → BEGIN IMMEDIATE
  → 같은 project_id에서 seq 이상의 torn tail 제거
  → journal_entries upsert/append
  → COMMIT
```

스냅샷은 slot 0/1을 교대한다. 복구는 newest valid snapshot과 그 이후의 연속 CRC-valid tail만
노출하며 첫 손상/공백 이후 항목을 조용히 건너뛰지 않는다. slot B가 손상되면 A로 되돌아가고,
두 슬롯과 tail의 issue를 구조화해 반환한다.

### 3.2 제품 문서

애니매틱·번역 메모리·Production Bible은 저장 전 기존 domain exporter/schema를 재사용한다.

1. 크기·항목 수·문자 길이·버전 검증
2. canonical JSON 생성
3. namespace+key 단일 `kvSet` upsert
4. load 시 같은 importer/strict schema로 재검증
5. 일부 행만 살릴 수 없는 손상은 전체 `invalid`로 fail-closed

각 어댑터는 save queue와 generation fencing을 둔다. 먼저 시작한 느린 쓰기가 나중 편집을
덮지 않으며, unmount 뒤 늦은 hydration이 React 상태를 되돌리지 않는다.

### 3.3 대형 카탈로그

브러시와 필터는 JSON envelope 전체를 읽지 않는다.

- 브러시 UI 초기 256행, 필터 UI 초기 128행
- stable composite order + cursor 기반 keyset pagination
- 검색·category/engine·pinned/favorite 조건을 SQL에 pushdown
- 정확 `totalCount`와 명시적 “더 불러오기”
- mutation 뒤 사용자가 의도적으로 불러온 깊이까지만 bounded refresh
- import/creator pack은 `putMany()` transaction으로 cap 없이 기록

Creator Pack 설치는 현재 resource 행과 receipt가 두 단계다. 중간 종료 후 partial row 또는 receipt
불일치를 발견하면 설치 완료로 간주하지 않고 `repair-required`로 차단한다. 단일 원자 transaction으로
과장하지 않으며, 향후 receipt와 resource write를 한 DB transaction으로 합치는 것이 교체 조건이다.

## 4. Preview와 durable commit

pointer move·GPU composite·selection overlay에는 SQLite/OPFS I/O가 없다. 진행 중 stroke는 입력/
renderer 메모리에 있고, command commit·autosave debounce·명시 저장 경계에서만 durable queue에
들어간다. `createSyncAccessHandle`과 SQL statement는 storage worker/runtime 소유이며 interactive
render hot path의 GPU→CPU readback과도 무관하다.

```text
pen move / frame             committed command / document save
--------------------------   ----------------------------------
memory + GPU only            async serialized storage queue
no SQL                       validation + transaction
no OPFS flush                success/failure surfaced to UI
```

## 5. 실패 정책

| 실패 | 동작 |
| --- | --- |
| WebAssembly/OPFS/SAH-pool 부재 | `SqliteUnavailableError`; 조용한 memory/localStorage 강등 금지 |
| SQLite open/migration 실패 | 제품 데이터 미로드, 오류 표면화, 명시 retry 가능 |
| journal row CRC/torn JSON | 첫 불연속에서 tail 절단, issue 보고 |
| snapshot 한 슬롯 손상 | 다른 슬롯 + 연속 tail로 복구 |
| 두 슬롯 모두 손상 | 빈 정상 문서로 가장하지 않고 recovery issue/실패 |
| document canonical/schema 불일치 | `invalid`; 자동 덮어쓰기 차단, 검증된 명시 import만 복구 가능 |
| save 실패 | 메모리 편집 유지 가능, UI는 “메모리 임시·저장되지 않음” 표시 |
| quota 초과 | 실패 전파, 정리/export 안내; localStorage에 복제하지 않음 |
| Worker/device/tab 종료 | 이미 COMMIT된 행만 재개방, 진행 중 요청은 미완료로 취급 |
| creator-pack row/receipt 불일치 | `repair-required`; 성공 배지 금지 |

SQLite unavailable compatibility adapter가 남아 있는 모듈은 **V12 전용 키**만 사용할 수 있고,
제품 기본 성공 경로가 아니다. 기존 Studio v1 키를 자동 탐색하지 않는다.

## 6. 데이터 폐기와 외부 포맷

V12 DB 파일명 자체를 `studio-local-v12.db`로 바꿔 이전 `/studio-local.db`를 재개방하지 않는다.
기존 autosave/checkpoint/workspace/animatic/tournament/brush/filter/TM/Bible 키도 제품 boot에서 읽지
않는다. 최종 파괴 작업은 다음 세 조건을 모두 요구한다.

1. compile-time destructive flag
2. `RESET_EXISTING_STUDIO_DATA=YES`
3. confirmation phrase `REPLACE_CURRENT_TOONSTUDIO_IN_PLACE_V12`

반면 사용자가 선택한 SUT/SUTG/KPP/MYB/Krita bundle/ABR/JSON은 FormatGateway 입력이다. 이는
폐기 대상 내부 데이터의 자동 migration이 아니라 명시적 외부 asset import이며, 원본·rights·
unsupported를 보존한다.

## 7. 백업과 협업 경계

OPFS는 같은 origin의 로컬 내구성일 뿐 백업이 아니다. 브라우저 데이터 삭제·기기 분실을 막지
못한다. cloud backup/CAS는 별도 권한·암호화·보존 정책과 함께 구현해야 하며 현재 로컬 저장
완료를 클라우드 동기화로 표현하지 않는다.

Yjs/Loro 협업도 별도 Provider다. CRDT에는 layer/text/comic/animation 같은 의미 객체와 asset
hash만 넣고 raster tile 대형 blob은 넣지 않는다. CRDT가 선택되더라도 SQLite 저널과 백업의
역할을 대체하지 않는다.

## 8. 교체 조건

- 공식 SQLite WASM을 wa-sqlite/다른 엔진으로 교체: 같은 실제 Chromium OPFS 하니스에서
  canonical/복구 품질 동률, p95 우위, 번들·메모리·라이선스 게이트 통과 시만 허용.
- localStorage 제품 기본 복귀: 허용하지 않는다. SQLite보다 정확성과 내구성이 우수하다는 같은
  테스트 증거가 없는 한 후보가 아니다.
- KV 문서의 구조화 테이블 승격: 검색/부분 갱신이 실제 병목이고 schema migration 비용보다
  p95·메모리 우위가 입증될 때.
- creator pack two-stage commit: resource+receipt를 한 SQLite transaction으로 합친 뒤
  fault injection에서 partial install 0을 증명하면 `repair-required` 경계를 단순화한다.
