import {
  isNewerStudioTeamCommentLiveEvent,
  parseStudioTeamCommentLiveEvent,
  type StudioTeamCommentLiveEvent,
} from "../studio-team-comment-live-event";
import type {
  StudioPeerFabricBroadcastResult,
  StudioPeerFabricEvent,
  StudioPeerFabricPort,
} from "./studio-peer-fabric";

export const STUDIO_PEER_COMMENT_HINT_WIRE = "studio-peer-comment-hint-v1" as const;

interface StudioPeerCommentHintEnvelope {
  readonly wire: typeof STUDIO_PEER_COMMENT_HINT_WIRE;
  readonly change: StudioTeamCommentLiveEvent;
}

export interface StudioPeerCommentHintPort {
  publish(change: StudioTeamCommentLiveEvent): StudioPeerFabricBroadcastResult;
  subscribe(listener: (change: StudioTeamCommentLiveEvent) => void): () => void;
  knownSequence(threadId: string): string | null;
  close(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnvelope(value: unknown, workId: string): StudioTeamCommentLiveEvent | null {
  if (!isRecord(value) || Object.keys(value).length !== 2
    || value.wire !== STUDIO_PEER_COMMENT_HINT_WIRE) return null;
  return parseStudioTeamCommentLiveEvent(value.change, workId);
}

/** Sends only canonical invalidation metadata after the authoritative REST mutation succeeds. */
export class StudioPeerCommentHint implements StudioPeerCommentHintPort {
  private readonly known = new Map<string, string>();
  private readonly listeners = new Set<(change: StudioTeamCommentLiveEvent) => void>();
  private readonly unsubscribe: () => void;
  private closed = false;

  constructor(
    private readonly fabric: StudioPeerFabricPort,
    private readonly workId: string,
  ) {
    this.unsubscribe = fabric.subscribe("comment-hint-v1", (event) => this.receive(event));
  }

  publish(change: StudioTeamCommentLiveEvent): StudioPeerFabricBroadcastResult {
    const parsed = parseStudioTeamCommentLiveEvent(change, this.workId);
    if (!parsed || this.closed) return { targets: [], sent: [], failed: [] };
    this.remember(parsed);
    return this.fabric.broadcast(
      "comment-hint-v1",
      JSON.stringify({ wire: STUDIO_PEER_COMMENT_HINT_WIRE, change: parsed } satisfies StudioPeerCommentHintEnvelope),
      { trafficClass: "control", ttlMs: 30_000 },
    );
  }

  subscribe(listener: (change: StudioTeamCommentLiveEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  knownSequence(threadId: string): string | null {
    return this.known.get(threadId) ?? null;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    this.listeners.clear();
    this.known.clear();
  }

  private receive(event: StudioPeerFabricEvent): void {
    if (this.closed) return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(event.payload) as unknown;
    } catch {
      return;
    }
    const change = parseEnvelope(candidate, this.workId);
    if (!change || !isNewerStudioTeamCommentLiveEvent(
      change,
      this.known.get(change.threadId),
    )) return;
    this.remember(change);
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch {
        // Refresh observers do not own the peer fabric.
      }
    }
  }

  private remember(change: StudioTeamCommentLiveEvent): void {
    const previous = this.known.get(change.threadId);
    if (isNewerStudioTeamCommentLiveEvent(change, previous)) {
      this.known.set(change.threadId, change.activitySequence);
    }
  }
}

export function createStudioPeerCommentHint(
  fabric: StudioPeerFabricPort,
  workId: string,
): StudioPeerCommentHintPort {
  return new StudioPeerCommentHint(fabric, workId);
}
