import { describe, expect, it, vi } from "vitest";

import {
  preflightStudioAiComicDirectorSchema,
  STUDIO_AI_COMIC_DIRECTOR_REQUIRED_RELATIONS,
} from "./studio-ai-comic-director-schema-preflight";

function schemaRows(missing?: string) {
  return STUDIO_AI_COMIC_DIRECTOR_REQUIRED_RELATIONS.map((relationName) => ({
    relationName,
    relation: relationName === missing ? null : `public.${relationName}`,
  }));
}

describe("Studio AI Comic Director schema preflight", () => {
  it("verifies managed relations without executing runtime DDL", async () => {
    const query = vi.fn().mockResolvedValue({ rows: schemaRows() });
    const pool = { query } as unknown as Parameters<
      typeof preflightStudioAiComicDirectorSchema
    >[0];

    await preflightStudioAiComicDirectorSchema(pool);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("to_regclass");
    expect(sql).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\b/u);
    expect(params).toEqual([[...STUDIO_AI_COMIC_DIRECTOR_REQUIRED_RELATIONS]]);
  });

  it("fails closed with the exact missing managed relation", async () => {
    const missing = "studio_ai_comic_director_job_event";
    const query = vi.fn().mockResolvedValue({ rows: schemaRows(missing) });
    const pool = { query } as unknown as Parameters<
      typeof preflightStudioAiComicDirectorSchema
    >[0];

    await expect(preflightStudioAiComicDirectorSchema(pool)).rejects.toThrow(
      new RegExp(missing, "u"),
    );
  });
});
