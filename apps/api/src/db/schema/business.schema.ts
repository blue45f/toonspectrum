import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type {
  BusinessInquiryStatus,
  BusinessInquiryType,
} from "../../../../../packages/core/src/business-inquiry";

export const businessInquiries = pgTable(
  "business_inquiry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text("type").$type<BusinessInquiryType>().notNull(),
    organization: text("organization").notNull().default(""),
    contactName: text("contactName").notNull(),
    email: text("email").notNull(),
    website: text("website").notNull().default(""),
    message: text("message").notNull(),
    sourcePath: text("sourcePath").notNull().default(""),
    consentVersion: text("consentVersion").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").$type<BusinessInquiryStatus>().notNull().default("new"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_business_inquiry_status_created").on(table.status, table.createdAt),
    index("idx_business_inquiry_fingerprint_created").on(table.fingerprint, table.createdAt),
    index("idx_business_inquiry_email_created").on(table.email, table.createdAt),
  ],
);
