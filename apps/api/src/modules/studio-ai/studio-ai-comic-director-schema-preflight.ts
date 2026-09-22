import { runSchemaPreflightToleratingDbUnavailability } from "../../common/database-availability";
import { dbPool } from "../../db";

import type { Pool } from "pg";

export const STUDIO_AI_COMIC_DIRECTOR_SCHEMA_PREFLIGHT = Symbol(
  "STUDIO_AI_COMIC_DIRECTOR_SCHEMA_PREFLIGHT",
);

export const STUDIO_AI_COMIC_DIRECTOR_REQUIRED_RELATIONS = [
  "studio_ai_comic_director_session",
  "studio_ai_visual_bible_revision",
  "studio_ai_comic_director_job",
  "studio_ai_comic_director_job_event",
  "studio_ai_comic_director_artifact",
  "studio_ai_comic_director_approval",
] as const;

interface ComicDirectorSchemaRow {
  relationName: string;
  relation: string | null;
}

type QueryablePool = Pick<Pool, "query">;

const INCOMPLETE_SCHEMA_MESSAGE =
  "Studio AI Comic Director schema is incomplete; apply production migration 0052_studio_ai_comic_director.sql before starting the API";

/**
 * Production schema authority belongs to managed migrations. Runtime startup only
 * verifies the approved relations and never requires CREATE/ALTER privileges.
 */
export async function preflightStudioAiComicDirectorSchema(
  pool: QueryablePool = dbPool,
): Promise<void> {
  const result = await pool.query<ComicDirectorSchemaRow>(
    `
WITH required(relation_name) AS (
  SELECT * FROM unnest($1::text[])
)
SELECT
  relation_name AS "relationName",
  pg_catalog.to_regclass(
    pg_catalog.format('public.%I', relation_name)
  )::text AS relation
FROM required
ORDER BY relation_name
`,
    [[...STUDIO_AI_COMIC_DIRECTOR_REQUIRED_RELATIONS]],
  );
  const relations = new Map(
    result.rows.map(
      ({ relationName, relation }) => [relationName, relation] as const,
    ),
  );
  const missing = STUDIO_AI_COMIC_DIRECTOR_REQUIRED_RELATIONS.filter(
    (relationName) => !relations.get(relationName),
  );
  if (missing.length > 0) {
    throw new Error(`${INCOMPLETE_SCHEMA_MESSAGE}: ${missing.join(", ")}`);
  }
}

export const studioAiComicDirectorSchemaPreflightProvider = {
  provide: STUDIO_AI_COMIC_DIRECTOR_SCHEMA_PREFLIGHT,
  useFactory: async (): Promise<true> => {
    await runSchemaPreflightToleratingDbUnavailability(
      "Studio AI Comic Director schema preflight",
      () => preflightStudioAiComicDirectorSchema(),
    );
    return true;
  },
};
