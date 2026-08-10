# Browser KV 권위 하이브리드 설계

## 목표

`/studio`의 사용자가 “저장됨”으로 이해하는 데이터에는 하나의 명시적 권위만 둔다. 작은 UI 상태를
위해 localStorage를 없애는 것이 목표가 아니라, 창작 데이터·복구 정보·카탈로그가 편의 API를 통해
다시 browser KV 권위로 퇴행하는 것을 차단하는 것이 목표다.

```text
Studio stable IR / canonical document
  ├─ structured metadata, catalog, lease ──> SQLite WASM / OPFS SAH-pool
  ├─ large immutable bytes ────────────────> OPFS SHA-256 CAS
  ├─ append/crash recovery ────────────────> native OPFS journal or SQLite journal
  ├─ UI preference / consent / tutorial ──> localStorage (explicit allowlist)
  └─ transient clipboard / degraded edit ─> browser clipboard or memory/session state
```

## 권위 규칙

| 데이터 종류 | Primary | 실패 시 | 금지 |
| --- | --- | --- | --- |
| Project/autosave/CRDT journal | native OPFS journal 또는 shared SQLite | memory-only + 명시적 degraded 상태 | localStorage/IndexedDB에 성공으로 기록 |
| Brush/filter/asset/catalog | shared SQLite 구조화 table/manifest | bounded memory session + 저장 실패 표시 | 전체 JSON localStorage envelope, 숨은 cap |
| VRM/BG3D/font/texture byte | OPFS SHA-256 CAS + SQLite manifest-last commit | 현재 탭 byte 또는 작업 취소 | base64 localStorage, engine object 저장 |
| Calibration/precision profile | SQLite canonical row | 현재 세션 calibration + 저장 실패 표시 | localStorage/IndexedDB silent mirror |
| UI layout/favorite/recent/ack | exact localStorage key | default UI | 창작 payload 포함 |
| Clipboard/consent/tutorial | browser clipboard 또는 exact bounded key | 현재 세션 기능 제한 | durable creative authority로 승격 |
| Legacy internal Studio data | 명시적 import/test adapter만 | 읽지 않음 | product boot 자동 발견·복사 |

`LEGACY_DATA_MIGRATION=FALSE`이므로 pre-V12 key나 database가 존재한다는 사실은 migration trigger가
아니다. 사용자 파일 선택을 통한 외부 창작 포맷 import는 FormatGateway 작업이며 내부 저장소 자동
migration과 구분한다.

## 정적 경계 가드

`studio-browser-kv-authority-boundary.test.ts`는 제품 코드를 import하거나 실행하지 않고 TypeScript
AST로 다음을 검사한다.

1. `src/domains/creator`를 재귀 탐색한다.
2. `packages/studio-*/src`를 디렉터리 이름으로 발견해 모두 탐색한다.
3. test/spec/story/fixture/generated/testing 소스는 제품 권위가 아니므로 제외한다.
4. `localStorage.setItem`, `window/globalThis.localStorage`, localStorage alias, 위험한 key를 쓰는
   주입형 `.setItem`을 찾는다.
5. `indexedDB.open`, `IDBFactory.open`, `IDBObjectStore.put/add/delete`, Dexie, `idb.openDB`를 찾는다.
6. 파일 + operation kind + key/method + occurrence count가 정확히 맞는 항목만 허용한다.
7. 허용 항목이 사라져도 stale allowance로 실패한다. 따라서 legacy 제거 뒤 목록도 반드시 줄어든다.

가드는 문자열 검색만 사용하지 않는다. optional chaining, multiline call, alias, 상수 key와 native
IDB type을 AST로 인식한다. 자체 fixture는 direct/aliased/key-obscured localStorage, native IDB,
Dexie와 `idb` wrapper가 실제로 검출되는지 확인한다. 반대로 UI preference, clipboard, remove-only,
명시적 legacy import는 exact allowance가 있을 때만 통과한다.

## 허용 목록의 의미

허용 목록은 “이 저장소를 제품 권위로 승인한다”는 뜻이 아니다.

- UI 항목은 payload가 presentation/session 범위를 넘지 않는 동안만 유효하다.
- `removeItem`/IDB `delete`는 이전 권위를 만드는 것이 아니라 제거하기 위한 cleanup-only 경계다.
- IndexedDB 항목은 V12 SQLite/OPFS 제품 factory와 분리된 pre-V12 import/test 또는 관측 가능한
  emergency rollback 코드다.
- 주입형 `storage.setItem`은 ambient browser storage를 자동 선택하지 않는 codec/test seam이다.
- 같은 파일에 같은 method가 하나 늘어도 occurrence count가 달라져 실패한다.

따라서 broad path regex, 디렉터리 wildcard, “legacy 파일 전체” 예외는 두지 않는다.

## 장애와 복구

1. SQLite/OPFS open 실패를 잡아 localStorage/IndexedDB write로 재시도하지 않는다.
2. 현재 탭 메모리에 편집을 유지할 수 있으나 durability receipt를 만들지 않는다.
3. UI는 저장 실패와 reload 시 손실 가능성을 표시한다.
4. corruption은 empty 정상값으로 덮지 않고 fail-closed한다.
5. OPFS CAS byte hash와 SQLite manifest를 함께 검증한다.
6. clear/tombstone은 durable store commit 이후 compatibility key를 삭제한다.

## 교체 조건

IndexedDB/Dexie가 제품 후보로 돌아오려면 같은 corpus에서 SQLite/OPFS보다 높은 복구 성공률 또는
명확한 browser reach 우위, canonical 의미 보존, p50/p95/p99, Worker/Bundle/peak memory, 이중 권위가
없는 전환 설계를 함께 제출해야 한다. 단순 API 편의성은 교체 근거가 아니다.
