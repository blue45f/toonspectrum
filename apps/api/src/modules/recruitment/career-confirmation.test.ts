import "reflect-metadata";
import { readFileSync } from "node:fs";

import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { verifySessionToken } from "../../server/session";
import { sessionAuth } from "../../session-middleware";
import { HiringStore } from "../collaboration/hiring.store";

import { CareerConfirmationController } from "./career-confirmation.controller";
import { CareerConfirmationModule } from "./career-confirmation.module";
import { CareerConfirmationRepository, confirmationDigest } from "./career-confirmation.repository";
import { CreatorCareerRepository } from "./career.repository";

import type { Pool } from "pg";

vi.mock("../../server/session", () => ({ verifySessionToken: vi.fn(() => null) }));
vi.mock("../../server/user-lifecycle", () => ({ isSessionAllowed: vi.fn(async () => true) }));
const id = "00000000-0000-4000-8000-000000000001";
const selection = { careerId: id, versionId: id, teamId: id, targetAccountId: "target" };
const request = { ...selection, sourceDigest: "a".repeat(64), requesterMembershipRevision: 1, targetMembershipRevision: 1, consent: "exact-version-2026-09-20", mutationId: id };
function harness(reply: (sql: string, values: unknown[]) => object[]) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => ({ rows: reply(sql, values) }));
  const release = vi.fn(); const store = new HiringStore({ connect: async () => ({ query, release }) } as unknown as Pool);
  return { query, release, repo: new CareerConfirmationRepository(store), career: new CreatorCareerRepository(store) };
}
describe("career confirmation HTTP and optional capability", () => {
  it("constructs the actual dedicated Nest module and preserves private no-store headers", async () => {
    const app = await NestFactory.createApplicationContext(CareerConfirmationModule, { logger: false, abortOnError: false });
    try {
      const controller = app.get(CareerConfirmationController);
      expect(() => controller.capability()).toThrow(); expect(() => controller.list({ direction: "received" })).toThrow();
      for (const name of Object.getOwnPropertyNames(CareerConfirmationController.prototype)) {
        if (name === "constructor") continue;
        const method = Object.getOwnPropertyDescriptor(CareerConfirmationController.prototype, name)?.value;
        if (typeof method !== "function" || Reflect.getMetadata(PATH_METADATA, method) === undefined || Reflect.getMetadata(METHOD_METADATA, method) === undefined) continue;
        const headers = Reflect.getMetadata(HEADERS_METADATA, method) as { name: string; value: string }[];
        expect(headers.some((h) => h.name === "Cache-Control" && h.value.includes(name === "publicSummaries" ? "no-store" : "private, no-store"))).toBe(true);
      }
      expect(readFileSync(`${process.cwd()}/apps/api/src/app.module.ts`, "utf8")).toContain("    CareerConfirmationModule,");
    } finally { await app.close(); }
  });
  it("sessionAuth removes a forged raw actor before this controller and binds a verified session", async () => {
    const h = harness(() => []), controller = new CareerConfirmationController(h.repo);
    vi.mocked(verifySessionToken).mockReturnValue(null);
    const forged = { headers: { "x-user-id": "target" } };
    const next = vi.fn(); sessionAuth(forged as never, {} as never, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(() => controller.list({ direction: "received" }, forged.headers["x-user-id"])).toThrow();
    expect(h.query).not.toHaveBeenCalled();
    vi.mocked(verifySessionToken).mockReturnValueOnce({ userId: "author", sessionVersion: 1, expiresAt: Date.now() + 60000 });
    const verified = { headers: { "x-user-id": "signed-fixture" } }; const nextVerified = vi.fn();
    sessionAuth(verified as never, {} as never, nextVerified); await vi.waitFor(() => expect(nextVerified).toHaveBeenCalled());
    expect(verified.headers["x-user-id"]).toBe("author");
  });
  it("strictly rejects actor overrides, unbounded batches/cursors and missing consent", () => {
    const h = harness(() => []), controller = new CareerConfirmationController(h.repo);
    for (const invalid of [{ ...request, actorId: "other" }, { ...request, snapshot: {} }, { ...request, mutationId: "fake" }, { ...request, consent: false }, { ...request, targetMembershipRevision: -1 }]) expect(() => controller.request(invalid, "validation-fixture")).toThrow();
    expect(() => controller.preview({ ...selection, requesterId: "other" }, "author")).toThrow();
    expect(() => controller.publicSummaries({ careerIds: Array.from({ length: 51 }, () => id) })).toThrow();
    expect(() => controller.publicSummaries({ careerIds: [id, id] })).toThrow();
    expect(() => controller.list({ direction: "received", limit: 500 }, "author")).toThrow();
    expect(() => controller.collaborators({ after: "x".repeat(401) }, "author")).toThrow();
    expect(h.query).not.toHaveBeenCalled();
  });
  it("missing confirmation migration is truthful 503, no runtime repair, old careers continue", async () => {
    const h = harness((sql) => { if (sql.includes("creator_career_confirmation_require_ready")) throw new Error("undefined function"); return sql.includes('FROM "user"') ? [{ id: "author" }] : []; });
    await expect(h.repo.capability("author")).rejects.toMatchObject({ status: 503, response: { available: false, code: "career-confirmation-unavailable" } });
    expect(await h.career.list("author")).toEqual([]);
    expect(h.query.mock.calls.some(([sql]) => /CREATE|ALTER|GRANT/u.test(sql))).toBe(false);
    expect(h.query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true); expect(h.release).toHaveBeenCalledTimes(2);
  });
  it("does not let the requester confirm or let a third party inspect private requests", async () => {
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "author" }] : sql.startsWith("SELECT * FROM creator_career_confirmation_request") ? [{ id, requester_id: "author", target_id: "target" }] : []);
    await expect(h.repo.action("author", id, { action: "confirmed", expectedRevision: 1, mutationId: id })).rejects.toMatchObject({ status: 403 });
    const outsider = harness((sql) => sql.includes('FROM "user"') ? [{ id: "other" }] : []);
    await expect(outsider.repo.action("other", id, { action: "revoked", expectedRevision: 1, mutationId: id })).rejects.toMatchObject({ status: 404 });
    expect(outsider.query.mock.calls.find(([sql]) => sql.startsWith("SELECT * FROM creator_career_confirmation_request"))?.[0]).toContain("(requester_id=$2 OR target_id=$2)");
  });
  it("orders parents before request locks and uses a fresh database clock for mutation expiry", () => {
    const source = readFileSync(`${process.cwd()}/apps/api/src/modules/recruitment/career-confirmation.repository.ts`, "utf8");
    const action = source.slice(source.indexOf("  action(actor:"));
    expect(action.indexOf("await this.source")).toBeLessThan(action.indexOf("FOR UPDATE"));
    expect(action.indexOf("FOR UPDATE")).toBeLessThan(action.indexOf("SELECT clock_timestamp() AS now"));
  });
  it("uses one bounded summary read and an explicit public projection", async () => {
    const snapshot = { title: "작품", role: "lineart", startMonth: "2026-01", endMonth: null, episodeFrom: null, episodeTo: null, scope: "범위", contribution: "기여", portfolioUrl: "https://example.com/private", rights: "owned", visibility: "public" };
    const h = harness((sql) => sql.startsWith("SELECT DISTINCT") ? [{ id: "private-request", requester_id: "author", target_id: "target", team_id: "private-team", version_id: "private-version", career_id: id, snapshot, confirmed_at: new Date(), expires_at: new Date(Date.now() + 60000) }] : []);
    const rows = await h.repo.publicSummaries([id]); expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/private-request|private-team|private-version|target|portfolioUrl/u);
    expect(h.query.mock.calls.filter(([sql]) => sql.startsWith("SELECT DISTINCT"))).toHaveLength(1);
    expect(h.query.mock.calls.find(([sql]) => sql.startsWith("SELECT DISTINCT"))?.[0]).toContain("LIMIT 50");
  });
  it("canonical digests distinguish exact content and ignore object key ordering", () => {
    expect(confirmationDigest({ scope: "a", contribution: "b" })).toBe(confirmationDigest({ contribution: "b", scope: "a" }));
    expect(confirmationDigest({ scope: "a" })).not.toBe(confirmationDigest({ scope: "b" }));
  });
});
