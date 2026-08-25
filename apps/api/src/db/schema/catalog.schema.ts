import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";

import { users } from "./index";

// ── 사용자 데이터 (localStorage → DB) ──────────────────────
export const ratings = pgTable(
  "rating",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("titleId").notNull(),
    value: integer("value").notNull(), // 0.5~5 → ×10 정수 저장(5~50)
    updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })]
);


export const reviews = pgTable(
  "review",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("titleId").notNull(),
    rating: integer("rating").notNull(), // ×10 정수
    text: text("text").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    spoiler: boolean("spoiler").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    unique().on(t.userId, t.titleId), // userId prefix 조회(프로필 리뷰)도 커버
    index("idx_review_title_created").on(t.titleId, t.createdAt), // 작품 상세 리뷰 목록
    index("idx_review_created").on(t.createdAt), // 전체 리뷰 피드(최신순)
  ]
);


export const reads = pgTable(
  "read",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("titleId").notNull(),
    state: text("state").notNull(), // want | reading | done | dropped
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })]
);


export const subscriptions = pgTable(
  "subscription",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("titleId").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })]
);


export const collections = pgTable(
  "collection",
  {
    // New clients provide UUID v4 IDs for optimistic write-through. Keep text for seed/legacy
    // opaque IDs (for example seed-col-1); this contract intentionally needs no DDL migration.
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("📚"),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [index("idx_collection_user").on(t.userId)]
);


export const collectionItems = pgTable(
  "collection_item",
  {
    collectionId: text("collectionId")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    titleId: text("titleId").notNull(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.titleId] })]
);


export const reviewLikes = pgTable(
  "review_like",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewId: text("reviewId").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.reviewId] }),
    index("idx_review_like_review").on(t.reviewId), // 리뷰별 좋아요 집계
  ]
);


export const reviewReplies = pgTable(
  "review_reply",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    reviewId: text("reviewId").notNull(),
    parentId: text("parentId"),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    spoiler: boolean("spoiler").notNull().default(false),
    // 답글 소프트 삭제 — 하위 답글이 있으면 자리 표시("삭제된 댓글")를 남기고 본문만 비운다.
    deletedAt: timestamp("deletedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_review_reply_review").on(t.reviewId, t.createdAt), // 런타임 ensure 미러
    index("idx_review_reply_parent").on(t.parentId, t.createdAt), // 하위 답글 존재 확인
  ]
);


export const catalogSnapshots = pgTable(
  "catalog_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    source: text("source").notNull(), // crawl/manual/manual-file/synthetic
    sourceVersion: text("sourceVersion"),
    titleCount: integer("titleCount").notNull().default(0),
    isCurrent: boolean("isCurrent").notNull().default(false),
    snapshot: text("snapshot").notNull(), // JSON stringified title[] payload
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_catalog_snapshot_current").on(t.isCurrent, t.createdAt), // 런타임 ensure 미러
    index("idx_catalog_snapshot_created").on(t.createdAt), // 런타임 ensure 미러 — 보존 프루닝
  ]
);


export const catalogIngestRuns = pgTable(
  "catalog_ingest_run",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    source: text("source").notNull(),
    status: text("status").notNull(), // running|success|failed|aborted
    runHash: text("runHash"),
    triggeredBy: text("triggeredBy"),
    requestedBy: text("requestedBy"),
    startedAt: timestamp("startedAt", { mode: "date" }).notNull(),
    finishedAt: timestamp("finishedAt", { mode: "date" }),
    durationMs: integer("durationMs"),
    titleCount: integer("titleCount").notNull().default(0),
    message: text("message"),
    error: text("error"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_catalog_ingest_run_created").on(t.createdAt), // 런타임 ensure 미러 — 이력 목록
    index("idx_catalog_ingest_run_status").on(t.status, t.createdAt), // 런타임 ensure 미러
    index("idx_catalog_ingest_run_started").on(t.startedAt), // 좀비 run 정리(startedAt < cutoff)
  ]
);
