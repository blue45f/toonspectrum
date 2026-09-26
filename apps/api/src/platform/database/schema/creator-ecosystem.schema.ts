import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

import type {
  BusinessVerificationStatus,
  CollaborationProposalStatus,
  CollaborationType,
  CollectionEditionType,
  CollectionOwnershipStatus,
  CollectionReadStatus,
} from "../../../../../../packages/core/src/creator-ecosystem";

export const creatorCollaborationPreferences = pgTable(
  "creator_collaboration_preference",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    discoverable: boolean("discoverable").notNull().default(false),
    acceptedTypes: jsonb("acceptedTypes")
      .$type<CollaborationType[]>()
      .notNull()
      .default([]),
    acceptUnverified: boolean("acceptUnverified").notNull().default(false),
    note: text("note").notNull().default(""),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_creator_collaboration_discoverable").on(
      table.discoverable,
      table.updatedAt,
    ),
  ],
);

export const creatorBusinessProfiles = pgTable(
  "creator_business_profile",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    organization: text("organization").notNull(),
    website: text("website").notNull(),
    contactEmail: text("contactEmail").notNull(),
    evidenceNote: text("evidenceNote").notNull().default(""),
    verificationStatus: text("verificationStatus")
      .$type<BusinessVerificationStatus>()
      .notNull()
      .default("draft"),
    reviewNote: text("reviewNote").notNull().default(""),
    reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_creator_business_verification").on(
      table.verificationStatus,
      table.updatedAt,
    ),
  ],
);

export const creatorIpProposals = pgTable(
  "creator_ip_proposal",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    senderId: text("senderId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetCreatorId: text("targetCreatorId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<CollaborationType>().notNull(),
    organization: text("organization").notNull(),
    contactEmail: text("contactEmail").notNull(),
    senderVerificationStatus: text("senderVerificationStatus")
      .$type<BusinessVerificationStatus>()
      .notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    budgetMinWon: bigint("budgetMinWon", { mode: "number" }).notNull().default(0),
    budgetMaxWon: bigint("budgetMaxWon", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("KRW"),
    territories: jsonb("territories").$type<string[]>().notNull().default([]),
    exclusive: boolean("exclusive").notNull().default(false),
    durationMonths: integer("durationMonths").notNull().default(0),
    projectUrl: text("projectUrl").notNull().default(""),
    rightsRequested: jsonb("rightsRequested").$type<string[]>().notNull().default([]),
    status: text("status")
      .$type<CollaborationProposalStatus>()
      .notNull()
      .default("new"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_creator_ip_proposal_target").on(
      table.targetCreatorId,
      table.status,
      table.createdAt,
    ),
    index("idx_creator_ip_proposal_sender").on(table.senderId, table.createdAt),
  ],
);

export const creatorCollectionItems = pgTable(
  "creator_collection_item",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isbn13: text("isbn13").notNull().default(""),
    title: text("title").notNull(),
    creator: text("creator").notNull().default(""),
    publisher: text("publisher").notNull().default(""),
    volumeLabel: text("volumeLabel").notNull().default(""),
    coverUrl: text("coverUrl").notNull().default(""),
    ownershipStatus: text("ownershipStatus")
      .$type<CollectionOwnershipStatus>()
      .notNull()
      .default("owned"),
    readStatus: text("readStatus")
      .$type<CollectionReadStatus>()
      .notNull()
      .default("unread"),
    editionType: text("editionType")
      .$type<CollectionEditionType>()
      .notNull()
      .default("standard"),
    lentTo: text("lentTo").notNull().default(""),
    notes: text("notes").notNull().default(""),
    sourceProvider: text("sourceProvider").notNull().default(""),
    sourceUrl: text("sourceUrl").notNull().default(""),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_creator_collection_user_updated").on(table.userId, table.updatedAt),
    index("idx_creator_collection_user_isbn").on(table.userId, table.isbn13),
  ],
);
