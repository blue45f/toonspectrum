import { readFileSync, writeFileSync } from "node:fs";

const bindingPath = "src/domains/creator/live/studio-crdt-room-binding.ts";
const testPath = "src/domains/creator/live/studio-crdt-room-binding.test.ts";
const mode = process.argv[2];
if (mode !== "tests" && mode !== "fix") throw new Error("Expected tests or fix");

const tests = `

describe("[mesh-sync-regression] server signaling is not document authority", () => {
  class MeshRoom extends FakeRoom {
    readonly crdtFanout = "mesh" as const;
  }

  it("applies consecutive zero-sequence peer strokes immediately after a peer snapshot", async () => {
    const peer = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    add(peer, "initial-peer-stroke", 1);
    const fake = new MeshRoom(peer);
    fake.serverSequence = 17;
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake), canEdit: false });
    try {
      await binding.start();
      expect(client.getStroke("initial-peer-stroke")).not.toBeNull();
      for (const index of [2, 3]) {
        const before = peer.encodeStateVector();
        add(peer, "live-peer-stroke-" + index, index);
        fake.emitRemote({
          protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
          workId: fake.workId,
          updateId: "00000000-0000-4000-8000-" + String(index).padStart(12, "0"),
          serverSequence: "0",
          update: encodeStudioCrdtUpdate(peer.encodeStateAsUpdate(before)),
        });
        // No periodic sync, timer, reload, or another REST snapshot may repair this assertion.
        expect(client.getStroke("live-peer-stroke-" + index)).not.toBeNull();
      }
      expect(fake.syncRequests).toBe(1);
    } finally {
      binding.close();
      client.destroy();
      peer.destroy();
    }
  });

  it("does not confuse independent peers' local sequence counters", async () => {
    const firstPeer = new StudioCrdtDocument();
    const secondPeer = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new MeshRoom(firstPeer);
    fake.serverSequence = 400;
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake), canEdit: false });
    try {
      await binding.start();
      add(secondPeer, "second-peer-first-edit", 24);
      fake.emitRemote({
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: fake.workId,
        updateId: "00000000-0000-4000-8000-000000000024",
        serverSequence: "1",
        update: encodeStudioCrdtUpdate(secondPeer.encodeStateAsUpdate()),
      });
      expect(client.getStroke("second-peer-first-edit")).not.toBeNull();
      expect(fake.syncRequests).toBe(1);
    } finally {
      binding.close();
      client.destroy();
      firstPeer.destroy();
      secondPeer.destroy();
    }
  });

  it("retains browser recovery copies and never reports a mesh receipt as a server ACK", async () => {
    const peer = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new MeshRoom(peer);
    const outbox = new DurableMemoryOutbox();
    const statuses: StudioCrdtBindingStatus[] = [];
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      recoveryVault: new MemoryRecoveryVault(),
      outboxScope: "mesh-user",
      onStatus: (status) => statuses.push(status),
    });
    try {
      await binding.start();
      add(client, "locally-durable-mesh-stroke", 30);
      binding.flush();
      await vi.waitFor(() => expect(fake.publications).toHaveLength(1));
      await binding.syncNow();
      expect(peer.getStroke("locally-durable-mesh-stroke")).not.toBeNull();
      expect(outbox.requests.size).toBe(1);
      expect(statuses.at(-1)?.pendingCount).toBe(1);
      expect(statuses.every((status) => status.lastAckAt === null)).toBe(true);
      expect(statuses.every((status) => status.lastAckServerSequence === null)).toBe(true);
      binding.flush();
      await Promise.resolve();
      expect(fake.publications).toHaveLength(1);
    } finally {
      binding.close();
      client.destroy();
      peer.destroy();
    }
  });

  it("cannot use a peer snapshot as an authoritative REST save fence", async () => {
    const peer = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new MeshRoom(peer);
    fake.serverSequence = 12;
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake) });
    try {
      await binding.start();
      await expect(binding.flushAndWaitForAuthoritativeAck()).rejects.toThrow("서버 승인");
    } finally {
      binding.close();
      client.destroy();
      peer.destroy();
    }
  });

  it("keeps authoritative server stale-update protection enabled", async () => {
    const server = new StudioCrdtDocument();
    const other = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    fake.serverSequence = 12;
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake), canEdit: false });
    try {
      await binding.start();
      add(other, "stale-authoritative-replay", 45);
      fake.emitRemote({
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: fake.workId,
        updateId: "00000000-0000-4000-8000-000000000045",
        serverSequence: "0",
        update: encodeStudioCrdtUpdate(other.encodeStateAsUpdate()),
      });
      expect(client.getStroke("stale-authoritative-replay")).toBeNull();
    } finally {
      binding.close();
      client.destroy();
      server.destroy();
      other.destroy();
    }
  });
});
`;

if (mode === "tests") {
  const source = readFileSync(testPath, "utf8");
  if (!source.includes("[mesh-sync-regression]")) writeFileSync(testPath, source + tests);
} else {
  let source = readFileSync(bindingPath, "utf8");
  function replace(before, after) {
    const matches = source.split(before).length - 1;
    if (matches !== 1) throw new Error(`Expected one anchor, found ${matches}: ${before}`);
    source = source.replace(before, after);
  }
  replace(
    '  private classifyAuthoritativeSequence(\n',
    '  /** Signaling can be server-backed while document edits are peer-to-peer. Peer counters\n   * are not a global ordering fence and peer receipts never prove durable server storage.\n   * An unspecified fanout preserves the legacy authoritative transport contract. */\n  private hasAuthoritativeServer(): boolean {\n    return this.room.mode === "server"\n      && this.room.crdtFanout !== "mesh"\n      && this.room.crdtFanout !== "none";\n  }\n\n  private classifyAuthoritativeSequence(\n',
  );
  replace(
    'if (this.room.mode !== "server" || this.authoritativeServerSequence === null)',
    'if (!this.hasAuthoritativeServer() || this.authoritativeServerSequence === null)',
  );
  replace(
    'private advanceAuthoritativeSequenceAfterSync(sequence: string): void {\n    if (this.room.mode !== "server") return;',
    'private advanceAuthoritativeSequenceAfterSync(sequence: string): void {\n    if (!this.hasAuthoritativeServer()) return;',
  );
  replace(
    '    if (this.room.mode === "server") {\n      this.lastAckAt = Date.now();',
    '    if (this.hasAuthoritativeServer()) {\n      this.lastAckAt = Date.now();',
  );
  replace(
    '      if (this.room.mode !== "server") {\n        throw new Error("로컬 협업 모드에서는 서버 승인 전 원고를 저장할 수 없습니다.");',
    '      if (!this.hasAuthoritativeServer()) {\n        throw new Error("로컬·P2P 협업 모드에서는 서버 승인 전 원고를 저장할 수 없습니다.");',
  );
  replace(
    '      this.room.mode === "server" &&\n      this.room.ready &&\n      Date.now() < deadline',
    '      this.hasAuthoritativeServer() &&\n      this.room.ready &&\n      Date.now() < deadline',
  );
  replace(
    '      if (this.room.mode === "local" && pending.localBroadcasted) continue;',
    '      if (!this.hasAuthoritativeServer() && pending.localBroadcasted) continue;',
  );
  replace(
    '        if (this.room.mode === "local") {\n          // BroadcastChannel delivery is peer visibility, not durable authority.',
    '        if (!this.hasAuthoritativeServer()) {\n          // BroadcastChannel/P2P delivery is peer visibility, not durable authority.',
  );
  replace(
    '      this.room.mode === "server" &&\n      (event.status.state === "connecting" ||',
    '      this.hasAuthoritativeServer() &&\n      (event.status.state === "connecting" ||',
  );
  replace(
    'if (this.closed || this.recoveryState || this.room.mode !== "server") return;',
    'if (this.closed || this.recoveryState || !this.hasAuthoritativeServer()) return;',
  );
  writeFileSync(bindingPath, source);
}
