import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const transportPath = "src/domains/creator/live/studio-live-p2p-overlay-transport.ts";
const testsPath = "src/domains/creator/live/studio-mesh-sync-regression.test.ts";
const mode = process.argv[2];
if (mode !== "tests" && mode !== "fix") throw new Error("Expected tests or fix");

if (mode === "tests") {
  const source = readFileSync(testsPath, "utf8");
  if (source.includes("[channel-close-regression]")) throw new Error("Tests already added");
  writeFileSync(testsPath, source + `

describe("[channel-close-regression] peer lifecycle", () => {
  it("recreates the RTC connection after only the data channel closes", async () => {
    const test = await pair();
    const received: unknown[] = [];
    test.b.transport.subscribeInk?.((wire) => received.push(wire));
    test.hub.channels[0]!.close();
    test.a.primary.emit(presence(REMOTE));
    test.b.primary.emit(presence(LOCAL));
    await microtasks();
    expect(test.hub.connections.length).toBeGreaterThan(2);
    expect(test.a.transport.binaryLaneCapabilities).toContain(STUDIO_LIVE_INK_CAPABILITY);
    expect(test.b.transport.binaryLaneCapabilities).toContain(STUDIO_LIVE_INK_CAPABILITY);
    expect(test.a.transport.sendInk?.(inkBegin())).toBe(true);
    expect(test.a.transport.sendInk?.(inkChunk())).toBe(true);
    expect(received).toEqual([inkBegin(), inkChunk()]);
  });

  it("rejects a queued document frame from a channel that has already closed", async () => {
    const test = await pair();
    const received: StudioCrdtTransportMessage[] = [];
    test.a.transport.subscribeCrdt?.((message) => received.push(message));
    const channel = test.hub.channels[0]!;
    const queuedMessage = channel.onmessage!;
    channel.close();
    const { createStudioCrdtLocalWireMessage } = await import("./studio-crdt-protocol");
    const wire = createStudioCrdtLocalWireMessage({
      workId: WORK_ID, senderSessionId: REMOTE.sessionId, targetSessionId: null,
      kind: "update", payload: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: WORK_ID,
        updateId: "00000000-0000-4000-8000-000000000096",
        serverSequence: "0", update: "AAAA",
      },
    });
    queuedMessage({ data: JSON.stringify(wire) } as MessageEvent<unknown>);
    expect(received).toEqual([]);
  });
});
`);
} else {
  let source = readFileSync(transportPath, "utf8");
  const blobHash = createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest("hex");
  if (blobHash !== "4d34afe9045bc5d5c492a43f24997f21e24316ff") {
    throw new Error(`Transport changed since review: ${blobHash}`);
  }
  const anchor = 'import {\n  isStudioLiveInkWireCandidate,';
  if (source.split(anchor).length !== 2) throw new Error("Import anchor is ambiguous");
  source = source.replace(anchor,
    'import { bindStudioLiveP2pChannelLifecycle } from "./studio-live-p2p-channel-lifecycle";\n' + anchor);
  const start = source.indexOf("  private bindChannel(\n");
  const end = source.indexOf("  private notifyMeshReady(", start);
  if (start < 0 || end <= start) throw new Error("Missing channel binding boundaries");
  source = source.slice(0, start) + `  private bindChannel(
    link: StudioLiveP2pPeerLink,
    channel: StudioLiveP2pRtcDataChannel,
  ): void {
    bindStudioLiveP2pChannelLifecycle({
      link,
      channel,
      isActive: () => !this.closed && this.peers.get(link.sessionId) === link,
      resetNegotiation: () => {
        link.announcedBinaryLanes = false;
        link.peerBinaryLanes = STUDIO_LIVE_P2P_NO_BINARY_LANES;
        link.inkInboundWindow = null;
      },
      onOpen: () => {
        this.announceMeshBinaryLanes(link);
        this.notifyMeshReady(link, channel);
      },
      onMessage: (value) => this.handleChannelMessage(link, value),
      onClosed: () => this.teardownPeer(link.sessionId),
    });
  }

` + source.slice(end);
  const messageAnchor = '  private handleChannelMessage(link: StudioLiveP2pPeerLink, data: unknown): void {\n    if (this.closed) return;';
  if (source.split(messageAnchor).length !== 2) throw new Error("Message anchor is ambiguous");
  source = source.replace(messageAnchor,
    '  private handleChannelMessage(link: StudioLiveP2pPeerLink, data: unknown): void {\n    if (this.closed || link.closed || this.peers.get(link.sessionId) !== link) return;');
  const offerAnchor = '    } catch {\n      this.teardownPeer(link.sessionId);\n    }\n  }\n\n  private async handleMeshSignal';
  if (source.split(offerAnchor).length !== 2) throw new Error("Offer cleanup anchor is ambiguous");
  source = source.replace(offerAnchor,
    '    } catch {\n      // A rejected offer from a retired connection must not close a newer link for the peer.\n      if (this.peers.get(link.sessionId) === link) this.teardownPeer(link.sessionId);\n    }\n  }\n\n  private async handleMeshSignal');
  writeFileSync(transportPath, source);
}
