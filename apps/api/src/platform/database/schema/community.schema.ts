import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { users } from "./index";

import type { FeedbackDetails } from "../../../../../../packages/core/src/feedback";
import type { CommunityCafeRule } from "../../../../../../packages/core/src/types";

export const fanPosts = pgTable(
  "fan_post",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scope: text("scope").notNull(), // title | author | pencafe | cafe
    targetId: text("targetId").notNull(),
    targetLabel: text("targetLabel").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("talk"), // talk | theory | fanart | cheer
    title: text("title").notNull(),
    text: text("text").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    // 이미지 첨부(팬아트 공유) — creator_asset.dataUrl과 동일하게 축소된 webp/jpeg 데이터 URL 보관.
    images: jsonb("images").$type<string[]>().notNull().default([]),
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_fan_post_target").on(t.scope, t.targetId, t.createdAt), // 런타임 ensure 미러
    index("idx_fan_post_scope_target_kind_created").on(t.scope, t.targetId, t.kind, t.createdAt), // 런타임 ensure 미러
    index("idx_fan_post_user_created").on(t.userId, t.createdAt), // 작성자별 글(프로필)
    index("idx_fan_post_created").on(t.createdAt), // 전체 피드 커서(createdAt desc, id desc)
  ]
);


export const fanPostReplies = pgTable(
  "fan_post_reply",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    postId: text("postId")
      .notNull()
      .references(() => fanPosts.id, { onDelete: "cascade" }),
    parentId: text("parentId"),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    // 답글 소프트 삭제 — 하위 답글이 있으면 자리 표시("삭제된 댓글")를 남기고 본문만 비운다.
    deletedAt: timestamp("deletedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_fan_post_reply_post").on(t.postId, t.createdAt), // 런타임 ensure 미러
    index("idx_fan_post_reply_parent").on(t.parentId, t.createdAt), // 런타임 ensure 미러
  ]
);


// ── 회원 개설형 커뮤니티 ─────────────────────────────────────────────
// 기존 community_cafe URL/행을 그대로 확장하고 게시글은 fan_post(scope='cafe')를 재사용한다.
export const communityCafes = pgTable(
  "community_cafe",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    genre: text("genre").notNull().default(""),
    kind: text("kind").notNull().default("genre"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    visibility: text("visibility").notNull().default("public"),
    joinPolicy: text("joinPolicy").notNull().default("open"),
    postingPolicy: text("postingPolicy").notNull().default("members"),
    rules: jsonb("rules").$type<CommunityCafeRule[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    createdBy: text("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_community_cafe_genre").on(t.genre, t.createdAt),
    index("idx_community_cafe_discovery").on(t.visibility, t.status, t.createdAt),
    index("idx_community_cafe_kind_created").on(t.kind, t.createdAt),
  ],
);

export const communityCafeMembers = pgTable(
  "community_cafe_member",
  {
    cafeId: text("cafeId").notNull().references(() => communityCafes.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joinedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cafeId, t.userId] }),
    index("idx_community_cafe_member_user").on(t.userId),
    index("idx_community_cafe_member_role").on(t.cafeId, t.role, t.joinedAt),
  ],
);

export const communityCafeJoinRequests = pgTable(
  "community_cafe_join_request",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    cafeId: text("cafeId").notNull().references(() => communityCafes.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull().default(""),
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_community_cafe_join_request_user").on(t.cafeId, t.userId),
    index("idx_community_cafe_join_request_queue").on(t.cafeId, t.status, t.createdAt),
    index("idx_community_cafe_join_request_user").on(t.userId, t.status),
  ],
);

export const communityCafeInvites = pgTable(
  "community_cafe_invite",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    cafeId: text("cafeId").notNull().references(() => communityCafes.id, { onDelete: "cascade" }),
    codeHash: text("codeHash").notNull().unique(),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    maxUses: integer("maxUses").notNull().default(1),
    useCount: integer("useCount").notNull().default(0),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    revokedAt: timestamp("revokedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_community_cafe_invite_cafe").on(t.cafeId, t.createdAt),
    index("idx_community_cafe_invite_expiry").on(t.expiresAt, t.revokedAt),
  ],
);

export const communityCafeBans = pgTable(
  "community_cafe_ban",
  {
    cafeId: text("cafeId").notNull().references(() => communityCafes.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull().default(""),
    bannedBy: text("bannedBy").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cafeId, t.userId] }),
    index("idx_community_cafe_ban_cafe").on(t.cafeId, t.createdAt),
    index("idx_community_cafe_ban_user").on(t.userId, t.expiresAt),
  ],
);

export const communityCafeModerationLogs = pgTable(
  "community_cafe_moderation_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    cafeId: text("cafeId").notNull().references(() => communityCafes.id, { onDelete: "cascade" }),
    actorId: text("actorId").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetUserId: text("targetUserId").references(() => users.id, { onDelete: "set null" }),
    targetPostId: text("targetPostId"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_community_cafe_moderation_log_cafe").on(t.cafeId, t.createdAt),
    index("idx_community_cafe_moderation_log_actor").on(t.actorId, t.createdAt),
  ],
);

// ── 사이트 Q&A·의견 게시판 ─────────────────────────────────
export const feedbackPosts = pgTable(
  "feedback_post",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull().default("question"), // question | idea | bug | request
    title: text("title").notNull(),
    text: text("text").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("open"), // reply status, independent of delivery
    progress: text("progress").notNull().default("received"),
    metadata: jsonb("metadata").$type<FeedbackDetails>().notNull().default({}),
    answeredAt: timestamp("answeredAt", { mode: "date" }),
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_feedback_post_created").on(t.createdAt), // 목록 커서(createdAt desc, id desc)
    index("idx_feedback_post_status_created").on(t.status, t.createdAt), // 상태 필터 목록
    index("idx_feedback_post_progress_created").on(t.progress, t.createdAt, t.id),
    index("idx_feedback_post_user_created").on(t.userId, t.createdAt, t.id),
  ]
);


export const feedbackReplies = pgTable(
  "feedback_reply",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    postId: text("postId")
      .notNull()
      .references(() => feedbackPosts.id, { onDelete: "cascade" }),
    parentId: text("parentId"),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    isOfficial: boolean("isOfficial").notNull().default(false), // 운영자(admin/operator) 답변
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_feedback_reply_post").on(t.postId, t.createdAt), // 글 상세 답글 목록
    index("idx_feedback_reply_parent").on(t.parentId), // 하위 답글 존재 확인
  ]
);


// One authenticated person has at most one vote per post.
export const feedbackVotes = pgTable(
  "feedback_vote",
  {
    postId: text("postId").notNull().references(() => feedbackPosts.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("idx_feedback_vote_user").on(t.userId)]
);
