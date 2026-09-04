import { dbPool } from "../../db";

import {
  TRAFFIC_PAGE_VIEW_PREFIX,
  trafficPageViewRangeKey,
  TRAFFIC_SESSION_PREFIX,
  TRAFFIC_SESSION_UPPER_BOUND,
} from "./traffic-analytics-model";

const RETENTION_LEASE_KEY = "traffic:maintenance:retention";
const RETENTION_LEASE_MS = 6 * 60 * 60 * 1_000;

type StoredTrafficValue = Readonly<Record<string, unknown>>;

function json(value: StoredTrafficValue): string {
  return JSON.stringify(value);
}

export async function persistTrafficPageView(input: {
  eventKey: string;
  eventValue: StoredTrafficValue;
  sessionKey: string;
  sessionValue: StoredTrafficValue;
  occurredAt: Date;
}): Promise<void> {
  await dbPool.query(
    `
      WITH inserted_event AS (
        INSERT INTO app_setting (key, value, "updatedAt")
        VALUES ($1, $2::jsonb, $3)
        RETURNING 1
      )
      INSERT INTO app_setting (key, value, "updatedAt")
      SELECT $4, $5::jsonb, $3
      FROM inserted_event
      ON CONFLICT (key) DO UPDATE SET
        value =
          app_setting.value
          || jsonb_strip_nulls(EXCLUDED.value)
          || jsonb_build_object(
            'firstSeenAt',
              COALESCE(app_setting.value->'firstSeenAt', EXCLUDED.value->'firstSeenAt'),
            'entryPath',
              COALESCE(app_setting.value->'entryPath', EXCLUDED.value->'entryPath'),
            'referrerHost',
              COALESCE(app_setting.value->'referrerHost', EXCLUDED.value->'referrerHost'),
            'source',
              COALESCE(app_setting.value->'source', EXCLUDED.value->'source'),
            'medium',
              COALESCE(app_setting.value->'medium', EXCLUDED.value->'medium'),
            'campaign',
              COALESCE(app_setting.value->'campaign', EXCLUDED.value->'campaign'),
            'pageViews',
              COALESCE((app_setting.value->>'pageViews')::integer, 0) + 1,
            'engagedSeconds',
              GREATEST(
                COALESCE((app_setting.value->>'engagedSeconds')::integer, 0),
                COALESCE((EXCLUDED.value->>'engagedSeconds')::integer, 0)
              )
          ),
        "updatedAt" = GREATEST(app_setting."updatedAt", EXCLUDED."updatedAt")
    `,
    [
      input.eventKey,
      json(input.eventValue),
      input.occurredAt,
      input.sessionKey,
      json(input.sessionValue),
    ],
  );
}

export async function persistTrafficHeartbeat(input: {
  sessionKey: string;
  sessionValue: StoredTrafficValue;
  occurredAt: Date;
}): Promise<void> {
  await dbPool.query(
    `
      INSERT INTO app_setting (key, value, "updatedAt")
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (key) DO UPDATE SET
        value =
          app_setting.value
          || jsonb_strip_nulls(EXCLUDED.value)
          || jsonb_build_object(
            'firstSeenAt',
              COALESCE(app_setting.value->'firstSeenAt', EXCLUDED.value->'firstSeenAt'),
            'entryPath',
              COALESCE(app_setting.value->'entryPath', EXCLUDED.value->'entryPath'),
            'pageViews',
              COALESCE((app_setting.value->>'pageViews')::integer, 0),
            'engagedSeconds',
              GREATEST(
                COALESCE((app_setting.value->>'engagedSeconds')::integer, 0),
                COALESCE((EXCLUDED.value->>'engagedSeconds')::integer, 0)
              )
          ),
        "updatedAt" = GREATEST(app_setting."updatedAt", EXCLUDED."updatedAt")
    `,
    [input.sessionKey, json(input.sessionValue), input.occurredAt],
  );
}

export async function cleanupExpiredTrafficData(
  retentionDays: number,
  now = new Date(),
): Promise<void> {
  const retentionCutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1_000,
  );
  const leaseCutoff = new Date(now.getTime() - RETENTION_LEASE_MS);
  await dbPool.query(
    `
      WITH cleanup_lease AS (
        INSERT INTO app_setting (key, value, "updatedAt")
        VALUES ($1, '{"version":1}'::jsonb, $2)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          "updatedAt" = EXCLUDED."updatedAt"
        WHERE app_setting."updatedAt" < $3
        RETURNING 1
      )
      DELETE FROM app_setting
      WHERE EXISTS (SELECT 1 FROM cleanup_lease)
        AND (
          (
            key >= $4
            AND key < $5
          ) OR (
            key >= $6
            AND key < $7
            AND "updatedAt" < $8
          )
        )
    `,
    [
      RETENTION_LEASE_KEY,
      now,
      leaseCutoff,
      TRAFFIC_PAGE_VIEW_PREFIX,
      trafficPageViewRangeKey(retentionCutoff),
      TRAFFIC_SESSION_PREFIX,
      TRAFFIC_SESSION_UPPER_BOUND,
      retentionCutoff,
    ],
  );
}
