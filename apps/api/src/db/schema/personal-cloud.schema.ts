import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

/**
 * Encrypted OAuth connections for user-owned Google Drive, Dropbox and OneDrive.
 * Project bytes never enter this table; only encrypted provider credentials and
 * account metadata required to refresh a short-lived browser upload token live here.
 */
export const personalCloudConnections = pgTable(
  "personal_cloud_connection",
  {
    userId: text("userId").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    accountLabel: text("accountLabel").notNull(),
    encryptedAccessToken: text("encryptedAccessToken").notNull(),
    encryptedRefreshToken: text("encryptedRefreshToken").notNull(),
    tokenType: text("tokenType").notNull().default("Bearer"),
    scope: text("scope").notNull(),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("createdAt", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("lastUsedAt", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (connection) => [
    primaryKey({
      name: "personal_cloud_connection_pkey",
      columns: [connection.userId, connection.provider],
    }),
    foreignKey({
      name: "personal_cloud_connection_user_fkey",
      columns: [connection.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    check(
      "personal_cloud_connection_provider_check",
      sql`${connection.provider} in ('google-drive', 'dropbox', 'onedrive')`,
    ),
    check(
      "personal_cloud_connection_provider_account_check",
      sql`length(${connection.providerAccountId}) between 1 and 512`,
    ),
    check(
      "personal_cloud_connection_account_label_check",
      sql`length(${connection.accountLabel}) between 1 and 512`,
    ),
    check(
      "personal_cloud_connection_token_ciphertext_check",
      sql`length(${connection.encryptedAccessToken}) between 32 and 32768
        and length(${connection.encryptedRefreshToken}) between 32 and 32768`,
    ),
    check(
      "personal_cloud_connection_token_type_check",
      sql`length(${connection.tokenType}) between 1 and 64`,
    ),
    check(
      "personal_cloud_connection_scope_check",
      sql`length(${connection.scope}) between 1 and 4096`,
    ),
    check(
      "personal_cloud_connection_timestamp_check",
      sql`${connection.updatedAt} >= ${connection.createdAt}
        and (${connection.lastUsedAt} is null or ${connection.lastUsedAt} >= ${connection.createdAt})`,
    ),
    index("idx_personal_cloud_connection_updated").on(
      connection.userId,
      connection.updatedAt.desc(),
    ),
    index("idx_personal_cloud_connection_provider_account").on(
      connection.provider,
      connection.providerAccountId,
    ),
  ],
);
