import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioWorkSession, type StudioWorkSessionCreate } from "@toonspectrum/studio-project-model";
import { StudioWorkSessionController } from "./studio-work-session-controller";
import { studioWorkSessionRequestHash, type StudioSessionMutation, type StudioWorkSessionApi } from "./studio-work-session-client";

const controllers: StudioWorkSessionController[] = [];
afterEach(() => { controllers.splice(0).forEach((controller) => controller.dispose()); vi.useRealTimers(); });
const at = "2026-09-21T00:00:00.000Z";
const actor = { userId: "host", canEdit: true, canComment: true };
const createInput = { title: "12화 검수", purpose: "8컷 시선", kind: "review" as const,
  input: { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) }, invitedUserIds: ["guest"] };
async function mutation(input: StudioWorkSessionCreate): Promise<StudioSessionMutation> {
  const session = createStudioWorkSession(input, actor, at);
  return { view: { session, capabilities: { edit: true, comment: true } }, receipt: { contract: "studio-work-session-receipt-v1", actorUserId: "host",
    workId: "work", sessionId: input.id, operationId: input.operationId, previousVersion: 0, resultVersion: 1, stateHash: "b".repeat(64),
    requestHash: await studioWorkSessionRequestHash("work", input.id, input) } };
}
function fixture() {
  let active = true, id = 0; const storage = new Map<string, string>();
  const api = { list: vi.fn<StudioWorkSessionApi["list"]>().mockResolvedValue({ items: [], nextCursor: null }),
    current: vi.fn<StudioWorkSessionApi["current"]>(), create: vi.fn<StudioWorkSessionApi["create"]>(),
    command: vi.fn<StudioWorkSessionApi["command"]>(), receipt: vi.fn<StudioWorkSessionApi["receipt"]>() };
  api.create.mockImplementation(async (_workId, input) => mutation(input));
  const store = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
  const controller = new StudioWorkSessionController("work", "host", api, store, () => active, () => `id-${++id}`); controllers.push(controller);
  return { controller, api, storage, store, deactivate: () => { active = false; controller.suspend(); } };
}
describe("receipt-backed work-session client", () => {
  it("loads without creating, joining or marking anything as accepted", async () => {
    const f = fixture(); await f.controller.refresh(); expect(f.api.list).toHaveBeenCalledOnce(); expect(f.api.create).not.toHaveBeenCalled(); expect(f.api.command).not.toHaveBeenCalled();
  });
  it("persists intent before sending and clears it only after a matching receipt", async () => {
    const f = fixture(); f.api.create.mockImplementation(async (_workId, input) => { expect(f.storage.size).toBe(1); return mutation(input); });
    await f.controller.create(createInput); expect(f.api.create).toHaveBeenCalledOnce(); expect(f.storage.size).toBe(0); expect(f.controller.getSnapshot().view?.session.version).toBe(1);
  });
  it("recovers a lost successful response by reading without posting again", async () => {
    const f = fixture(); let result!: StudioSessionMutation;
    f.api.create.mockImplementation(async (_workId, input) => { result = await mutation(input); throw new Error("connection lost"); });
    await f.controller.create(createInput); expect(f.controller.getSnapshot().phase).toBe("uncertain");
    f.api.receipt.mockImplementation(async () => result); await f.controller.refresh();
    expect(f.api.create).toHaveBeenCalledOnce(); expect(f.api.receipt).toHaveBeenCalledOnce(); expect(f.controller.getSnapshot().phase).toBe("ready"); expect(f.storage.size).toBe(0);
  });
  it("does not converge on an actor or payload-mismatched receipt", async () => {
    const f = fixture(); f.api.create.mockImplementation(async (_workId, input) => {
      const result = await mutation(input); return { ...result, receipt: { ...result.receipt, requestHash: "c".repeat(64) } };
    });
    await f.controller.create(createInput); expect(f.controller.getSnapshot().phase).toBe("uncertain"); expect(f.storage.size).toBe(1);
    await f.controller.create({ ...createInput, title: "Another" }); expect(f.api.create).toHaveBeenCalledOnce();
  });
  it("fences a result after the account or visibility changes", async () => {
    const f = fixture(); let finish!: (result: StudioSessionMutation) => void;
    f.api.create.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const request = f.controller.create(createInput), input = f.api.create.mock.calls[0]![1];
    f.deactivate(); finish(await mutation(input)); await request;
    expect(f.controller.getSnapshot().view).toBeNull(); expect(f.storage.size).toBe(1);
  });
  it("retries only after explicit action using the same persisted request", async () => {
    const f = fixture(); let result!: StudioSessionMutation;
    f.api.create.mockImplementationOnce(async (_workId, input) => { result = await mutation(input); throw new Error("lost"); });
    await f.controller.create(createInput); const first = f.api.create.mock.calls[0]![1];
    f.api.receipt.mockImplementation(async () => ({ view: result.view, receipt: null }));
    await f.controller.reconcile(false); expect(f.api.create).toHaveBeenCalledOnce();
    await f.controller.reconcile(true); expect(f.api.create).toHaveBeenCalledTimes(2); expect(f.api.create.mock.calls[1]![1]).toEqual(first);
  });
  it("restores pending work without creating a replacement session", async () => {
    const f = fixture(); let result!: StudioSessionMutation;
    f.api.create.mockImplementation(async (_workId, input) => { result = await mutation(input); throw new Error("lost"); });
    await f.controller.create(createInput); f.controller.dispose();
    const restored = new StudioWorkSessionController("work", "host", f.api, f.store, () => true); controllers.push(restored);
    f.api.receipt.mockImplementation(async () => result); await restored.refresh();
    expect(f.api.create).toHaveBeenCalledOnce(); expect(restored.getSnapshot().view?.session.id).toBe(result.view.session.id);
  });
  it("does not send when persistence is blocked", async () => {
    const f = fixture(), controller = new StudioWorkSessionController("work", "host", f.api,
      { ...f.store, setItem() { throw new Error("storage unavailable"); } }, () => true); controllers.push(controller);
    await controller.create(createInput); expect(f.api.create).not.toHaveBeenCalled(); expect(controller.getSnapshot().reason).toBe("storage");
  });
  it("does not overwrite a malformed pending record", async () => {
    const f = fixture(); f.storage.set(f.controller.storageKey, "not-json");
    const restored = new StudioWorkSessionController("work", "host", f.api, f.store, () => true); controllers.push(restored);
    await restored.create(createInput); expect(f.api.create).not.toHaveBeenCalled(); expect(f.storage.get(restored.storageKey)).toBe("not-json");
  });
});
