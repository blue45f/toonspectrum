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
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
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
  // 답글 소프트 삭제 — 하위 답글이 있으면 자리 표시("삭제된 댓글")를 남기고 본문만 비운다.
  deletedAt: timestamp("deletedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

export const fanPosts = pgTable("fan_post", {
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
  // 답글 소프트 삭제 — 하위 답글이 있으면 자리 표시("삭제된 댓글")를 남기고 본문만 비운다.
  deletedAt: timestamp("deletedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

// ── 장르 카페(소모임) — 회원이 직접 만들고 가입하는 커뮤니티 단위 ──────────────
// 게시글은 fan_post(scope='cafe', targetId=cafe.slug)를 재사용한다.
export const communityCafes = pgTable("community_cafe", {
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
});

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
  (t) => [primaryKey({ columns: [t.cafeId, t.userId] })]
);

// ── 사이트 Q&A·의견 게시판 ─────────────────────────────────
export const feedbackPosts = pgTable("feedback_post", {
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
});

export const feedbackReplies = pgTable("feedback_reply", {
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

// ── 창작 스튜디오: 사용자 제작 웹툰/컷툰 + 창작 게시판 ──────────────
// 툰스푼/포마코 스타일의 브라우저 제작 도구(Konva) 결과물을 올리는 UGC 보드.
export const creatorWorks = pgTable("creator_work", {
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
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
});

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
  (t) => [primaryKey({ columns: [t.userId, t.workId] })]
);

export const creatorWorkComments = pgTable("creator_work_comment", {
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
});

// 회원이 사이트에 공유한 커스텀 에셋(다른 회원이 스튜디오에서 재사용). 이미지 데이터URL 보관.
export const creatorAssets = pgTable("creator_asset", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dataUrl: text("dataUrl").notNull(), // 축소된 webp 데이터 URL(creator_work.cover와 동일 방식)
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  kind: text("kind").notNull().default("image"), // image | sticker (추후 vrm 등 확장)
  hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
  downloads: integer("downloads").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
});

// 런타임 토글/설정(key-value). 예: monetization.enabled (광고형 수익화 on/off).
export const appSettings = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
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
