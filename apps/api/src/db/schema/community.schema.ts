import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./index";

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


// ── 장르 카페(소모임) — 회원이 직접 만들고 가입하는 커뮤니티 단위 ──────────────
// 게시글은 fan_post(scope='cafe', targetId=cafe.slug)를 재사용한다.
export const communityCafes = pgTable(
  "community_cafe",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    genre: text("genre").notNull().default(""), // lib/taxonomy GENRES 중 하나(또는 빈 값=자유)
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [index("idx_community_cafe_genre").on(t.genre, t.createdAt)] // 런타임 ensure 미러
);


export const communityCafeMembers = pgTable(
  "community_cafe_member",
  {
    cafeId: text("cafeId")
      .notNull()
      .references(() => communityCafes.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | member
    joinedAt: timestamp("joinedAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.cafeId, t.userId] }),
    index("idx_community_cafe_member_user").on(t.userId), // 런타임 ensure 미러 — 내 카페 목록
  ]
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
    category: text("category").notNull().default("question"), // question | idea | bug
    title: text("title").notNull(),
    text: text("text").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("open"), // open(답변대기) | answered(답변완료)
    answeredAt: timestamp("answeredAt", { mode: "date" }),
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_feedback_post_created").on(t.createdAt), // 목록 커서(createdAt desc, id desc)
    index("idx_feedback_post_status_created").on(t.status, t.createdAt), // 상태 필터 목록
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
