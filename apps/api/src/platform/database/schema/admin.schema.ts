import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./index";

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


export const creatorCampaigns = pgTable(
  "creator_campaign",
  {
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
  },
  (t) => [index("idx_creator_campaign_creator").on(t.creatorId)]
);


export const revenueLedger = pgTable(
  "revenue_ledger",
  {
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
  },
  (t) => [
    index("idx_revenue_ledger_recipient_created").on(t.recipientId, t.createdAt), // 크리에이터 수익 내역
    index("idx_revenue_ledger_payer_created").on(t.payerId, t.createdAt), // 후원/결제 내역
    index("idx_revenue_ledger_createdat").on(t.createdAt),
    index("idx_revenue_ledger_status_createdat").on(t.status, t.createdAt),
    index("idx_revenue_ledger_reviewedat").on(t.reviewedAt),
    index("idx_revenue_ledger_settledat").on(t.settledAt),
  ]
);


// Managed administrator tables. Keep persisted SQL defaults and existing FK deletion semantics.
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    adminId: text("adminId").notNull().references(() => users.id, { onDelete: "cascade" }),
    adminEmail: text("adminEmail"),
    action: text("action").notNull(),
    targetType: text("targetType").notNull().default("system"),
    targetId: text("targetId"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_admin_audit_logs_createdat").on(t.createdAt),
    index("idx_admin_audit_logs_action").on(t.action),
  ],
);

export const adminBannedWords = pgTable(
  "admin_banned_words",
  {
    id: text("id").primaryKey(),
    word: text("word").notNull().unique(),
    category: text("category").notNull().default("general"),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
);

export const adminPromos = pgTable(
  "admin_promos",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    discountType: text("discountType").notNull().default("percent"),
    discountValue: integer("discountValue").notNull().default(10),
    maxUses: integer("maxUses").notNull().default(100),
    usedCount: integer("usedCount").notNull().default(0),
    isActive: boolean("isActive").notNull().default(true),
    expiresAt: timestamp("expiresAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
);

export const adminAnnouncements = pgTable(
  "admin_announcements",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    level: text("level").notNull().default("info"),
    placement: text("placement").notNull().default("top_banner"),
    targetRole: text("targetRole").notNull().default("all"),
    isActive: boolean("isActive").notNull().default(true),
    startsAt: timestamp("startsAt", { mode: "date" }),
    endsAt: timestamp("endsAt", { mode: "date" }),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_admin_announcements_active").on(t.isActive),
  ],
);

export const adminSecurityPolicies = pgTable(
  "admin_security_policies",
  {
    id: text("id").primaryKey(),
    ipAddress: text("ipAddress").notNull().unique(),
    reason: text("reason").notNull().default(""),
    action: text("action").notNull().default("block"),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
);

export const adminContentReports = pgTable(
  "admin_content_reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporterId").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: text("targetType").notNull(),
    targetId: text("targetId").notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("pending"),
    resolvedBy: text("resolvedBy").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolvedAt", { mode: "date" }),
    resolutionNote: text("resolutionNote").default(""),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_admin_reports_status").on(t.status),
  ],
);
