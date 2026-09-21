import { describe, expect, it } from "vitest";

import { createStudioWorkSession, reduceStudioWorkSession, studioWorkSessionSchema, studioWorkSessionCommandSchema,
  type StudioWorkSession, type StudioWorkSessionCommand } from "../graph/work-session";

const at = "2026-09-21T10:00:00.000Z";
const host = { userId: "host", canEdit: true, canComment: true };
const guest = { userId: "guest", canEdit: false, canComment: true };
const input = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact",
  reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
const source = { version: 1 as const, sourceServerRevision: 7, sourceContentDigest: input.rootGraphHash, pageOrdinal: 0, pageId: "page-1" };
const item = { id: "first", source, title: "도입 장면", purpose: "감정 확인", dialogue: "안녕하세요", assignedUserId: null };
const asset = { assetId: "background-1", sha256: "b".repeat(64), elementType: "image" as const };
const candidate = { id: "candidate-1", asset, title: "교실", rationale: "시선에 맞는 구도", usageConditions: "팀에서 사용 조건을 확인해야 함" };
type Intent<T = StudioWorkSessionCommand> = T extends StudioWorkSessionCommand ? Omit<T, "operationId" | "expectedVersion"> : never;
function create(kind: StudioWorkSession["kind"] = "reading") {
  return createStudioWorkSession({ id: "session", operationId: "create", title: "작업 세션", purpose: "고정 원고를 검토", kind,
    input, invitedUserIds: [guest.userId] }, host, at);
}
function run(value: StudioWorkSession, intent: Intent, actor = host) {
  return reduceStudioWorkSession(value, { ...intent, operationId: `op-${value.version}`, expectedVersion: value.version }, actor, at);
}
function active(value: StudioWorkSession) { return run(run(value, { action: "ready" }), { action: "start" }); }

describe("session purpose workflows", () => {
  it("does not add fields to historical v1 records or change legacy transition output", () => {
    const value = create();
    expect(Object.hasOwn(value, "workflow")).toBe(false);
    expect(Object.hasOwn(studioWorkSessionSchema.parse(value), "workflow")).toBe(false);
    const started = active(value);
    expect(Object.hasOwn(started, "workflow")).toBe(false);
    expect(started).toEqual({ ...value, status: "active", version: 3 });
  });
  it("keeps source pin fixed while editing and reordering a session's discussion agenda", () => {
    const value = create(), previous = JSON.stringify(value);
    let next = run(value, { action: "agenda-add", item });
    next = run(next, { action: "agenda-add", item: { ...item, id: "second", title: "두 번째" } });
    next = run(next, { action: "agenda-reorder", expectedOrder: ["first", "second"], itemIds: ["second", "first"] });
    next = run(next, { action: "agenda-edit", expectedItemRevision: 1, itemId: "first", title: "수정 제안", purpose: "연출 조정", dialogue: "새 대사 제안", assignedUserId: null });
    expect(next.workflow?.agenda.map((entry) => entry.id)).toEqual(["second", "first"]);
    expect(next.workflow?.agenda[1]?.source).toEqual(source);
    expect(next.input).toEqual(input);
    expect(JSON.stringify(value)).toBe(previous);
  });
  it.each([["first", "first"], ["missing"], [], ["first", "extra"]].map((ids) => ({ ids })))("rejects incomplete/duplicate reorder $ids", ({ ids }) => {
    const value = run(create(), { action: "agenda-add", item });
    expect(() => run(value, { action: "agenda-reorder", expectedOrder: ["first"], itemIds: ids })).toThrow("invalid-target");
  });
  it("never reuses the identity of a removed agenda entry", () => {
    const value = run(run(create(), { action: "agenda-add", item }), { action: "agenda-remove", expectedItemRevision: 1, itemId: item.id });
    expect(value.workflow?.retiredAgendaIds).toEqual([item.id]);
    expect(() => run(value, { action: "agenda-add", item })).toThrow("invalid-target");
  });
  it("only assigns joined people and keeps reading turns tied to the focused source", () => {
    expect(() => run(create(), { action: "agenda-add", item: { ...item, assignedUserId: guest.userId } })).toThrow("invalid-target");
    let value = run(create(), { action: "join" }, guest);
    value = active(run(value, { action: "agenda-add", item: { ...item, assignedUserId: guest.userId } }));
    const focused = run(value, { action: "agenda-focus", itemId: item.id });
    expect(focused.readerUserId).toBe(guest.userId);
    expect(focused.workflow?.activeAgendaItemId).toBe(item.id);
    const departed = run(focused, { action: "leave" }, guest);
    expect(departed.readerUserId).toBeNull();
    expect(() => run(departed, { action: "agenda-focus", itemId: item.id })).toThrow("invalid-target");
  });
  it("records one explicit item outcome without changing the manuscript or approval", () => {
    const value = active(run(create(), { action: "agenda-add", item }));
    const next = run(value, { action: "agenda-conclude", expectedItemRevision: 1, itemId: item.id, body: "대사 수정 후 다시 검토" });
    expect(next.workflow?.agenda[0]?.outcome).toEqual({ authorUserId: host.userId, at, body: "대사 수정 후 다시 검토" });
    expect(next.input).toEqual(input); expect(next.results).toEqual([]); expect(next.status).toBe("active");
    expect(() => run(next, { action: "agenda-edit", expectedItemRevision: 1, itemId: item.id, title: "교체", purpose: "", dialogue: "", assignedUserId: null })).toThrow("invalid-transition");
    expect(() => run(next, { action: "agenda-conclude", expectedItemRevision: 1, itemId: item.id, body: "덮어쓰기" })).toThrow("invalid-transition");
  });
  it("rejects forged input source digests and nonhost agenda edits", () => {
    const joined = run(create(), { action: "join" }, guest);
    expect(() => run(joined, { action: "agenda-add", item }, guest)).toThrow("forbidden");
    expect(() => run(joined, { action: "agenda-add", item: { ...item, source: { ...source, sourceContentDigest: "c".repeat(64) } } })).toThrow();
  });
  it("keeps one actual-actor ballot, preserves decision evidence, and requires reopening", () => {
    let value = run(create("material-choice"), { action: "join" }, guest);
    value = active(run(value, { action: "material-propose", candidate }, guest));
    value = run(value, { action: "material-propose", candidate: { ...candidate, id: "candidate-2", asset: { ...asset, assetId: "another" } } });
    value = run(value, { action: "material-vote", candidateId: candidate.id, rationale: "A" }, guest);
    value = run(value, { action: "material-vote", candidateId: "candidate-2", rationale: "B" }, guest);
    expect(value.workflow?.materialVotes).toHaveLength(1);
    expect(value.workflow?.materialVotes[0]).toMatchObject({ userId: guest.userId, candidateId: "candidate-2" });
    const decided = run(value, { action: "material-decide", observedVersion: value.version, candidateId: candidate.id, rationale: "후보 A를 사용 예정으로 선택" });
    expect(decided.workflow?.materialDecisions[0]?.votes).toEqual(value.workflow?.materialVotes);
    expect(() => run(decided, { action: "material-vote", candidateId: "candidate-2", rationale: "later" }, guest)).toThrow("invalid-transition");
    const reopened = run(decided, { action: "material-decide", observedVersion: decided.version, candidateId: null, rationale: "새 조건 검토" });
    const withdrawn = run(reopened, { action: "material-vote", candidateId: null, rationale: "" }, guest);
    expect(withdrawn.workflow?.materialVotes).toEqual([]);
    expect(withdrawn.workflow?.materialDecisions[0]).toEqual(decided.workflow?.materialDecisions[0]);
  });
  it("prevents outsiders/noncommenters from voting and participants from deciding", () => {
    let value = run(create("material-choice"), { action: "join" }, guest);
    value = active(run(value, { action: "material-propose", candidate }));
    const vote = { action: "material-vote" as const, candidateId: candidate.id, rationale: "" };
    expect(() => run(value, vote, { ...guest, userId: "outsider" })).toThrow("forbidden");
    expect(() => run(value, vote, { ...guest, canComment: false })).toThrow("forbidden");
    expect(() => run(value, { action: "material-decide", observedVersion: value.version, candidateId: candidate.id, rationale: "선정" }, guest)).toThrow("forbidden");
  });
  it("rejects caller-supplied voter/author identities, URLs and invented asset versions", () => {
    const base = { operationId: "op", expectedVersion: 1 };
    expect(studioWorkSessionCommandSchema.safeParse({ ...base, action: "material-vote", candidateId: candidate.id, rationale: "", userId: "host" }).success).toBe(false);
    expect(studioWorkSessionCommandSchema.safeParse({ ...base, action: "material-propose", candidate: { ...candidate, asset: { ...asset, url: "https://invalid.example" } } }).success).toBe(false);
  });
  it("does not remove decided history and rejects closed/capacity-exhausted mutations", () => {
    const value = active(run(create("material-choice"), { action: "material-propose", candidate }));
    const vote = { action: "material-vote" as const, candidateId: candidate.id, rationale: "" };
    expect(() => run({ ...value, version: 128 }, vote)).toThrow("capacity");
    const closed = run(value, { action: "close", summary: "결론 없이 종료" });
    expect(() => run(closed, vote)).toThrow("closed");
    expect(closed.workflow).toEqual(value.workflow);
  });
});
