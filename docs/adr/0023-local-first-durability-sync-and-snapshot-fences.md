# ADR-0023 — Local-first 내구 저장, 클라우드 동기화와 서버 스냅샷 경계 분리

- 상태: Proposed
- 결정일: 2026-09-16
- 범위: Studio 편집 명령, OPFS autosave journal, CRDT outbox/ACK, CreatorWork 저장, 검수·게시 snapshot
- 관련: [ADR-0012](0012-v12-sqlite-opfs-local-authority.md), [ADR-0016](0016-studio-route-document-runtime-boundaries.md), [ADR-0020](0020-editor-client-ui-command-boundary.md), [ADR-0022](0022-studio-authority-identity-production-modes.md)

## 1. 맥락

Studio에는 이미 다음의 서로 다른 내구·버전 경계가 있다.

1. 메모리 Authoring Document
2. 문서별 Web Lock으로 직렬화된 OPFS autosave journal
3. SQLite CRDT outbox와 recovery vault
4. 인증된 realtime gateway의 CRDT update ACK와 server sequence
5. `CreatorWork` 전체 문서 revision
6. review snapshot, approval, publish package 좌표

각 경계는 목적이 다르지만 사용자와 일부 오케스트레이션 코드에서는 모두 `저장`으로 표현될 수 있다.
특히 `studio-page-save-pipeline.ts`는 다음을 하나의 동작으로 묶고 있다.

```text
마지막 획 확정
→ 문서 mutation 잠금
→ CRDT authoritative ACK barrier
→ 모든 페이지 canvas capture
→ 전체 DTO 생성
→ CreatorWork create/update
→ autosave durable authority clear
→ route navigation
```

이 흐름은 공식 서버 snapshot을 만들 때는 필요하다. 그러나 일반 초안 저장이나 로컬/P2P 편집에도 같은 의미가
적용되면 다음 문제가 발생한다.

- 서버가 없어도 OPFS에 안전하게 저장된 원고를 `저장 실패`로 표시한다.
- 로컬 저장과 클라우드 권한 검증이 결합되어 초보자가 저장 방식을 선택해야 한다.
- 한 번의 저장에 모든 페이지 캡처와 전체 문서 전송이 필요하다.
- 자동 저장 빈도를 높이면 캡처·직렬화·네트워크 비용이 과도해진다.
- server CRDT sequence와 CreatorWork revision의 차이가 UI에서 드러나지 않는다.
- 검수본과 현재 편집 head를 혼동할 위험이 있다.

반대로 server ACK를 제거하거나 P2P 수신을 server ACK로 인정하면 공동 편집 권위가 약해지고 영구 거절된 변경을
공식 원고로 오인할 수 있다. 따라서 로컬 내구성과 서버 권위 중 하나를 선택하는 것이 아니라 경계를 분리해야 한다.

## 2. 결정

### 2.1 일반 편집의 첫 번째 저장 완료 조건은 OPFS receipt다

사용자의 편집 명령은 다음 순서로 처리한다.

```text
EditorClient dispatch
→ Authoring Document apply
→ OPFS journal append/checkpoint
→ LocalDurabilityReceipt 발급
→ UI: 이 기기에 저장됨
→ CRDT outbox enqueue
→ 서버 연결 시 전송/ACK
```

`LocalDurabilityReceipt`가 발급되면 네트워크 연결 여부와 무관하게 사용자의 현재 기기에서는 저장된 것으로 표시한다.
OPFS 실패 전까지 server ACK를 기다리며 편집을 막지 않는다.

```ts
export interface StudioLocalDurabilityReceiptV1 {
  readonly schemaVersion: 1;
  readonly documentScope: string;
  readonly localSequence: number;
  readonly journalGeneration: number;
  readonly operationCount: number;
  readonly contentDigest: string;
  readonly persistedAt: string;
}
```

receipt는 다음을 보장한다.

- 해당 sequence까지 journal 또는 checkpoint에서 복구 가능하다.
- 같은 document scope의 writer가 Web Lock으로 직렬화되었다.
- content digest가 canonical serializer 기준으로 계산되었다.
- receipt 이후 clear tombstone 없이는 해당 frontier를 조용히 제거하지 않는다.

### 2.2 클라우드 동기화 완료 조건은 인증 서버 ACK다

CRDT update의 원격 내구 완료는 현재 원칙을 유지한다.

- stable update id
- server-side persist 후 ACK
- monotonic server sequence
- fresh state-vector sync
- outbox ACK tombstone
- permanent rejection 시 recovery vault

BroadcastChannel, P2P receipt, 다른 탭의 snapshot은 server ACK가 아니다.

```ts
export interface StudioCloudSyncReceiptV1 {
  readonly updateId: string;
  readonly serverSequence: string;
  readonly stateVectorDigest: string;
  readonly acknowledgedAt: string;
}
```

`StudioCrdtRoomBinding.flushAndWaitForAuthoritativeAck()`의 보안 의미는 유지한다. 다만 일반 로컬 저장의
필수 단계로 사용하지 않고 server snapshot fence의 하위 단계로 한정한다.

### 2.3 CreatorWork revision은 명시적 server snapshot이다

다음 동작만 CreatorWork revision을 전진시키는 snapshot fence를 요구한다.

- `클라우드 원고 갱신`
- 이름 있는 서버 버전 생성
- 검수본 생성
- 승인 요청
- 게시 package 생성
- 서버 compaction 정책에 따른 background snapshot

snapshot fence는 다음 조건을 모두 확인한다.

1. 현재 로컬 명령이 OPFS에 내구 저장되었다.
2. 현재 collaborative frontier의 pending update가 server ACK를 받았다.
3. snapshot 요청의 required server sequence가 persisted Y.Doc frontier에 포함된다.
4. Authoring document digest와 raster asset manifest가 일치한다.
5. CreatorWork revision 증가가 원자적으로 commit된다.

```ts
export interface StudioServerSnapshotFenceRequestV1 {
  readonly baseWorkRevision: number;
  readonly requiredCrdtServerSequence: string;
  readonly expectedStateVectorDigest: string;
  readonly expectedDocumentDigest: string;
  readonly intent: "manual-version" | "review" | "approval" | "publish" | "compaction";
  readonly previewPolicy: "none" | "thumbnail" | "review-medium" | "publish-source";
}
```

### 2.4 사용자 상태는 하나의 boolean이 아니라 projection이다

상태 문구를 다음으로 제한한다.

| 조건 | 기본 문구 | 보조 정보 |
| --- | --- | --- |
| memory 변경, journal 대기 | `기기 저장 준비 중` | 짧은 진행 상태 |
| OPFS receipt, remote 없음 | `이 기기에 저장됨` | 로컬 전용 |
| OPFS receipt, offline | `이 기기에 안전하게 저장됨` | `오프라인 · 연결되면 자동 동기화` |
| outbox pending | `기기에 저장됨` | `클라우드 동기화 중` |
| authoritative ACK 완료 | `클라우드와 동기화됨` | 마지막 ACK 시각 |
| CRDT ACK 뒤 CreatorWork snapshot 이전 | `클라우드와 동기화됨` | `검수용 서버 원고 갱신 가능` |
| snapshot current | `서버 원고 최신` | CreatorWork revision |
| local journal 실패 | `기기 저장 실패` | 복구 package와 재시도 |
| permanent rejection | `복구 확인 필요` | 협업 편집 차단, recovery vault 유지 |

`저장 버튼`은 일반 저장을 수행하는 수단이 아니라 다음 명시적 작업 진입점으로 바뀐다.

- 이름 있는 버전 만들기
- 검수본 만들기
- 서버 원고 갱신
- 복구 지점 만들기
- 게시 준비

일반 편집은 자동 저장되며 사용자가 로컬/서버 방식을 매번 선택하지 않는다.

### 2.5 server sequence와 CreatorWork revision을 분리한다

다음 좌표는 합치지 않는다.

```text
local sequence
local checkpoint
CRDT server sequence
CreatorWork server revision
review snapshot id
approval id
publish package id
```

- CRDT server sequence는 update stream 내구 ACK다.
- CreatorWork revision은 검수·게시 가능한 canonical snapshot이다.
- review snapshot은 CreatorWork revision과 content digest를 고정한다.
- approval은 review snapshot의 source를 고정한다.
- publish package는 approval source revision만 출력한다.

기존 `StudioVersionCoordinates`는 이 분리를 계속 담당하며 UI는 `resolveStudioVersionProjection()`과 동등한
projection에서 상태를 읽는다.

### 2.6 현재 save pipeline은 adapter로 축소한다

`runStudioPageSavePipeline()`을 즉시 삭제하지 않는다.

#### 단계 A — 의미 변경

- 일반 autosave 진입점에서 호출하지 않는다.
- `commitStudioServerSnapshot()` adapter가 기존 pipeline을 호출한다.
- snapshot request에 `requiredCrdtServerSequence`와 expected digest를 포함한다.
- 모든 페이지 capture는 review/publish/explicit snapshot에서만 수행한다.

#### 단계 B — capture 분리

- CreatorWork canonical document와 page preview artifact를 분리한다.
- snapshot commit은 document revision을 먼저 원자적으로 생성한다.
- preview/export worker가 해당 revision에서 thumbnail·review preview를 비동기 생성한다.
- 작업 목록 thumbnail은 latest successful preview receipt를 가리킨다.

#### 단계 C — server materialization

- 서버가 persisted Y.Doc frontier와 asset manifest에서 snapshot을 materialize한다.
- 클라이언트가 전체 page data URL을 매번 업로드하지 않는다.
- 구형 client DTO path는 compatibility flag 아래 유지한 뒤 제거한다.

### 2.7 local/P2P 모드에서의 동작

- OPFS receipt가 있으면 정상 저장 상태다.
- local peer delivery는 공동 작업 전파 상태로 표시할 수 있으나 cloud sync 완료는 아니다.
- server snapshot, review, approval, publish는 인증 서버가 없으면 사용할 수 없다.
- 해당 제한은 `저장 실패`가 아니라 `서버 기능을 사용하려면 로그인/연결 필요`로 표현한다.
- P2P frontier는 파일/복구 package로 내보낼 수 있으며 server work로 승격할 때 새 권한 검사를 거친다.

## 3. 동시성·수명 주기 규칙

### 3.1 두 탭

- 같은 document scope의 OPFS writer는 하나다.
- 기존 `studio-autosave-document-leader.ts`와 Web Lock을 사용한다.
- follower 탭은 leader에게 journal append를 요청하거나 편집 불가/독립 사본 중 하나를 명시한다.
- 두 탭이 같은 journal sequence를 독립 증가시키지 않는다.
- leader 종료 시 generation fencing 후 새 leader가 checkpoint/journal을 재검증한다.

### 3.2 종료

- `beforeunload` 네트워크 요청은 내구성 보장이 아니다.
- active command는 종료 전 journal queue에 들어가야 한다.
- queue가 아직 OPFS receipt를 만들지 못했으면 UI와 unload guard가 위험을 표시한다.
- 서버 ACK를 기다리기 위해 종료를 무기한 차단하지 않는다.

### 3.3 clear/tombstone

- CreatorWork snapshot 성공만으로 최신 로컬 journal을 즉시 삭제하지 않는다.
- snapshot이 고정한 local sequence/digest가 현재 frontier와 정확히 같을 때 해당 sequence까지 compaction한다.
- snapshot 이후 새 edit가 있으면 새 journal tail을 유지한다.
- durable clear tombstone은 scope, generation, throughSequence, digest를 포함한다.

## 4. 실패 정책

### 4.1 OPFS 실패

- 첫 write 실패: bounded retry, `기기 저장 준비 중`
- retry 초과: `기기 저장 실패`, durabilityAtRisk=true
- 메모리 편집은 가능한 범위에서 유지하되 저장된 것으로 표시하지 않는다.
- recovery package export를 제공한다.
- 손상 journal을 빈 정상 문서로 덮어쓰지 않는다.

### 4.2 server transport 실패

- 로컬 편집 계속
- outbox 유지
- exponential backoff + online event 즉시 retry
- retryable failure는 recovery vault로 이동하지 않는다.

### 4.3 permanent rejection

- optimistic frontier를 recovery vault에 보존한다.
- collaborative mutation을 차단한다.
- 서버 권위 원고 reload, 거절된 변경 export, 권한 확인을 제공한다.
- 자동으로 서버 문서를 로컬 frontier로 덮지 않는다.

### 4.4 snapshot conflict

- base CreatorWork revision이 오래되었으면 409
- required CRDT server sequence가 아직 persisted frontier에 없으면 retryable conflict
- expected digest가 다르면 fail closed
- UI는 최신 server head와 local frontier를 비교한 뒤 다시 snapshot을 만들도록 안내한다.

## 5. API와 타입 변경

### 5.1 Web 내부 경계

권장 신규 인터페이스:

```ts
interface StudioDurabilityRuntime {
  append(command: StudioDomainCommand): Promise<StudioLocalDurabilityReceiptV1>;
  checkpoint(reason: "interval" | "manual" | "snapshot-fence"): Promise<StudioLocalDurabilityReceiptV1>;
  status(): StudioDurabilityStatus;
  subscribe(listener: () => void): () => void;
}

interface StudioSyncRuntime {
  enqueue(update: Uint8Array): string;
  ensureAuthoritativeFrontier(timeoutMs?: number): Promise<StudioCloudFrontierReceiptV1>;
  status(): StudioSyncStatus;
  subscribe(listener: () => void): () => void;
}

interface StudioServerSnapshotCoordinator {
  commit(input: StudioServerSnapshotIntent): Promise<StudioServerSnapshotReceiptV1>;
}
```

`StudioSyncRuntime.ensureAuthoritativeFrontier()`는 기존 `flushAndWaitForAuthoritativeAck()`의 의미를 감싸며,
호출자가 일반 저장이 아니라 snapshot fence임을 타입으로 드러낸다.

### 5.2 서버 요청

신규 endpoint 제안:

```text
POST /creator/works/:id/authoring-snapshots
```

응답:

```ts
interface StudioServerSnapshotReceiptV1 {
  readonly workId: string;
  readonly revision: number;
  readonly contentDigest: string;
  readonly crdtServerSequence: string;
  readonly stateVectorDigest: string;
  readonly previewJobId: string | null;
  readonly createdAt: string;
}
```

## 6. 검증

### 6.1 순수 테스트

- 상태 projection이 memory/local/queued/synced/snapshot/recovery를 정확히 구분
- snapshot fence는 server sequence 없이 성공하지 않음
- peer receipt는 cloud receipt로 변환 불가
- clear tombstone이 새 journal tail을 삭제하지 않음
- local sequence와 generation 역행 차단

### 6.2 브라우저 통합 테스트

1. server 없이 그리기 → `이 기기에 저장됨` → 강제 종료 → 동일 digest 복구
2. offline 편집 1,000 operation → reconnect → outbox drain → 최종 digest 일치
3. 같은 문서 두 탭 → 단일 writer → leader 종료 → 새 leader 승계
4. server ACK 지연 중에도 로컬 편집 지속
5. permanent rejection → recovery vault 유지 → reload/export 가능
6. 일반 autosave가 page capture와 CreatorWork API를 호출하지 않음
7. 검수본 만들기가 final pending stroke와 required server sequence를 포함
8. snapshot 완료 직후 새 edit가 생겨도 새 journal tail 유지

### 6.3 관측성

최소 metric:

- `studio_durability_receipt_latency_ms`
- `studio_durability_failure_total{reason}`
- `studio_crdt_outbox_depth`
- `studio_crdt_ack_latency_ms`
- `studio_snapshot_fence_latency_ms{intent,stage}`
- `studio_snapshot_conflict_total{reason}`
- `studio_recovery_required_total{code}`
- `studio_autosave_page_capture_total` — 일반 autosave에서 항상 0이어야 함

## 7. 결과

### 긍정

- 서버가 없어도 사용자의 원고를 안전하게 저장할 수 있다.
- 초보자가 저장 위치를 매번 결정할 필요가 없다.
- server authority와 P2P/local receipt의 보안 경계를 유지한다.
- 자동 저장에서 모든 페이지 캡처를 제거할 수 있다.
- 검수·승인·게시가 정확한 server revision을 사용한다.
- 작업 목록 thumbnail을 독립 preview job으로 안정적으로 갱신할 수 있다.

### 비용·제약

- UI가 하나의 `saved` boolean 대신 여러 상태를 다뤄야 한다.
- snapshot worker 도입 전까지 기존 client capture 경로를 병행해야 한다.
- OPFS receipt와 CRDT update의 sequence correlation 계약이 필요하다.
- 로컬 저장 완료와 서버 공식 원고 최신이 다르다는 개념을 도움말에 설명해야 한다.

## 8. 기각한 대안

### 대안 A — 모든 저장에 server ACK 요구

기각. 오프라인·로컬 작업을 정상 상태로 취급할 수 없고 자동 저장을 무겁게 만든다.

### 대안 B — P2P receipt를 server ACK로 인정

기각. 권한·영속 순서·전역 frontier를 증명하지 못한다.

### 대안 C — server ACK를 제거하고 client snapshot만 저장

기각. 마지막 collaborative update가 빠진 stale snapshot을 공식 원고로 만들 수 있다.

### 대안 D — 매 edit마다 CreatorWork 전체 revision 생성

기각. 전체 document·preview 비용, revision 폭증, 충돌 범위를 키운다.

### 대안 E — localStorage를 즉시 fallback 권위로 사용

기각. ADR-0012의 SQLite/OPFS 단일 권위와 대형 문서 내구성 계약을 위반한다.

## 9. 마이그레이션과 호환

1. 상태 projection과 metric만 shadow로 추가한다.
2. 기존 save 버튼 문구를 `서버 원고 저장`으로 바꾸기 전에 자동 저장 상태를 먼저 노출한다.
3. local/P2P에서 일반 저장 오류를 제거하되 server snapshot action은 명확히 disable한다.
4. 기존 pipeline을 `commitStudioServerSnapshot` adapter 뒤로 이동한다.
5. snapshot endpoint가 안정화되면 page capture를 preview worker로 분리한다.
6. 구형 client는 기존 CreatorWork save를 계속 사용할 수 있으나 새 review/approval 생성에는 snapshot receipt가 필요하다.
7. feature flag rollback 시 기존 server save path를 유지하고 생성된 local receipts/outbox를 삭제하지 않는다.

## 10. 승인 체크리스트

- [ ] 제품 문구 `기기 저장` / `클라우드 동기화` / `서버 원고` 승인
- [ ] `flushAndWaitForAuthoritativeAck`의 일반 autosave 호출 제거 범위 확인
- [ ] OPFS receipt와 command sequence 연결 방식 승인
- [ ] snapshot endpoint의 sequence/digest 검증 책임 승인
- [ ] client capture → server preview worker 전환 단계 승인
- [ ] local/P2P server 기능 제한 UX 승인
- [ ] 두 탭 writer/follower 정책 승인
