import { pgTable, text, integer, bigint, timestamp, boolean, jsonb, primaryKey, unique } from "drizzle-orm/pg-core";

// libSQL(SQLite) → PostgreSQL(Neon) 마이그레이션:
//  - integer{mode:"timestamp_ms"} → timestamp({mode:"date"})  (Drizzle가 Date로 주고받음)
//  - integer{mode:"boolean"}      → boolean
//  - text{mode:"json"}            → jsonb
//  - 금액(*Cents)                 → bigint({mode:"number"})  (KRW 큰 금액 int32 오버플로 방지)

// ── 인증 사용자 테이블 + 확장 컬럼 ──────────────
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: text("role").notNull().default("user"),
  // 확장: 크리덴셜 로그인·프로필
  passwordHash: text("passwordHash"),
  avatar: text("avatar"), // 아바타 컬러 hex
  bio: text("bio"),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

export const accounts = pgTable(
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

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

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
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [unique().on(t.userId, t.titleId)]
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

export const collections = pgTable("collection", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📚"),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

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
  (t) => [primaryKey({ columns: [t.userId, t.reviewId] })]
);

export const reviewReplies = pgTable("review_reply", {
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
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

export const fanPosts = pgTable("fan_post", {
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
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

export const fanPostReplies = pgTable("fan_post_reply", {
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
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

export const creatorProfiles = pgTable("creator_profile", {
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
});

export const monetizationPlans = pgTable("monetization_plan", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  intervalDays: integer("intervalDays").notNull().default(30),
  currency: text("currency").notNull().default("KRW"),
  priceCents: bigint("priceCents", { mode: "number" }).notNull(),
  perks: jsonb("perks").$type<string[]>().notNull().default([]),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
});

export const creatorCampaigns = pgTable("creator_campaign", {
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
  targetAmountCents: bigint("targetAmountCents", { mode: "number" }).notNull().default(0),
  raisedAmountCents: bigint("raisedAmountCents", { mode: "number" }).notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  startsAt: timestamp("startsAt", { mode: "date" }),
  endsAt: timestamp("endsAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
});

export const revenueLedger = pgTable("revenue_ledger", {
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
  amountCents: bigint("amountCents", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("KRW"),
  metadata: jsonb("metadata").notNull().default({}),
  reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt", { mode: "date" }),
  reviewNote: text("reviewNote").default(""),
  settledAt: timestamp("settledAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

export const catalogSnapshots = pgTable("catalog_snapshot", {
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
});

export const catalogIngestRuns = pgTable("catalog_ingest_run", {
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
});
