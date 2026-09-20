import { describe, expect, it, vi } from "vitest";

import { HiringStore } from "../collaboration/hiring.store";
import { parseHiring } from "../collaboration/hiring.validation";

import { CreatorMeetingRepository } from "./meeting.repository";
import { roomInputSchema, roomMessageSchema } from "./meeting.validation";

import type { Pool } from "pg";

const now = new Date("2026-09-20T01:00:00Z");
function harness(status: "waiting" | "admitted" | "removed" = "waiting") {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.startsWith("SELECT a.*,u.name")) return { rows: [{ user_id: "guest", name: "지원자", status }, { user_id: "host", name: "모집자", status: "admitted" }] };
    if (sql.startsWith("SELECT m.*,u.name")) {
      const admitted = values?.[2], host = values?.[3];
      return { rows: [{ id: "mine", user_id: "guest", name: "지원자", text: "내 대기 질문", created_at: now }, { id: "host", user_id: "host", name: "호스트", text: "호스트 안내", created_at: now }, ...(admitted || host ? [{ id: "other", user_id: "other", name: "다른 참여자", text: "진행 중인 대화", created_at: now }] : [])] };
    }
    return { rows: [] };
  });
  const store = new HiringStore({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool);
  const repo = new CreatorMeetingRepository(store);
  vi.spyOn(repo, "scope").mockImplementation(async () => {
    if (status === "removed") throw Object.assign(new Error("removed"), { status: 403 });
    return { room: { id: "room", title: "면접", kind: "interview", host_id: "host", team_id: null, application_id: "application", starts_at: now, ends_at: new Date(now.getTime() + 3600000), status: "live", epoch: 4, now }, admission: { status, epoch: 4 } };
  });
  return { repo, query };
}
describe("isolated room policy (mock persistence)", () => {
  it("waiting guests cannot read ongoing chat or another applicant roster", async () => {
    const h = harness(); const room = await h.repo.get("guest", "room");
    expect(room.participants.map((p) => p.userId)).toEqual(["guest", "host"]);
    const projection = h.query.mock.calls.find(([s]) => s.startsWith("SELECT a.*")); expect(projection?.[1]).toEqual(["room", false, "guest", "host"]);
    expect((await h.repo.messages("guest", "room", 4)).map((m) => m.text)).not.toContain("진행 중인 대화");
  });
  it("rejects stale epochs and waiting guests posting admitted chat", async () => {
    const h = harness(); await expect(h.repo.messages("guest", "room", 3)).rejects.toMatchObject({ status: 409 });
    await expect(h.repo.message("guest", "room", { expectedEpoch: 4, audience: "admitted", text: "우회" })).rejects.toMatchObject({ status: 403 });
    expect(h.query.mock.calls.some(([s]) => s.startsWith("INSERT"))).toBe(false);
  });
  it("never supplies media tokens even after admission", async () => {
    const h = harness("admitted"); await expect(h.repo.media("guest", "room", 4)).rejects.toMatchObject({ status: 503 });
    expect((await h.repo.get("guest", "room")).media).toEqual({ status: "not-configured", recordingEnabled: false, transcriptionEnabled: false });
  });
  it("requires this room's host for admission/removal/end", async () => {
    const h = harness("admitted"); await expect(h.repo.host("guest", "room", { expectedEpoch: 4, action: "end", targetAccountId: null })).rejects.toMatchObject({ status: 403 });
  });
  it("rejects unrelated interview participants and oversized durations at the boundary", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(() => parseHiring(roomInputSchema, { title: "면접", kind: "interview", applicationId: id, teamId: null, participantIds: ["one", "two"], startsAt: now.toISOString(), endsAt: new Date(now.getTime() + 3600000).toISOString() })).toThrow();
    expect(() => parseHiring(roomMessageSchema, { expectedEpoch: 4, audience: "admitted", text: "안녕", userId: "host" })).toThrow();
  });
});
