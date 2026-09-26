import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "apps/api/src/platform/database/migrations/0090_studio_review_voice_note.sql"), "utf8");

describe("studio review voice note migration", () => {
  it("pins notes to exact review revisions with bounded retention and idempotent authorship", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS studio_review_voice_note");
    expect(sql).toContain('"rootGraphHash" text NOT NULL');
    expect(sql).toContain('UNIQUE ("authorUserId", "operationId")');
    expect(sql).toContain('"expiresAt" > "createdAt"');
    expect(sql).toContain("studio_review_voice_note_expiry_idx");
    expect(sql).toContain("studio_review_voice_note_guard_update");
    expect(sql).toContain("new review voice note cannot start deleted");
    expect(sql).toContain("review voice note immutable fields changed");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OR DELETE");
    expect(sql).toContain("REVOKE ALL ON TABLE studio_review_voice_note FROM PUBLIC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION studio_review_voice_note_guard() FROM PUBLIC");
  });
});
