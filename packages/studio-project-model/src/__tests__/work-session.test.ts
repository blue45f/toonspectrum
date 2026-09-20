import { describe, expect, it } from "vitest";

import { createStudioWorkSession, reduceStudioWorkSession, studioWorkSessionSchema, type StudioWorkSessionCommand, type StudioWorkSession } from "../graph/work-session";

const at = "2026-09-21T00:00:00.000Z";
const host = { userId: "host", canEdit: true, canComment: true };
const guest = { userId: "guest", canEdit: false, canComment: true };
const input = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
function create() { return createStudioWorkSession({ id: "session", operationId: "create", title: "12화 검수", purpose: "8컷의 시선을 검토한다", kind: "review", input, invitedUserIds: ["guest"] }, host, at); }
function command(session: StudioWorkSession, action: StudioWorkSessionCommand["action"], actor = host, extra = {}) {
  return reduceStudioWorkSession(session, { operationId: `command-${session.version}`, expectedVersion: session.version, action, ...extra } as StudioWorkSessionCommand, actor, at);
}
describe("durable creator work sessions", () => {
  it("pins the input and creates a draft without media or approval side effects", () => {
    const value = create(); expect(value.status).toBe("draft"); expect(value.input).toEqual(input); expect(value.participantUserIds).toEqual(["host"]); expect(value.results).toEqual([]);
  });
  it("requires explicit ready/start and preserves an immutable previous state", () => {
    const value = create(), before = JSON.stringify(value); const next = command(command(value, "ready"), "start");
    expect(next.status).toBe("active"); expect(next.version).toBe(3); expect(JSON.stringify(value)).toBe(before);
  });
  it("rejects a stale base rather than silently overwriting newer work", () => {
    expect(() => reduceStudioWorkSession(create(), { action: "ready", operationId: "op", expectedVersion: 2 }, host, at)).toThrow("conflict");
  });
  it("does not make an invitation a joined participant or allow an outsider to join", () => {
    const value = create(); expect(value.participantUserIds).not.toContain("guest");
    expect(() => command(value, "join", { ...guest, userId: "outsider" })).toThrow("forbidden");
    expect(command(value, "join", guest).participantUserIds).toContain("guest");
  });
  it("requires current comment authority and records the actual actor for notes", () => {
    const value = command(create(), "join", guest);
    expect(() => command(value, "note", { ...guest, canComment: false }, { category: "note", body: "Test" })).toThrow("forbidden");
    const next = command(value, "note", guest, { category: "note", body: "수정안" }); expect(next.notes[0]!.authorUserId).toBe("guest");
    expect(() => command(value, "note", guest, { category: "decision", body: "승인" })).toThrow("forbidden");
  });
  it("cannot present or drive a reader through a different user's role", () => {
    const value = command(command(command(create(), "join", guest), "ready"), "start");
    const presenter = { pageOrdinal: 7, zoom: 1, x: 0.5, y: 0.5 };
    expect(() => command(value, "present", guest, { presenter })).toThrow("forbidden");
    expect(command(value, "present", host, { presenter }).presenter?.pageOrdinal).toBe(7);
    expect(() => command(value, "reader", host, { userId: "guest" })).toThrow("invalid-transition");
  });
  it("allows reading turns only for people who explicitly joined", () => {
    let value = { ...create(), kind: "reading" as const }; value = command(command(value, "ready"), "start") as typeof value;
    expect(() => command(value, "reader", host, { userId: "guest" })).toThrow("invalid-target");
    const next = command(command(value, "join", guest), "reader", host, { userId: "guest" }); expect(next.readerUserId).toBe("guest");
    expect(command(next, "leave", guest).readerUserId).toBeNull();
  });
  it("requires an explicit close summary and never turns a decision into approval", () => {
    const value = command(command(create(), "ready"), "start");
    expect(() => command(value, "close", host, { summary: "" })).toThrow();
    const next = command(value, "close", host, { summary: "결론 보류. 시선 수정 후 다시 검토." }); expect(next.status).toBe("closed"); expect(next.results).toEqual([]);
    expect(() => command(next, "start")).toThrow("closed");
  });
  it("rejects cross-work pins and uninvited member injection", () => {
    const value = create(); expect(studioWorkSessionSchema.safeParse({ ...value, workId: "another" }).success).toBe(false);
    expect(studioWorkSessionSchema.safeParse({ ...value, participantUserIds: ["outsider"] }).success).toBe(false);
    expect(() => command(value, "attach-result", host, { result: { type: "review", subject: { ...input, workId: "another" } } })).toThrow("invalid-target");
  });
  it("bounds command history while reserving the ability to close", () => {
    const value = { ...create(), status: "active" as const, version: 128 };
    expect(() => command(value, "present", host, { presenter: { pageOrdinal: 0, zoom: 1, x: 0, y: 0 } })).toThrow("capacity");
    expect(command(value, "close", host, { summary: "완료 기록" }).status).toBe("closed");
  });
});
