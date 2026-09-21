import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioSessionEvidenceService, StudioSessionEvidenceController } from "./studio-session-evidence.controller";
import { StudioWorkSessionService } from "./studio-work-session.controller";
import { StudioWorkSessionRepositoryError, type StudioWorkSessionRepository } from "./studio-work-session.repository";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), release: vi.fn(), captures: vi.fn() }));
vi.mock("../../db", () => ({ dbPool: { connect: mocks.connect } }));
vi.mock("./studio-review-capture-attestation", () => ({ loadStudioReviewResolutionCaptures: mocks.captures }));
const pin = { schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
const current = vi.fn();
const repository = { current } as unknown as StudioWorkSessionRepository;
const service = new StudioSessionEvidenceService(repository);
beforeEach(() => {
  vi.resetAllMocks(); current.mockResolvedValue({ session: { input: pin } });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.captures.mockResolvedValue([]);
});
describe("session evidence authorization and failure boundary", () => {
  it("does not read capture rows before current invitation and membership are established", async () => {
    current.mockRejectedValue(new StudioWorkSessionRepositoryError("forbidden"));
    await expect(service.read("guest", "work", "session")).rejects.toMatchObject({ code: "forbidden" });
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.captures).not.toHaveBeenCalled();
  });
  it("rechecks access after metadata collection and discards results revoked during the read", async () => {
    current.mockResolvedValueOnce({ session: { input: pin } }).mockRejectedValueOnce(new StudioWorkSessionRepositoryError("forbidden"));
    await expect(service.read("actor", "work", "session")).rejects.toMatchObject({ code: "forbidden" });
    expect(current).toHaveBeenCalledTimes(2); expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("rejects a changed pin after the read instead of publishing prior-source data", async () => {
    current.mockResolvedValueOnce({ session: { input: pin } }).mockResolvedValueOnce({ session: { input: { ...pin, rootGraphHash: "b".repeat(64) } } });
    await expect(service.read("actor", "work", "session")).rejects.toMatchObject({ code: "invalid-target" });
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("keeps unattested or mismatched capture evidence unavailable and never queries the live document", async () => {
    mocks.captures.mockResolvedValue([{ subject: { ...pin, revisionId: "other" } }]);
    expect(await service.read("actor", "work", "session")).toMatchObject({ workId: "work", sessionId: "session", evidence: null, nextOffset: null });
    expect(mocks.query).not.toHaveBeenCalled(); expect(current).toHaveBeenCalledTimes(2);
  });
  it("releases a connection on storage errors instead of returning empty-success evidence", async () => {
    mocks.captures.mockRejectedValue(new Error("source database unavailable"));
    await expect(service.read("actor", "work", "session")).rejects.toThrow("source database unavailable");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("does not admit an anonymous controller request", async () => {
    const controller = new StudioSessionEvidenceController(new StudioWorkSessionService(repository), service);
    await expect(controller.read({ workId: "work", sessionId: "session" }, {}, undefined)).rejects.toMatchObject({ status: 403 });
    expect(current).not.toHaveBeenCalled();
  });
});
