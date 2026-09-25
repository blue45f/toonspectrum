import { beforeEach, describe, expect, it, vi } from "vitest";
import { studioHandoffClient, StudioHandoffClientError } from "./studio-handoff-envelope-client";
import { handoffFixture } from "./studio-handoff-envelope-fixture";

const io = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: io, isHttpError: (error: unknown) => Boolean(error && typeof error === "object" && "response" in error) }));
const signal = () => new AbortController().signal;
function input() {
  const { prepared, choice } = handoffFixture(), recipient = prepared.recipients[0]!;
  return { envelopeId: "envelope", taskId: prepared.taskId, baseRevision: prepared.baseRevision,
    completionFingerprint: prepared.completionFingerprint, recipient: { userId: recipient.userId, roleAssignmentId: recipient.roleAssignmentId },
    recipientBindingDigest: recipient.bindingDigest, usageConditions: choice.usageConditions, remainingNotes: choice.remainingNotes };
}
beforeEach(() => vi.clearAllMocks());
describe("handoff HTTP authority boundary", () => {
  it("does not treat a malformed successful delivery response as a definitive rejected write", async () => {
    io.post.mockResolvedValue({ received: true });
    const failure = await studioHandoffClient.create("work", input(), signal()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error); expect(failure).not.toBeInstanceOf(StudioHandoffClientError);
    expect(io.post).toHaveBeenCalledTimes(1);
  });
  it("does not forget the intent when a successful response names a different envelope", async () => {
    const { view } = handoffFixture(); io.post.mockResolvedValue({ ...view, envelope: { ...view.envelope, id: "other" } });
    const failure = await studioHandoffClient.create("work", input(), signal()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error); expect(failure).not.toBeInstanceOf(StudioHandoffClientError);
  });
  it.each([408, 429, 500, 502, 503])("keeps HTTP %i as an uncertain outcome rather than a definitive rejection", async (status) => {
    const error = Object.assign(new Error("network outcome"), { response: { status } }); io.post.mockRejectedValue(error);
    await expect(studioHandoffClient.create("work", input(), signal())).rejects.toBe(error);
  });
  it.each([[401, "denied"], [403, "denied"], [404, "missing"], [409, "changed"], [400, "invalid"], [422, "invalid"]] as const)(
    "classifies a definitive HTTP %i rejection as %s", async (status, reason) => {
      io.post.mockRejectedValue(Object.assign(new Error("rejected"), { response: { status } }));
      await expect(studioHandoffClient.create("work", input(), signal())).rejects.toMatchObject({ reason });
    });
  it("validates successful actions and sends explicit acceptance without automatic retries", async () => {
    const { view } = handoffFixture(); io.post.mockResolvedValue(view); const abort = signal();
    const action = { requestId: "confirm", envelopeDigest: view.envelopeDigest };
    await studioHandoffClient.act("work", "envelope", "accept", action, abort);
    expect(io.post).toHaveBeenCalledExactlyOnceWith("/creator/works/work/handoff-envelopes/envelope/accept", { ...action, confirmed: true }, { signal: abort, retry: 0 });
  });
  it("encodes path and cursor components and never retries reads automatically", async () => {
    io.get.mockResolvedValue({ items: [], nextCursor: null }); const abort = signal();
    await studioHandoffClient.list("작업/a", "cursor/b", abort);
    expect(io.get).toHaveBeenCalledExactlyOnceWith(`/creator/works/${encodeURIComponent("작업/a")}/handoff-envelopes?cursor=cursor%2Fb`, { signal: abort, retry: 0 });
  });
});
