import { describe, expect, it, vi } from "vitest";

import {
  StudioPeerBulkTransfer,
  type StudioPeerBulkReceived,
} from "./studio-peer-bulk-transfer";
import type {
  StudioPeerFabricEvent,
  StudioPeerFabricPeer,
  StudioPeerFabricPort,
  StudioPeerFabricSendOptions,
} from "./studio-peer-fabric";
import type { StudioPeerCapability } from "./studio-peer-fabric-protocol";

const A: StudioPeerFabricPeer = {
  sessionId: "peer-a",
  displayName: "A",
  role: "owner",
  capabilities: ["bulk-transfer-v1"],
};
const B: StudioPeerFabricPeer = {
  sessionId: "peer-b",
  displayName: "B",
  role: "editor",
  capabilities: ["bulk-transfer-v1"],
};

type Listener = (event: StudioPeerFabricEvent) => void;

class MemoryFabric implements StudioPeerFabricPort {
  readonly localCapabilities = ["bulk-transfer-v1"] as const;
  remote: MemoryFabric | null = null;
  mutate: ((payload: string) => string) | null = null;
  private readonly listeners = new Map<StudioPeerCapability | null, Set<Listener>>();
  private sequence = 0;

  constructor(readonly self: StudioPeerFabricPeer) {}

  getPeers(capability?: StudioPeerCapability): readonly StudioPeerFabricPeer[] {
    const peer = this.remote?.self;
    if (!peer || (capability && !peer.capabilities.includes(capability))) return [];
    return [peer];
  }

  send(
    targetSessionId: string,
    capability: StudioPeerCapability,
    payload: string,
    _options?: StudioPeerFabricSendOptions,
  ): boolean {
    const remote = this.remote;
    if (!remote || remote.self.sessionId !== targetSessionId) return false;
    const delivered = this.mutate?.(payload) ?? payload;
    const event: StudioPeerFabricEvent = {
      sender: this.self,
      capability,
      trafficClass: "bulk",
      messageId: `memory-${++this.sequence}`,
      sequence: this.sequence,
      sentAt: Date.now(),
      payload: delivered,
    };
    for (const listener of [
      ...(remote.listeners.get(capability) ?? []),
      ...(remote.listeners.get(null) ?? []),
    ]) listener(event);
    return true;
  }

  broadcast(): { targets: readonly string[]; sent: readonly string[]; failed: readonly string[] } {
    return { targets: [], sent: [], failed: [] };
  }

  subscribe(capability: StudioPeerCapability | null, listener: Listener): () => void {
    const listeners = this.listeners.get(capability) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(capability, listeners);
    return () => listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
  }
}

function pair() {
  const left = new MemoryFabric(A);
  const right = new MemoryFabric(B);
  left.remote = right;
  right.remote = left;
  return { left, right };
}

function bytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 17 + 3) % 251);
}

describe("StudioPeerBulkTransfer", () => {
  it("transfers multiple chunks and verifies the exact SHA-256 receipt", async () => {
    const { left, right } = pair();
    const received = vi.fn<(value: StudioPeerBulkReceived) => void>();
    const receiver = new StudioPeerBulkTransfer(right, {
      chunkSize: 8 * 1024,
      randomId: () => "receiver-unused",
      onReceive: received,
    });
    const sender = new StudioPeerBulkTransfer(left, {
      chunkSize: 8 * 1024,
      randomId: () => "transfer-1",
    });
    const source = bytes(70_123);

    const receipt = await sender.send("peer-b", {
      kind: "recovery-package",
      name: "recovery.toon.zip",
      mimeType: "application/zip",
      bytes: source,
      metadata: { workId: "work-1" },
    });

    expect(receipt).toMatchObject({
      transferId: "transfer-1",
      targetSessionId: "peer-b",
      byteLength: source.byteLength,
    });
    expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0]?.[0].offer.chunkCount).toBe(9);
    expect(received.mock.calls[0]?.[0].bytes).toEqual(source);
    sender.close();
    receiver.close();
  });

  it("rejects an offer that exceeds the receiver budget", async () => {
    const { left, right } = pair();
    const receiver = new StudioPeerBulkTransfer(right, {
      maximumIncomingBytes: 1_024,
      randomId: () => "receiver-unused",
    });
    const sender = new StudioPeerBulkTransfer(left, {
      randomId: () => "transfer-too-large",
    });

    await expect(sender.send("peer-b", {
      kind: "work-asset",
      name: "large.png",
      mimeType: "image/png",
      bytes: bytes(2_048),
    })).rejects.toThrow("수신 허용 크기");
    sender.close();
    receiver.close();
  });

  it("fails closed when one transferred chunk is modified", async () => {
    const { left, right } = pair();
    let modified = false;
    left.mutate = (payload) => {
      const message = JSON.parse(payload) as Record<string, unknown>;
      if (!modified && message.type === "chunk" && typeof message.data === "string") {
        modified = true;
        const replacement = message.data.startsWith("A") ? "B" : "A";
        message.data = `${replacement}${message.data.slice(1)}`;
        return JSON.stringify(message);
      }
      return payload;
    };
    const receiver = new StudioPeerBulkTransfer(right, {
      chunkSize: 4 * 1024,
      randomId: () => "receiver-unused",
    });
    const sender = new StudioPeerBulkTransfer(left, {
      chunkSize: 4 * 1024,
      randomId: () => "transfer-tampered",
    });

    await expect(sender.send("peer-b", {
      kind: "library-cas",
      name: "asset.bin",
      mimeType: "application/octet-stream",
      bytes: bytes(12_000),
    })).rejects.toThrow("SHA-256");
    expect(modified).toBe(true);
    sender.close();
    receiver.close();
  });
});
