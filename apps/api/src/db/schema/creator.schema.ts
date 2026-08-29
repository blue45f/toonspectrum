import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

import { users, bytea } from "./index";

export const creatorProfiles = pgTable(
  "creator_profile",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("displayName").notNull().default(""),
    profile: text("profile").notNull().default(""),
    payoutChannel: text("payoutChannel").notNull().default(""),
    payoutHandle: text("payoutHandle").notNull().default(""),
    isVerifiedCreator: boolean("isVerifiedCreator").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [index("idx_creator_profile_user").on(t.userId)]
);


// ── 창작 스튜디오: 사용자 제작 웹툰/컷툰 + 창작 게시판 ──────────────
// 툰스푼/포마코 스타일의 브라우저 제작 도구(Konva) 결과물을 올리는 UGC 보드.
export const creatorWorks = pgTable(
  "creator_work",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("titleId"), // 설정 시 특정 웹툰의 "팬 창작물"로 연결(미설정 = 독립 오리지널)
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    cover: text("cover").notNull().default(""), // 대표 썸네일(데이터 URL 또는 외부 URL)
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    format: text("format").notNull().default("cuttoon"), // cuttoon(스튜디오 제작) | upload(이미지 업로드)
    pages: jsonb("pages").$type<string[]>().notNull().default([]), // 렌더된 페이지(세로 스크롤 순서)
    doc: jsonb("doc").notNull().default({}), // 재편집용 스튜디오 문서(Konva JSON)
    status: text("status").notNull().default("published"), // draft | published
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    views: integer("views").notNull().default(0),
    // 편집 저장용 단조 증가 버전. 공개 작품 정렬/조회수와 무관하며, 소유자의 낙관적 충돌 방지에만 사용.
    revision: integer("revision").notNull().default(1),
    // 연재 시리즈(코미코 베스트도전 스타일) — 설정 시 시리즈의 한 회차가 된다.
    // FK는 의도적으로 생략(reviewLikes.reviewId와 동일 관례) — 런타임 ensure DDL과 push 양쪽 호환.
    seriesId: text("seriesId"),
    episodeNo: integer("episodeNo"), // 시리즈 내 회차 번호(서버가 max+1 자동 부여)
    // 창작 챌린지(툰스푼 창작 작업실 스타일) — 설정 시 해당 챌린지 참여작.
    challengeId: text("challengeId"),
    // 리믹스 (이어서 편집하기) 원작 ID 링크
    remixFromId: text("remixFromId"),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_creator_work_user_created").on(t.userId, t.createdAt), // 내 작품/작가 보드
    index("idx_creator_work_title_created").on(t.titleId, t.createdAt), // 작품별 팬 창작물
    index("idx_creator_work_status_created").on(t.status, t.createdAt), // 공개 보드 최신순
    index("creator_work_series_idx").on(t.seriesId, t.episodeNo), // 시리즈 회차 정렬
    index("creator_work_challenge_idx").on(t.challengeId), // 챌린지 참여작
    index("idx_creator_work_remix").on(t.remixFromId), // 리믹스 쿼리 최적화
    check("creator_work_revision_value_positive_check", sql`${t.revision} >= 1`),
  ]
);


// 저장 전 협업은 첫 공유/초대 시점에만 hidden draft creator_work를 만들고 이 marker를 붙인다.
// 멤버십·댓글·CRDT는 처음부터 workId를 참조하므로, 실제 저장 승격에서는 FK를 복사하거나 재키잉하지
// 않는다. active marker의 expiresAt은 임시 작업실 lease이며 cleanup은 work 삭제 cascade로 수행한다.
export const creatorDraftCollaborationRooms = pgTable(
  "creator_draft_collaboration_room",
  {
    roomId: text("roomId").primaryKey(),
    draftDocumentId: text("draftDocumentId").notNull(),
    ownerUserId: text("ownerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    graphRevision: integer("graphRevision").notNull().default(0),
    initialSnapshotByteLength: integer("initialSnapshotByteLength").notNull(),
    provisionIntent: text("provisionIntent").notNull(),
    provisionMutationId: text("provisionMutationId").notNull(),
    promotionMutationId: text("promotionMutationId"),
    promotionExpectedWorkRevision: integer("promotionExpectedWorkRevision"),
    promotionFinalStatus: text("promotionFinalStatus"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp("lastActivityAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    promotedAt: timestamp("promotedAt", { mode: "date", withTimezone: true }),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("creator_draft_collaboration_room_owner_draft_unique").on(
      t.ownerUserId,
      t.draftDocumentId
    ),
    unique("creator_draft_collaboration_room_work_unique").on(t.workId),
    unique("creator_draft_room_owner_provision_mutation_unique").on(
      t.ownerUserId,
      t.provisionMutationId
    ),
    uniqueIndex("creator_draft_room_owner_promotion_mutation_unique")
      .on(t.ownerUserId, t.promotionMutationId)
      .where(sql`${t.promotionMutationId} is not null`),
    index("idx_creator_draft_collaboration_room_owner_created").on(
      t.ownerUserId,
      t.createdAt.desc()
    ),
    index("idx_creator_draft_collaboration_room_owner_active_lease")
      .on(t.ownerUserId, t.expiresAt)
      .where(sql`${t.status} = 'active'`),
    index("idx_creator_draft_collaboration_room_active_expiry")
      .on(t.expiresAt, t.roomId)
      .where(sql`${t.status} = 'active'`),
    check(
      "creator_draft_collaboration_room_room_id_check",
      sql`${t.roomId} ~ '^draft-room_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`
    ),
    check(
      "creator_draft_collaboration_room_draft_document_id_check",
      sql`${t.draftDocumentId} ~ '^draft_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`
    ),
    check(
      "creator_draft_collaboration_room_provision_intent_check",
      sql`${t.provisionIntent} in ('share-link', 'invite-member', 'cloud-save')`
    ),
    check(
      "creator_draft_collaboration_room_status_check",
      sql`${t.status} in ('active', 'promoted')`
    ),
    check(
      "creator_draft_collaboration_room_graph_revision_check",
      sql`${t.graphRevision} between 0 and 2147483647`
    ),
    check(
      "creator_draft_collaboration_room_snapshot_bytes_check",
      sql`${t.initialSnapshotByteLength} between 0 and 16777216`
    ),
    check(
      "creator_draft_collaboration_room_provision_mutation_check",
      sql`${t.provisionMutationId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`
    ),
    check(
      "creator_draft_collaboration_room_promotion_mutation_check",
      sql`${t.promotionMutationId} is null or ${t.promotionMutationId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`
    ),
    check(
      "creator_draft_room_promotion_work_revision_check",
      sql`${t.promotionExpectedWorkRevision} is null or ${t.promotionExpectedWorkRevision} between 1 and 2147483647`
    ),
    check(
      "creator_draft_room_promotion_final_status_check",
      sql`${t.promotionFinalStatus} is null or ${t.promotionFinalStatus} in ('draft', 'published')`
    ),
    check(
      "creator_draft_collaboration_room_time_order_check",
      sql`${t.lastActivityAt} >= ${t.createdAt} and ${t.expiresAt} > ${t.lastActivityAt} and ${t.updatedAt} >= ${t.createdAt}`
    ),
    check(
      "creator_draft_collaboration_room_state_check",
      sql`(${t.status} = 'active'
          and ${t.promotedAt} is null
          and ${t.promotionMutationId} is null
          and ${t.promotionExpectedWorkRevision} is null
          and ${t.promotionFinalStatus} is null)
        or (${t.status} = 'promoted'
          and ${t.promotedAt} is not null
          and ${t.promotionMutationId} is not null
          and ${t.graphRevision} >= 1
          and ((${t.promotionExpectedWorkRevision} is null and ${t.promotionFinalStatus} is null)
            or (${t.promotionExpectedWorkRevision} is not null and ${t.promotionFinalStatus} is not null)))`
    ),
  ]
);


// 작품 편집 revision의 전체 snapshot. owner-only API에서만 읽고 복원하며 공개 작품 투영에는 포함하지 않는다.
// PK(workId, revision)는 작품별 최신순 조회를 역방향 index scan으로 처리하고 FK cascade도 빠르게 만든다.
export const creatorWorkRevisions = pgTable(
  "creator_work_revision",
  {
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    restoredFromRevision: integer("restoredFromRevision"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "creator_work_revision_pkey", columns: [t.workId, t.revision] }),
    check("creator_work_revision_positive_check", sql`${t.revision} >= 1`),
    check(
      "creator_work_revision_restored_from_positive_check",
      sql`${t.restoredFromRevision} is null or ${t.restoredFromRevision} >= 1`
    ),
    check("creator_work_revision_snapshot_object_check", sql`jsonb_typeof(${t.snapshot}) = 'object'`),
  ]
);


// Yjs 문서의 압축 기준점. 전체 snapshot은 공개 원고 JSON과 분리하고, 해당 sequence 이하의
// append-only update를 모두 포함할 때만 전진한다. 단일 work 행이라 FK cascade와 hydrate 조회가 단순하다.
export const creatorWorkCrdtSnapshots = pgTable(
  "creator_work_crdt_snapshot",
  {
    workId: text("workId").primaryKey(),
    snapshot: bytea("snapshot").notNull(),
    compactedSequence: bigint("compactedSequence", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_crdt_snapshot_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    check(
      "creator_work_crdt_snapshot_sequence_check",
      sql`${t.compactedSequence} >= 0`
    ),
    check(
      "creator_work_crdt_snapshot_size_check",
      sql`octet_length(${t.snapshot}) between 1 and 16777216`
    ),
  ]
);


// CRDT 수신 확인은 DB commit 이후에만 성공한다. updateId는 재전송 dedupe 키이고, 전역 identity
// sequence는 작품별 정렬 index와 함께 snapshot 경계·재시작 복구의 안정적인 순서를 제공한다.
export const creatorWorkCrdtUpdates = pgTable(
  "creator_work_crdt_update",
  {
    workId: text("workId").notNull(),
    sequence: bigint("sequence", { mode: "bigint" }).generatedAlwaysAsIdentity(),
    updateId: text("updateId").notNull(),
    actorUserId: text("actorUserId"),
    payload: bytea("payload").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_crdt_update_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_crdt_update_actor_fkey",
      columns: [t.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    primaryKey({ name: "creator_work_crdt_update_pkey", columns: [t.workId, t.sequence] }),
    unique("creator_work_crdt_update_work_update_id_unique").on(t.workId, t.updateId),
    index("idx_creator_work_crdt_update_actor_created").on(t.actorUserId, t.createdAt.desc()),
    check(
      "creator_work_crdt_update_id_check",
      sql`length(${t.updateId}) between 1 and 160`
    ),
    check(
      "creator_work_crdt_update_payload_size_check",
      sql`octet_length(${t.payload}) between 1 and 49152`
    ),
  ]
);


// 압축으로 update log 본문을 삭제한 뒤에도 updateId 재전송은 영구적으로 판별해야 한다.
// 작은 SHA-256 receipt만 보존하면 전체 payload를 중복 저장하지 않고도 exactly-once ACK와
// 다른 내용으로 같은 updateId를 재사용하는 충돌 탐지를 유지할 수 있다.
export const creatorWorkCrdtUpdateReceipts = pgTable(
  "creator_work_crdt_update_receipt",
  {
    workId: text("workId").notNull(),
    updateId: text("updateId").notNull(),
    sequence: bigint("sequence", { mode: "bigint" }),
    actorUserId: text("actorUserId"),
    payloadHash: bytea("payloadHash").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_crdt_update_receipt_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_crdt_update_receipt_actor_fkey",
      columns: [t.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    primaryKey({
      name: "creator_work_crdt_update_receipt_pkey",
      columns: [t.workId, t.updateId],
    }),
    unique("creator_work_crdt_update_receipt_work_sequence_unique").on(
      t.workId,
      t.sequence
    ),
    index("idx_creator_work_crdt_update_receipt_actor_created").on(
      t.actorUserId,
      t.createdAt.desc()
    ),
    check(
      "creator_work_crdt_update_receipt_id_check",
      sql`length(${t.updateId}) between 1 and 160`
    ),
    check(
      "creator_work_crdt_update_receipt_sequence_check",
      sql`${t.sequence} is null or ${t.sequence} > 0`
    ),
    check(
      "creator_work_crdt_update_receipt_hash_check",
      sql`octet_length(${t.payloadHash}) = 32`
    ),
  ]
);


// 작품별 실시간 잠금 revision high-water. 동일 작품의 advisory-lock 임계 구역 안에서만
// 증가시키며, JOIN snapshot과 mutation fanout이 같은 단조 순서를 공유하게 한다.
export const creatorWorkLiveLockClocks = pgTable(
  "creator_work_live_lock_clock",
  {
    workId: text("workId").primaryKey(),
    revision: bigint("revision", { mode: "bigint" }).notNull().default(sql`0`),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_live_lock_clock_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    check(
      "creator_work_live_lock_clock_revision_check",
      sql`${t.revision} >= 0`
    ),
  ]
);


// 실시간 편집의 짧은 임대 잠금. WebSocket gateway 프로세스 메모리가 아니라 PostgreSQL을
// 권위 저장소로 사용하므로 여러 API 인스턴스가 같은 리소스를 동시에 승인할 수 없다. 연결이
// 비정상 종료되더라도 expiresAt 이후 다른 편집자가 재획득하며, 정상 종료는 owner/lease 조건부
// 삭제로 즉시 해제한다.
export const creatorWorkLiveLocks = pgTable(
  "creator_work_live_lock",
  {
    workId: text("workId").notNull(),
    resourceId: text("resourceId").notNull(),
    leaseId: text("leaseId").notNull(),
    // Every acquire/renew embeds the validated request UUID plus a private server nonce. Decision
    // events expose only the requestId prefix; the complete token lets stale authorization rollback
    // delete only the exact mutation it created even if a client reuses a request UUID.
    acquisitionId: text("acquisitionId").notNull(),
    ownerConnectionId: text("ownerConnectionId").notNull(),
    ownerName: text("ownerName").notNull(),
    // Every writer must participate in the per-work clock. A permissive default would let an old
    // API process mutate rows without advancing the high-water mark, so incompatible writers fail
    // closed instead of silently violating the ordering contract.
    revision: bigint("revision", { mode: "bigint" }).notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_live_lock_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    primaryKey({
      name: "creator_work_live_lock_pkey",
      columns: [t.workId, t.resourceId],
    }),
    index("idx_creator_work_live_lock_expiry").on(t.expiresAt),
    check(
      "creator_work_live_lock_resource_id_check",
      sql`length(${t.resourceId}) between 1 and 200`
    ),
    check(
      "creator_work_live_lock_lease_id_check",
      sql`length(${t.leaseId}) between 1 and 80`
    ),
    check(
      "creator_work_live_lock_acquisition_id_check",
      sql`length(${t.acquisitionId}) between 1 and 80`
    ),
    check(
      "creator_work_live_lock_connection_id_check",
      sql`length(${t.ownerConnectionId}) between 1 and 128`
    ),
    check(
      "creator_work_live_lock_revision_check",
      sql`${t.revision} > 0`
    ),
    check(
      "creator_work_live_lock_owner_name_check",
      sql`length(${t.ownerName}) between 1 and 80`
    ),
    check(
      "creator_work_live_lock_expiry_order_check",
      sql`${t.expiresAt} > ${t.createdAt}`
    ),
  ]
);


// 클러스터 전체 CRDT 대기 작업 부하를 노드당 1행으로 근사 집계한다. work/user와 무관하게
// 프로세스 수에 비례해 크기가 고정되므로 별도 TTL 정리 없이도 무한 증가하지 않는다.
export const creatorWorkCrdtNodeLoad = pgTable(
  "creator_work_crdt_node_load",
  {
    nodeId: text("nodeId").primaryKey(),
    pendingOperations: integer("pendingOperations").notNull(),
    reportedAt: timestamp("reportedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_creator_work_crdt_node_load_reported").on(t.reportedAt),
    check("creator_work_crdt_node_load_pending_check", sql`${t.pendingOperations} >= 0`),
  ]
);


// CRDT scene topology stores only `(assetId, elementType)`. The authored binary body and the
// bounded placement descriptor live here, scoped to the private work and removed with it. Keeping
// this separate from creator_asset is deliberate: creator_asset is a public image/data-URL
// marketplace, while these rows may contain private raster, VRM, or embedded-background GLB data.
export const creatorWorkAssets = pgTable(
  "creator_work_asset",
  {
    workId: text("workId").notNull(),
    assetId: text("assetId").notNull(),
    elementType: text("elementType").notNull(),
    mimeType: text("mimeType").notNull(),
    descriptor: jsonb("descriptor")
      .$type<{
        version: 1;
        element: {
          id: string;
          type: "image" | "vrm" | "background3d";
          x: number;
          y: number;
          width: number;
          height: number;
          rotation: number;
          name?: string;
          opacity?: number;
          hidden?: boolean;
          locked?: boolean;
          noClip?: boolean;
        };
      }>()
      .notNull(),
    payload: bytea("payload").notNull(),
    byteSize: integer("byteSize").notNull(),
    sha256: text("sha256").notNull(),
    intrinsicWidth: integer("intrinsicWidth"),
    intrinsicHeight: integer("intrinsicHeight"),
    decodedRgbaBytes: integer("decodedRgbaBytes"),
    uploadedBy: text("uploadedBy"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_asset_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_asset_uploaded_by_fkey",
      columns: [t.uploadedBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    primaryKey({
      name: "creator_work_asset_pkey",
      columns: [t.workId, t.assetId],
    }),
    index("idx_creator_work_asset_uploader_updated").on(t.uploadedBy, t.updatedAt.desc()),
    check(
      "creator_work_asset_id_check",
      sql`length(${t.assetId}) between 1 and 160`
    ),
    check(
      "creator_work_asset_element_type_check",
      sql`${t.elementType} in ('image', 'vrm', 'background3d')`
    ),
    check(
      "creator_work_asset_media_contract_check",
      sql`(
          ${t.elementType} = 'image'
          and ${t.mimeType} in ('image/png', 'image/jpeg', 'image/webp')
          and ${t.byteSize} <= 8388608
        ) or (
          ${t.elementType} in ('vrm', 'background3d')
          and ${t.mimeType} = 'model/gltf-binary'
          and ${t.byteSize} <= 12582912
        )`
    ),
    check(
      "creator_work_asset_byte_size_check",
      sql`${t.byteSize} between 1 and 12582912`
    ),
    check(
      "creator_work_asset_payload_size_check",
      sql`octet_length(${t.payload}) = ${t.byteSize}`
    ),
    check(
      "creator_work_asset_intrinsic_image_check",
      sql`((
          ${t.elementType} = 'image'
          and ${t.intrinsicWidth} between 1 and 16384
          and ${t.intrinsicHeight} between 1 and 16384
          and ${t.decodedRgbaBytes} between 4 and 67108864
          and ${t.decodedRgbaBytes}::bigint =
            ${t.intrinsicWidth}::bigint * ${t.intrinsicHeight}::bigint * 4
        ) or (
          ${t.elementType} in ('vrm', 'background3d')
          and ${t.intrinsicWidth} is null
          and ${t.intrinsicHeight} is null
          and ${t.decodedRgbaBytes} is null
        )) is true`
    ),
    check(
      "creator_work_asset_sha256_check",
      sql`${t.sha256} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "creator_work_asset_descriptor_check",
      sql`(jsonb_typeof(${t.descriptor}) = 'object'
        and ${t.descriptor}->>'version' = '1'
        and jsonb_typeof(${t.descriptor}->'element') = 'object'
        and ${t.descriptor}->'element'->>'id' = ${t.assetId}
        and ${t.descriptor}->'element'->>'type' = ${t.elementType}) is true`
    ),
  ]
);


// Asset IDs are permanent CRDT identities, not reusable storage slots. Physical payload deletion
// writes this lightweight reservation in the same transaction so an old offline reference can
// never resolve to unrelated bytes after reconnect. Reservations share the work lifecycle.
export const creatorWorkAssetTombstones = pgTable(
  "creator_work_asset_tombstone",
  {
    workId: text("workId").notNull(),
    assetId: text("assetId").notNull(),
    elementType: text("elementType").notNull(),
    deletedBy: text("deletedBy"),
    deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_asset_tombstone_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_asset_tombstone_deleted_by_fkey",
      columns: [t.deletedBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    primaryKey({
      name: "creator_work_asset_tombstone_pkey",
      columns: [t.workId, t.assetId],
    }),
    index("idx_creator_work_asset_tombstone_deleted_by").on(t.deletedBy, t.deletedAt.desc()),
    check(
      "creator_work_asset_tombstone_id_check",
      sql`length(${t.assetId}) between 1 and 160`
    ),
    check(
      "creator_work_asset_tombstone_element_type_check",
      sql`${t.elementType} in ('image', 'vrm', 'background3d')`
    ),
  ]
);


// 작품 소유자는 creator_work.userId로 판정하며 이 테이블에는 넣지 않는다. 멤버 행은 초대부터
// 수락/거절까지의 상태를 보존해 팀 관리 API와 이후 실시간 presence 권한의 단일 근거로 사용한다.
export const creatorWorkCollaborators = pgTable(
  "creator_work_collaborator",
  {
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    status: text("status").notNull().default("pending"),
    // 초대 조건(역할)이 바뀌거나 재초대될 때 회전하는 동의 토큰이다.
    invitationId: text("invitationId").notNull(),
    // 초대한 관리자가 탈퇴해도 이미 수락한 팀 멤버십은 유지한다.
    invitedBy: text("invitedBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("respondedAt", { mode: "date", withTimezone: true }),
  },
  (t) => [
    primaryKey({ name: "creator_work_collaborator_pkey", columns: [t.workId, t.userId] }),
    index("idx_creator_work_collaborator_user_status_updated").on(t.userId, t.status, t.updatedAt),
    index("idx_creator_work_collaborator_work_status_role").on(t.workId, t.status, t.role),
    index("idx_creator_work_collaborator_invited_by").on(t.invitedBy),
    check(
      "creator_work_collaborator_role_check",
      sql`${t.role} in ('admin', 'editor', 'commenter', 'viewer')`
    ),
    check(
      "creator_work_collaborator_status_check",
      sql`${t.status} in ('pending', 'active', 'declined')`
    ),
    check(
      "creator_work_collaborator_response_state_check",
      sql`(${t.status} = 'pending' and ${t.respondedAt} is null) or (${t.status} in ('active', 'declined') and ${t.respondedAt} is not null)`
    ),
  ]
);


// 팀 변경 이력은 멤버십 행과 달리 append-only로 보존한다. 개인정보 이름·초대 동의 토큰은
// 저장하지 않고, 조회 시 현재 사용자 행을 조인한다. 사용자 hard delete 뒤 FK는 SET NULL이 된다.
// UUID는 공개 식별자, sequence는 동일 시각/clock skew에도 안정적인 DB 삽입 순서다.
export const creatorWorkCollaborationEvents = pgTable(
  "creator_work_collaboration_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId").references(() => users.id, { onDelete: "set null" }),
    targetUserId: text("targetUserId").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    beforeState: jsonb("beforeState").$type<{ role: string; status: string } | null>(),
    afterState: jsonb("afterState").$type<{ role: string; status: string } | null>(),
    sequence: bigint("sequence", { mode: "bigint" }).generatedAlwaysAsIdentity(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_creator_work_collaboration_event_work_sequence").on(
      t.workId,
      t.sequence.desc()
    ),
    index("idx_creator_work_collaboration_event_target_created").on(
      t.targetUserId,
      t.createdAt.desc()
    ),
    index("idx_creator_work_collaboration_event_actor_created").on(
      t.actorUserId,
      t.createdAt.desc()
    ),
    check(
      "creator_work_collaboration_event_action_check",
      sql`${t.action} in ('invite', 'reinvite', 'accept', 'decline', 'role_change', 'remove')`
    ),
    check(
      "creator_work_collaboration_event_before_state_check",
      sql`(${t.beforeState} is null or (
        jsonb_typeof(${t.beforeState}) = 'object'
        and ${t.beforeState} ?& array['role', 'status']
        and ${t.beforeState} - array['role', 'status'] = '{}'::jsonb
        and ${t.beforeState}->>'role' in ('admin', 'editor', 'commenter', 'viewer')
        and ${t.beforeState}->>'status' in ('pending', 'active', 'declined')
      )) is true`
    ),
    check(
      "creator_work_collaboration_event_after_state_check",
      sql`(${t.afterState} is null or (
        jsonb_typeof(${t.afterState}) = 'object'
        and ${t.afterState} ?& array['role', 'status']
        and ${t.afterState} - array['role', 'status'] = '{}'::jsonb
        and ${t.afterState}->>'role' in ('admin', 'editor', 'commenter', 'viewer')
        and ${t.afterState}->>'status' in ('pending', 'active', 'declined')
      )) is true`
    ),
    check(
      "creator_work_collaboration_event_transition_check",
      sql`((
        (${t.action} = 'invite' and ${t.beforeState} is null and ${t.afterState}->>'status' = 'pending')
        or (${t.action} = 'reinvite' and ${t.beforeState}->>'status' = 'declined' and ${t.afterState}->>'status' = 'pending')
        or (${t.action} in ('accept', 'decline')
          and ${t.beforeState}->>'status' = 'pending'
          and ${t.afterState}->>'status' = case when ${t.action} = 'accept' then 'active' else 'declined' end
          and ${t.beforeState}->>'role' = ${t.afterState}->>'role')
        or (${t.action} = 'role_change'
          and ${t.beforeState}->>'status' in ('pending', 'active')
          and ${t.beforeState}->>'status' = ${t.afterState}->>'status'
          and ${t.beforeState}->>'role' <> ${t.afterState}->>'role')
        or (${t.action} = 'remove'
          and ${t.beforeState}->>'status' in ('pending', 'active')
          and ${t.afterState} is null)
      )) is true`
    ),
  ]
);


// 공개 작품 댓글(creator_comment)과 분리된 스튜디오 팀 검수 댓글. 캔버스 위치를 가리키는
// thread, append-only message/activity, 사용자별 read frontier를 각각 보존한다. 모든 공개 ID는
// 레거시 text ID를 유지하되 길이를 제한하고, 작성자/시각은 API 서버가 정한 값만 저장한다.
export const creatorWorkTeamCommentThreads = pgTable(
  "creator_work_team_comment_thread",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workId: text("workId").notNull(),
    anchor: jsonb("anchor")
      .$type<
        | { type: "page"; pageId: string }
        | { type: "frame"; pageId: string; frameId: string }
        | { type: "element"; pageId: string; elementId: string; frameId?: string }
        | { type: "point"; pageId: string; x: number; y: number }
      >()
      .notNull(),
    status: text("status").notNull().default("open"),
    createdBy: text("createdBy"),
    resolvedBy: text("resolvedBy"),
    resolvedAt: timestamp("resolvedAt", { mode: "date", withTimezone: true }),
    lastActivitySequence: bigint("lastActivitySequence", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_team_comment_thread_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_team_comment_thread_created_by_fkey",
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    foreignKey({
      name: "creator_work_team_comment_thread_resolved_by_fkey",
      columns: [t.resolvedBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    unique("creator_work_team_comment_thread_work_id_unique").on(t.workId, t.id),
    index("idx_creator_work_team_comment_thread_work_updated")
      .on(t.workId, t.updatedAt.desc(), t.id.desc()),
    index("idx_creator_work_team_comment_thread_work_status_updated")
      .on(t.workId, t.status, t.updatedAt.desc(), t.id.desc()),
    index("idx_creator_work_team_comment_thread_created_by")
      .on(t.createdBy, t.createdAt.desc()),
    index("idx_creator_work_team_comment_thread_resolved_by")
      .on(t.resolvedBy, t.resolvedAt.desc()),
    check(
      "creator_work_team_comment_thread_id_check",
      sql`length(${t.id}) between 1 and 160`
    ),
    check(
      "creator_work_team_comment_thread_anchor_check",
      sql`(
        jsonb_typeof(${t.anchor}) = 'object'
        and ${t.anchor} ?& array['type', 'pageId']
        and jsonb_typeof(${t.anchor}->'pageId') = 'string'
        and length(${t.anchor}->>'pageId') between 1 and 120
        and ${t.anchor}->>'pageId' = btrim(${t.anchor}->>'pageId')
        and case ${t.anchor}->>'type'
          when 'page' then
            ${t.anchor} - array['type', 'pageId'] = '{}'::jsonb
          when 'frame' then
            ${t.anchor} - array['type', 'pageId', 'frameId'] = '{}'::jsonb
            and jsonb_typeof(${t.anchor}->'frameId') = 'string'
            and length(${t.anchor}->>'frameId') between 1 and 120
            and ${t.anchor}->>'frameId' = btrim(${t.anchor}->>'frameId')
          when 'element' then
            ${t.anchor} - array['type', 'pageId', 'frameId', 'elementId'] = '{}'::jsonb
            and jsonb_typeof(${t.anchor}->'elementId') = 'string'
            and length(${t.anchor}->>'elementId') between 1 and 120
            and ${t.anchor}->>'elementId' = btrim(${t.anchor}->>'elementId')
            and (
              not (${t.anchor} ? 'frameId')
              or (
                jsonb_typeof(${t.anchor}->'frameId') = 'string'
                and length(${t.anchor}->>'frameId') between 1 and 120
                and ${t.anchor}->>'frameId' = btrim(${t.anchor}->>'frameId')
              )
            )
          when 'point' then
            ${t.anchor} - array['type', 'pageId', 'x', 'y'] = '{}'::jsonb
            and jsonb_typeof(${t.anchor}->'x') = 'number'
            and (${t.anchor}->>'x')::numeric between 0 and 1
            and jsonb_typeof(${t.anchor}->'y') = 'number'
            and (${t.anchor}->>'y')::numeric between 0 and 1
          else false
        end
      ) is true`
    ),
    check(
      "creator_work_team_comment_thread_status_check",
      sql`${t.status} in ('open', 'resolved')`
    ),
    check(
      "creator_work_team_comment_thread_resolution_state_check",
      sql`(
        (${t.status} = 'open' and ${t.resolvedAt} is null and ${t.resolvedBy} is null)
        or (${t.status} = 'resolved' and ${t.resolvedAt} is not null)
      )`
    ),
    check(
      "creator_work_team_comment_thread_activity_sequence_check",
      sql`${t.lastActivitySequence} >= 0`
    ),
    check(
      "creator_work_team_comment_thread_timestamp_order_check",
      sql`${t.updatedAt} >= ${t.createdAt}
        and (${t.resolvedAt} is null or ${t.resolvedAt} >= ${t.createdAt})`
    ),
  ]
);


export const creatorWorkTeamCommentMessages = pgTable(
  "creator_work_team_comment_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: text("threadId").notNull(),
    authorUserId: text("authorUserId"),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_team_comment_message_thread_fkey",
      columns: [t.threadId],
      foreignColumns: [creatorWorkTeamCommentThreads.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_team_comment_message_author_user_fkey",
      columns: [t.authorUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    unique("creator_work_team_comment_message_thread_id_unique").on(t.threadId, t.id),
    index("idx_creator_work_team_comment_message_thread_created")
      .on(t.threadId, t.createdAt, t.id),
    index("idx_creator_work_team_comment_message_author_created")
      .on(t.authorUserId, t.createdAt.desc()),
    check(
      "creator_work_team_comment_message_id_check",
      sql`length(${t.id}) between 1 and 160`
    ),
    check(
      "creator_work_team_comment_message_body_check",
      sql`length(${t.body}) between 1 and 4000 and ${t.body} = btrim(${t.body})`
    ),
  ]
);


export const creatorWorkTeamCommentActivities = pgTable(
  "creator_work_team_comment_activity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workId: text("workId").notNull(),
    threadId: text("threadId").notNull(),
    actorUserId: text("actorUserId"),
    messageId: text("messageId"),
    action: text("action").notNull(),
    sequence: bigint("sequence", { mode: "bigint" }).generatedAlwaysAsIdentity(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_team_comment_activity_thread_fkey",
      columns: [t.workId, t.threadId],
      foreignColumns: [
        creatorWorkTeamCommentThreads.workId,
        creatorWorkTeamCommentThreads.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_team_comment_activity_actor_user_fkey",
      columns: [t.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    foreignKey({
      name: "creator_work_team_comment_activity_message_fkey",
      columns: [t.threadId, t.messageId],
      foreignColumns: [
        creatorWorkTeamCommentMessages.threadId,
        creatorWorkTeamCommentMessages.id,
      ],
    }).onDelete("cascade"),
    unique("creator_work_team_comment_activity_message_unique").on(t.messageId),
    index("idx_creator_work_team_comment_activity_thread_sequence")
      .on(t.threadId, t.sequence.desc()),
    index("idx_creator_work_team_comment_activity_work_sequence")
      .on(t.workId, t.sequence.desc()),
    index("idx_creator_work_team_comment_activity_actor_created")
      .on(t.actorUserId, t.createdAt.desc()),
    check(
      "creator_work_team_comment_activity_id_check",
      sql`length(${t.id}) between 1 and 160`
    ),
    check(
      "creator_work_team_comment_activity_action_check",
      sql`${t.action} in ('thread_created', 'reply_added', 'resolved', 'reopened', 'reanchored')`
    ),
    check(
      "creator_work_team_comment_activity_message_state_check",
      sql`(
        (${t.action} in ('thread_created', 'reply_added') and ${t.messageId} is not null)
        or (${t.action} in ('resolved', 'reopened', 'reanchored') and ${t.messageId} is null)
      )`
    ),
  ]
);


export const creatorWorkTeamCommentReads = pgTable(
  "creator_work_team_comment_read",
  {
    threadId: text("threadId").notNull(),
    userId: text("userId").notNull(),
    lastReadActivitySequence: bigint("lastReadActivitySequence", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    readAt: timestamp("readAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_team_comment_read_thread_fkey",
      columns: [t.threadId],
      foreignColumns: [creatorWorkTeamCommentThreads.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_team_comment_read_user_fkey",
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    primaryKey({
      name: "creator_work_team_comment_read_pkey",
      columns: [t.threadId, t.userId],
    }),
    index("idx_creator_work_team_comment_read_user_at")
      .on(t.userId, t.readAt.desc()),
    check(
      "creator_work_team_comment_read_sequence_check",
      sql`${t.lastReadActivitySequence} >= 0`
    ),
  ]
);


// 댓글 생성/답글 추가/위치 이동의 네트워크 재시도를 정확히 한 번의 논리 mutation으로 수렴시키는 영수증.
// work 행을 먼저 잠그는 repository 규약과 복합 PK가 같은 작품 안의 동시 재시도를 직렬화하며,
// requestHash가 같은 mutationId를 다른 payload에 재사용하는 것을 거부한다. response는 최초 커밋
// 결과를 그대로 재생하기 위한 서버 응답 snapshot이다. 위치 이동 영수증에는 새 메시지가 없으므로
// messageId가 null이며, thread 삭제 시 함께 정리된다.
export const creatorWorkTeamCommentMutations = pgTable(
  "creator_work_team_comment_mutation",
  {
    workId: text("workId").notNull(),
    actorUserId: text("actorUserId").notNull(),
    mutationId: text("mutationId").notNull(),
    operation: text("operation").notNull(),
    requestHash: text("requestHash").notNull(),
    threadId: text("threadId").notNull(),
    messageId: text("messageId"),
    response: jsonb("response").$type<unknown>().notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "creator_work_team_comment_mutation_pkey",
      columns: [t.workId, t.actorUserId, t.mutationId],
    }),
    foreignKey({
      name: "creator_work_team_comment_mutation_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_team_comment_mutation_actor_fkey",
      columns: [t.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_team_comment_mutation_thread_fkey",
      columns: [t.workId, t.threadId],
      foreignColumns: [
        creatorWorkTeamCommentThreads.workId,
        creatorWorkTeamCommentThreads.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_team_comment_mutation_message_fkey",
      columns: [t.threadId, t.messageId],
      foreignColumns: [
        creatorWorkTeamCommentMessages.threadId,
        creatorWorkTeamCommentMessages.id,
      ],
    }).onDelete("cascade"),
    unique("creator_work_team_comment_mutation_message_unique").on(t.messageId),
    index("idx_creator_work_team_comment_mutation_actor_created")
      .on(t.actorUserId, t.createdAt.desc()),
    index("idx_creator_work_team_comment_mutation_thread_created")
      .on(t.threadId, t.createdAt.desc()),
    check(
      "creator_work_team_comment_mutation_id_check",
      sql`length(${t.mutationId}) between 1 and 160
        and ${t.mutationId} = btrim(${t.mutationId})
        and ${t.mutationId} !~ '[[:cntrl:]]'`
    ),
    check(
      "creator_work_team_comment_mutation_operation_check",
      sql`${t.operation} in ('thread_create', 'reply_add', 'thread_reanchor')`
    ),
    check(
      "creator_work_team_comment_mutation_message_state_check",
      sql`(
        (${t.operation} in ('thread_create', 'reply_add') and ${t.messageId} is not null)
        or (${t.operation} = 'thread_reanchor' and ${t.messageId} is null)
      )`
    ),
    check(
      "creator_work_team_comment_mutation_request_hash_check",
      sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "creator_work_team_comment_mutation_response_check",
      sql`jsonb_typeof(${t.response}) = 'object'`
    ),
  ]
);


// ── 창작 연재 시리즈 — 회차(creator_work.seriesId)를 묶는 단위 ──────────────
// author/avatar는 게시 시점 스냅샷(표시는 항상 users 조인 값 우선, 탈퇴/조인 실패 시 폴백).
export const creatorSeries = pgTable(
  "creator_series",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    author: text("author").notNull().default(""),
    avatar: text("avatar").notNull().default(""),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    cover: text("cover").notNull().default(""), // 대표 커버(데이터 URL 또는 외부 URL)
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("ongoing"), // ongoing(연재중) | completed(완결)
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [index("creator_series_user_idx").on(t.userId)]
);


// ── 창작 챌린지(주간 주제 이벤트) — 기본 시드는 apps/api/src/server/creator.ts가 idempotent 보장 ──
export const creatorChallenges = pgTable("creator_challenge", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  theme: text("theme").notNull().default(""), // 주제 설명
  startsAt: timestamp("startsAt", { mode: "date" }),
  endsAt: timestamp("endsAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});


// ── 창작자 팔로우 — follower가 creator(userId)를 구독 ──────────────────────
export const creatorFollows = pgTable(
  "creator_follow",
  {
    followerId: text("followerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: text("creatorId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.creatorId] })]
);


export const creatorWorkLikes = pgTable(
  "creator_work_like",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.workId] }),
    index("idx_creator_work_like_work").on(t.workId), // 작품별 좋아요 집계
  ]
);


export const creatorWorkComments = pgTable(
  "creator_work_comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [index("idx_creator_work_comment_work").on(t.workId, t.createdAt)]
);


// ── 창작 스튜디오 서버 AI: 분산 일일 쿼터 + 최소 사용 이력 ──────────────
// 원장에는 프롬프트/응답/API 키/제공자 오류 본문을 저장하지 않는다. 일일 집계 행은 외부 호출 전에
// 토큰을 보수적으로 예약해 여러 API 인스턴스의 동시 요청도 짧은 Postgres 트랜잭션으로 제한한다.
export const studioAiRequestGates = pgTable(
  "studio_ai_request_gate",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    requestTimes: timestamp("requestTimes", { mode: "date", withTimezone: true })
      .array()
      .notNull()
      .default(sql`'{}'::timestamptz[]`),
    // Bearer token 원문은 API 프로세스에만 있고 DB에는 SHA-256 digest만 저장한다.
    leaseTokenHash: bytea("leaseTokenHash"),
    leaseFence: bigint("leaseFence", { mode: "bigint" }).notNull().default(sql`0`),
    leaseExpiresAt: timestamp("leaseExpiresAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "studio_ai_request_gate_request_times_check",
      sql`cardinality(${t.requestTimes}) between 0 and 10000`
    ),
    check("studio_ai_request_gate_lease_fence_check", sql`${t.leaseFence} >= 0`),
    check(
      "studio_ai_request_gate_lease_state_check",
      sql`(
          ${t.leaseTokenHash} is null
          and ${t.leaseExpiresAt} is null
        ) or (
          ${t.leaseTokenHash} is not null
          and octet_length(${t.leaseTokenHash}) = 32
          and ${t.leaseExpiresAt} is not null
        )`
    ),
  ]
);


// 유료 공급자 호출의 재전송 방지 receipt. 원문 Idempotency-Key, 프롬프트, 응답 본문은 저장하지
// 않고 사용자 결합 키 해시와 canonical request hash만 보관한다.
export const studioAiRequestReceipts = pgTable(
  "studio_ai_request_receipt",
  {
    userKeyHash: bytea("userKeyHash").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestHash: bytea("requestHash").notNull(),
    leaseFence: bigint("leaseFence", { mode: "bigint" }).notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attemptCount").notNull().default(0),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("studio_ai_request_receipt_user_request_unique").on(t.userId, t.requestHash),
    index("idx_studio_ai_request_receipt_expires").on(t.expiresAt),
    check(
      "studio_ai_request_receipt_user_key_hash_check",
      sql`octet_length(${t.userKeyHash}) = 32`
    ),
    check(
      "studio_ai_request_receipt_request_hash_check",
      sql`octet_length(${t.requestHash}) = 32`
    ),
    check("studio_ai_request_receipt_lease_fence_check", sql`${t.leaseFence} >= 0`),
    check(
      "studio_ai_request_receipt_status_check",
      sql`${t.status} in ('admitted', 'sent', 'succeeded', 'ambiguous')`
    ),
    check(
      "studio_ai_request_receipt_attempt_count_check",
      sql`${t.attemptCount} between 0 and 2`
    ),
    check(
      "studio_ai_request_receipt_expiry_check",
      sql`${t.expiresAt} > ${t.createdAt}`
    ),
  ]
);


export const studioAiGlobalDailyQuotas = pgTable(
  "studio_ai_global_daily_quota",
  {
    usageDay: date("usageDay", { mode: "string" }).primaryKey(), // DB clock 기준 UTC 날짜
    requestCount: integer("requestCount").notNull().default(0),
    tokenCount: bigint("tokenCount", { mode: "number" }).notNull().default(0),
    reservedTokens: bigint("reservedTokens", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("studio_ai_global_daily_quota_request_count_check", sql`${t.requestCount} >= 0`),
    check("studio_ai_global_daily_quota_token_count_check", sql`${t.tokenCount} >= 0`),
    check("studio_ai_global_daily_quota_reserved_tokens_check", sql`${t.reservedTokens} >= 0`),
  ]
);


export const studioAiDailyQuotas = pgTable(
  "studio_ai_daily_quota",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDay: date("usageDay", { mode: "string" }).notNull(), // DB clock 기준 UTC 날짜
    requestCount: integer("requestCount").notNull().default(0),
    tokenCount: bigint("tokenCount", { mode: "number" }).notNull().default(0),
    reservedTokens: bigint("reservedTokens", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "studio_ai_daily_quota_pkey", columns: [t.userId, t.usageDay] }),
    check("studio_ai_daily_quota_request_count_check", sql`${t.requestCount} >= 0`),
    check("studio_ai_daily_quota_token_count_check", sql`${t.tokenCount} >= 0`),
    check("studio_ai_daily_quota_reserved_tokens_check", sql`${t.reservedTokens} >= 0`),
  ]
);


export const studioAiUsageLedger = pgTable(
  "studio_ai_usage_ledger",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(), // 서버가 요청한 고정 모델; 제공자 응답 본문 값은 기록하지 않음
    attemptCount: integer("attemptCount").notNull().default(1),
    status: text("status").notNull(),
    promptTokens: integer("promptTokens"),
    completionTokens: integer("completionTokens"),
    totalTokens: integer("totalTokens"),
    startedAt: timestamp("startedAt", { mode: "date", withTimezone: true }).notNull(),
    finishedAt: timestamp("finishedAt", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_ai_usage_user_started").on(t.userId, t.startedAt),
    index("idx_studio_ai_usage_status_started").on(t.status, t.startedAt),
    check(
      "studio_ai_usage_task_check",
      sql`${t.task} in ('composition', 'scenario', 'translation', 'dialogue', 'palette')`
    ),
    check("studio_ai_usage_provider_check", sql`${t.provider} in ('zai', 'deepseek', 'openrouter')`),
    check("studio_ai_usage_model_check", sql`char_length(${t.model}) between 1 and 200`),
    check("studio_ai_usage_attempt_count_check", sql`${t.attemptCount} between 1 and 2`),
    check(
      "studio_ai_usage_status_check",
      sql`${t.status} in ('success', 'client_aborted', 'timeout', 'provider_rate_limited', 'provider_error', 'network_error', 'content_filtered')`
    ),
    check("studio_ai_usage_prompt_tokens_check", sql`${t.promptTokens} is null or ${t.promptTokens} >= 0`),
    check(
      "studio_ai_usage_completion_tokens_check",
      sql`${t.completionTokens} is null or ${t.completionTokens} >= 0`
    ),
    check("studio_ai_usage_total_tokens_check", sql`${t.totalTokens} is null or ${t.totalTokens} >= 0`),
    check("studio_ai_usage_timestamps_check", sql`${t.finishedAt} >= ${t.startedAt}`),
  ]
);
