import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type {
  CommerceOrderStatus,
  CommerceProductType,
  CommerceProvider,
  CommerceProviderMode,
} from "../../../../../../packages/core/src/commerce";
import { users } from "./auth.schema";

export const commerceProductPrices = pgTable(
  "commerce_product_price",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productType: text("productType").$type<CommerceProductType>().notNull(),
    productId: text("productId").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("KRW"),
    active: boolean("active").notNull().default(true),
    updatedBy: text("updatedBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_commerce_product_price_product").on(table.productType, table.productId),
    index("idx_commerce_product_price_active").on(table.productType, table.active),
  ],
);

export const commerceOrders = pgTable(
  "commerce_order",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text("orderId").notNull(),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    productType: text("productType").$type<CommerceProductType>().notNull(),
    productId: text("productId").notNull(),
    resourceId: text("resourceId").notNull(),
    productName: text("productName").notNull(),
    amount: integer("amount").notNull(),
    balanceAmount: integer("balanceAmount").notNull(),
    currency: text("currency").notNull().default("KRW"),
    provider: text("provider").$type<CommerceProvider>().notNull(),
    providerMode: text("providerMode").$type<CommerceProviderMode>().notNull(),
    providerStatus: text("providerStatus").$type<CommerceOrderStatus>().notNull().default("READY"),
    paymentKey: text("paymentKey"),
    method: text("method").notNull().default(""),
    receiptUrl: text("receiptUrl").notNull().default(""),
    termsVersion: text("termsVersion").notNull(),
    createIdempotencyKey: text("createIdempotencyKey").notNull(),
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
    uniqueIndex("uq_commerce_order_order_id").on(table.orderId),
    uniqueIndex("uq_commerce_order_payment_key").on(table.paymentKey),
    uniqueIndex("uq_commerce_order_create_idempotency").on(
      table.userId,
      table.createIdempotencyKey,
    ),
    index("idx_commerce_order_user_created").on(table.userId, table.createdAt),
    index("idx_commerce_order_status_created").on(table.providerStatus, table.createdAt),
    index("idx_commerce_order_product").on(table.productType, table.productId),
  ],
);

export const commerceEntitlements = pgTable(
  "commerce_entitlement",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    productType: text("productType").$type<CommerceProductType>().notNull(),
    productId: text("productId").notNull(),
    sourceOrderId: text("sourceOrderId").references(() => commerceOrders.id, { onDelete: "set null" }),
    grantedAt: timestamp("grantedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revokedAt", { mode: "date", withTimezone: true }),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_commerce_entitlement_user_product").on(
      table.userId,
      table.productType,
      table.productId,
    ),
    index("idx_commerce_entitlement_active").on(
      table.userId,
      table.productType,
      table.revokedAt,
    ),
  ],
);

export const commercePaymentEvents = pgTable(
  "commerce_payment_event",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text("orderId").references(() => commerceOrders.id, { onDelete: "cascade" }),
    provider: text("provider").$type<CommerceProvider>().notNull(),
    eventKey: text("eventKey").notNull(),
    eventType: text("eventType").notNull(),
    verified: boolean("verified").notNull().default(false),
    payloadHash: text("payloadHash").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_commerce_payment_event_key").on(table.provider, table.eventKey),
    index("idx_commerce_payment_event_order").on(table.orderId, table.createdAt),
  ],
);
