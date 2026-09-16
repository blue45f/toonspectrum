# ADR-0024 — Production operation log와 revision-pinned 검수·승인·게시 계약

- 상태: Proposed
- 결정일: 2026-09-16
- 범위: Production Workspace v3, 작업·역할·인계, 외부 검토, review snapshot, approval, publish package
- 관련: [ADR-0022](0022-studio-authority-identity-production-modes.md), [ADR-0023](0023-local-first-durability-sync-and-snapshot-fences.md)

## 1. 맥락

현재 Studio Production Center는 이미 다음을 지원하는 Workspace v3 모델을 가진다.

- `episode → sequence → scene → page` 제작 계층
- planning, script, storyboard, rough, lineart, color/background, lettering, review, approved, publishing 단계
- story, storyboard, lineart, color, background, lettering, reviewer, director, publisher 역할
- task의 의존성, 담당자, 검수자, 우선순위, 진행률, 차단 이유
- 역할 배정과 범위
- 장면 인계 brief, locked fields, acceptance criteria
- 검수 항목과 승인 capability
- 이름 있는 Production version snapshot
- 서버 저장소와 외부 review link

서버는 `GET/PUT /creator/works/:id/production`을 제공한다. `PUT`은 `baseRevision`과 전체 Workspace document를
받고 exact revision이 아니면 409를 반환한다. 이 모델은 단일 편집과 초기 서버화에는 안전하지만 팀 단위 실시간
운영에서는 충돌 범위가 너무 크다.

예를 들어 식자 담당자가 `task-lettering-4`의 진행률을 바꾸는 동안 PD가 다른 장면의 검수 항목을 생성하면 두 변경은
논리적으로 독립적이다. 그러나 전체 document PUT에서는 늦게 저장한 사용자가 전체 재로드·재적용해야 한다.

또한 `studio-review-workflow.ts`에는 revision-pinned review cycle, snapshot, thread, blocker, approval 코어가 있지만
현재 외부 review API는 페이지 이미지와 단순 `comment/approve/reject` feedback 중심이다. 단순 feedback의 approve가
공식 approval과 같은 의미가 되어서는 안 된다.

따라서 다음 두 문제를 함께 해결해야 한다.

1. Production 변경을 entity-scoped idempotent operation으로 전환한다.
2. 검수·승인·게시를 특정 CreatorWork revision과 digest에 고정한다.

## 2. 결정

### 2.1 Workspace v3는 조회 projection과 compacted snapshot으로 유지한다

현재 `ProductionWorkspace` 타입과 검증 규칙은 폐기하지 않는다.

- UI 최초 조회
- offline/read-only cache
- export/backup
- operation log compaction
- 구형 client 호환

에 계속 사용한다.

다만 서버 mutation의 canonical 입력은 전체 document PUT이 아니라 operation이다.

```text
Production operation append
→ operation-level authorization
→ entity/field conflict check
→ current snapshot에 deterministic apply
→ 전체 invariant 검증
→ operation receipt + revision 증가
→ compacted Workspace snapshot 갱신
```

### 2.2 Production operation contract

공유 contract는 browser와 API가 동일 parser를 사용한다.

```ts
export interface StudioProductionOperationV1 {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly clientId: string;
  readonly workId: string;
  readonly baseWorkspaceRevision: number;
  readonly target: StudioProductionOperationTargetV1;
  readonly kind: StudioProductionOperationKindV1;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly submittedAt: string;
}

export interface StudioProductionOperationTargetV1 {
  readonly entityKind:
    | "workspace"
    | "task"
    | "review-issue"
    | "hierarchy-node"
    | "role-assignment"
    | "handoff";
  readonly entityId: string | null;
  readonly fieldPaths: readonly string[];
}
```

operation kind v1:

```ts
export type StudioProductionOperationKindV1 =
  | "workspace.rename"
  | "task.create"
  | "task.patch"
  | "task.delete"
  | "review-issue.create"
  | "review-issue.patch"
  | "review-issue.resolve"
  | "hierarchy-node.create"
  | "hierarchy-node.move"
  | "hierarchy-node.delete"
  | "role-assignment.create"
  | "role-assignment.patch"
  | "role-assignment.delete"
  | "handoff.create"
  | "handoff.patch"
  | "handoff.accept"
  | "version-snapshot.create";
```

#### 규칙

- `operationId`는 work 범위에서 영구 idempotency key다.
- actor user id는 request payload에서 받지 않고 인증 context에서 주입한다.
- `submittedAt`은 사용자 UX 참고값이며 server `appliedAt`이 권위다.
- `fieldPaths`는 parser가 kind별 allowlist와 대조한다.
- patch payload는 arbitrary JSON Merge Patch가 아니라 kind별 strict schema다.
- delete는 tombstone operation이다. compacted snapshot에서는 제거할 수 있지만 operation audit에는 남는다.
- version snapshot operation은 현재 Workspace projection만 고정하며 Authoring 문서 revision을 대신하지 않는다.

### 2.3 operation receipt

```ts
export interface StudioProductionOperationReceiptV1 {
  readonly operationId: string;
  readonly workId: string;
  readonly actorUserId: string;
  readonly acceptedWorkspaceRevision: number;
  readonly affectedEntityRevisions: readonly {
    readonly entityKind: StudioProductionOperationTargetV1["entityKind"];
    readonly entityId: string;
    readonly fieldRevisions: Readonly<Record<string, number>>;
  }[];
  readonly appliedAt: string;
  readonly snapshotRevision: number;
}
```

동일 `operationId` 재전송은 동일 semantic receipt를 반환한다. request payload가 기존 operation과 다르면
idempotency-key-reuse 오류로 거절한다.

### 2.4 충돌은 전체 Workspace가 아니라 entity/field 범위로 판정한다

#### 자동 재적용 가능

- 서로 다른 task
- 같은 task의 서로 다른 독립 field
- 다른 hierarchy subtree
- 다른 review issue
- presence 또는 화면 정렬 같은 비영속 UI preference

#### 명시적 충돌

- 같은 task의 동일 field가 base 이후 변경됨
- hierarchy parent/order를 동시에 변경
- 역할 제거와 해당 역할을 task에 새로 배정
- task delete와 task patch
- handoff accept와 acceptance criteria 변경
- 승인/게시 capability가 필요한 상태 전이

서버는 field conflict를 반환하고 전체 Workspace reload를 강제하지 않는다.

```ts
export interface StudioProductionFieldConflictV1 {
  readonly entityKind: string;
  readonly entityId: string;
  readonly fieldPath: string;
  readonly baseFieldRevision: number;
  readonly currentFieldRevision: number;
  readonly currentValue: unknown;
}
```

### 2.5 전체 invariant는 operation 적용 후 항상 재검증한다

기존 Workspace v3 검증을 유지한다.

- ID 중복 금지
- episode→sequence→scene→page 부모 규칙
- hierarchy cycle 금지
- page identity 중복 금지
- task dependency self/cycle/missing reference 금지
- assignee/reviewer assignment 존재 확인
- handoff hierarchy 존재 확인
- 문서 크기·항목 수 상한

operation-level 검증이 통과해도 최종 snapshot 검증이 실패하면 transaction 전체를 rollback한다.

### 2.6 capability는 operation kind와 상태 전이에 적용한다

| Capability | 허용 operation |
| --- | --- |
| `view` | snapshot·operation receipt 조회 |
| `edit` | 일반 task/review/hierarchy/handoff 변경 |
| `manageRoles` | role assignment, member scope 변경 |
| `approve` | approved 단계 진입, approval-required issue 해제, handoff 최종 승인 |
| `publish` | publishing 단계 진입, publish package 요청 |
| `manageLinks` | external review link 생성·폐기 |

`edit` 사용자가 payload를 조작해 approved/publishing 상태로 진입할 수 없도록 서버가 previous→next transition을 검사한다.

### 2.7 review feedback와 공식 workflow를 분리한다

외부 review link의 `comment/approve/reject`는 검토자의 의견이다.

- `comment`: review thread message 또는 새 thread 후보
- `reject`: changes-requested 후보
- `approve`: reviewer recommendation

공식 approval은 아니다. 공식 approval은 다음 조건을 만족하는 별도 command다.

1. `approve` capability
2. revision-pinned review snapshot
3. 열려 있는 blocker 0
4. review cycle status가 `in-review`
5. snapshot source revision/digest와 current stored record 일치
6. canonical approval statement digest

### 2.8 review cycle과 snapshot은 서버 영속 record다

```ts
export interface StudioReviewCycleRecordV1 {
  readonly id: string;
  readonly workId: string;
  readonly status:
    | "draft"
    | "in-review"
    | "changes-requested"
    | "revised"
    | "approved"
    | "superseded";
  readonly currentSnapshotId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioReviewSnapshotRecordV1 {
  readonly id: string;
  readonly cycleId: string;
  readonly workId: string;
  readonly sourceServerRevision: number;
  readonly sourceContentDigest: string;
  readonly sourceCrdtServerSequence: string;
  readonly sourceArchiveSchemaVersion: number;
  readonly previewManifestId: string;
  readonly createdBy: string;
  readonly createdAt: string;
}
```

snapshot은 immutable이다. 수정 원고는 같은 cycle의 새 snapshot 또는 정책상 새 cycle을 만든다.

### 2.9 review thread는 snapshot anchor를 사용한다

기존 `StudioReviewAnchorV2`를 유지한다.

- semantic entity
- element
- point
- region
- script range
- time range
- publish issue

thread는 snapshot에 속한다. 새 snapshot으로 넘어갈 때 자동 덮어쓰지 않고 carry-over resolution을 기록한다.

```ts
export type StudioReviewTargetResolution =
  | "resolved"
  | "moved"
  | "modified"
  | "orphaned";
```

orphaned thread도 감사 기록에서 삭제하지 않는다.

### 2.10 approval은 immutable이며 stale/superseded를 구분한다

```ts
export interface StudioApprovalRecordV1 {
  readonly id: string;
  readonly workId: string;
  readonly reviewCycleId: string;
  readonly reviewSnapshotId: string;
  readonly sourceServerRevision: number;
  readonly sourceContentDigest: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly statementDigest: string;
  readonly supersededAt: string | null;
}
```

- server head가 앞으로 이동하면 approval은 `stale` projection이 된다.
- 명시적으로 새 approval이 기존 approval을 대체하면 `supersededAt`을 기록한다.
- stale는 삭제나 무효 조작이 아니라 “현재 head와 다름”을 뜻한다.
- source digest mismatch는 stale가 아니라 invalid이며 fail closed한다.

### 2.11 publish package는 approval source를 고정한다

```ts
export interface StudioPublishPackageV1 {
  readonly id: string;
  readonly workId: string;
  readonly approvalId: string;
  readonly sourceServerRevision: number;
  readonly sourceContentDigest: string;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly manifestDigest: string | null;
  readonly status:
    | "queued"
    | "materializing"
    | "rendering"
    | "validating"
    | "ready"
    | "failed"
    | "cancelled";
  readonly requestedBy: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
}
```

export worker는 current head가 아니라 `sourceServerRevision`을 materialize한다. 작업 도중 head가 변경되어도 job input은
바뀌지 않는다.

## 3. API 결정

### 3.1 Production operations

```text
POST /creator/works/:id/production/operations
GET  /creator/works/:id/production/operations?afterRevision=<n>&limit=<n>
```

batch request:

```ts
interface ApplyStudioProductionOperationsV1 {
  readonly baseWorkspaceRevision: number;
  readonly operations: readonly StudioProductionOperationV1[];
}
```

batch는 순서대로 원자 적용한다. 하나가 실패하면 기본값은 전체 rollback이다. 향후 independent partial batch가 필요하면
새 schema version으로 도입하며 v1의 의미를 바꾸지 않는다.

응답:

```ts
interface StudioProductionOperationsResultV1 {
  readonly workId: string;
  readonly baseRevision: number;
  readonly revision: number;
  readonly receipts: readonly StudioProductionOperationReceiptV1[];
  readonly snapshot: ProductionWorkspace;
}
```

초기 구현은 snapshot을 함께 반환해 UI 단순성을 유지한다. 안정화 후 `Prefer: return=minimal`을 지원할 수 있다.

### 3.2 Review

```text
POST  /creator/works/:id/review-cycles
GET   /creator/works/:id/review-cycles
POST  /creator/works/:id/review-cycles/:cycleId/snapshots
POST  /creator/works/:id/review-threads
PATCH /creator/works/:id/review-threads/:threadId
POST  /creator/works/:id/approvals
```

review snapshot 생성은 ADR-0023의 server snapshot receipt를 요구한다.

### 3.3 Publish

```text
POST /creator/works/:id/publish-packages
GET  /creator/works/:id/publish-packages/:packageId
POST /creator/works/:id/publish-packages/:packageId/cancel
POST /creator/works/:id/publish-packages/:packageId/retry
```

retry는 같은 source approval을 유지하고 새 execution attempt를 만든다. 동일 idempotency key의 중복 요청은 기존 package를
반환한다.

### 3.4 기존 API 호환

```text
GET /creator/works/:id/production  유지
PUT /creator/works/:id/production  호환 경로
```

PUT은 다음 정책을 따른다.

- 구형 client의 exact revision update 허용
- operation client가 활성화된 account/work에서 deprecation telemetry
- PUT document diff를 server-side synthetic operation으로 변환하지 않는다. 의미가 모호하기 때문이다.
- migration 종료 시 read-only import endpoint 또는 explicit replace capability로 축소한다.

## 4. 저장소 결정

### 4.1 Production

기존 `creatorWorkProductionWorkspaces`:

- latest compacted snapshot
- current revision
- updated by/time

신규 `creator_work_production_operations`:

- work_id
- operation_id unique
- actor_user_id
- client_id
- base_revision
- accepted_revision
- kind
- entity_kind/entity_id
- field_paths
- request_digest
- payload
- submitted_at/applied_at

신규 `creator_work_production_entity_revisions`:

- work_id
- entity_kind/entity_id
- field_revision_map JSONB
- deleted_at

operation append, entity revision, compacted snapshot revision 증가는 하나의 DB transaction이다.

### 4.2 Review/Approval

별도 정규화 테이블을 사용한다.

- `creator_work_review_cycles`
- `creator_work_review_snapshots`
- `creator_work_review_threads`
- `creator_work_review_thread_messages`
- `creator_work_approvals`

외부 review feedback는 link/token audit를 위해 기존 테이블을 유지하고, 내부 thread로 수용할 때 source feedback id를 기록한다.

### 4.3 Publish

- `creator_work_publish_packages`
- `creator_work_publish_attempts`
- `creator_work_publish_artifacts`

artifact bytes는 object storage, DB에는 immutable metadata/digest/object key만 저장한다.

## 5. 클라이언트 동작

### 5.1 optimistic operation

1. kind별 local validator
2. local Production snapshot에 deterministic apply
3. SQLite operation outbox에 append
4. UI 즉시 갱신
5. server batch 전송
6. receipt로 local operation ACK
7. server snapshot projection 채택

server reject 시 전체 local Workspace를 버리지 않는다.

- invalid permission: operation rollback + 안내
- field conflict: 대상 field만 conflict UI
- missing dependency/entity: 관련 operation과 dependent operation을 blocked 상태로 전환
- schema/protocol mismatch: mutation 중지 + client reload/update 안내

### 5.2 offline

- server-work에서도 일반 edit capability를 마지막으로 확인한 범위에서 offline operation draft를 만들 수 있다.
- offline draft는 `서버 미승인`임을 표시한다.
- manageRoles, approve, publish처럼 권한 민감 operation은 offline queue를 기본 허용하지 않는다.
- reconnect 시 최신 capability와 entity revision을 다시 확인한다.

### 5.3 cross-tab

- full Workspace를 BroadcastChannel로 전달하지 않는다.
- `{ scopeKey, revision, sourceClientId }` invalidation receipt를 유지한다.
- operation outbox writer도 scope Web Lock으로 직렬화한다.
- 더 최신 revision을 본 탭만 server snapshot을 다시 읽는다.

## 6. 감사와 보존

### 6.1 보존 대상

- accepted Production operation/receipt
- review snapshot
- review thread/message
- approval
- publish package manifest/attempt receipt

### 6.2 변경 금지

- accepted operation payload를 수정하지 않는다.
- approval source revision/digest를 수정하지 않는다.
- ready publish package manifest를 수정하지 않는다.
- correction은 새 record와 supersedes reference로 표현한다.

### 6.3 개인정보

- operation payload에 필요 이상의 display name, email, raw prompt, clipboard, access token을 넣지 않는다.
- user identity는 opaque id를 사용하고 표시 이름은 조회 시 projection한다.
- 외부 reviewer 이름은 별도 retention/privacy 정책을 적용한다.

## 7. 실패와 복구

| 실패 | 서버 동작 | 클라이언트 동작 |
| --- | --- | --- |
| duplicate operation id, same digest | 기존 receipt 반환 | ACK 처리 |
| duplicate operation id, different digest | 409 idempotency key reuse | operation 중지·진단 |
| independent stale base | 최신 snapshot에 재적용 | receipt 채택 |
| same field stale base | field conflict 반환 | field merge UI |
| invariant violation | transaction rollback | 대상 operation rollback |
| capability change | 403 + current capabilities | restricted operation 제거 |
| review source mismatch | fail closed | 새 snapshot 생성 안내 |
| blocker open | approval 거절 | blocker 목록 표시 |
| publish worker crash | attempt failed, package input 유지 | 같은 package retry |

## 8. 검증

### 8.1 Contract

- web/API가 같은 fixture corpus를 parse
- unknown operation kind/field fail closed
- operation id/digest idempotency
- actor spoof field가 contract에 존재하지 않음
- payload size/count bounds

### 8.2 Repository

- 두 transaction이 다른 entity를 변경하면 둘 다 성공
- 같은 field 변경은 하나만 성공하고 정확한 conflict 반환
- role revoke + active assignment invariant rollback
- dependency/hierarchy cycle rollback
- operation append와 compacted snapshot revision 원자성
- DB crash 후 duplicate retry가 동일 receipt 반환

### 8.3 Workflow

- review snapshot이 없는 approval 실패
- source revision/digest mismatch 실패
- open blocker가 있는 approval 실패
- head advance 후 approval stale
- superseded approval 보존
- publish package가 approval source revision 이외를 materialize하지 않음
- external `approve` feedback가 공식 approval로 자동 변환되지 않음

### 8.4 Browser

- 두 브라우저가 서로 다른 task 동시 수정
- 같은 task 다른 field 동시 수정
- 같은 field conflict와 사용자의 값 선택
- offline operation reconnect
- cross-tab invalidation에서 stale full object overwrite 없음
- review thread carry-over/moved/orphaned 표시

## 9. 관측성

- `studio_production_operation_total{kind,result}`
- `studio_production_operation_latency_ms{kind}`
- `studio_production_conflict_total{entity_kind,field}`
- `studio_production_snapshot_compaction_total`
- `studio_review_snapshot_total{result}`
- `studio_review_thread_carry_over_total{resolution}`
- `studio_approval_total{result,reason}`
- `studio_publish_package_total{status,profile}`
- `studio_publish_attempt_latency_ms{stage}`

operation payload 원문이나 대사는 metric/log label로 기록하지 않는다.

## 10. 결과

### 긍정

- 독립 작업의 동시 수정이 전체 문서 409로 막히지 않는다.
- 기존 Production Workspace v3 UI·백업·조회 projection을 재사용한다.
- 외부 검토 의견과 공식 승인을 구분한다.
- 검수·승인·게시가 정확한 원고 revision과 digest에 고정된다.
- audit와 재현 가능한 게시 package를 제공한다.

### 비용·제약

- operation kind별 parser와 apply reducer가 필요하다.
- entity/field revision metadata를 유지해야 한다.
- 기존 PUT과 operation client가 공존하는 전환기가 필요하다.
- 검수·승인 repository와 export worker가 추가된다.
- 같은 field의 의미적 자동 merge는 제한적으로만 가능하며 사용자 선택 UI가 필요하다.

## 11. 기각한 대안

### 대안 A — 전체 Workspace PUT 유지 + 자동 retry

기각. 자동 retry가 다른 팀원의 field를 덮거나 전체 diff 병합 로직을 클라이언트마다 중복시킨다.

### 대안 B — Production Workspace 전체를 Yjs 문서로 전환

기각. 작업 상태 전이, capability, approval audit, 서버 transaction invariant를 일반 CRDT merge에 맡기기 어렵다.
Production은 서버 검증 operation log가 더 적합하다.

### 대안 C — external feedback의 approve를 공식 approval로 사용

기각. actor capability와 immutable source revision/digest가 보장되지 않는다.

### 대안 D — approval 없이 current head를 publish

기각. 검수된 결과와 실제 artifact가 달라질 수 있다.

### 대안 E — operation log만 저장하고 snapshot을 제거

기각. 최초 조회·offline cache·구형 client·대형 log replay 비용에 불리하다. operation log와 compacted snapshot을 함께 사용한다.

## 12. 마이그레이션

1. 공유 contract package와 fixture parity test를 먼저 도입한다.
2. 신규 operation endpoint를 기존 snapshot repository 옆에 추가한다.
3. UI의 한 종류 operation부터 shadow/opt-in으로 전환한다. 권장 첫 vertical slice는 `task.patch`다.
4. task CRUD → review issue → hierarchy → role → handoff 순으로 확대한다.
5. local operation outbox와 cross-tab invalidation을 배선한다.
6. server review cycle/snapshot/thread를 도입하고 기존 external feedback projection을 추가한다.
7. approval endpoint와 stale projection을 배선한다.
8. approval-pinned publish package를 도입한다.
9. operation coverage가 충분한 뒤 PUT을 compatibility-only로 축소한다.

## 13. 승인 체크리스트

- [ ] 공유 contract package와 versioning 정책 승인
- [ ] operation kind v1과 field allowlist 승인
- [ ] entity/field conflict 정책 승인
- [ ] offline 허용 operation 범위 승인
- [ ] audit retention과 개인정보 정책 승인
- [ ] external feedback와 official approval 구분 승인
- [ ] review snapshot/approval/publish DB schema 승인
- [ ] 기존 PUT deprecation 조건 승인
