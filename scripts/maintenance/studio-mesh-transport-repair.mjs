import { readFileSync, writeFileSync } from "node:fs";

const transportPath = "src/domains/creator/live/studio-live-p2p-overlay-transport.ts";
const testPath = "src/domains/creator/live/studio-live-p2p-overlay-transport.test.ts";
const bindingPath = "src/domains/creator/live/studio-crdt-room-binding.ts";
const mode = process.argv[2];
if (mode !== "tests" && mode !== "fix") throw new Error("Expected tests or fix");

const tests = `

describe("[mesh-transport-regression] signaling-only browser peers", () => {
  async function pair(unordered = false) {
    const hub = new MemoryRtcHub();
    if (unordered) {
      const createChannel = hub.createChannel.bind(hub);
      vi.spyOn(hub, "createChannel").mockImplementation((label) => {
        const channel = createChannel(label);
        channel.ordered = false;
        return channel;
      });
    }
    const bus = new SignalingBus();
    const localPrimary = bus.create(LOCAL, "mesh");
    const remotePrimary = bus.create(REMOTE, "mesh");
    localPrimary.binaryLaneCapabilities = [];
    remotePrimary.binaryLaneCapabilities = [];
    const wrap = (primary: FakePrimaryTransport, participant: StudioLiveParticipant) =>
      applyStudioLiveP2pOverlay(() => primary, {
        createPeerConnection: () => hub.create(), now: () => NOW,
      })(contextFor(participant));
    const local = wrap(localPrimary, LOCAL);
    const remote = wrap(remotePrimary, REMOTE);
    const controls: StudioLiveTransportControlEvent[] = [];
    local.subscribeControl?.((event) => controls.push(event));
    expect(local.binaryLaneCapabilities ?? []).not.toContain(STUDIO_LIVE_INK_CAPABILITY);
    await local.connect();
    await remote.connect();
    localPrimary.emit(envelope({ sender: REMOTE, kind: "presence:heartbeat",
      payload: { visibility: "active", pageId: "page-1", tool: "pen" } }));
    remotePrimary.emit(envelope({ sender: LOCAL, kind: "presence:heartbeat",
      payload: { visibility: "active", pageId: "page-1", tool: "pen" }, sequence: 2 }));
    await flush();
    await flush();
    return { hub, localPrimary, remotePrimary, local, remote, controls,
      close: () => { local.close(); remote.close(); } };
  }

  it("notifies the document binding when the real peer data channel opens", async () => {
    const test = await pair();
    try {
      expect(test.controls.filter((event) => event.type === "status"
        && event.status.state === "ready")).toHaveLength(1);
    } finally { test.close(); }
  });

  it("negotiates and delivers exact live ink without an authoritative ink primary", async () => {
    const test = await pair();
    const received: StudioLiveInkWireMessage[] = [];
    test.remote.subscribeInk?.((value) => received.push(value as StudioLiveInkWireMessage));
    try {
      expect(test.local.binaryLaneCapabilities).toContain(STUDIO_LIVE_INK_CAPABILITY);
      expect(test.remote.binaryLaneCapabilities).toContain(STUDIO_LIVE_INK_CAPABILITY);
      const begin = inkBeginWire(LOCAL, "peer-live-ink");
      const chunk = inkChunkWire(LOCAL, "peer-live-ink", 0, 0);
      expect(test.local.sendInk?.(begin)).toBe(true);
      expect(test.local.sendInk?.(chunk)).toBe(true);
      expect(received).toEqual([begin, chunk]);
      expect(test.localPrimary.sentInk).toEqual([]);
      expect(test.remotePrimary.sentInk).toEqual([]);
    } finally { test.close(); }
  });

  it("never negotiates actual ink on an unordered channel", async () => {
    const test = await pair(true);
    try {
      expect(test.local.binaryLaneCapabilities ?? []).not.toContain(STUDIO_LIVE_INK_CAPABILITY);
      expect(test.local.sendInk?.(inkBeginWire(LOCAL))).toBe(false);
      expect(test.localPrimary.sentInk).toEqual([]);
    } finally { test.close(); }
  });

  it("fails closed on live-ink backpressure instead of hiding it behind the local primary", async () => {
    const test = await pair();
    const received: unknown[] = [];
    test.remote.subscribeInk?.((value) => received.push(value));
    try {
      test.hub.setBufferedAmount(STUDIO_LIVE_P2P_PREVIEW_MAX_BUFFERED_BYTES);
      const begin = inkBeginWire(LOCAL, "congested-peer-ink");
      expect(test.local.sendInk?.(begin)).toBe(false);
      expect(received).toEqual([]);
      expect(test.localPrimary.sentInk).toEqual([]);
      test.hub.setBufferedAmount(0);
      expect(test.local.sendInk?.(begin)).toBe(true);
      expect(received).toEqual([begin]);
      test.remote.close();
      expect(test.local.sendInk?.(inkChunkWire(LOCAL, "congested-peer-ink", 0, 0))).toBe(false);
    } finally { test.close(); }
  });

  it("retries a failed CRDT frame with the same id rather than marking it already delivered", async () => {
    const test = await pair();
    const received: StudioCrdtTransportMessage[] = [];
    test.remote.subscribeCrdt?.((message) => received.push(message));
    const request: StudioCrdtUpdateRequest = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-p2p",
      updateId: "00000000-0000-4000-8000-000000000091", clientSequence: 1, update: "AAAA",
    };
    try {
      test.hub.failOnNthSend(1);
      await expect(test.local.publishCrdtUpdate?.(request)).rejects.toThrow();
      expect(received).toEqual([]);
      await expect(test.local.publishCrdtUpdate?.(request)).resolves.toMatchObject({ duplicate: false });
      expect(received.filter((message) => message.type === "update"
        && message.update.updateId === request.updateId)).toHaveLength(1);
    } finally { test.close(); }
  });

  it("applies the first peer sync response without waiting for a stalled local channel", async () => {
    const test = await pair();
    test.localPrimary.requestCrdtSync.mockImplementation(() => new Promise(() => undefined));
    test.remote.subscribeCrdt?.((message) => {
      if (message.type !== "sync-request") return;
      test.remote.respondCrdtSync?.({
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-p2p", requestId: message.request.requestId,
        transferId: "00000000-0000-4000-8000-000000000092",
        chunks: ["AAA="], chunkCount: 1, totalBytes: 2,
        serverStateVector: "AA==", serverSequence: "0",
      }, message.senderSessionId);
    });
    let response: StudioCrdtSyncResponse | null = null;
    try {
      void test.local.requestCrdtSync?.({
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-p2p",
        requestId: "00000000-0000-4000-8000-000000000093", stateVector: "AA==",
      }).then((value) => { response = value; });
      await vi.waitFor(() => expect(response).not.toBeNull(), { timeout: 300, interval: 10 });
    } finally { test.close(); }
  });
});
`;

function edit(path, transform) {
  let source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const replace = (before, after) => {
    const count = source.split(before).length - 1;
    if (count !== 1) throw new Error(`Expected one anchor in ${path}, found ${count}: ${before}`);
    source = source.replace(before, after);
  };
  transform(replace);
  writeFileSync(path, source);
}

if (mode === "tests") {
  let source = readFileSync(testPath, "utf8").replace(/\r\n/g, "\n");
  if (!source.includes("[mesh-transport-regression]")) {
    const anchor = 'class MemoryDataChannel implements StudioLiveP2pRtcDataChannel {\n';
    if (!source.includes(anchor)) throw new Error("Missing RTC test seam");
    source = source.replace(anchor, anchor + '  ordered = true;\n  maxRetransmits: number | null = null;\n  maxPacketLifeTime: number | null = null;\n');
    writeFileSync(testPath, source + tests);
  }
} else {
  edit(transportPath, (replace) => {
    replace('  readonly bufferedAmount: number;\n', '  readonly bufferedAmount: number;\n  readonly ordered?: boolean;\n  readonly maxRetransmits?: number | null;\n  readonly maxPacketLifeTime?: number | null;\n');
    replace('const STUDIO_LIVE_P2P_NO_BINARY_LANES: readonly string[] = Object.freeze([]);', 'const STUDIO_LIVE_P2P_NO_BINARY_LANES: readonly string[] = Object.freeze([]);\nconst STUDIO_LIVE_P2P_RELIABLE_INK_LANES: readonly string[] = Object.freeze([STUDIO_LIVE_INK_CAPABILITY]);');
    replace(`async function firstNonNullCrdtSyncResponse(
  primary: Promise<StudioCrdtSyncResponse | null>,
  mesh: Promise<StudioCrdtSyncResponse | null>,
): Promise<StudioCrdtSyncResponse | null> {
  const settled = await Promise.allSettled([primary, mesh]);
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) return result.value;
  }
  return null;
}`, `function firstNonNullCrdtSyncResponse(
  primary: Promise<StudioCrdtSyncResponse | null>,
  mesh: Promise<StudioCrdtSyncResponse | null>,
): Promise<StudioCrdtSyncResponse | null> {
  return new Promise((resolve) => {
    let remaining = 2;
    const settle = (response: StudioCrdtSyncResponse | null): void => {
      if (response) resolve(response);
      if (--remaining === 0) resolve(null);
    };
    // A missing same-profile BroadcastChannel must not delay an already available remote peer.
    void primary.then(settle, () => settle(null));
    void mesh.then(settle, () => settle(null));
  });
}`);
    replace('  private readonly inkListeners = new Set<(value: unknown) => void>();', '  private readonly inkListeners = new Set<(value: unknown) => void>();\n  private readonly controlListeners = new Set<(event: StudioLiveTransportControlEvent) => void>();\n  private readonly meshReadyChannels = new WeakSet<StudioLiveP2pRtcDataChannel>();');
    replace(`  /**
   * The mesh alone cannot negotiate a binary lane it can honor — actual samples require the
   * reliable authority path — so the overlay advertises exactly what the primary negotiated.
   */
  get binaryLaneCapabilities(): readonly string[] {
    return this.primary.binaryLaneCapabilities ?? STUDIO_LIVE_P2P_NO_BINARY_LANES;
  }`, `  /** Authoritative connections retain their server-negotiated lane. Signaling-only rooms
   * negotiate exact ink independently over ordered, fully reliable RTC data channels. */
  get binaryLaneCapabilities(): readonly string[] {
    if (!this.usesPeerInkLane()) {
      return this.primary.binaryLaneCapabilities ?? STUDIO_LIVE_P2P_NO_BINARY_LANES;
    }
    return this.ready && [...this.peers.values()].some((peer) =>
      this.isReliableMeshLink(peer) && peer.announcedBinaryLanes
      && peer.peerBinaryLanes.includes(STUDIO_LIVE_INK_CAPABILITY)
    ) ? STUDIO_LIVE_P2P_RELIABLE_INK_LANES : STUDIO_LIVE_P2P_NO_BINARY_LANES;
  }`);
    replace(`  subscribeControl(listener: (event: StudioLiveTransportControlEvent) => void): () => void {
    return this.primary.subscribeControl?.(listener) ?? (() => undefined);
  }`, `  subscribeControl(listener: (event: StudioLiveTransportControlEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.controlListeners.add(listener);
    const unsubscribe = this.primary.subscribeControl?.(listener);
    return () => {
      this.controlListeners.delete(listener);
      unsubscribe?.();
    };
  }`);
    replace('  requestCrdtSync(request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse | null> {\n', '  requestCrdtSync(request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse | null> {\n    // A peer snapshot can repair a peer room, never certify a server save boundary.\n    if (this.primary.crdtFanout === "authoritative") {\n      return this.primary.requestCrdtSync?.(request) ?? Promise.resolve(null);\n    }\n');
    replace(`    if (this.primary.publishCrdtUpdate) {
      if (this.openPeerChannelCount() > 0) {
        void this.publishMeshCrdtUpdate(request).catch(() => undefined);
      }
      return this.primary.publishCrdtUpdate(request);
    }`, `    if (this.primary.publishCrdtUpdate) {
      const primary = this.primary.publishCrdtUpdate(request);
      if (this.openPeerChannelCount() > 0) {
        const mesh = this.publishMeshCrdtUpdate(request);
        if (this.primary.crdtFanout !== "authoritative") {
          // A same-profile receipt cannot hide a failed cross-browser transmission.
          return Promise.all([primary, mesh]).then(([acknowledgement]) => acknowledgement);
        }
        void mesh.catch(() => undefined);
      }
      return primary;
    }`);
    replace(`  /**
   * V18 delivery contract: actual samples must never be lossy. The opportunistic mesh has no
   * retransmit protocol, so a channel closing mid-stroke would tear an unrecoverable hole in the
   * strictly-sequenced chunk stream. Actuals therefore always ride the reliable primary lane;
   * only droppable predictions may hop the mesh, and only to peers that announced ink-v2.
   */`, `  /**
   * Server-backed actual samples still use the authoritative primary. Signaling-only rooms may
   * use a separately negotiated, ordered RTC lane with unlimited SCTP retransmissions. Every
   * peer must be capable and writable; congestion/closure fails closed so the publisher retains
   * its retry/cancel contract. Final CRDT strokes remain independent of transient live ink.
   */`);
    replace('    const sendPrimary = this.primary.sendInk;\n', '    if (this.usesPeerInkLane()) {\n      if (!this.ready || !this.binaryLaneCapabilities.includes(STUDIO_LIVE_INK_CAPABILITY)) return false;\n      if ([...this.peers.values()].some((peer) => !this.isReliableMeshLink(peer))) return false;\n      return this.sendMeshInkPrediction(message);\n    }\n    const sendPrimary = this.primary.sendInk;\n');
    replace('    this.inkListeners.clear();\n', '    this.inkListeners.clear();\n    this.controlListeners.clear();\n');
    replace(`      this.rememberMeshCrdtUpdateId(parsed.updateId);
      if (this.peers.size > 0) {
        this.sendMeshCrdtWire({`, `      if (this.closed || this.peers.size === 0) {
        return Promise.reject(new Error("P2P 원고 전송 채널이 준비되지 않았습니다."));
      }
      {
        const delivered = this.sendMeshCrdtWire({`);
    replace(`            update: parsed.update,
          },
        });
      }
    }
    return Promise.resolve({`, `            update: parsed.update,
          },
        });
        if (!delivered) {
          return Promise.reject(new Error("일부 P2P 참여자에게 원고를 전송하지 못해 다시 시도합니다."));
        }
        this.rememberMeshCrdtUpdateId(parsed.updateId);
      }
    }
    return Promise.resolve({`);
    replace(`    const target = message.targetSessionId;
    for (const peer of this.peers.values()) {
      if (target && peer.sessionId !== target) continue;
      if (this.sendSerializedToPeer(peer, serialized)) delivered += 1;
    }
    return delivered > 0;`, `    const target = message.targetSessionId;
    if (message.kind === "update" && !target
      && this.peers.size !== this.knownPeerSessionIds.size) return false;
    let expected = 0;
    for (const peer of this.peers.values()) {
      if (target && peer.sessionId !== target) continue;
      expected += 1;
      if (this.sendSerializedToPeer(peer, serialized)) delivered += 1;
    }
    return delivered > 0 && (message.kind !== "update" || delivered === expected);`);
    replace('  /** True only when the primary negotiated the ink-v2 binary lane for this connection. */', `  private usesPeerInkLane(): boolean {
    return this.primary.crdtFanout === "mesh" || this.primary.crdtFanout === "none";
  }

  private isReliableMeshLink(peer: StudioLiveP2pPeerLink): boolean {
    const channel = peer.channel;
    return !peer.closed && channel?.readyState === "open" && channel.ordered === true
      && channel.maxRetransmits === null && channel.maxPacketLifeTime === null;
  }

  /** True only when the primary negotiated the ink-v2 binary lane for this connection. */`);
    replace(`    const lanes = this.primary.binaryLaneCapabilities ?? STUDIO_LIVE_P2P_NO_BINARY_LANES;
    if (lanes.length === 0) return;
    link.announcedBinaryLanes = this.sendSerializedToPeer(
      link,
      JSON.stringify({ wire: STUDIO_LIVE_P2P_CAPS_WIRE, binaryLanes: [...lanes] }),
    );`, `    const lanes = this.usesPeerInkLane()
      ? (this.isReliableMeshLink(link) ? STUDIO_LIVE_P2P_RELIABLE_INK_LANES : STUDIO_LIVE_P2P_NO_BINARY_LANES)
      : this.primary.binaryLaneCapabilities ?? STUDIO_LIVE_P2P_NO_BINARY_LANES;
    if (lanes.length === 0) return;
    // Set before send: synchronous adapters can answer during send and otherwise recurse forever.
    link.announcedBinaryLanes = true;
    if (!this.sendSerializedToPeer(
      link,
      JSON.stringify({ wire: STUDIO_LIVE_P2P_CAPS_WIRE, binaryLanes: [...lanes] }),
    )) link.announcedBinaryLanes = false;`);
    replace(`    if (!this.inkLaneNegotiated()) return;
    if (!this.acceptMeshInkInbound(link, data.byteLength)) return;`, `    if (this.usesPeerInkLane()) {
      if (!this.ready || !this.isReliableMeshLink(link) || !link.announcedBinaryLanes
        || !link.peerBinaryLanes.includes(STUDIO_LIVE_INK_CAPABILITY)) return;
    } else if (!this.inkLaneNegotiated()) return;
    if (!this.acceptMeshInkInbound(link, data.byteLength)) return;`);
    replace(`      this.announceMeshBinaryLanes(link);
    };
    channel.onmessage`, `      this.announceMeshBinaryLanes(link);
      this.notifyMeshReady(link, channel);
    };
    channel.onmessage`);
    replace(`    if (channel.readyState === "open") this.announceMeshBinaryLanes(link);
  }

  private handleChannelMessage`, `    if (channel.readyState === "open") {
      this.announceMeshBinaryLanes(link);
      this.notifyMeshReady(link, channel);
    }
  }

  private notifyMeshReady(link: StudioLiveP2pPeerLink, channel: StudioLiveP2pRtcDataChannel): void {
    if (!this.usesPeerInkLane() || this.meshReadyChannels.has(channel)) return;
    this.meshReadyChannels.add(channel);
    queueMicrotask(() => {
      if (this.closed || link.closed || link.channel !== channel || channel.readyState !== "open") return;
      const event: StudioLiveTransportControlEvent = { type: "status", status: {
        state: "ready", message: "P2P 데이터 채널이 연결되어 누락된 원고를 다시 맞춥니다.", recoverable: true,
      } };
      for (const listener of this.controlListeners) {
        try { listener(event); } catch { /* An observer must not break peer delivery. */ }
      }
    });
  }

  private handleChannelMessage`);
  });
  edit(bindingPath, (replace) => {
    replace(`    if (event.status.state !== "ready") return;
    void this.syncNow()`, `    if (event.status.state !== "ready") return;
    if (!this.hasAuthoritativeServer()) {
      // A newly opened peer could not receive previously acknowledged local-only broadcasts.
      for (const pending of this.pending.values()) pending.localBroadcasted = false;
    }
    if (this.syncPromise) {
      // Do not merely join a snapshot request started before this peer channel became usable.
      this.scheduleSyncRetry();
      return;
    }
    void this.syncNow()`);
  });
}
