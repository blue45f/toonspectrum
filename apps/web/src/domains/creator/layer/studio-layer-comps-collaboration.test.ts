import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCrdtDocument } from "../live/studio-crdt-document";
import { studioPageToCrdtPage } from "../live/studio-crdt-page-payload";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  decodeStudioCrdtStateVector,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtStateVector,
  encodeStudioCrdtSyncChunks,
  type StudioCrdtSyncRequest,
  type StudioCrdtUpdateRequest,
} from "../live/studio-crdt-protocol";
import { StudioCrdtRoomBinding } from "../live/studio-crdt-room-binding";
import type { StudioLiveRoom } from "../live/studio-live-collaboration-room";
import type { PageState } from "../studio-page-state";
import { captureStudioLayerCompTransaction, parseStudioLayerComps } from "./studio-layer-comps-document";

/** Transport responses use real Yjs diffs; the publication gate models delayed delivery/ACK. */
function peerRoom(server: StudioCrdtDocument, mode: "local" | "server", sequence: { current: number }) {
  let publicationGate: Promise<void> | null = null;
  const publish = vi.fn(async (request: StudioCrdtUpdateRequest) => {
    if (publicationGate) await publicationGate;
    server.applyUpdate(decodeStudioCrdtUpdate(request.update));
    return {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-a", updateId: request.updateId, duplicate: false,
      serverSequence: String(++sequence.current),
      serverStateVector: encodeStudioCrdtStateVector(server.encodeStateVector()),
    };
  });
  return {
    room: {
      ready: true, mode, workId: "work-a",
      subscribe: () => () => undefined,
      subscribeCrdt: () => () => undefined,
      publishCrdtUpdate: publish,
      requestCrdtSync: async (request: StudioCrdtSyncRequest) => {
        const diff = server.encodeStateAsUpdate(decodeStudioCrdtStateVector(request.stateVector));
        const chunks = encodeStudioCrdtSyncChunks(diff);
        return {
          protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
          workId: "work-a", requestId: request.requestId,
          transferId: "11111111-1111-4111-8111-111111111111",
          chunks, chunkCount: chunks.length, totalBytes: diff.byteLength,
          serverStateVector: encodeStudioCrdtStateVector(server.encodeStateVector()),
          serverSequence: String(sequence.current),
        };
      },
    } as unknown as StudioLiveRoom,
    publish,
    delay: (gate: Promise<void>) => { publicationGate = gate; },
  };
}

describe("layer comp publication under a page lease", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["local", "server"] as const)("preserves both peers' accepted captures with delayed %s delivery and a missed peer broadcast", async (mode) => {
    vi.useFakeTimers();
    const page: PageState = { id: "p1", bg: "#fff", bgGrad: null, canvasH: 1080, elements: [] };
    const server = new StudioCrdtDocument();
    server.upsertPage(studioPageToCrdtPage(page));
    const first = new StudioCrdtDocument(server.encodeStateAsUpdate());
    const second = new StudioCrdtDocument(server.encodeStateAsUpdate());
    const sequence = { current: 0 };
    const firstRoom = peerRoom(server, mode, sequence);
    const secondRoom = peerRoom(server, mode, sequence);
    const firstBinding = new StudioCrdtRoomBinding({ document: first, room: firstRoom.room });
    const secondBinding = new StudioCrdtRoomBinding({ document: second, room: secondRoom.room });
    let heldBy: string | null = null;
    const options = (document: StudioCrdtDocument, binding: StudioCrdtRoomBinding, peer: string) => ({
      prepare: () => true,
      getPage: (): PageState => ({
        ...page, layerComps: parseStudioLayerComps(document.getPage(page.id)?.payload.props.layerComps) ?? [],
      }),
      canMutate: () => true,
      acquire: vi.fn(async () => { if (heldBy !== null) return false; heldBy = peer; return true; }),
      synchronize: () => binding.flushAndWaitForDelivery(),
      release: vi.fn(() => { expect(heldBy).toBe(peer); heldBy = null; }),
      validatePage: studioPageToCrdtPage,
      commit: vi.fn((_elements: PageState["elements"], patch: Pick<PageState, "layerComps">) => {
        document.upsertPage(studioPageToCrdtPage({ ...page, ...patch }));
        return true;
      }),
      reportError: vi.fn(),
    });
    const firstOptions = options(first, firstBinding, "first");
    const secondOptions = options(second, secondBinding, "second");
    try {
      await firstBinding.start();
      await secondBinding.start();
      let allowPublication!: () => void;
      firstRoom.delay(new Promise<void>((resolve) => { allowPublication = resolve; }));
      const firstCapture = captureStudioLayerCompTransaction({ ...firstOptions, name: "첫 동료" });
      await vi.advanceTimersByTimeAsync(0);
      expect(firstOptions.commit).toHaveBeenCalledOnce();
      expect(firstRoom.publish).toHaveBeenCalledOnce();
      expect(firstOptions.release).not.toHaveBeenCalled();
      expect(heldBy).toBe("first");
      expect(await captureStudioLayerCompTransaction({ ...secondOptions, name: "다음 동료" })).toBe(false);
      expect(secondOptions.commit).not.toHaveBeenCalled();

      allowPublication();
      await expect(firstCapture).resolves.toBe(true);
      expect(firstOptions.release).toHaveBeenCalledOnce();
      // No broadcast was delivered to the second peer. Its lease-time sync must fetch this comp.
      expect(secondOptions.getPage().layerComps).toHaveLength(0);
      expect(await captureStudioLayerCompTransaction({ ...secondOptions, name: "다음 동료" })).toBe(true);
      const names = parseStudioLayerComps(server.getPage(page.id)?.payload.props.layerComps)!.map((comp) => comp.name);
      expect(names).toEqual(["첫 동료", "다음 동료"]);
      await firstBinding.flushAndWaitForDelivery();
      expect(firstOptions.getPage().layerComps?.map((comp) => comp.name)).toEqual(names);
      expect(secondOptions.getPage().layerComps?.map((comp) => comp.name)).toEqual(names);
      expect(firstOptions.reportError).not.toHaveBeenCalled();
      expect(secondOptions.reportError).not.toHaveBeenCalled();
      expect(heldBy).toBeNull();
    } finally {
      firstBinding.close(); secondBinding.close();
      first.destroy(); second.destroy(); server.destroy();
    }
  });
});
