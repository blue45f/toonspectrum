import { Injectable } from "@nestjs/common";

import {
  creatorRoleWorkspacePreferenceForProfile,
  normalizeCreatorRoleWorkspacePreference,
  type CreatorRoleWorkspacePreference,
  type PublicCreatorRoleCandidate,
} from "../../../../web/src/shared/lib/creator-role-workspace-contract";
import {
  normalizeCreatorRoleProfile,
  publicCreatorRoleProfile,
  type CreatorCollaborationStatus,
  type CreatorRoleId,
  type CreatorSpecialtyId,
} from "../../../../web/src/shared/lib/creator-role-contract";
import { dbClient } from "../../db";

export interface CreatorRoleWorkspaceRecord {
  readonly projectKey: string;
  readonly revision: number;
  readonly document: CreatorRoleWorkspacePreference;
  readonly updatedAt: string | null;
}

export interface CreatorRoleDirectoryFilter {
  readonly role?: CreatorRoleId;
  readonly specialty?: CreatorSpecialtyId;
  readonly collaborationStatus?: CreatorCollaborationStatus;
  readonly q?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface CreatorRoleDirectoryPage {
  readonly items: readonly PublicCreatorRoleCandidate[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

type DatabaseRow = Record<string, unknown>;

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function workspaceRecord(
  row: DatabaseRow,
  fallbackKey: string,
): CreatorRoleWorkspaceRecord {
  return {
    projectKey: typeof row.projectKey === "string" ? row.projectKey : fallbackKey,
    revision: nonNegativeInteger(row.revision),
    document: normalizeCreatorRoleWorkspacePreference(jsonValue(row.document)),
    updatedAt: isoDate(row.updatedAt),
  };
}

function publicCandidate(row: DatabaseRow): PublicCreatorRoleCandidate | null {
  if (typeof row.userId !== "string" || !row.userId) return null;
  const rawProfile = jsonValue(row.roleProfile);
  const roleProfile = publicCreatorRoleProfile({
    ...(rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile)
      ? rawProfile as Record<string, unknown>
      : {}),
    roleVisibility: true,
    activeRole: null,
  });
  if (!roleProfile) return null;
  return {
    userId: row.userId,
    name: typeof row.name === "string" && row.name.trim()
      ? row.name.trim()
      : "익명 창작자",
    roleProfile,
    capacity: null,
    customRoleLabel: typeof row.customRoleLabel === "string"
      ? row.customRoleLabel.trim().slice(0, 48) || null
      : null,
  };
}

const WORKSPACE_COLUMNS = `
  "projectKey", "revision", "document", "updatedAt"
`;

const PUBLIC_ROLE_VISIBLE_SQL = `
  COALESCE(
    CASE
      WHEN jsonb_typeof(pref."document"->'visibility'->'roles') = 'boolean'
      THEN (pref."document"->'visibility'->>'roles')::boolean
      ELSE NULL
    END,
    CASE
      WHEN jsonb_typeof(u."creatorRoleProfile"->'roleVisibility') = 'boolean'
      THEN (u."creatorRoleProfile"->>'roleVisibility')::boolean
      ELSE false
    END,
    false
  )
`;

const PUBLIC_SPECIALTIES_VISIBLE_SQL = `
  COALESCE(
    CASE
      WHEN jsonb_typeof(pref."document"->'visibility'->'specialties') = 'boolean'
      THEN (pref."document"->'visibility'->>'specialties')::boolean
      ELSE NULL
    END,
    false
  )
`;

const PUBLIC_EXPERIENCE_VISIBLE_SQL = `
  COALESCE(
    CASE
      WHEN jsonb_typeof(pref."document"->'visibility'->'experienceLevel') = 'boolean'
      THEN (pref."document"->'visibility'->>'experienceLevel')::boolean
      ELSE NULL
    END,
    false
  )
`;

const PUBLIC_COLLABORATION_VISIBLE_SQL = `
  COALESCE(
    CASE
      WHEN jsonb_typeof(pref."document"->'visibility'->'collaborationStatus') = 'boolean'
      THEN (pref."document"->'visibility'->>'collaborationStatus')::boolean
      ELSE NULL
    END,
    false
  )
`;

const PUBLIC_SELECT_SQL = `
  u."id" AS "userId",
  COALESCE(NULLIF(BTRIM(u."name"), ''), '익명 창작자') AS "name",
  CASE WHEN ${PUBLIC_ROLE_VISIBLE_SQL}
    THEN NULLIF(BTRIM(pref."document"->>'customRoleLabel'), '')
    ELSE NULL
  END AS "customRoleLabel",
  jsonb_build_object(
    'version', 1,
    'primaryRole', u."creatorRoleProfile"->'primaryRole',
    'secondaryRoles', COALESCE(u."creatorRoleProfile"->'secondaryRoles', '[]'::jsonb),
    'specialties', CASE WHEN ${PUBLIC_SPECIALTIES_VISIBLE_SQL}
      THEN COALESCE(u."creatorRoleProfile"->'specialties', '[]'::jsonb)
      ELSE '[]'::jsonb
    END,
    'experienceLevel', CASE WHEN ${PUBLIC_EXPERIENCE_VISIBLE_SQL}
      THEN u."creatorRoleProfile"->'experienceLevel'
      ELSE 'null'::jsonb
    END,
    'collaborationStatus', CASE WHEN ${PUBLIC_COLLABORATION_VISIBLE_SQL}
      THEN u."creatorRoleProfile"->'collaborationStatus'
      ELSE 'null'::jsonb
    END,
    'roleVisibility', true,
    'activeRole', 'null'::jsonb
  ) AS "roleProfile"
`;

@Injectable()
export class CreatorRoleWorkspaceRepository {
  async get(
    userId: string,
    projectKey: string,
  ): Promise<CreatorRoleWorkspaceRecord> {
    const result = await dbClient.execute({
      sql: `SELECT ${WORKSPACE_COLUMNS}
        FROM "creator_role_workspace_preference"
        WHERE "userId" = ? AND "projectKey" = ?
        LIMIT 1`,
      args: [userId, projectKey],
    });
    if (result.rows[0]) return workspaceRecord(result.rows[0], projectKey);

    const profileResult = await dbClient.execute({
      sql: `SELECT "creatorRoleProfile"
        FROM "user"
        WHERE "id" = ? AND "status" = 'active'
        LIMIT 1`,
      args: [userId],
    });
    const profile = normalizeCreatorRoleProfile(
      profileResult.rows[0]?.creatorRoleProfile,
    );
    return {
      projectKey,
      revision: 0,
      document: creatorRoleWorkspacePreferenceForProfile(profile),
      updatedAt: null,
    };
  }

  async save(
    userId: string,
    projectKey: string,
    baseRevision: number,
    document: CreatorRoleWorkspacePreference,
  ): Promise<CreatorRoleWorkspaceRecord | null> {
    const result = await dbClient.execute({
      sql: `INSERT INTO "creator_role_workspace_preference" (
          "userId", "projectKey", "revision", "document", "createdAt", "updatedAt"
        )
        SELECT ?, ?, 1, ?::jsonb, NOW(), NOW()
        WHERE ? = 0
        ON CONFLICT ("userId", "projectKey") DO UPDATE SET
          "revision" = "creator_role_workspace_preference"."revision" + 1,
          "document" = EXCLUDED."document",
          "updatedAt" = NOW()
        WHERE "creator_role_workspace_preference"."revision" = ?
        RETURNING ${WORKSPACE_COLUMNS}`,
      args: [
        userId,
        projectKey,
        JSON.stringify(normalizeCreatorRoleWorkspacePreference(document)),
        baseRevision,
        baseRevision,
      ],
    });
    return result.rows[0] ? workspaceRecord(result.rows[0], projectKey) : null;
  }

  async batchPublicProfiles(
    userIds: readonly string[],
  ): Promise<readonly PublicCreatorRoleCandidate[]> {
    if (userIds.length === 0) return [];
    const result = await dbClient.execute({
      sql: `SELECT ${PUBLIC_SELECT_SQL}
        FROM "user" u
        LEFT JOIN "creator_role_workspace_preference" pref
          ON pref."userId" = u."id" AND pref."projectKey" = 'global'
        WHERE u."status" = 'active'
          AND u."id" = ANY(?::text[])
          AND u."creatorRoleProfile"->>'primaryRole' IS NOT NULL
          AND ${PUBLIC_ROLE_VISIBLE_SQL}
        ORDER BY u."name" ASC, u."id" ASC`,
      args: [[...userIds]],
    });
    return result.rows
      .map(publicCandidate)
      .filter((candidate): candidate is PublicCreatorRoleCandidate => candidate !== null);
  }

  async directory(
    filter: CreatorRoleDirectoryFilter,
  ): Promise<CreatorRoleDirectoryPage> {
    const where = [
      `u."status" = 'active'`,
      `u."creatorRoleProfile"->>'primaryRole' IS NOT NULL`,
      PUBLIC_ROLE_VISIBLE_SQL,
    ];
    const args: unknown[] = [];

    if (filter.role) {
      where.push(`(
        u."creatorRoleProfile"->>'primaryRole' = ?
        OR COALESCE(u."creatorRoleProfile"->'secondaryRoles', '[]'::jsonb)
          @> to_jsonb(ARRAY[?]::text[])
      )`);
      args.push(filter.role, filter.role);
    }
    if (filter.specialty) {
      where.push(`(
        ${PUBLIC_SPECIALTIES_VISIBLE_SQL}
        AND COALESCE(u."creatorRoleProfile"->'specialties', '[]'::jsonb)
          @> to_jsonb(ARRAY[?]::text[])
      )`);
      args.push(filter.specialty);
    }
    if (filter.collaborationStatus) {
      where.push(`(
        ${PUBLIC_COLLABORATION_VISIBLE_SQL}
        AND u."creatorRoleProfile"->>'collaborationStatus' = ?
      )`);
      args.push(filter.collaborationStatus);
    }
    if (filter.q) {
      where.push(`(
        COALESCE(u."name", '') ILIKE '%' || ? || '%'
        OR COALESCE(pref."document"->>'customRoleLabel', '') ILIKE '%' || ? || '%'
      )`);
      args.push(filter.q, filter.q);
    }

    const result = await dbClient.execute({
      sql: `SELECT ${PUBLIC_SELECT_SQL}, COUNT(*) OVER() AS "total"
        FROM "user" u
        LEFT JOIN "creator_role_workspace_preference" pref
          ON pref."userId" = u."id" AND pref."projectKey" = 'global'
        WHERE ${where.join("\n          AND ")}
        ORDER BY
          CASE u."creatorRoleProfile"->>'collaborationStatus'
            WHEN 'available' THEN 0
            WHEN 'limited' THEN 1
            ELSE 2
          END,
          u."name" ASC,
          u."id" ASC
        LIMIT ? OFFSET ?`,
      args: [...args, filter.limit, filter.offset],
    });
    const items = result.rows
      .map(publicCandidate)
      .filter((candidate): candidate is PublicCreatorRoleCandidate => candidate !== null);
    return {
      items,
      total: nonNegativeInteger(result.rows[0]?.total),
      limit: filter.limit,
      offset: filter.offset,
    };
  }
}
