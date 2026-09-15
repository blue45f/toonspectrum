import { Injectable } from "@nestjs/common";

import { dbClient } from "../../db";

import type {
  PersonalCloudConnectionRecord,
  PersonalCloudProviderId,
} from "./personal-cloud.types";

type DatabaseRow = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function date(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) throw new Error("invalid personal cloud database timestamp");
  return parsed;
}

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  return date(value);
}

function connection(row: DatabaseRow): PersonalCloudConnectionRecord {
  const provider = text(row.provider);
  if (!(["google-drive", "dropbox", "onedrive"] as const).includes(provider as PersonalCloudProviderId)) {
    throw new Error("invalid personal cloud provider in database");
  }
  return Object.freeze({
    userId: text(row.userId),
    provider: provider as PersonalCloudProviderId,
    providerAccountId: text(row.providerAccountId),
    accountLabel: text(row.accountLabel),
    encryptedAccessToken: text(row.encryptedAccessToken),
    encryptedRefreshToken: text(row.encryptedRefreshToken),
    tokenType: text(row.tokenType) || "Bearer",
    scope: text(row.scope),
    accessTokenExpiresAt: date(row.accessTokenExpiresAt),
    createdAt: date(row.createdAt),
    updatedAt: date(row.updatedAt),
    lastUsedAt: optionalDate(row.lastUsedAt),
  });
}

const SELECT_COLUMNS = `
  "userId", "provider", "providerAccountId", "accountLabel",
  "encryptedAccessToken", "encryptedRefreshToken", "tokenType", "scope",
  "accessTokenExpiresAt", "createdAt", "updatedAt", "lastUsedAt"
`;

@Injectable()
export class PersonalCloudRepository {
  private schemaReady: Promise<void> | null = null;

  private ensureSchema(): Promise<void> {
    if (this.schemaReady) return this.schemaReady;
    this.schemaReady = (async () => {
      await dbClient.execute({
        sql: `CREATE TABLE IF NOT EXISTS "personal_cloud_connection" (
          "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "provider" text NOT NULL CHECK ("provider" IN ('google-drive', 'dropbox', 'onedrive')),
          "providerAccountId" text NOT NULL,
          "accountLabel" text NOT NULL,
          "encryptedAccessToken" text NOT NULL,
          "encryptedRefreshToken" text NOT NULL,
          "tokenType" text NOT NULL DEFAULT 'Bearer',
          "scope" text NOT NULL,
          "accessTokenExpiresAt" timestamptz NOT NULL,
          "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastUsedAt" timestamptz,
          PRIMARY KEY ("userId", "provider")
        )`,
        args: [],
      });
      await dbClient.execute({
        sql: `CREATE INDEX IF NOT EXISTS "idx_personal_cloud_connection_updated"
          ON "personal_cloud_connection" ("userId", "updatedAt" DESC)`,
        args: [],
      });
      // PostgreSQL grants no table privileges to PUBLIC by default. A dedicated
      // migration may harden ownership later, but runtime feature bootstrap must
      // not fail merely because the application role cannot issue REVOKE.
    })().catch((error) => {
      this.schemaReady = null;
      throw error;
    });
    return this.schemaReady;
  }
  async list(userId: string): Promise<readonly PersonalCloudConnectionRecord[]> {
    await this.ensureSchema();
    const result = await dbClient.execute({
      sql: `SELECT ${SELECT_COLUMNS}
        FROM "personal_cloud_connection"
        WHERE "userId" = ?
        ORDER BY "provider" ASC`,
      args: [userId],
    });
    return Object.freeze(result.rows.map(connection));
  }

  async find(
    userId: string,
    provider: PersonalCloudProviderId,
  ): Promise<PersonalCloudConnectionRecord | null> {
    await this.ensureSchema();
    const result = await dbClient.execute({
      sql: `SELECT ${SELECT_COLUMNS}
        FROM "personal_cloud_connection"
        WHERE "userId" = ? AND "provider" = ?
        LIMIT 1`,
      args: [userId, provider],
    });
    return result.rows[0] ? connection(result.rows[0]) : null;
  }

  async upsert(input: Omit<PersonalCloudConnectionRecord, "createdAt" | "updatedAt" | "lastUsedAt">): Promise<PersonalCloudConnectionRecord> {
    await this.ensureSchema();
    const now = new Date();
    const result = await dbClient.execute({
      sql: `INSERT INTO "personal_cloud_connection" (
          "userId", "provider", "providerAccountId", "accountLabel",
          "encryptedAccessToken", "encryptedRefreshToken", "tokenType", "scope",
          "accessTokenExpiresAt", "createdAt", "updatedAt", "lastUsedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT ("userId", "provider") DO UPDATE SET
          "providerAccountId" = EXCLUDED."providerAccountId",
          "accountLabel" = EXCLUDED."accountLabel",
          "encryptedAccessToken" = EXCLUDED."encryptedAccessToken",
          "encryptedRefreshToken" = EXCLUDED."encryptedRefreshToken",
          "tokenType" = EXCLUDED."tokenType",
          "scope" = EXCLUDED."scope",
          "accessTokenExpiresAt" = EXCLUDED."accessTokenExpiresAt",
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING ${SELECT_COLUMNS}`,
      args: [
        input.userId,
        input.provider,
        input.providerAccountId,
        input.accountLabel,
        input.encryptedAccessToken,
        input.encryptedRefreshToken,
        input.tokenType,
        input.scope,
        input.accessTokenExpiresAt,
        now,
        now,
      ],
    });
    if (!result.rows[0]) throw new Error("personal cloud connection upsert returned no row");
    return connection(result.rows[0]);
  }

  async updateTokens(input: {
    readonly userId: string;
    readonly provider: PersonalCloudProviderId;
    readonly encryptedAccessToken: string;
    readonly encryptedRefreshToken: string;
    readonly tokenType: string;
    readonly scope: string;
    readonly accessTokenExpiresAt: Date;
  }): Promise<PersonalCloudConnectionRecord> {
    await this.ensureSchema();
    const now = new Date();
    const result = await dbClient.execute({
      sql: `UPDATE "personal_cloud_connection"
        SET "encryptedAccessToken" = ?,
            "encryptedRefreshToken" = ?,
            "tokenType" = ?,
            "scope" = ?,
            "accessTokenExpiresAt" = ?,
            "updatedAt" = ?,
            "lastUsedAt" = ?
        WHERE "userId" = ? AND "provider" = ?
        RETURNING ${SELECT_COLUMNS}`,
      args: [
        input.encryptedAccessToken,
        input.encryptedRefreshToken,
        input.tokenType,
        input.scope,
        input.accessTokenExpiresAt,
        now,
        now,
        input.userId,
        input.provider,
      ],
    });
    if (!result.rows[0]) throw new Error("personal cloud connection not found");
    return connection(result.rows[0]);
  }

  async touch(userId: string, provider: PersonalCloudProviderId): Promise<void> {
    await this.ensureSchema();
    await dbClient.execute({
      sql: `UPDATE "personal_cloud_connection"
        SET "lastUsedAt" = ?, "updatedAt" = ?
        WHERE "userId" = ? AND "provider" = ?`,
      args: [new Date(), new Date(), userId, provider],
    });
  }

  async remove(userId: string, provider: PersonalCloudProviderId): Promise<boolean> {
    await this.ensureSchema();
    const result = await dbClient.execute({
      sql: `DELETE FROM "personal_cloud_connection"
        WHERE "userId" = ? AND "provider" = ?`,
      args: [userId, provider],
    });
    return result.rowsAffected > 0;
  }
}
