import "reflect-metadata";
import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { signSession } from "../../server/session";
import { sessionAuth } from "../../session-middleware";
import { HiringAvailabilityRepository } from "./hiring-availability.repository";
import { HiringOfferRepository } from "./hiring-offer.repository";
import { HiringStore } from "./hiring.store";

import type { HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";
import type { Request, Response } from "express";
import type { Pool } from "pg";

vi.mock("../../server/user-lifecycle", () => ({ isSessionAllowed: vi.fn(async () => true) }));
afterEach(() => vi.unstubAllEnvs());
const ID = "11111111-1111-4111-8111-111111111111", now = new Date("2026-09-20T01:00:00Z");
const terms: HiringSlotTerms = { model: "freelance-task", role: "lineart", publicScope: "10컷 선화", quantity: 10, quantityUnit: "cut", startsAt: "2026-09-20T01:10:00Z", dueAt: "2026-09-20T02:00:00Z", timeZone: "Asia/Seoul", compensation: "paid", currency: "KRW", minRate: 10000, maxRate: 20000, rateUnit: "cut", tools: [], formats: [], revisionRounds: 1, acceptanceCriteria: "검수", ndaRequired: false, creditPolicy: "표기", portfolioPolicy: "allowed", aiPolicy: "prohibited" };
function offerHarness(options: { candidate?: string; closed?: boolean; expired?: boolean; eligible?: boolean; peak?: number; lateClock?: boolean; invalidCompensation?: boolean; taskElapsed?: boolean; shortTask?: boolean; receipt?: { request_digest: string; result: unknown } } = {}) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    if (sql.includes('FROM "user"')) return { rows: [{ id: "candidate" }] };
    if (sql.includes("FROM creator_hiring_receipt")) return { rows: options.receipt ? [options.receipt] : [] };
    if (sql.startsWith("SELECT s.post_id")) return { rows: [{ post_id: ID, slot_id: ID, candidate_id: options.candidate ?? "candidate" }] };
    if (sql.startsWith("SELECT *,clock_timestamp() AS now FROM creator_collab_post")) return { rows: [{ id: ID, userId: "recruiter", version: 1, status: options.closed ? "closed" : "open", hidden: false, deletedAt: null, deadlineAt: new Date(now.getTime() + 5000), now }] };
    if (sql.startsWith("SELECT revision,state")) return { rows: [{ revision: 1, state: "open" }] };
    if (sql.startsWith("SELECT *,clock_timestamp() AS now FROM creator_hiring_offer")) return { rows: [{ id: ID, slot_id: ID, candidate_id: "candidate", recruiter_id: "recruiter", terms_revision: 1, terms: options.invalidCompensation ? { ...terms, model: "employment", compensation: "unpaid", minRate: 0, maxRate: 0 } : options.taskElapsed || options.shortTask ? { ...terms, startsAt: new Date(now.getTime() - 1000).toISOString(), dueAt: new Date(now.getTime() + (options.taskElapsed ? 500 : 5000)).toISOString() } : terms, state: "pending", expires_at: new Date(now.getTime() + (options.expired ? -1000 : 3600000)), now }] };
    if (sql === "SELECT clock_timestamp() AS now") return { rows: [{ now: new Date(now.getTime() + (options.lateClock ? 6000 : 1000)) }] };
    return { rows: [] };
  });
  const store = new HiringStore({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool);
  const availability = new HiringAvailabilityRepository(store);
  vi.spyOn(availability, "lockCapacity").mockResolvedValue(1);
  vi.spyOn(availability, "overlap").mockResolvedValue(options.peak ?? 0);
  vi.spyOn(availability, "eligible").mockResolvedValue(options.eligible === false ? null : { userId: "candidate", displayName: "작가", roles: ["lineart"], tools: [], formats: [], startsAt: terms.startsAt, endsAt: terms.dueAt, confirmedAt: now.toISOString(), expiresAt: terms.dueAt, capacity: 1, minRate: 10000, rateUnit: "cut", reasons: [] });
  return { repo: new HiringOfferRepository(store, availability), query, calls: () => query.mock.calls.map(([sql]) => sql) };
}
describe("verified session actor boundary", () => {
  it.each(["victim-user", "forged.jwt.signature", ["victim-user", "another-user"]])("removes forged actor header %j", async (header) => {
    vi.stubEnv("AUTH_SESSION_SECRET", "hiring-test-secret-32-bytes-minimum-value");
    const req = { headers: { "x-user-id": header } } as unknown as Request;
    await new Promise<void>((resolve, reject) => sessionAuth(req, {} as Response, (error?: unknown) => error ? reject(error) : resolve()));
    expect(req.headers["x-user-id"]).toBeUndefined();
  });
  it("replaces a real signed token with its principal", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "hiring-test-secret-32-bytes-minimum-value");
    const req = { headers: { "x-user-id": signSession("candidate") } } as unknown as Request;
    await new Promise<void>((resolve, reject) => sessionAuth(req, {} as Response, (error?: unknown) => error ? reject(error) : resolve()));
    expect(req.headers["x-user-id"]).toBe("candidate");
  });
});
describe("offer transaction protocol (mock SQL, not real concurrency)", () => {
  it.each([{ candidate: "other" }, { closed: true }, { expired: true }, { eligible: false }, { peak: 1 }, { lateClock: true }, { invalidCompensation: true }, { taskElapsed: true }])("rejects wrong actor/closed/expired/revoked/full/late deadline %j", async (options) => {
    const h = offerHarness(options); await expect(h.repo.accept("candidate", ID, ID)).rejects.toThrow();
    expect(h.calls().some((s) => s.startsWith("INSERT INTO creator_hiring_commitment"))).toBe(false);
  });
  it("records only a pending onboarding receipt after capacity reservation", async () => {
    const h = offerHarness(); const result = await h.repo.accept("candidate", ID, ID);
    expect(result).toMatchObject({ onboardingStatus: "pending", documentAccessGranted: false });
    expect(h.calls().some((s) => /INSERT INTO creator_hiring_outbox/u.test(s))).toBe(true);
    expect(h.calls().some((s) => /INSERT INTO (production_|creator_work_collaborator)/u.test(s))).toBe(false);
    expect(h.calls().at(-1)).toBe("COMMIT");
  });
  it("caps the pending reservation at the task deadline", async () => {
    const h = offerHarness({ shortTask: true });
    expect((await h.repo.accept("candidate", ID, ID)).holdExpiresAt).toBe(new Date(now.getTime() + 5000).toISOString());
  });
  it("returns the immutable prior receipt before looking up a subsequently deleted post", async () => {
    const result = { offerId: ID, commitmentId: ID, holdExpiresAt: now.toISOString(), onboardingStatus: "pending", documentAccessGranted: false };
    const digest = createHash("sha256").update(JSON.stringify({ offerId: ID })).digest("hex");
    const h = offerHarness({ receipt: { request_digest: digest, result } });
    await expect(h.repo.accept("candidate", ID, ID)).resolves.toEqual(result);
    expect(h.calls().some((s) => s.includes("FROM creator_collab_post"))).toBe(false);
    expect(h.calls().some((s) => s.startsWith("INSERT"))).toBe(false);
  });
  it("never accepts a receipt digest mismatch", async () => {
    const h = offerHarness({ receipt: { request_digest: "wrong", result: {} } });
    await expect(h.repo.accept("candidate", ID, ID)).rejects.toMatchObject({ status: 409 });
  });
});
