import { describe, expect, it, vi } from "vitest";

import { CollaborationRepository } from "./collaboration.repository";
import { CollaborationService, parseCollaborationQuery } from "./collaboration.service";
import type { CollaborationInput } from "../../../../../packages/core/src/collaboration";
import type { Pool } from "pg";

const ID = "11111111-1111-4111-8111-111111111111";
const input: CollaborationInput = { type: "team", role: "ink", title: "웹툰 선화 작업자를 구합니다", payType: "negotiable", workMode: "remote",
  details: { description: "함께 웹툰을 완성할 선화 작가를 구합니다. 주간 연재 프로젝트의 작업량과 일정을 협의합니다.", deliverables: "주 10컷 PSD 납품", terms: "저작권과 크레딧 협의", compensation: "납품 후 7일 이내 지급", budgetMin: null, budgetMax: null, budgetUnit: "episode", deadline: "", location: "", genre: "판타지", tools: [], portfolioUrl: "" } };
const application = { message: "매주 10컷 작업이 가능하고 기존 선화 작업 경험이 있습니다.", contact: "artist@example.com", portfolioUrl: "" };
function harness(options: { post?: Record<string, unknown>; daily?: number; active?: number; capacity?: number; existing?: string; unavailable?: boolean } = {}) {
  const row = { ...input, id: ID, userId: "owner", authorName: "작가", status: "open", version: 1,
    hidden: false, saved: false, deadlineAt: null, createdAt: new Date(), updatedAt: new Date(), ...options.post };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    if (options.unavailable) throw new Error("private database diagnostic");
    if (sql.includes("AS daily")) return { rows: [{ daily: options.daily ?? 0, active: options.active ?? 0 }] };
    if (sql.includes("AS count")) return { rows: [{ count: options.capacity ?? 0 }] };
    if (sql.startsWith("SELECT status FROM creator_collab_application")) return { rows: options.existing ? [{ status: options.existing }] : [] };
    if (sql.startsWith("SELECT * FROM creator_collab_post") || sql.startsWith("SELECT p.*")) return { rows: [row] };
    if (sql.includes("RETURNING id")) return { rows: [{ id: ID }] };
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  const repo = new CollaborationRepository({ query, connect } as unknown as Pool);
  return { repo, query, release, connect, calls: () => query.mock.calls.map(([sql]) => sql) };
}
describe("collaboration repository transaction contracts (mock PostgreSQL)", () => {
  it.each([{ daily: 5 }, { active: 100 }])("enforces durable quota %j before inserting", async (quota) => {
    const h = harness(quota);
    await expect(h.repo.create("owner", input)).rejects.toMatchObject({ status: 429 });
    expect(h.calls().some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(h.calls().some((sql) => sql.startsWith("INSERT INTO creator_collab_post"))).toBe(false);
    expect(h.calls().at(-1)).toBe("ROLLBACK"); expect(h.release).toHaveBeenCalledOnce();
  });
  it("commits valid publication and releases the client", async () => {
    const h = harness(); await expect(h.repo.create("owner", input)).resolves.toHaveProperty("id");
    expect(h.calls().at(-1)).toBe("COMMIT"); expect(h.release).toHaveBeenCalledOnce();
  });
  it("rejects another author's update", async () => {
    const h = harness(); await expect(h.repo.update(ID, "outsider", input, 1)).rejects.toMatchObject({ status: 403 });
    expect(h.calls().some((sql) => sql.startsWith("UPDATE"))).toBe(false);
  });
  it("rejects stale-version updates without writing", async () => {
    const h = harness({ post: { version: 2 } });
    await expect(h.repo.update(ID, "owner", input, 1)).rejects.toMatchObject({ status: 409 });
    expect(h.calls().some((sql) => sql.startsWith("UPDATE"))).toBe(false);
  });
  it.each([{ hidden: true }, { status: "closed" }, { deadlineAt: new Date(0) }])("does not apply to unavailable post %j", async (post) => {
    const h = harness({ post }); await expect(h.repo.apply(ID, "applicant", application)).rejects.toThrow();
    expect(h.calls().some((sql) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("rejects self-applications", async () => {
    const h = harness(); await expect(h.repo.apply(ID, "owner", application)).rejects.toMatchObject({ status: 403 });
  });
  it("enforces application capacity while holding the parent lock", async () => {
    const h = harness({ capacity: 200 }); await expect(h.repo.apply(ID, "applicant", application)).rejects.toMatchObject({ status: 429 });
    expect(h.calls()[1]).toContain("FOR UPDATE");
    expect(h.calls().some((sql) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("does not overwrite an existing live application", async () => {
    const h = harness({ existing: "submitted" }); await expect(h.repo.apply(ID, "applicant", application)).rejects.toMatchObject({ status: 409 });
  });
  it("permits explicit resubmission after withdrawal", async () => {
    const h = harness({ existing: "withdrawn" }); await h.repo.apply(ID, "applicant", application);
    expect(h.calls().some((sql) => sql.includes("ON CONFLICT"))).toBe(true); expect(h.calls().at(-1)).toBe("COMMIT");
  });
  it("erases private application data on withdrawal", async () => {
    const h = harness(); await h.repo.withdraw(ID, "applicant");
    const write = h.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE creator_collab_application"));
    expect(write?.[0]).toContain("message='',contact='',\"portfolioUrl\"=''");
    expect(write?.[1]).toEqual([ID, "applicant"]); expect(h.calls()[1]).toContain("FOR UPDATE");
  });
  it("serializes bookmarking with deletion and moderation", async () => {
    const h = harness(); await h.repo.bookmark(ID, "reader", true);
    expect(h.calls()[0]).toBe("BEGIN"); expect(h.calls()[1]).toContain("FOR UPDATE"); expect(h.calls()[2]).toContain("INSERT INTO creator_collab_bookmark");
  });
  it("rejects hidden-post bookmarks", async () => {
    const h = harness({ post: { hidden: true } }); await expect(h.repo.bookmark(ID, "reader", true)).rejects.toMatchObject({ status: 404 });
  });
  it("never returns another author's private application list", async () => {
    const h = harness(); await expect(h.repo.applications(ID, "outsider")).rejects.toMatchObject({ status: 403 });
    expect(h.calls().some((sql) => sql.includes("FROM creator_collab_application a"))).toBe(false);
  });
});
describe("service input and persistence boundary", () => {
  it("rejects unauthenticated publication before database access", async () => {
    const h = harness(); await expect(new CollaborationService(h.repo).create(undefined, input)).rejects.toMatchObject({ status: 401 });
    expect(h.query).not.toHaveBeenCalled();
  });
  it("never turns storage failure into an empty success", async () => {
    const h = harness({ unavailable: true }); await expect(new CollaborationService(h.repo).list({})).rejects.toMatchObject({ status: 503 });
  });
  it("rejects private views for guests and malformed cursors", () => {
    for (const view of ["mine", "saved", "applied"]) expect(() => parseCollaborationQuery({ view })).toThrow();
    expect(() => parseCollaborationQuery({ cursor: "bad" })).toThrow();
    expect(() => parseCollaborationQuery({ q: ["unexpected"] })).toThrow();
    expect(() => parseCollaborationQuery({ role: "constructor" })).toThrow();
  });
});
