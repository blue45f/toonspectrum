# Recovery package CAS hybrid design

## 결정

V12 외부 복구는 로컬 SQLite/OPFS 권위와 분리된 명시적 파일 작업이다.

```text
SQLite JournalStore + two-slot SnapshotIR
  → 기존 recoverProject로 완전한 frontier 검증
  → canonical snapshot.json + journal-tail.json
OPFS asset bytes
  → 기존 WebCrypto SHA-256 / sha256:<hex>
  → content-addressed attachment entries
rights + metadata + project identity
  → strict canonical manifest v1
  → 기존 studio-package-archive deterministic ZIP32/store writer
  → caller-owned local file port (.toonrecovery.zip)
```

서버 업로드, 자동 동기화, 계정 백업 또는 cloud retention은 이 모듈에 없다. 파일 picker/download
UX도 호출자가 명시적 port로 제공해야 하며, 제품 API에는 `fetch`, URL 또는 인증 토큰이 없다.

## 컨테이너 레이아웃

```text
manifest.json
history/snapshot.json            # snapshot이 있을 때만
history/journal-tail.json
attachments/sha256/<64hex>.bin   # hash 오름차순, 같은 bytes는 1개
```

모든 ZIP entry는 UTF-8, compression method `store`, extra/comment 없음, DOS epoch timestamp다. 기존
`buildStudioPackageArchiveBytes`가 CRC32와 ZIP32 central/local header를 쓴다. 새 recovery 모듈은 기존
project archive의 schema-specific importer를 호출할 수 없으므로, 동일 안전 규약의 strict reader만
소유한다. 이 reader는 central/local 일치, 물리 구간 연속성, path normalization, duplicate extraction
path, CRC32, 파일·바이트 한도를 검증한다.

## manifest v1

manifest는 다음 안정 필드를 가진다.

- `schema`, `version: 1`, `hashAlgorithm: "sha256"`.
- `project`: projectId, 선택적 workspaceId/title. 런타임 엔진 객체 없음.
- `recovered`: 최종 seq와 stable IR `projectDigest`.
- `snapshot`: path/hash/bytes/slot/seq/snapshot project digest 또는 null.
- `journalTail`: snapshot base seq, first/last seq, count, path/hash/bytes.
- `attachments`: content hash에서 경로를 유도한 bytes, MIME, rights, metadata.
- package-level `rights`, `metadata`, 정확한 totals.

객체 key는 `canonicalJson`으로 정렬되고 attachment·tag·notice 배열도 정규화 정렬된다. 동일한
history, attachment bytes와 metadata를 다른 입력 순서로 주어도 완성 ZIP bytes가 동일하다.

## 두 단계 import

### 1. authenticate

`importStudioV12RecoveryPackage`는 외부 상태를 쓰기 전에 다음을 모두 끝낸다.

1. archive 총 크기와 EOCD/central directory 범위.
2. path traversal, Unicode/case-fold duplicate, hidden local bytes, ZIP bomb 선언.
3. 각 entry CRC32.
4. manifest strict schema, unknown version, canonical bytes와 expected path 집합.
5. snapshot/journal/attachment SHA-256 및 manifest byte totals.
6. SnapshotIR/JournalEntryIR exact canonical schema. unknown/engine object 필드는 reject.
7. 기존 `recoverProject`가 CRC, gap, command apply, scene/project digest를 통과하는지 확인.

이 단계가 성공해야만 immutable import payload를 반환한다. 손상 일부를 조용히 버리고 성공으로
표시하지 않는다.

### 2. restore

`restoreStudioV12RecoveryPackage`는 비어 있는 JournalStore만 받는다. content-addressed attachment
target을 먼저 호출하고, target이 같은 hash를 반환해야 history를 기록한다. OPFS 연동은 기존
`StudioOpfsAssetStore.put` adapter를 사용한다.

JournalStore에는 bulk transaction API가 없으므로 history 복원을 원자적이라고 과장하지 않는다.
중간 storage failure가 나면 저장된 journal prefix는 기존 recovery 계약으로만 복구할 수 있고 호출은
`RESTORE_FAILED`로 끝난다. 새 SQLite DB를 대상으로 쓰는 것이 정상 제품 흐름이다.

## 고정 한도

| Boundary | v1 maximum |
| --- | ---: |
| Archive | 256,000,000B |
| Manifest | 1,000,000B |
| Snapshot | 64,000,000B |
| Journal tail | 64,000,000B / 100,000 entries |
| Attachments | 1,024 files |
| One attachment | 128,000,000B |
| Attachment total | 192,000,000B |
| Files | 1,027 |
| UTF-8 path | 240B |

호출자는 이 값을 낮출 수 있지만 높일 수 없다. Blob/typed-array 입력은 async hash 전에 snapshot해
호출자 변이에 의한 TOCTOU를 막는다. signal은 모든 await와 attachment/history loop 사이에서
검사한다. WebCrypto 한 번의 digest 자체는 중단할 수 없으므로 완료 직후 AbortError를 반환한다.

## no-engine-object 원칙

복구 패키지는 SnapshotIR, JournalEntryIR, 권리/메타데이터의 strict schema만 저장한다. CanvasKit,
Vello, Konva, Three, GPUDevice/Adapter 같은 런타임 handle key가 JSON에 들어오면 명시적으로 거부한다.
attachment는 opaque bytes이며 엔진 인스턴스 직렬화가 아니다.

## cloud upload 잔여 블로커

현재 패키지는 사용자가 외부 파일로 보관할 수 있는 disaster-recovery vertical slice다. 클라우드
백업 완료 표시는 다음이 없으므로 금지한다.

- 인증된 upload/download provider와 사용자 동의 UX.
- end-to-end encryption, key recovery/rotation과 메타데이터 노출 정책.
- resumable multipart, retry/idempotency와 서버 측 content hash 재검증.
- retention/versioning/deletion/export 규칙과 권리·지역·개인정보 정책.
- quota/billing, offline conflict, 계정 탈취 및 ransomware recovery runbook.
- 실제 provider 장애·대용량·네트워크 fault benchmark.

이 조건은 파일 패키지 API 밖의 별도 후보 조사와 보안/법무 결정을 요구한다.
