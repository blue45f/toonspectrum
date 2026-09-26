import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type {
  CreatorSupportAgeBand,
  CreatorSupportCategory,
  CreatorSupportNeed,
  CreatorSupportOfferType,
  CreatorSupportStatus,
} from "../../../../../../packages/core/src/creator-support";
import { users } from "./auth.schema";

export const creatorSupportApplications = pgTable(
  "creator_support_application",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    creatorId: text("creatorId").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: text("category").$type<CreatorSupportCategory>().notNull(),
    ageBand: text("ageBand").$type<CreatorSupportAgeBand>().notNull(),
    applicantRole: text("applicantRole").notNull(),
    title: text("title").notNull(),
    story: text("story").notNull(),
    intendedUse: text("intendedUse").notNull(),
    supportNeeds: jsonb("supportNeeds").$type<CreatorSupportNeed[]>().notNull().default([]),
    portfolioUrl: text("portfolioUrl").notNull().default(""),
    estimatedBudgetWon: integer("estimatedBudgetWon").notNull().default(0),
    guardianConfirmed: boolean("guardianConfirmed").notNull().default(false),
    consentVersion: text("consentVersion").notNull(),
    status: text("status").$type<CreatorSupportStatus>().notNull().default("submitted"),
    reviewNote: text("reviewNote").notNull().default(""),
    reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewedAt", { mode: "date", withTimezone: true }),
    monetarySupportEnabled: boolean("monetarySupportEnabled").notNull().default(false),
    payoutStatus: text("payoutStatus").notNull().default("not_ready"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_creator_support_creator_created").on(table.creatorId, table.createdAt),
    index("idx_creator_support_status_created").on(table.status, table.createdAt),
  ],
);

export const creatorSupportOffers = pgTable(
  "creator_support_offer",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    applicationId: text("applicationId").notNull()
      .references(() => creatorSupportApplications.id, { onDelete: "cascade" }),
    supporterId: text("supporterId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<CreatorSupportOfferType>().notNull(),
    message: text("message").notNull(),
    contactEmail: text("contactEmail").notNull(),
    consentVersion: text("consentVersion").notNull(),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_creator_support_offer_application_created").on(table.applicationId, table.createdAt),
    index("idx_creator_support_offer_supporter_created").on(table.supporterId, table.createdAt),
  ],
);
