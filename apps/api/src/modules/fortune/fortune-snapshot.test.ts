import "reflect-metadata";
import { fortuneMonthDays } from "../../../../../packages/core/src/fortune";
import { KASI_POLICY_REVISION } from "./fortune-enrichment.provider";
import { describe, expect, it, vi } from "vitest";
import type { UpstashCoordinationPort } from "../../infrastructure/upstash-coordination/upstash-coordination.port";
import { FixtureSnapshots, followupConfig, followupCoordination, followupNow, specialXml } from "../../../test/fortune-followup-fixtures";
import { FortuneEnrichmentService } from "./fortune-enrichment.service";
import { fortuneSnapshotKey, parseFortuneSnapshot, type FortunePublicSnapshot } from "./fortune-snapshot";
import { PostgresFortuneSnapshotRepository } from "./fortune-snapshot.repository";

const snapshot = (): FortunePublicSnapshot => ({ kind: "special-days", month: "2024-09", category: "holidays", source: "kasi", status: "external", items: [],
  policyRevision: "data-go-15012690-20260920", checkedAt: followupNow().toISOString(), expiresAt: "2026-09-21T01:00:00.000Z" });
function setup() {
  const snapshots = new FixtureSnapshots(), coordination = followupCoordination();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(specialXml()));
  const create = () => new FortuneEnrichmentService({ ...followupConfig, snapshotsEnabled: true }, { fetch: fetcher, now: followupNow }, coordination as unknown as UpstashCoordinationPort, snapshots);
  return { snapshots, coordination, fetcher, create };
}
describe("public fortune snapshots", () => {
  it("reuses validated snapshots across instances and isolates mutations", async () => {
    const { create, fetcher, snapshots, coordination } = setup();
    const first = await create().specialDays("2024-09", "holidays"); first.items[0].name = "mutated";
    const second = await create().specialDays("2024-09", "holidays");
    expect(second.status).toBe("external-cache"); expect(second.items[0].name).toBe("테스트 휴일");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(snapshots.put).toHaveBeenCalledTimes(1);
    expect(coordination.releaseLease).toHaveBeenCalledTimes(1);
  });
  it.each(["private", "expired", "future", "duration", "key", "category", "html", "duplicate"])("rejects %s snapshots", (mode) => {
    const value = snapshot(); const bad: Record<string, unknown> = { ...value };
    if (mode === "private") bad.birthDate = "1980-01-01";
    if (mode === "expired") bad.expiresAt = followupNow().toISOString();
    if (mode === "future") bad.checkedAt = "2026-09-20T02:00:00.000Z";
    if (mode === "duration") bad.expiresAt = "2026-09-22T01:00:00.000Z";
    if (mode === "category") bad.category = "private";
    if (mode === "html") bad.items = [{ date: "2024-09-17", name: "<script>", sequence: 1, isHoliday: true }];
    if (mode === "duplicate") bad.items = Array.from({ length: 2 }, () => ({ date: "2024-09-17", name: "test", sequence: 1, isHoliday: true }));
    expect(() => parseFortuneSnapshot(bad, mode === "key" ? "other" : fortuneSnapshotKey(value), followupNow())).toThrow();
  });
  it.each(["read-failure", "write-failure", "busy", "lost-lease", "corrupt"])("fails closed for %s", async (mode) => {
    const { create, fetcher, snapshots, coordination } = setup();
    if (mode === "read-failure") snapshots.get.mockRejectedValueOnce(new Error("unavailable"));
    if (mode === "write-failure") snapshots.put.mockRejectedValueOnce(new Error("unavailable"));
    if (mode === "busy") coordination.acquireLease.mockResolvedValueOnce({ acquired: false });
    if (mode === "lost-lease") coordination.renewLease.mockResolvedValueOnce({ matched: false });
    if (mode === "corrupt") snapshots.get.mockResolvedValueOnce({ ...snapshot(), month: "2024-10" });
    expect(await create().specialDays("2024-09", "holidays")).toMatchObject({ source: "local", status: "local-fallback" });
    if (["read-failure", "busy", "corrupt"].includes(mode)) expect(fetcher).not.toHaveBeenCalled();
    if (mode === "lost-lease") expect(snapshots.put).not.toHaveBeenCalled();
    if (["write-failure", "lost-lease"].includes(mode)) expect(coordination.releaseLease).toHaveBeenCalledTimes(1);
  });
  it("reads a completed winner after obtaining a lease instead of refetching", async () => {
    const { create, snapshots, fetcher } = setup(); snapshots.get.mockResolvedValueOnce(null).mockResolvedValueOnce(snapshot());
    expect((await create().specialDays("2024-09", "holidays")).status).toBe("external-cache"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses parameterized SQL, version-fenced writes and bounded deletion", async () => {
    const query = vi.fn(async () => ({ rows: [{ payload: snapshot() }] })); const repo = new PostgresFortuneSnapshotRepository(query);
    expect(await repo.get(fortuneSnapshotKey(snapshot()), followupNow())).toEqual(snapshot());
    await repo.put(snapshot()); await repo.prune();
    expect(query.mock.calls[1][0]).toContain("fortune_public_snapshot.checked_at < EXCLUDED.checked_at");
    expect(query.mock.calls[2][0]).toContain("LIMIT 1000"); expect(query.mock.calls[1][1][0]).toBe(fortuneSnapshotKey(snapshot()));
  });
});
it("isolates calendar verification caches by current public calculation output", async () => {
  const { snapshots, coordination, fetcher } = setup();
  const data: FortunePublicSnapshot = { kind: "calendar", month: "2024-09", status: "external", source: "kasi", policyRevision: KASI_POLICY_REVISION,
    checks: fortuneMonthDays("2024-09").map((day) => ({ date: day.date, matches: true, fields: [] })),
    checkedAt: followupNow().toISOString(), expiresAt: "2026-09-21T01:00:00.000Z" };
  const create = () => new FortuneEnrichmentService({ ...followupConfig, snapshotsEnabled: true, kasiEnabled: true, kasiServiceKey: "fixture" },
    { fetch: fetcher, now: followupNow }, coordination as unknown as UpstashCoordinationPort, snapshots);
  snapshots.rows.set(`v2:calendar:2024-09:${KASI_POLICY_REVISION}`, data);
  expect((await create().calendar("2024-09")).status).toBe("local-fallback");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fortuneSnapshotKey(data)).toMatch(/^v3:calendar:2024-09:[a-f0-9]{64}:/u);
  await snapshots.put(data); fetcher.mockClear();
  expect((await create().calendar("2024-09")).status).toBe("external-cache"); expect(fetcher).not.toHaveBeenCalled();
});
