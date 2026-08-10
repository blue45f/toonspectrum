# ADR-0014 — Browser KV 권위 정적 경계

- 상태: Accepted
- 결정일: 2026-08-10
- 범위: `/studio` 제품 소스와 `packages/studio-*`의 browser-local persistence 호출
- 관련: ADR-0012 V12 SQLite/OPFS 로컬 권위, ADR-0013 외부 복구 패키지

## 맥락

ADR-0012는 구조화 창작 데이터의 제품 권위를 SQLite/OPFS로 정했다. 그러나 legacy parser,
테스트 adapter, UI preference, cleanup 코드가 같은 소스 트리에 남아 있으면 새 기능이 편의상
`localStorage.setItem` 또는 IndexedDB wrapper를 다시 제품 경로에 연결할 수 있다. 코드 리뷰만으로는
optional chaining, alias, 주입형 storage, `IDBFactory.open`, `IDBObjectStore.put`을 저장소 전체에서
계속 추적하기 어렵다.

또한 localStorage/IndexedDB 코드를 전부 문자열 금지하면 다음 정당한 경계까지 잃는다.

- UI layout, acknowledgement, consent, tutorial progress
- browser clipboard 실패 시 bounded session transfer
- V12 durable commit 뒤 이전 key를 지우는 cleanup
- 사용자가 명시적으로 실행하는 legacy import/test adapter

따라서 broad ban도 broad exception도 사용하지 않고 실행 가능한 정적 권위 경계를 둔다.

## 결정

`src/domains/creator/studio-browser-kv-authority-boundary.test.ts`를 제품 권위 회귀 게이트로 채택한다.

### 탐색 범위

- `src/domains/creator` 재귀
- 실행 시 발견되는 모든 `packages/studio-*/src`
- test/spec/story/fixture/generated/testing 파일 제외

현재 별도 파일 목록을 수동 유지하지 않고 package directory를 발견하므로 새 Studio package도 자동
포함된다.

### 검출 범위

- direct, `window`, `globalThis`, optional-chain localStorage write/cleanup
- localStorage alias write
- autosave/project/CRDT/brush/filter/calibration 등 known durable key를 쓰는 주입형 `.setItem`
- native `indexedDB.open`, typed `IDBFactory.open`
- `IDBObjectStore.put/add/delete`
- Dexie와 `idb`/`idb-keyval` wrapper

검출기는 TypeScript AST를 사용한다. 댓글이나 문서의 `localStorage.setItem` 텍스트는 호출로 오인하지
않는다.

### 허용 조건

허용 항목은 다음 필드를 모두 가진다.

```text
exact file
finding kind
exact key or IDB method
exact occurrence count
rationale
proof
```

wildcard path/key와 broad regex exemption은 금지한다. 호출 수가 늘면 같은 key라도 실패하고,
legacy 호출이 제거됐는데 allowance가 남아도 stale allowance로 실패한다.

허용 클래스는 네 가지뿐이다.

1. UI preference/acknowledgement/tutorial/consent/recent state
2. bounded clipboard/session-transfer compatibility
3. `removeItem`/IDB `delete` cleanup-only
4. 제품 기본 SQLite/OPFS factory와 분리된 injected compatibility 또는 explicit legacy import/test,
   그리고 사용자에게 상태가 보이는 emergency rollback

허용 목록은 browser KV를 제품 권위로 승인하지 않는다. legacy 제거를 방해하지 않도록 정확한 현재
표면을 기록한 감소형 원장이다.

## 절대 정책

- `LEGACY_DATA_MIGRATION=FALSE`
- 제품 boot는 pre-V12 localStorage key/IndexedDB database를 자동 발견하거나 복사하지 않는다.
- project/autosave/CRDT/brush/filter/VRM calibration의 durable 성공은 SQLite/OPFS receipt만 인정한다.
- SQLite/OPFS 실패 시 localStorage/IndexedDB로 조용히 전환하지 않는다.
- memory-only 편집은 허용할 수 있지만 durable generation을 올리지 않고 UI에 손실 가능성을 표시한다.
- renderer/provider/GPU 객체는 어떤 storage에도 문서 원본으로 저장하지 않는다.

## 자체 검증

가드 테스트 자체가 무력화되지 않도록 source-string fixture를 포함한다.

- 실패해야 하는 예: direct/window/globalThis/alias localStorage, key-obscured autosave,
  native IndexedDB, injected `IDBObjectStore`, Dexie, `idb.openDB`
- exact allowance로만 통과하는 예: UI density, session clipboard, cleanup-only, legacy import
- allowance hygiene: wildcard·빈 key·중복·0 occurrence·짧은 사유를 거부
- 실제 workspace: unreviewed finding 0, stale allowance 0

도입 시점의 실제 탐색은 105개 호출을 UI/cleanup/injected compatibility/legacy IDB로 분류했다.
이 수치는 승인 목표가 아니라 감소 대상 baseline이며, 실행 테스트의 exact occurrence가 단일 진실이다.

## 결과

### 긍정적

- SQLite/OPFS로 전환한 제품 경로가 새 browser KV fallback으로 퇴행하면 같은 PR에서 실패한다.
- alias와 wrapper를 포함하므로 단순 `rg localStorage`보다 우회가 어렵다.
- UI preference와 cleanup은 유지하면서 창작 권위만 차단한다.
- legacy 코드를 지우면 allowlist도 반드시 줄어든다.
- 새 `packages/studio-*`가 자동으로 검사된다.

### 한계

- 정적 분석은 runtime dependency injection의 실제 객체 identity를 완전히 증명하지 않는다. 따라서
  product boundary test와 실제 Chromium OPFS benchmark를 함께 유지한다.
- computed method, reflection, minified/generated runtime은 검출 대상이 아니다. 제품 TypeScript에서
  storage access를 reflection으로 작성하는 것을 금지한다.
- current allowlist의 legacy IDB는 아직 소스에 존재한다. 제품 기본 경로와 분리되어 있지만 장기적으로
  삭제하고 occurrence baseline을 0에 가깝게 줄인다.

## 증거

- executable gate: `src/domains/creator/studio-browser-kv-authority-boundary.test.ts`
- 후보 비교: `docs/candidates/browser-kv-authority/capability-survey.md`
- 설계: `docs/candidates/browser-kv-authority/hybrid-design.md`
- benchmark 계획: `docs/candidates/browser-kv-authority/benchmark-plan.md`
- license/deployment: `docs/candidates/browser-kv-authority/license-deployment.md`
- SQLite/OPFS 실제 browser 결과: `tests/benchmarks/results/*sqlite-opfs-browser.json`,
  `tests/benchmarks/results/*library-opfs-browser.json`
