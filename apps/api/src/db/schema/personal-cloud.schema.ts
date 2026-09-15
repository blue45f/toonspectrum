import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

/**
 * Encrypted OAuth connections for user-owned Google Drive, Dropbox and OneDrive.
 * Project bytes never enter this table; only encrypted provider credentials and
 * account metadata required to refresh a short-lived browser upload token live here.
 */
export const personalCloudConnections = pgTable(
  "personal_cloud_connection",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    accountLabel: text("accountLabel").notNull(),
    encryptedAccessToken: text("encryptedAccessToken").notNull(),
    encryptedRefreshToken: text("encryptedRefreshToken").notNull(),
    tokenType: text("tokenType").notNull().default("Bearer"),
    scope: text("scope").notNull(),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date" }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
    lastUsedAt: timestamp("lastUsedAt", { mode: "date" }),
  },
  (connection) => [
    primaryKey({ columns: [connection.userId, connection.provider] }),
    index("idx_personal_cloud_connection_updated").on(
      connection.userId,
      connection.updatedAt,
    ),
    index("idx_personal_cloud_connection_provider_account").on(
      connection.provider,
      connection.providerAccountId,
    ),
  ],
);
