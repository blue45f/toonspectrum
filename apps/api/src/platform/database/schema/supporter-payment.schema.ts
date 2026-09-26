import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import type {
  SupporterPaymentMode,
  SupporterPaymentStatus,
  SupporterVisibility,
} from "../../../../../../packages/core/src/supporter-payment";

export const supporterPayments = pgTable(
  "supporter_payment",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text("orderId").notNull(),
    amount: integer("amount").notNull(),
    balanceAmount: integer("balanceAmount").notNull(),
    currency: text("currency").notNull().default("KRW"),
    orderName: text("orderName").notNull(),
    supporterName: text("supporterName").notNull().default(""),
    message: text("message").notNull().default(""),
    visibility: text("visibility").$type<SupporterVisibility>().notNull().default("anonymous"),
    showAmount: boolean("showAmount").notNull().default(false),
    showMessage: boolean("showMessage").notNull().default(false),
    publicHidden: boolean("publicHidden").notNull().default(false),
    termsVersion: text("termsVersion").notNull(),
    mode: text("mode").$type<SupporterPaymentMode>().notNull(),
    providerStatus: text("providerStatus").$type<SupporterPaymentStatus>().notNull().default("READY"),
    paymentKey: text("paymentKey"),
    method: text("method").notNull().default(""),
    receiptUrl: text("receiptUrl").notNull().default(""),
    confirmIdempotencyKey: text("confirmIdempotencyKey").notNull(),
    cancelIdempotencyKey: text("cancelIdempotencyKey"),
    cancelReason: text("cancelReason").notNull().default(""),
    approvedAt: timestamp("approvedAt", { mode: "date", withTimezone: true }),
    canceledAt: timestamp("canceledAt", { mode: "date", withTimezone: true }),
    webhookVerifiedAt: timestamp("webhookVerifiedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_supporter_payment_order_id").on(table.orderId),
    uniqueIndex("uq_supporter_payment_payment_key").on(table.paymentKey),
    index("idx_supporter_payment_status_created").on(table.providerStatus, table.createdAt),
    index("idx_supporter_payment_public_wall").on(table.visibility, table.approvedAt),
    index("idx_supporter_payment_created").on(table.createdAt),
  ],
);

export const supporterFundingSettings = pgTable("supporter_funding_setting", {
  id: text("id").primaryKey(),
  monthlyGoalAmount: integer("monthlyGoalAmount").notNull().default(300_000),
  publicWallEnabled: boolean("publicWallEnabled").notNull().default(true),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
