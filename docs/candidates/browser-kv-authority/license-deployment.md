# Browser KV 권위 license 및 deployment 검토

## 제품 baseline

| Component | Pin / API | License | Deployment role | 검증 사항 |
| --- | --- | --- | --- | --- |
| `@sqlite.org/sqlite-wasm` | `3.53.0-build1` | package manifest `Apache-2.0` | SQLite ESM/WASM와 OPFS SAH-pool | THIRD_PARTY_NOTICES, exact pin, WASM hash/inventory, Worker CSP |
| SQLite core | package가 감싼 upstream SQLite WASM | SQLite upstream public-domain 정책; wrapper 고지와 구분 | SQL engine | 배포 BOM에 wrapper와 core 출처를 분리 기재 |
| OPFS / Web Locks / localStorage / IndexedDB | Web Platform | third-party package 없음 | browser storage/cross-tab primitives | browser support, secure context, COOP/COEP, quota |
| Dexie | 미도입 후보 | upstream Apache-2.0 후보; 도입 시 exact package manifest 재검증 | IndexedDB convenience layer 후보 | 직접 의존·bundle·notices·CSP 실측 전 승격 금지 |

로컬 설치 artifact의 raw 크기는 다음과 같다. 이는 압축된 production chunk 크기가 아니며,
deployment budget에서는 Vite 산출물과 Worker lazy-load를 다시 측정한다.

| Artifact | Raw bytes |
| --- | ---: |
| `dist/sqlite3.wasm` | 864,752 |
| `dist/index.mjs` | 578,559 |
| `dist/sqlite3-worker1.mjs` | 571,858 |
| `dist/sqlite3-opfs-async-proxy.js` | 32,289 |

## Worker와 헤더

OPFS persistence는 Worker에서 실행하며 다음 capability를 startup probe로 확인한다.

- secure context
- `navigator.storage.getDirectory`
- `FileSystemFileHandle.createSyncAccessHandle`
- 필요한 배포의 COOP `same-origin`
- 필요한 배포의 COEP `require-corp`
- Worker/WASM CSP와 same-origin artifact load

capability가 없으면 SQLite/OPFS가 성공한 것처럼 표시하지 않는다. 메모리 세션으로 내려갈 경우
durability는 `none`이고 UI에 새로고침 손실 가능성을 표시한다. localStorage/IndexedDB로 조용히
전환하지 않는다.

## 데이터 배치

```text
OPFS SAH-pool directory: toonspectrum-studio-sqlite
SQLite logical file:     /studio-local-v12.db
Large immutable bytes:   feature-specific OPFS SHA-256 CAS roots
Autosave recovery:       native OPFS journal roots
```

- SQL에는 canonical JSON, index column, lease, hash/length/mime receipt만 둔다.
- font, VRM, GLB, PNG 같은 byte는 SQL TEXT/base64에 넣지 않는다.
- renderer/provider 객체, GPU resource, object URL, FileSystemHandle은 IR에 저장하지 않는다.
- database/schema migration은 `PRAGMA user_version` + transaction으로 순차 적용한다.

## localStorage/IndexedDB 배포 정책

localStorage는 exact UI key만 허용한다. key 이름만 UI라고 해서 충분하지 않으며 payload가 project,
stroke, brush program, filter graph, asset byte, calibration profile을 포함하면 즉시 금지 대상이다.

IndexedDB 코드는 pre-V12 import/test 또는 명시적 emergency rollback을 위해 일부 소스에 남아 있다.
제품 기본 factory가 이를 ambient global에서 자동 발견하지 않아야 한다. 정적 가드는 database open,
put/add/delete의 파일·키·호출 수를 고정하며, legacy 코드 제거 시 stale allowance가 실패해 원장도
같이 줄이도록 강제한다.

`LEGACY_DATA_MIGRATION=FALSE`이므로 배포 시 기존 key/DB를 복사하지 않는다. 최종 cutover 삭제는
ADR-0012의 3중 파괴 플래그를 사용한다. cleanup은 durable V12 commit/tombstone이 끝난 뒤에만
수행한다.

## 보안·개인정보

- API key/credential은 localStorage 제품 권위에 두지 않는다. 세션 전용 BYOK는 session storage
  또는 memory로 제한하고 서버 provider credential은 서버에서 관리한다.
- OPFS는 origin-private이지 암호화 백업이 아니다. 기기/브라우저 프로필 삭제 대응은 ADR-0013의
  외부 복구 패키지 경계가 담당한다.
- site data 삭제, private mode, quota 정책을 durability 보장으로 오인하지 않는다.
- multi-tenant/user scope를 SQL key와 CAS owner receipt에 포함하고 auth 전환을 generation fence한다.

## 출하 체크리스트

- [ ] exact SQLite package pin과 WASM hash가 notices/inventory에 있음
- [ ] production Worker와 WASM chunk byte 측정
- [ ] COOP/COEP/CSP에서 OPFS browser gate 통과
- [ ] localStorage/IndexedDB fallback used = 0
- [ ] static browser-KV authority test 통과
- [ ] close/reopen 및 Worker terminate recovery 통과
- [ ] quota/corruption에서 silent fallback 0
- [ ] UI preference allowlist payload review
- [ ] legacy allowance 감소 또는 explicit quarantine 기록
