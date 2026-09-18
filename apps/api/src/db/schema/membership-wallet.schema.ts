import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type {
  CreditFeatureKey,
  MemberCreatorLevel,
  MemberSellerLevel,
  MemberTrustLevel,
  MembershipPlanId,
  WalletAsset,
} from "../../../../../packages/core/src/membership-wallet";
import { users } from "./auth.schema";

const amount = (name: string) => bigint(name, { mode: "number" });

export const membershipGrants = pgTable(
  "membership_grant",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    planId: text("planId").$type<MembershipPlanId>().notNull(),
    source: text("source").notNull(),
    grantKey: text("grantKey").notNull(),
    sourceRef: text("sourceRef"),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("startsAt", { mode: "date", withTimezone: true }).notNull(),
    endsAt: timestamp("endsAt", { mode: "date", withTimezone: true }),
    autoRenew: boolean("autoRenew").notNull().default(false),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },

  (table) => [
    uniqueIndex("uq_membership_grant_key").on(table.userId, table.grantKey),
    index("idx_membership_grant_user_active").on(table.userId, table.status, table.startsAt),
    check(
      "membership_grant_plan_check",
      sql`${table.planId} IN ('free','creator','pro','team')`,
    ),
    check(
      "membership_grant_status_check",
      sql`${table.status} IN ('active','cancelled','expired')`,
    ),
    check(
      "membership_grant_window_check",
      sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const memberLevels = pgTable(
  "member_level",
  {

    userId: text("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    creatorLevel: text("creatorLevel").$type<MemberCreatorLevel>().notNull().default("new"),
    trustLevel: text("trustLevel").$type<MemberTrustLevel>().notNull().default("new"),
    sellerLevel: text("sellerLevel").$type<MemberSellerLevel>().notNull().default("none"),
    trustScore: integer("trustScore").notNull().default(0),
    updatedBy: text("updatedBy").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_member_level_creator").on(table.creatorLevel, table.updatedAt),
    index("idx_member_level_trust").on(table.trustLevel, table.updatedAt),
    check("member_level_score_check", sql`${table.trustScore} BETWEEN 0 AND 1000`),
  ],
);

export const walletAccounts = pgTable(
  "wallet_account",
  {

    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    asset: text("asset").$type<WalletAsset>().notNull(),
    availableAmount: amount("availableAmount").notNull().default(0),
    reservedAmount: amount("reservedAmount").notNull().default(0),
    lifetimeGranted: amount("lifetimeGranted").notNull().default(0),
    lifetimeSpent: amount("lifetimeSpent").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_wallet_account_user_asset").on(table.userId, table.asset),
    index("idx_wallet_account_user").on(table.userId),
    check(
      "wallet_account_asset_check",
      sql`${table.asset} IN ('studio_credit','reward_point')`,
    ),

    check(
      "wallet_account_amounts_check",
      sql`${table.availableAmount} >= 0
        AND ${table.reservedAmount} >= 0
        AND ${table.lifetimeGranted} >= 0
        AND ${table.lifetimeSpent} >= 0`,
    ),
  ],
);

export const walletLots = pgTable(
  "wallet_lot",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    accountId: text("accountId").notNull().references(() => walletAccounts.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    asset: text("asset").$type<WalletAsset>().notNull(),
    source: text("source").notNull(),
    sourceKey: text("sourceKey").notNull(),
    sourceRef: text("sourceRef"),

    grantedAmount: amount("grantedAmount").notNull(),
    remainingAmount: amount("remainingAmount").notNull(),
    reservedAmount: amount("reservedAmount").notNull().default(0),
    spendPriority: integer("spendPriority").notNull().default(50),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_wallet_lot_source_key").on(table.accountId, table.sourceKey),
    index("idx_wallet_lot_spend").on(
      table.accountId,
      table.spendPriority,
      table.expiresAt,
      table.createdAt,
    ),
    index("idx_wallet_lot_user_source").on(table.userId, table.source, table.createdAt),
    check("wallet_lot_granted_check", sql`${table.grantedAmount} > 0`),

    check("wallet_lot_remaining_check", sql`${table.remainingAmount} >= 0`),
    check("wallet_lot_reserved_check", sql`${table.reservedAmount} >= 0`),
    check("wallet_lot_priority_check", sql`${table.spendPriority} >= 0`),
  ],
);

export const walletReservations = pgTable(
  "wallet_reservation",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    accountId: text("accountId")
      .notNull()
      .references(() => walletAccounts.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    featureKey: text("featureKey").$type<CreditFeatureKey>(),
    requestedAmount: amount("requestedAmount").notNull(),
    capturedAmount: amount("capturedAmount").notNull().default(0),

    idempotencyKey: text("idempotencyKey").notNull(),
    status: text("status").notNull().default("reserved"),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },

  (table) => [
    uniqueIndex("uq_wallet_reservation_idempotency").on(
      table.userId,
      table.idempotencyKey,
    ),
    index("idx_wallet_reservation_active").on(
      table.accountId,
      table.status,
      table.expiresAt,
    ),
    check(
      "wallet_reservation_status_check",
      sql`${table.status} IN ('reserved','captured','released','expired')`,
    ),
    check(
      "wallet_reservation_requested_check",
      sql`${table.requestedAmount} > 0`,
    ),
    check(
      "wallet_reservation_captured_check",
      sql`${table.capturedAmount} >= 0`,
    ),
  ],
);

export const walletReservationAllocations = pgTable(
  "wallet_reservation_allocation",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    reservationId: text("reservationId")
      .notNull()
      .references(() => walletReservations.id, { onDelete: "cascade" }),
    lotId: text("lotId")
      .notNull()
      .references(() => walletLots.id, { onDelete: "restrict" }),
    allocatedAmount: amount("allocatedAmount").notNull(),
    capturedAmount: amount("capturedAmount").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },

  (table) => [
    uniqueIndex("uq_wallet_allocation_reservation_lot").on(
      table.reservationId,
      table.lotId,
    ),
    index("idx_wallet_allocation_lot").on(table.lotId),
    check(
      "wallet_allocation_allocated_check",
      sql`${table.allocatedAmount} > 0`,
    ),
    check(
      "wallet_allocation_captured_check",
      sql`${table.capturedAmount} >= 0`,
    ),
  ],
);

export const walletLedgerEntries = pgTable(
  "wallet_ledger_entry",
  {

    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    accountId: text("accountId")
      .notNull()
      .references(() => walletAccounts.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lotId: text("lotId").references(() => walletLots.id, { onDelete: "set null" }),
    reservationId: text("reservationId").references(
      () => walletReservations.id,
      { onDelete: "set null" },
    ),
    entryType: text("entryType").notNull(),
    amount: amount("amount").notNull(),
    deltaAvailable: amount("deltaAvailable").notNull().default(0),

    deltaReserved: amount("deltaReserved").notNull().default(0),
    reason: text("reason").notNull(),
    referenceKey: text("referenceKey"),
    idempotencyKey: text("idempotencyKey").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_wallet_ledger_idempotency").on(
      table.accountId,
      table.idempotencyKey,
    ),

    index("idx_wallet_ledger_user_created").on(table.userId, table.createdAt),
    index("idx_wallet_ledger_reservation").on(
      table.reservationId,
      table.createdAt,
    ),
    check("wallet_ledger_amount_check", sql`${table.amount} >= 0`),
    check(
      "wallet_ledger_type_check",
      sql`${table.entryType} IN (
        'grant','purchase','reserve','capture','release',
        'refund','expire','adjustment','reversal'
      )`,
    ),
  ],
);

export const membershipPolicyOverrides = pgTable(
  "membership_policy_override",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").$type<unknown>().notNull(),
    active: boolean("active").notNull().default(true),
    updatedBy: text("updatedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_membership_policy_override_active").on(
      table.active,
      table.updatedAt,
    ),
  ],
);
