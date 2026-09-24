import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "apps/api/src/db/migrations/0091_creator_work_publication_media.sql",
  ),
  "utf8",
);

describe("creator publication media migration", () => {
  it("stores immutable digest references without inline image bytes", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS public.creator_work_publication_media",
    );
    expect(sql).toContain('PRIMARY KEY ("workId", slot, "objectDigest")');
    expect(sql).toContain('FOREIGN KEY (purpose, "objectDigest")');
    expect(sql).toContain("creator_asset_storage_object");
    expect(sql).toContain("creator_work_publication_media_slot_check");
    expect(sql).toContain("creator_work_publication_media_type_check");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.creator_work_publication_media FROM PUBLIC",
    );
    expect(sql).not.toMatch(/data:image|base64/iu);
  });
});
