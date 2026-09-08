import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { creatorAssetStorageObjects } from "./creator-asset-object-storage.schema";
import { creatorAssetLicenseSnapshots } from "./creator-asset-platform.schema";
import { users } from "./schema";

export const creatorAssetRightsEvidence = pgTable(
  "creator_asset_rights_evidence",
  {
    id: text("id").primaryKey(),
    licenseSnapshotId: text("licenseSnapshotId")
      .notNull()
      .references(() => creatorAssetLicenseSnapshots.id, { onDelete: "restrict" }),
    evidenceType: text("evidenceType").notNull(),
    objectPurpose: text("objectPurpose").notNull().default("source"),
    objectDigest: text("objectDigest").notNull(),
    visibility: text("visibility").notNull().default("rights-reviewer-only"),
    submittedBy: text("submittedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedBy: text("verifiedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_asset_rights_evidence_object_unique").on(
      table.licenseSnapshotId,
      table.evidenceType,
      table.objectDigest,
    ),
    foreignKey({
      name: "creator_asset_rights_evidence_storage_object_fkey",
      columns: [table.objectPurpose, table.objectDigest],
      foreignColumns: [
        creatorAssetStorageObjects.purpose,
        creatorAssetStorageObjects.digest,
      ],
    }).onDelete("restrict"),
    index("idx_creator_asset_rights_evidence_snapshot").on(
      table.licenseSnapshotId,
      table.createdAt,
    ),
    check(
      "creator_asset_rights_evidence_type_check",
      sql`${table.evidenceType} in (
        'creator-attestation', 'contract', 'source-page', 'license-text',
        'permission-email', 'public-domain-record', 'purchase-record'
      )`,
    ),
    check(
      "creator_asset_rights_evidence_purpose_check",
      sql`${table.objectPurpose} = 'source'`,
    ),
    check(
      "creator_asset_rights_evidence_digest_check",
      sql`${table.objectDigest} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_asset_rights_evidence_visibility_check",
      sql`${table.visibility} in ('rights-reviewer-only', 'publisher-and-reviewer')`,
    ),
  ],
);
