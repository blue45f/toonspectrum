import { describe, expect, it, vi } from "vitest";

import { HiringAvailabilityRepository } from "./hiring-availability.repository";
import { HiringCampaignRepository, HIRING_CAMPAIGN_POLICY } from "./hiring-campaign.repository";
import { HiringStore } from "./hiring.store";

import type { HiringCandidate, HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";
import type { Pool } from "pg";

const now = new Date(), terms = { role: "lineart", dueAt: new Date(now.getTime() + 3600000).toISOString() } as HiringSlotTerms;
function harness(options: { revoked?: boolean; candidates?: number; early?: boolean; duplicate?: boolean; inactive?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM "user"')) return { rows: options.inactive ? [] : [{ id: "recruiter" }] };
    if (sql.startsWith("SELECT *,clock_timestamp() AS now FROM creator_collab_post")) return { rows: [{ id: "post", userId: "recruiter", status: "open", version: 1, hidden: false, deletedAt: null, deadlineAt: null, now }] };
    if (sql.startsWith("SELECT state,terms FROM creator_hiring_slot")) return { rows: [{ state: "open", terms }] };
    if (sql.startsWith("SELECT *,clock_timestamp() AS now FROM creator_hiring_campaign")) return { rows: [{ state: "active", round: 0, next_dispatch_at: new Date(now.getTime() + (options.early ? 1000 : -1000)), now }] };
    if (sql.includes("AS duplicate")) return { rows: [{ candidate: 0, recruiter: 0, post: 0, duplicate: options.duplicate ? 1 : 0 }] };
    if (sql === "SELECT clock_timestamp() AS now") return { rows: [{ now }] };
    return { rows: [] };
  });
  const store = new HiringStore({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool), availability = new HiringAvailabilityRepository(store);
  const candidates = Array.from({ length: options.candidates ?? 0 }, (_, i) => ({ userId: `candidate-${i}`, expiresAt: new Date(now.getTime() + 3600000).toISOString() }) as HiringCandidate);
  vi.spyOn(availability, "candidates").mockResolvedValue(candidates);
  vi.spyOn(availability, "eligible").mockResolvedValue(options.revoked ? null : candidates[0]);
  vi.spyOn(availability, "lockCapacity").mockResolvedValue(1);
  return { query, repo: new HiringCampaignRepository(store, availability) };
}
describe("durable manual campaign boundaries (mock SQL)", () => {
  it("reports honest zero candidates and leaves automatic dispatch disabled", async () => {
    const h = harness(); await expect(h.repo.dispatch("recruiter", "post", "slot", "request")).resolves.toMatchObject({ sent: 0, automaticDispatchEnabled: false });
    expect(h.query.mock.calls.some(([s]) => s.startsWith("INSERT INTO creator_hiring_invitation"))).toBe(false);
    expect(HIRING_CAMPAIGN_POLICY.rounds).toEqual([5, 10]); expect(HIRING_CAMPAIGN_POLICY.secondRoundDelayMs).toBe(300000);
  });
  it("rechecks consent at dispatch even when candidate discovery was positive", async () => {
    const h = harness({ candidates: 1, revoked: true }); await expect(h.repo.dispatch("recruiter", "post", "slot", "retry")).resolves.toMatchObject({ sent: 0 });
    expect(h.query.mock.calls.some(([s]) => s.startsWith("INSERT INTO creator_hiring_invitation"))).toBe(false);
  });
  it("does not repeat prior invitations/declines and caps round one at five", async () => {
    const duplicate = harness({ candidates: 1, duplicate: true }); expect((await duplicate.repo.dispatch("recruiter", "post", "slot", "retry")).sent).toBe(0);
    const h = harness({ candidates: 8 }); expect((await h.repo.dispatch("recruiter", "post", "slot", "request")).sent).toBe(5);
    expect(h.query.mock.calls.filter(([s]) => s.startsWith("INSERT INTO creator_hiring_invitation"))).toHaveLength(5);
  });
  it("rejects early next round and inactive recruiters", async () => {
    await expect(harness({ early: true }).repo.dispatch("recruiter", "post", "slot", "request")).rejects.toMatchObject({ status: 409 });
    await expect(harness({ inactive: true }).repo.dispatch("recruiter", "post", "slot", "request")).rejects.toMatchObject({ status: 401 });
  });
});
