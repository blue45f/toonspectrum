import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioAdaptiveCursorTransportFactory } from "../live/studio-live-adaptive-cursor-transport";
import { StudioLiveRoom } from "../live/studio-live-collaboration-room";
import { applyStudioLiveP2pOverlay } from "../live/studio-live-p2p-overlay-transport";
import { createStudioPurposeRoutedLiveTransportFactory } from "../live/studio-live-purpose-routed-transport";
import { createStudioLiveSignalingServerTransport } from "../live/studio-live-signaling-server-transport";
import { createStudioOfflineCapableResourceLeaseController } from "./createStudioOfflineCapableResourceLeaseController";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";

const participant: StudioLiveParticipant = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  displayName: "작가",
  role: "owner",
};
const rooms: StudioLiveRoom[] = [];

afterEach(() => {
  rooms.splice(0).forEach((room) => room.close());
  vi.restoreAllMocks();
});

async function setup(withOfflineBranch: boolean) {
  const primary = createStudioLiveSignalingServerTransport();
  const purpose = createStudioPurposeRoutedLiveTransportFactory({
    primaryFactory: () => primary,
    createCoordinator: () => ({
      connect: vi.fn(async () => []),
      dispose: vi.fn(async () => undefined),
      isReady: () => false,
      publish: vi.fn(),
      subscribe: () => () => undefined,
      subscribeStatus: () => () => undefined,
    }),
  });
  const mesh = applyStudioLiveP2pOverlay(purpose, {
    enabled: true,
    createPeerConnection: () => {
      throw new Error("Unexpected peer in isolated test");
    },
  });
  const room = new StudioLiveRoom({
    workId: "offline-proposal-regression",
    participant,
    dependencies: {
      transportFactory: createStudioAdaptiveCursorTransportFactory({ baseFactory: mesh }),
    },
  });
  rooms.push(room);
  await room.start();

  const beginProposal = vi.fn(() => true);
  const endProposal = vi.fn();
  const offlineBranch = {
    beginProposal,
    endProposal,
  } as unknown as StudioOfflineBranchRuntime;
  const reportError = vi.fn();
  const reportNotice = vi.fn();
  const controller = createStudioOfflineCapableResourceLeaseController({
    heldResourcesRef: { current: [] },
    mutationGenerationRef: { current: 0 },
    pageId: "page-1",
    pendingMutationRef: { current: null },
    reportError,
    reportNotice,
    requiresSharedAuthority: true,
    roomRef: { current: room },
    runtimeRef: { current: withOfflineBranch ? { offlineBranch } : null },
  });
  return {
    controller,
    room,
    beginProposal,
    endProposal,
    reportError,
    reportNotice,
  };
}

describe("createStudioOfflineCapableResourceLeaseController", () => {
  it("keeps destructive edits local when no shared work or live room exists", async () => {
    const reportError = vi.fn();
    const reportNotice = vi.fn();
    const controller = createStudioOfflineCapableResourceLeaseController({
      heldResourcesRef: { current: [] },
      mutationGenerationRef: { current: 0 },
      pageId: "local-page",
      pendingMutationRef: { current: null },
      reportError,
      reportNotice,
      requiresSharedAuthority: false,
      roomRef: { current: null },
      runtimeRef: { current: null },
    });

    expect(controller.begin(undefined, "page-edit")).toBe(true);
    expect(controller.begin(["existing-element"], "transform")).toBe(true);
    expect(await controller.beginAsync(["existing-element"], "transform")).toBe(true);
    expect(reportError).not.toHaveBeenCalledWith(expect.stringContaining("오프라인 제안 권위"));
    expect(reportNotice).not.toHaveBeenCalled();
  });

  it("still fails closed for a shared work before room/offline authority is ready", async () => {
    const reportError = vi.fn();
    const controller = createStudioOfflineCapableResourceLeaseController({
      heldResourcesRef: { current: [] },
      mutationGenerationRef: { current: 0 },
      pageId: "shared-page",
      pendingMutationRef: { current: null },
      reportError,
      reportNotice: vi.fn(),
      requiresSharedAuthority: true,
      roomRef: { current: null },
      runtimeRef: { current: null },
    });

    expect(controller.begin(undefined, "page-edit")).toBe(false);
    expect(await controller.beginAsync(["existing-element"], "transform")).toBe(false);
    expect(reportError).toHaveBeenLastCalledWith(
      expect.stringContaining("오프라인 제안 권위"),
    );
  });

  it("routes destructive edits to a local proposal when the server has no lock authority", async () => {
    const {
      controller,
      room,
      beginProposal,
      endProposal,
      reportError,
      reportNotice,
    } = await setup(true);

    expect(room.canvasLockPolicy).toBe("cooperative");
    expect(room.serverLockSupported).toBe(false);
    expect(controller.begin(["existing-element"], "drag")).toBe(true);
    expect(beginProposal).toHaveBeenCalledWith({
      pageId: "page-1",
      elementIds: ["existing-element"],
      intent: "drag",
    });
    expect(reportError).toHaveBeenCalledWith(null);
    expect(reportNotice).toHaveBeenCalledWith(expect.stringContaining("오프라인 제안"));

    controller.end();
    expect(endProposal).toHaveBeenCalledOnce();
    expect(reportNotice).toHaveBeenLastCalledWith(null);
  });

  it("keeps additive strokes on the established append-only path", async () => {
    const { controller, beginProposal } = await setup(true);

    expect(controller.begin(undefined, "append-stroke")).toBe(true);
    expect(await controller.beginAsync(undefined, "append-stroke")).toBe(true);
    expect(beginProposal).not.toHaveBeenCalled();
  });

  it("fails closed for destructive edits when the offline branch is unavailable", async () => {
    const { controller, beginProposal, reportError } = await setup(false);

    expect(controller.begin(["existing-element"], "transform")).toBe(false);
    expect(await controller.beginAsync(["existing-element"], "transform")).toBe(false);
    expect(beginProposal).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenLastCalledWith(
      expect.stringContaining("오프라인 제안 권위"),
    );
  });
});
