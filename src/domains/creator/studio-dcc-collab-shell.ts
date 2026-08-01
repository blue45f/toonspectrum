/**
 * DOC-008 lite — multi-user collab shell for Hybrid DCC (presence + op log, not full Yjs CRDT).
 * Composes with existing live rooms when available; pure session ops for offline tests.
 */

export const STUDIO_DCC_COLLAB_SHELL_REVISION = 1 as const;

export type StudioDccCollabPresence = {
  readonly peerId: string;
  readonly displayName: string;
  readonly color: string;
  readonly selection: readonly string[];
  readonly lastSeenAt: number;
};

export type StudioDccCollabOp =
  | {
      readonly kind: "select";
      readonly peerId: string;
      readonly assetIds: readonly string[];
      readonly at: number;
    }
  | {
      readonly kind: "geometry-hint";
      readonly peerId: string;
      readonly assetId: string;
      readonly geometryHash: string;
      readonly at: number;
    }
  | {
      readonly kind: "chat";
      readonly peerId: string;
      readonly text: string;
      readonly at: number;
    };

export interface StudioDccCollabRoom {
  readonly revision: typeof STUDIO_DCC_COLLAB_SHELL_REVISION;
  readonly roomId: string;
  readonly peers: readonly StudioDccCollabPresence[];
  readonly ops: readonly StudioDccCollabOp[];
  readonly epoch: number;
}

export function createStudioDccCollabRoom(roomId: string): StudioDccCollabRoom {
  return {
    revision: STUDIO_DCC_COLLAB_SHELL_REVISION,
    roomId,
    peers: [],
    ops: [],
    epoch: 0,
  };
}

export function collabJoin(
  room: StudioDccCollabRoom,
  peer: Omit<StudioDccCollabPresence, "lastSeenAt" | "selection"> & {
    readonly selection?: readonly string[];
  },
  now = Date.now(),
): StudioDccCollabRoom {
  const presence: StudioDccCollabPresence = {
    peerId: peer.peerId,
    displayName: peer.displayName,
    color: peer.color,
    selection: peer.selection ?? [],
    lastSeenAt: now,
  };
  const peers = [
    ...room.peers.filter((p) => p.peerId !== peer.peerId),
    presence,
  ];
  return { ...room, peers, epoch: room.epoch + 1 };
}

export function collabLeave(
  room: StudioDccCollabRoom,
  peerId: string,
): StudioDccCollabRoom {
  return {
    ...room,
    peers: room.peers.filter((p) => p.peerId !== peerId),
    epoch: room.epoch + 1,
  };
}

export function collabAppendOp(
  room: StudioDccCollabRoom,
  op: StudioDccCollabOp,
): StudioDccCollabRoom {
  const peers = room.peers.map((p) =>
    p.peerId === op.peerId
      ? {
          ...p,
          lastSeenAt: op.at,
          selection: op.kind === "select" ? op.assetIds : p.selection,
        }
      : p,
  );
  return {
    ...room,
    peers,
    ops: [...room.ops, op].slice(-512),
    epoch: room.epoch + 1,
  };
}

export function collabActivePeerIds(
  room: StudioDccCollabRoom,
  now = Date.now(),
  ttlMs = 60_000,
): readonly string[] {
  return room.peers
    .filter((p) => now - p.lastSeenAt <= ttlMs)
    .map((p) => p.peerId);
}
