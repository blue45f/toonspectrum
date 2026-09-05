import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const librarySchema = readFileSync(
  resolve(root, "apps/api/src/db/creator-marketplace-library.schema.ts"),
  "utf8",
);
const reportSchema = readFileSync(
  resolve(root, "apps/api/src/db/creator-marketplace-report.schema.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    root,
    "apps/api/src/db/migrations/0037_creator_marketplace_3d_asset_parity.sql",
  ),
  "utf8",
);

describe("creator marketplace 3D asset parity", () => {
  it("admits 3D assets into the account library schema", () => {
    expect(librarySchema).toContain(
      "'asset', 'brush', 'filter', 'palette', 'template', '3d-preset', '3d-asset'",
    );
    expect(migration).toContain("creator_marketplace_library_kind_check_v2");
    expect(migration).toContain(
      'RENAME CONSTRAINT "creator_marketplace_library_kind_check_v2"',
    );
  });

  it("admits 3D assets into immutable moderation evidence", () => {
    expect(reportSchema).toContain(
      "'asset', 'brush', 'filter', 'palette', 'template', '3d-preset', '3d-asset'",
    );
    expect(migration).toContain(
      "creator_marketplace_resource_report_evidence_check_v2",
    );
    expect(migration).toContain("'3d-asset'");
    expect(migration).toContain("VALIDATE CONSTRAINT");
  });
});
