import { sqliteTable, text, integer, primaryKey, unique } from "drizzle-orm/sqlite-core";

// ── Auth.js (NextAuth) 표준 테이블 + 확장 컬럼 ──────────────
export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  role: text("role").notNull().default("user"),
  // 확장: 크리덴셜 로그인·프로필
  passwordHash: text("passwordHash"),
  avatar: text("avatar"), // 아바타 컬러 hex
  bio: text("bio"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (a) => [primaryKey({ columns: [a.provider, a.providerAccountId] })]
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// ── 사용자 데이터 (localStorage → DB) ──────────────────────
export const ratings = sqliteTable(
  "rating",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("titleId").notNull(),
    value: integer("value").notNull(), // 0.5~5 → ×10 정수 저장(5~50)
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })]
);

export const reviews = sqliteTable(
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
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    spoiler: integer("spoiler", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  },
  (t) => [unique().on(t.userId, t.titleId)]
);

export const reads = sqliteTable(
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

export const subscriptions = sqliteTable(
  "subscription",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("titleId").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })]
);

export const collections = sqliteTable("collection", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📚"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const collectionItems = sqliteTable(
  "collection_item",
  {
    collectionId: text("collectionId")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    titleId: text("titleId").notNull(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.titleId] })]
);

export const reviewLikes = sqliteTable(
  "review_like",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewId: text("reviewId").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.reviewId] })]
);

export const reviewReplies = sqliteTable("review_reply", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  reviewId: text("reviewId").notNull(),
  parentId: text("parentId"),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  spoiler: integer("spoiler", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const fanPosts = sqliteTable("fan_post", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  scope: text("scope").notNull(), // title | author
  targetId: text("targetId").notNull(),
  targetLabel: text("targetLabel").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("talk"), // talk | theory | fanart | cheer
  title: text("title").notNull(),
  text: text("text").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const fanPostReplies = sqliteTable("fan_post_reply", {
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
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const creatorProfiles = sqliteTable("creator_profile", {
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
  isVerifiedCreator: integer("isVerifiedCreator", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const monetizationPlans = sqliteTable("monetization_plan", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  intervalDays: integer("intervalDays").notNull().default(30),
  currency: text("currency").notNull().default("KRW"),
  priceCents: integer("priceCents").notNull(),
  perks: text("perks", { mode: "json" }).$type<string[]>().notNull().default([]),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const creatorCampaigns = sqliteTable("creator_campaign", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creatorId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  titleId: text("titleId"),
  planId: text("planId").references(() => monetizationPlans.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  targetAmountCents: integer("targetAmountCents").notNull().default(0),
  raisedAmountCents: integer("raisedAmountCents").notNull().default(0),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  startsAt: integer("startsAt", { mode: "timestamp_ms" }),
  endsAt: integer("endsAt", { mode: "timestamp_ms" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const revenueLedger = sqliteTable("revenue_ledger", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  payerId: text("payerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  recipientId: text("recipientId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: text("planId").references(() => monetizationPlans.id, { onDelete: "set null" }),
  campaignId: text("campaignId").references(() => creatorCampaigns.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("plan"),
  status: text("status").notNull().default("paid"),
  amountCents: integer("amountCents").notNull(),
  currency: text("currency").notNull().default("KRW"),
  metadata: text("metadata", { mode: "json" }).notNull().default("{}"),
  reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: integer("reviewedAt", { mode: "timestamp_ms" }),
  reviewNote: text("reviewNote").default(""),
  settledAt: integer("settledAt", { mode: "timestamp_ms" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});
