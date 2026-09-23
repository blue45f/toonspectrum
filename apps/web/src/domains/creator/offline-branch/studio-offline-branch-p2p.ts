import {
  chunkStudioOfflineBranchPeerPayloads,
  decodeStudioOfflineBranchPeerBundle,
  encodeStudioOfflineBranchPeerBundle,
  STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE,
} from "./studio-offline-branch-peer-bundle";

import type { StudioLiveRoom } from "../live/studio-live-collaboration-room";
import type { StudioPeerFabricEvent } from "../live/studio-peer-fabric";
import type { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";

const HELLO_WIRE = "studio-offline-branch-hello-v2" as const;
const MIME = "application/vnd.toonstudio.offline-branch+binary";
const CAPABILITY = "offline-branch-v1" as const;

interface StudioOfflineBranchHello {
  readonly wire: typeof HELLO_WIRE;
  readonly workId: string;
  readonly scope: string;
}

export interface StudioOfflineBranchPeerSync {
  readonly enabled: boolean;
  announce(): void;
  close(): void;
}

export interface ConnectStudioOfflineBranchPeerSyncOptions {
  readonly runtime: StudioOfflineBranchRuntime;
  readonly room: StudioLiveRoom;
  readonly workId: string;
  readonly scope: string;
  readonly onError?: (message: string) => void;
}

function parseHello(payload: string): StudioOfflineBranchHello | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const candidate = parsed as Partial<StudioOfflineBranchHello>;
  if (
    candidate.wire !== HELLO_WIRE
    || typeof candidate.workId !== "string"
    || typeof candidate.scope !== "string"
  ) return null;
  return {
    wire: HELLO_WIRE,
    workId: candidate.workId,
    scope: candidate.scope,
  };
}

function hello(workId: string, scope: string): string {
  return JSON.stringify({ wire: HELLO_WIRE, workId, scope } satisfies StudioOfflineBranchHello);
}

export function connectStudioOfflineBranchPeerSync({
  runtime,
  room,
  workId,
  scope,
  onError,
}: ConnectStudioOfflineBranchPeerSyncOptions): StudioOfflineBranchPeerSync {
  const fabric = room.peerFabric;
  const bulk = room.peerBulk;
  if (!fabric || !bulk) {
    return { enabled: false, announce: () => undefined, close: () => undefined };
  }
  let closed = false;
  let lastAnnouncement = "";
  const senderTails = new Map<string, Promise<void>>();
  const report = (cause: unknown): void => {
    onError?.(
      cause instanceof Error
        ? cause.message
        : "피어 오프라인 branch 동기화에 실패했습니다.",
    );
  };

  const sendBranch = async (targetSessionId: string): Promise<void> => {
    if (closed) return;
    const [documentBytes, payloads] = await Promise.all([
      runtime.exportPeerDocument(),
      runtime.peerPayloads(),
    ]);
    const chunks = chunkStudioOfflineBranchPeerPayloads(payloads);
    for (let index = 0; index < chunks.length; index += 1) {
      const bytes = encodeStudioOfflineBranchPeerBundle({
        workId,
        scope,
        documentBytes: null,
        payloads: chunks[index]!,
      });
      await bulk.send(targetSessionId, {
        kind: "offline-branch",
        name: `${workId}.offline-payloads-${index + 1}-of-${chunks.length}`,
        mimeType: MIME,
        bytes,
        metadata: {
          wire: STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE,
          workId,
          scope,
        },
      });
    }
    const documentBundle = encodeStudioOfflineBranchPeerBundle({
      workId,
      scope,
      documentBytes,
      payloads: [],
    });
    await bulk.send(targetSessionId, {
      kind: "offline-branch",
      name: `${workId}.toonstudio-offline-branch`,
      mimeType: MIME,
      bytes: documentBundle,
      metadata: {
        wire: STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE,
        workId,
        scope,
      },
    });
  };

  const enqueueSender = (senderSessionId: string, task: () => Promise<void>): void => {
    const previous = senderTails.get(senderSessionId) ?? Promise.resolve();
    const next = previous.then(task, task).catch(report).finally(() => {
      if (senderTails.get(senderSessionId) === next) senderTails.delete(senderSessionId);
    });
    senderTails.set(senderSessionId, next);
  };

  const onHello = (event: StudioPeerFabricEvent): void => {
    const candidate = parseHello(event.payload);
    if (!candidate || candidate.workId !== workId || candidate.scope !== scope) return;
    enqueueSender(event.sender.sessionId, () => sendBranch(event.sender.sessionId));
  };

  const unsubscribeFabric = fabric.subscribe(CAPABILITY, onHello);
  const unregisterBulk = bulk.register("offline-branch", {
    accept: (_sender, offer) =>
      offer.mimeType === MIME
      && offer.metadata.wire === STUDIO_OFFLINE_BRANCH_PEER_BUNDLE_WIRE
      && offer.metadata.workId === workId
      && offer.metadata.scope === scope,
    receive: (received) => {
      enqueueSender(received.sender.sessionId, async () => {
        const bundle = decodeStudioOfflineBranchPeerBundle(received.bytes);
        if (bundle.workId !== workId || bundle.scope !== scope) {
          throw new Error("피어 오프라인 branch가 다른 작업 범위를 가리킵니다.");
        }
        for (const payload of bundle.payloads) {
          await runtime.acceptPeerPayload(payload.hash, payload.bytes);
        }
        if (!bundle.documentBytes) return;
        const imported = await runtime.importPeerDocument(
          received.sender.sessionId,
          bundle.documentBytes,
        );
        if (imported.replyNeeded) await sendBranch(received.sender.sessionId);
      });
    },
  });

  const announce = (): void => {
    if (closed) return;
    const status = runtime.status;
    const heads = runtime.snapshot.heads.join(",");
    const peers = fabric.getPeers(CAPABILITY)
      .map((peer) => peer.sessionId)
      .sort()
      .join(",");
    const signature = `${heads}:${status.pendingOperations}:${status.conflicts}:${status.state}:${peers}`;
    // Runtime notifications can be emitted after an idempotent peer import. Re-announcing an
    // unchanged pending journal would make both peers answer each other forever.
    if (signature === lastAnnouncement) return;
    lastAnnouncement = signature;
    fabric.broadcast(CAPABILITY, hello(workId, scope), {
      trafficClass: "control",
      ttlMs: 30_000,
    });
  };
  const unsubscribeRuntime = runtime.subscribe((status) => {
    if (status.pendingOperations > 0 || status.state === "conflicted") announce();
  });
  announce();

  return {
    enabled: true,
    announce,
    close() {
      if (closed) return;
      closed = true;
      unsubscribeRuntime();
      unsubscribeFabric();
      unregisterBulk();
      senderTails.clear();
    },
  };
}
