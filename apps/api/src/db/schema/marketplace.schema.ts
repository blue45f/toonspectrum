import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

import { users, bytea } from "./index";

// 회원이 사이트에 공유한 커스텀 에셋(다른 회원이 스튜디오에서 재사용). 이미지 데이터URL 보관.
export const creatorAssets = pgTable(
  "creator_asset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    dataUrl: text("dataUrl").notNull(), // 축소된 webp 데이터 URL(creator_work.cover와 동일 방식)
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    kind: text("kind").notNull().default("image"), // image | sticker (추후 vrm 등 확장)
    mimeType: text("mimeType"),
    byteSize: integer("byteSize"),
    contentHash: text("contentHash"),
    previewDataUrl: text("previewDataUrl"),
    previewWidth: integer("previewWidth"),
    previewHeight: integer("previewHeight"),
    previewMimeType: text("previewMimeType"),
    previewByteSize: integer("previewByteSize"),
    previewContentHash: text("previewContentHash"),
    license: text("license").notNull().default("toonspectrum-standard"),
    attributionText: text("attributionText").notNull().default(""),
    containsAi: boolean("containsAi").notNull().default(false),
    rightsConfirmedAt: timestamp("rightsConfirmedAt", { mode: "date", withTimezone: true }),
    moderationStatus: text("moderationStatus").notNull().default("under_review"),
    moderationNote: text("moderationNote").notNull().default(""),
    reportCount: integer("reportCount").notNull().default(0),
    reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewedAt", { mode: "date", withTimezone: true }),
    hidden: boolean("hidden").notNull().default(false), // 관리자 비노출
    downloads: integer("downloads").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("creator_asset_created_idx").on(t.createdAt.asc().nullsLast()),
    index("idx_creator_asset_user").on(t.userId.asc().nullsLast()), // 내 에셋 목록
    index("idx_creator_asset_catalog").on(
      t.moderationStatus.asc().nullsLast(),
      t.hidden.asc().nullsLast(),
      t.createdAt.desc().nullsFirst()
    ),
    index("idx_creator_asset_downloads").on(
      t.downloads.desc().nullsFirst(),
      t.createdAt.desc().nullsFirst()
    ),
    uniqueIndex("creator_asset_owner_hash_unique")
      .on(t.userId.asc().nullsLast(), t.contentHash.asc().nullsLast())
      .where(sql`${t.contentHash} is not null`),
    check(
      "creator_asset_license_check",
      sql`${t.license} in ('toonspectrum-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0')`
    ),
    check(
      "creator_asset_moderation_status_check",
      sql`${t.moderationStatus} in ('published', 'under_review', 'rejected')`
    ),
    check(
      "creator_asset_mime_type_check",
      sql`${t.mimeType} is null or ${t.mimeType} in ('image/png', 'image/jpeg', 'image/webp')`
    ),
    check(
      "creator_asset_byte_size_check",
      sql`${t.byteSize} is null or ${t.byteSize} between 1 and 2250000`
    ),
    check(
      "creator_asset_content_hash_check",
      sql`${t.contentHash} is null or ${t.contentHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "creator_asset_preview_check",
      sql`(
        ${t.previewDataUrl} is null
        and ${t.previewWidth} is null
        and ${t.previewHeight} is null
        and ${t.previewMimeType} is null
        and ${t.previewByteSize} is null
        and ${t.previewContentHash} is null
      ) or (
        ${t.previewDataUrl} is not null
        and ${t.previewWidth} is not null
        and ${t.previewHeight} is not null
        and ${t.previewMimeType} is not null
        and ${t.previewByteSize} is not null
        and ${t.previewContentHash} is not null
        and ${t.previewWidth} between 1 and 320
        and ${t.previewHeight} between 1 and 320
        and ${t.previewMimeType} in ('image/png', 'image/jpeg', 'image/webp')
        and ${t.previewByteSize} between 1 and 131072
        and ${t.previewContentHash} ~ '^[0-9a-f]{64}$'
      )`
    ),
    check(
      "creator_asset_dimensions_check",
      sql`${t.width} between 1 and 4096 and ${t.height} between 1 and 4096 and ${t.width}::bigint * ${t.height}::bigint <= 16777216`
    ),
    check("creator_asset_tags_check", sql`jsonb_typeof(${t.tags}) = 'array'`),
    check("creator_asset_report_count_check", sql`${t.reportCount} >= 0`),
    check(
      "creator_asset_published_rights_check",
      sql`${t.moderationStatus} <> 'published' or ${t.rightsConfirmedAt} is not null`
    ),
  ]
);


export const creatorAssetReports = pgTable(
  "creator_asset_report",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    assetId: text("assetId")
      .notNull()
      .references(() => creatorAssets.id, { onDelete: "cascade" }),
    reporterId: text("reporterId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("open"),
    resolutionNote: text("resolutionNote").notNull().default(""),
    reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("creator_asset_report_asset_reporter_unique").on(t.assetId, t.reporterId),
    index("idx_creator_asset_report_queue").on(
      t.status.asc().nullsLast(),
      t.createdAt.asc().nullsLast()
    ),
    index("idx_creator_asset_report_reporter").on(
      t.reporterId.asc().nullsLast(),
      t.createdAt.desc().nullsFirst()
    ),
    check(
      "creator_asset_report_reason_check",
      sql`${t.reason} in ('copyright', 'unsafe', 'spam', 'misleading', 'other')`
    ),
    check("creator_asset_report_status_check", sql`${t.status} in ('open', 'resolved', 'dismissed')`),
  ]
);


// ── 창작 마켓 게시: 인스턴스 공용 고정 시간창 + 짧은 fencing lease ──────────────
// 인증 사용자 id/IP 원문은 보관하지 않는다. keyHash는 API가 도메인 분리 SHA-256으로 만든
// 32-byte digest이며, expiresAt 인덱스와 bounded lazy cleanup으로 오래된 gate 행을 제거한다.
export const creatorMarketplacePublishGates = pgTable(
  "creator_marketplace_publish_gate",
  {
    keyHash: bytea("keyHash").primaryKey(),
    windowStartedAt: timestamp("windowStartedAt", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    requestCount: integer("requestCount").notNull(),
    // Bearer lease token 원문은 API 프로세스에만 있고 DB에는 SHA-256 digest만 저장한다.
    leaseTokenHash: bytea("leaseTokenHash"),
    leaseFence: bigint("leaseFence", { mode: "bigint" }).notNull(),
    leaseExpiresAt: timestamp("leaseExpiresAt", {
      mode: "date",
      withTimezone: true,
    }),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_creator_marketplace_publish_gate_expires").on(t.expiresAt),
    check(
      "creator_marketplace_publish_gate_key_hash_check",
      sql`octet_length(${t.keyHash}) = 32`
    ),
    check(
      "creator_marketplace_publish_gate_window_check",
      sql`${t.windowStartedAt} = date_bin(
        interval '1 hour',
        ${t.windowStartedAt},
        timestamptz '1970-01-01 00:00:00+00'
      )`
    ),
    check(
      "creator_marketplace_publish_gate_request_count_check",
      sql`${t.requestCount} between 1 and 20`
    ),
    check(
      "creator_marketplace_publish_gate_lease_fence_check",
      sql`${t.leaseFence} >= 1`
    ),
    check(
      "creator_marketplace_publish_gate_lease_state_check",
      sql`(
        ${t.leaseTokenHash} is null
        and ${t.leaseExpiresAt} is null
      ) or (
        ${t.leaseTokenHash} is not null
        and octet_length(${t.leaseTokenHash}) = 32
        and ${t.leaseExpiresAt} is not null
        and ${t.leaseExpiresAt} > ${t.updatedAt}
      )`
    ),
    check(
      "creator_marketplace_publish_gate_retention_check",
      sql`${t.expiresAt} = ${t.windowStartedAt} + interval '2 hours'`
    ),
    check(
      "creator_marketplace_publish_gate_timestamps_check",
      sql`${t.updatedAt} >= ${t.createdAt}`
    ),
  ]
);
