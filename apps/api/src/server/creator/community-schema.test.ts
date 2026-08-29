import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../db", () => ({ dbPool: { query: mocks.query } }));

async function loadSubject() {
  return import("./community-schema");
}

const readyResult = { rows: [{ ready: true }] };
const incompleteResult = { rows: [{ ready: false }] };

describe("creator community schema ensure", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    vi.resetModules();
  });

  it("accepts an expand-compatible schema without issuing DDL and caches readiness", async () => {
    mocks.query.mockResolvedValueOnce(readyResult);
    const { ensureCreatorCommunitySchema } = await loadSubject();

    await expect(ensureCreatorCommunitySchema()).resolves.toBe(true);
    await expect(ensureCreatorCommunitySchema()).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledOnce();
    const verificationSql = String(mocks.query.mock.calls[0]?.[0]);
    expect(verificationSql).toContain('FROM "creator_work"');
    expect(verificationSql).toContain('FROM "creator_work_revision"');
    expect(verificationSql).toContain("normalized_check_constraints");
    expect(verificationSql).toContain("creator_work_revision_positive_check");
    expect(verificationSql).toContain("creator_work_revision_restored_from_positive_check");
    expect(verificationSql).toContain("creator_work_revision_snapshot_object_check");
    expect(verificationSql).toContain("constraint_row.contype = 'p'");
    expect(verificationSql).toContain("constraint_row.contype = 'f'");
    expect(verificationSql).not.toContain("creator_work_series_idx");
    expect(verificationSql).not.toContain("creator_work_challenge_idx");
    expect(verificationSql).not.toContain("creator_series_user_idx");
    expect(verificationSql).toContain("WHERE NOT EXISTS");
    expect(verificationSql).toContain('work_revision."revision" = work."revision"');
    expect(verificationSql).not.toMatch(/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/iu);
  });

  it("repairs a shaped database whose revision invariants or baseline are incomplete", async () => {
    mocks.query
      .mockResolvedValueOnce(incompleteResult)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(readyResult);
    const { ensureCreatorCommunitySchema } = await loadSubject();

    await expect(ensureCreatorCommunitySchema()).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledTimes(3);
    const repairSql = String(mocks.query.mock.calls[1]?.[0]);
    expect(repairSql).toContain('ALTER COLUMN "revision" SET DEFAULT 1');
    expect(repairSql).toContain('ALTER COLUMN "revision" SET NOT NULL');
    expect(repairSql).toContain('CONSTRAINT "creator_work_revision_positive_check"');
    expect(repairSql).toContain(
      'CONSTRAINT "creator_work_revision_restored_from_positive_check"'
    );
    expect(repairSql).toContain('CONSTRAINT "creator_work_revision_snapshot_object_check"');
    expect(repairSql).toContain('CONSTRAINT "creator_work_revision_pkey"');
    expect(repairSql).toContain('CONSTRAINT "creator_work_revision_work_id_fkey"');
    expect(repairSql).toContain('CREATE INDEX "creator_work_series_idx"');
    expect(repairSql).toContain('CREATE INDEX "creator_work_challenge_idx"');
    expect(repairSql).toContain('CREATE INDEX "creator_series_user_idx"');
    expect(repairSql).toContain('INSERT INTO "creator_work_revision"');
    expect(String(mocks.query.mock.calls[2]?.[0])).toContain('AS "ready"');
  });

  it.each([
    ["missing relation", "42P01"],
    ["missing column", "42703"],
  ])("repairs a legacy database with %s shape", async (_label, code) => {
    mocks.query
      .mockRejectedValueOnce(Object.assign(new Error("legacy shape is incomplete"), { code }))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(readyResult);
    const { ensureCreatorCommunitySchema } = await loadSubject();

    await expect(ensureCreatorCommunitySchema()).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(String(mocks.query.mock.calls[0]?.[0])).toMatch(/^\s*WITH\b/u);
    expect(String(mocks.query.mock.calls[1]?.[0])).toContain(
      'CREATE TABLE IF NOT EXISTS "creator_work"'
    );
    expect(String(mocks.query.mock.calls[2]?.[0])).toMatch(/^\s*WITH\b/u);
  });

  it.each([
    ["transport", "ECONNREFUSED"],
    ["permission", "42501"],
  ])("does not misclassify a %s failure as repairable drift", async (_label, code) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.query.mockRejectedValueOnce(
      Object.assign(new Error("verification unavailable"), { code })
    );
    const { ensureCreatorCommunitySchema } = await loadSubject();

    await expect(ensureCreatorCommunitySchema()).resolves.toBe(false);

    expect(mocks.query).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`ensure schema failed (code=${code})`)
    );
    errorSpy.mockRestore();
  });

  it("preserves a repair permission failure and retries instead of caching it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.query
      .mockRejectedValueOnce(Object.assign(new Error("relation missing"), { code: "42P01" }))
      .mockRejectedValueOnce(Object.assign(new Error("permission denied"), { code: "42501" }))
      .mockResolvedValueOnce(readyResult);
    const { ensureCreatorCommunitySchema } = await loadSubject();

    await expect(ensureCreatorCommunitySchema()).resolves.toBe(false);
    await expect(ensureCreatorCommunitySchema()).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ensure schema failed (code=42501): permission denied")
    );
    errorSpy.mockRestore();
  });

  it("does not cache a false re-verification after repair", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.query
      .mockResolvedValueOnce(incompleteResult)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(incompleteResult)
      .mockResolvedValueOnce(readyResult);
    const { ensureCreatorCommunitySchema } = await loadSubject();

    await expect(ensureCreatorCommunitySchema()).resolves.toBe(false);
    await expect(ensureCreatorCommunitySchema()).resolves.toBe(true);
    await expect(ensureCreatorCommunitySchema()).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledTimes(4);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("code=CREATOR_COMMUNITY_SCHEMA_INCOMPLETE")
    );
    errorSpy.mockRestore();
  });

  it("does not cache a failed re-verification query after repair", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.query
      .mockResolvedValueOnce(incompleteResult)
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error("permission denied"), { code: "42501" }))
      .mockResolvedValueOnce(readyResult);
    const { ensureCreatorCommunitySchema } = await loadSubject();

    await expect(ensureCreatorCommunitySchema()).resolves.toBe(false);
    await expect(ensureCreatorCommunitySchema()).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledTimes(4);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ensure schema failed (code=42501): permission denied")
    );
    errorSpy.mockRestore();
  });

  it("coalesces concurrent cold-start verification", async () => {
    let resolveVerification: ((value: typeof readyResult) => void) | undefined;
    mocks.query.mockImplementationOnce(
      () =>
        new Promise<typeof readyResult>((resolve) => {
          resolveVerification = resolve;
        })
    );
    const { ensureCreatorCommunitySchema } = await loadSubject();

    const first = ensureCreatorCommunitySchema();
    const second = ensureCreatorCommunitySchema();
    resolveVerification?.(readyResult);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(mocks.query).toHaveBeenCalledOnce();
  });
});
