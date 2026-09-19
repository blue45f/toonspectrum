import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";

import { HiringController } from "./hiring.controller";
import { HiringResumeRepository } from "./hiring-resume.repository";
import { HiringStore } from "./hiring.store";
import { parseHiring, resumeInputSchema, submissionSchema } from "./hiring.validation";

import type { HiringResumeInput } from "../../../../../packages/contracts/src/creator-hiring";
import type { Pool } from "pg";

const ID = "11111111-1111-4111-8111-111111111111";
export const resume: HiringResumeInput = { title: "선화 지원", expectedRevision: 0, content: { penName: "그림작가", summary: "웹툰 선화 작업", roles: ["lineart"], tools: ["Clip Studio Paint"], formats: ["PSD"], languages: ["한국어"], experiences: [], portfolio: [{ title: "작업 예시", url: "https://example.com/work", contribution: "직접 그린 선화", permission: "owned" }] } };
const input = { resumeVersionId: ID, portfolioIndexes: [0], message: "웹툰 선화 작업에 지원합니다. 주간 작업이 가능합니다.", contact: "artist@example.com", consentRevision: "2026-09-20" as const, expectedPostVersion: 1, mutationId: ID };
function harness(opts: { foreignResume?: boolean; revision?: number; appActor?: string; unavailable?: boolean; stalePost?: boolean; closed?: boolean; receipt?: { request_digest: string; result: unknown } } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (opts.unavailable) throw new Error("private SQL diagnostic");
    if (sql === "SELECT clock_timestamp() AS now") return { rows: [{ now: new Date() }] };
    if (sql.includes('FROM "user"')) return { rows: [{ id: "actor" }] };
    if (sql.includes("FROM creator_hiring_receipt")) return { rows: opts.receipt ? [opts.receipt] : [] };
    if (sql.startsWith("SELECT *,clock_timestamp()")) return { rows: [{ id: ID, userId: "recruiter", status: opts.closed ? "closed" : "open", version: opts.stalePost ? 2 : 1, hidden: false, deletedAt: null, deadlineAt: null, now: new Date() }] };
    if (sql.includes("SELECT v.* FROM creator_hiring_resume_version")) return { rows: opts.foreignResume ? [] : [{ id: ID, resume_id: ID, revision: 1, content: resume.content }] };
    if (sql.startsWith("SELECT id,revision")) return { rows: opts.foreignResume ? [] : [{ id: ID, revision: opts.revision ?? 1 }] };
    if (sql.startsWith('SELECT a."userId"')) return { rows: [{ userId: opts.appActor ?? "actor" }] };
    if (sql.includes("AS count")) return { rows: [{ count: 0 }] };
    if (sql.includes("RETURNING id")) return { rows: [{ id: ID }] };
    return { rows: [] };
  });
  const release = vi.fn();
  const store = new HiringStore({ connect: async () => ({ query, release }) } as unknown as Pool);
  return { query, release, store, repo: new HiringResumeRepository(store), sql: () => query.mock.calls.map(([s]) => s) };
}
describe("strict hiring input", () => {
  it("rejects actor, fortune, verification and arbitrary tool fields", () => {
    for (const extra of [{ userId: "other" }, { birthDate: "2000-01-01" }, { verified: true }]) expect(() => parseHiring(resumeInputSchema, { ...resume, ...extra })).toThrow();
    expect(() => parseHiring(resumeInputSchema, { ...resume, content: { ...resume.content, fortune: 100 } })).toThrow();
    expect(() => parseHiring(resumeInputSchema, { ...resume, content: { ...resume.content, tools: ["unbounded tool"] } })).toThrow();
  });
  it.each(["javascript:alert(1)", "http://example.com", "https://127.0.0.1", "https://localhost/a", Object.assign(new URL("https://example.com"), { username: "test-user", password: "fixture-only" }).href, "https://example.com:8443"])('rejects unsafe portfolio %s', (url) => {
    expect(() => parseHiring(resumeInputSchema, { ...resume, content: { ...resume.content, portfolio: [{ ...resume.content.portfolio[0], url }] } })).toThrow();
  });
  it("rejects duplicates, unsafe revision and oversized arrays", () => {
    expect(() => parseHiring(submissionSchema, { ...input, portfolioIndexes: [0, 0] })).toThrow();
    expect(() => parseHiring(resumeInputSchema, { ...resume, expectedRevision: Number.MAX_SAFE_INTEGER })).toThrow();
    expect(() => parseHiring(resumeInputSchema, { ...resume, content: { ...resume.content, experiences: Array(21).fill({}) } })).toThrow();
  });
});
describe("hiring controller and mocked SQL transaction boundaries", () => {
  it("requires a session actor and does not trust a body actor", () => {
    const h = harness(), ctrl = new HiringController(h.repo);
    expect(() => ctrl.create(resume)).toThrow();
    expect(() => ctrl.create({ ...resume, userId: "forged" }, "actor")).toThrow();
    expect(h.query).not.toHaveBeenCalled();
  });
  it("does not reveal another owner's resume versions", async () => {
    const h = harness({ foreignResume: true });
    await expect(h.repo.versions("actor", ID)).rejects.toMatchObject({ status: 404 });
    expect(h.sql().some((s) => s.startsWith("SELECT * FROM creator_hiring_resume_version"))).toBe(false);
  });
  it("does not let an outsider or moderator read submitted content", async () => {
    for (const actor of ["outsider", "moderator"]) {
      const h = harness(); await expect(h.repo.snapshots(actor, ID, ID)).rejects.toMatchObject({ status: 404 });
      expect(h.sql().some((s) => s.includes("FROM creator_hiring_application_snapshot"))).toBe(false);
    }
  });
  it("rejects stale resume and post revisions", async () => {
    await expect(harness({ revision: 2 }).repo.save("actor", ID, { ...resume, expectedRevision: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(harness({ stalePost: true }).repo.submit("actor", ID, input)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects closed posts and foreign versions without inserting", async () => {
    for (const opts of [{ closed: true }, { foreignResume: true }]) {
      const h = harness(opts); await expect(h.repo.submit("actor", ID, input)).rejects.toThrow();
      expect(h.sql().some((s) => s.startsWith("INSERT"))).toBe(false);
    }
  });
  it("commits the original application and selected snapshot atomically", async () => {
    const h = harness(); await h.repo.submit("actor", ID, input);
    expect(h.sql().find((s) => s.includes("FROM creator_collab_post"))).toContain("FOR UPDATE");
    expect(h.sql().some((s) => s.startsWith("INSERT INTO creator_collab_application"))).toBe(true);
    expect(h.sql().some((s) => s.startsWith("INSERT INTO creator_hiring_application_snapshot"))).toBe(true);
    expect(h.sql().at(-1)).toBe("COMMIT"); expect(h.release).toHaveBeenCalledOnce();
  });
  it("returns 503 with no private diagnostics on persistence failure", async () => {
    const h = harness({ unavailable: true }); await expect(h.repo.list("actor")).rejects.toMatchObject({ status: 503 });
    await expect(h.repo.list("actor")).rejects.not.toThrow("private SQL diagnostic");
  });
  it("rejects idempotency digest mismatch with 409", async () => {
    const h = harness({ receipt: { request_digest: "different", result: {} } });
    await expect(h.repo.submit("actor", ID, input)).rejects.toMatchObject({ status: 409 });
    expect(h.sql().some((s) => s.startsWith("INSERT"))).toBe(false);
  });
});
