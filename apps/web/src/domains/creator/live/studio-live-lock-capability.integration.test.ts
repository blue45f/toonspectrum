import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioLiveResourceLeaseController } from "./createStudioLiveResourceLeaseController";
import { StudioLiveRoom } from "./studio-live-collaboration-room";
import { createStudioLiveSignalingServerTransport } from "./studio-live-signaling-server-transport";
import { createStudioPurposeRoutedLiveTransportFactory } from "./studio-live-purpose-routed-transport";
import { applyStudioLiveP2pOverlay } from "./studio-live-p2p-overlay-transport";
import { createStudioAdaptiveCursorTransportFactory } from "./studio-live-adaptive-cursor-transport";
import type { StudioLiveTransport } from "./studio-live-collaboration-transport";
import type { StudioLiveLockAcquireResult, StudioLiveParticipant } from "./studio-live-collaboration-protocol";

const participant: StudioLiveParticipant = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  displayName: "작가", role: "owner",
};
const rooms: StudioLiveRoom[] = [];
afterEach(() => { rooms.splice(0).forEach((room) => room.close()); vi.restoreAllMocks(); });

async function setup(primary = createStudioLiveSignalingServerTransport(), role = participant.role) {
  const purpose = createStudioPurposeRoutedLiveTransportFactory({
    primaryFactory: () => primary,
    createCoordinator: () => ({
      connect: vi.fn(async () => []), dispose: vi.fn(async () => undefined),
      isReady: () => false, publish: vi.fn(),
      subscribe: () => () => undefined, subscribeStatus: () => () => undefined,
    }),
  });
  const mesh = applyStudioLiveP2pOverlay(purpose, {
    enabled: true, createPeerConnection: () => { throw new Error("Unexpected peer in isolated test"); },
  });
  const room = new StudioLiveRoom({
    workId: "lock-regression", participant: { ...participant, role },
    dependencies: { transportFactory: createStudioAdaptiveCursorTransportFactory({ baseFactory: mesh }) },
  });
  rooms.push(room);
  await room.start();
  const errors = vi.fn();
  const heldResourcesRef = { current: [] as string[] };
  const controller = createStudioLiveResourceLeaseController({
    roomRef: { current: room }, pageId: "page-1", heldResourcesRef,
    mutationGenerationRef: { current: 0 }, pendingMutationRef: { current: null }, reportError: errors,
  });
  return { room, controller, errors, heldResourcesRef, primary };
}

describe("signaling-only drawing lock regression through all runtime wrappers", () => {
  it("uses cooperative locks without inventing server authority", async () => {
    const { room } = await setup();
    expect(room.mode).toBe("server");
    expect(room.canvasLockPolicy).toBe("cooperative");
    expect(room.serverLockSupported).toBe(false);
    expect(room.authoritativeLockCapability).toBeNull();
    await expect(room.claimLockAsync("page:page-1")).resolves.toMatchObject({
      status: "acquired",
      resource: "page:page-1",
    });
    expect(room.releaseLock("page:page-1")).toBe(true);
    await expect(room.claimAuthoritativeLockAsync("page:page-1")).resolves.toMatchObject({
      status: "denied", code: "unsupported_authority",
    });
  });

  it("allows repeated additive pen strokes without requests, fake leases, or error spam", async () => {
    const { room, controller, errors, heldResourcesRef } = await setup();
    const claim = vi.spyOn(room, "claimLockAsync");
    for (let stroke = 0; stroke < 25; stroke += 1) {
      expect(controller.begin(undefined, "append-stroke")).toBe(true);
      controller.end();
    }
    expect(await controller.beginAsync(undefined, "append-stroke")).toBe(true);
    expect(claim).not.toHaveBeenCalled();
    expect(room.getLocks()).toEqual([]);
    expect(heldResourcesRef.current).toEqual([]);
    expect(errors.mock.calls.every(([message]) => message === null)).toBe(true);
  });

  it.each([
    { intent: "drag" as const, elementIds: ["existing-element"] },
    { intent: "transform" as const, elementIds: ["existing-element"] },
    { intent: "text-edit" as const, elementIds: ["existing-element"] },
    { intent: "page-edit" as const, elementIds: undefined },
  ])("allows $intent through a cooperative lock without the old error", async ({ intent, elementIds }) => {
    const { room, controller, errors } = await setup();

    expect(controller.begin(elementIds, intent)).toBe(true);
    expect(room.getLocks()).toHaveLength(1);
    controller.end();
    expect(room.getLocks()).toEqual([]);

    expect(await controller.beginAsync(elementIds, intent)).toBe(true);
    expect(room.getLocks()).toHaveLength(1);
    controller.end();
    expect(room.getLocks()).toEqual([]);
    expect(errors).not.toHaveBeenCalledWith(
      "현재 연결에서는 새 획을 추가할 수 있습니다. 기존 요소 수정은 편집 잠금 서버 연결이 필요합니다.",
    );
  });

  it("locks existing targets and still blocks viewers or a closed connection", async () => {
    const { room, controller, primary } = await setup();
    expect(controller.begin(["existing"], "append-stroke")).toBe(true);
    expect(room.getLocks()).toHaveLength(1);
    controller.end();

    primary.close();
    expect(controller.begin(undefined, "append-stroke")).toBe(false);
    const viewer = await setup(createStudioLiveSignalingServerTransport(), "viewer");
    expect(await viewer.controller.beginAsync(undefined, "append-stroke")).toBe(false);
  });

  it("defaults unknown server transports to required leases instead of downgrading", async () => {
    const source = createStudioLiveSignalingServerTransport();
    const unknown: StudioLiveTransport = {
      ...source, canvasLockPolicy: undefined, get ready() { return source.ready; },
    };
    const { room, controller } = await setup(unknown);
    expect(room.canvasLockPolicy).toBe("required");
    expect(controller.begin(undefined, "append-stroke")).toBe(false);
    expect(await controller.beginAsync(undefined, "append-stroke")).toBe(false);
  });

  it("does not permit a destructive gesture while its server request is pending", async () => {
    const source = createStudioLiveSignalingServerTransport();
    const required: StudioLiveTransport = {
      ...source, canvasLockPolicy: "required", get ready() { return source.ready; },
      acquireLock: vi.fn(), releaseLock: vi.fn(),
    };
    const { room, controller, errors } = await setup(required);
    expect(room.serverLockSupported).toBe(true);
    let settle!: (value: StudioLiveLockAcquireResult) => void;
    const claim = vi.spyOn(room, "claimLockAsync").mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    expect(controller.begin(["existing"], "drag")).toBe(false);
    expect(controller.begin(["existing"], "drag")).toBe(false);
    expect(claim).toHaveBeenCalledTimes(1);
    settle({ status: "denied", code: "lock_conflict", resource: "element:page-1:existing", requestId: "denied", message: "이미 편집 중" });
    await vi.waitFor(() => expect(errors).toHaveBeenCalledWith("이미 편집 중"));
    source.close();
    expect(room.serverLockSupported).toBe(true);
    expect(room.canvasLockPolicy).toBe("required");
  });
});
