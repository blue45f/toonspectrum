import type {
  StudioPeerFabricBroadcastResult,
  StudioPeerFabricEvent,
  StudioPeerFabricPeer,
  StudioPeerFabricPort,
} from "./studio-peer-fabric";

export const STUDIO_PEER_ANIMATIC_WIRE = "studio-peer-animatic-playback-v1" as const;
export const STUDIO_PEER_ANIMATIC_MAX_TIME_MS = 24 * 60 * 60 * 1_000;

export const STUDIO_PEER_ANIMATIC_ACTIONS = [
  "play",
  "pause",
  "seek",
  "select-shot",
  "set-loop",
] as const;
export type StudioPeerAnimaticAction = (typeof STUDIO_PEER_ANIMATIC_ACTIONS)[number];

export interface StudioPeerAnimaticLoop {
  readonly startMs: number;
  readonly endMs: number;
}

export interface StudioPeerAnimaticPacket {
  readonly wire: typeof STUDIO_PEER_ANIMATIC_WIRE;
  readonly sessionEpoch: string;
  readonly sequence: number;
  readonly action: StudioPeerAnimaticAction;
  readonly playing: boolean;
  readonly timeMs: number;
  readonly playbackRate: number;
  readonly shotId: string | null;
  readonly loop: StudioPeerAnimaticLoop | null;
  readonly sentAt: number;
}

export interface StudioPeerAnimaticEvent {
  readonly sender: StudioPeerFabricPeer;
  readonly packet: StudioPeerAnimaticPacket;
  readonly projectedTimeMs: number;
}

export interface StudioPeerAnimaticPlaybackPort {
  publish(input: Omit<StudioPeerAnimaticPacket, "wire" | "sessionEpoch" | "sequence" | "sentAt">):
    StudioPeerFabricBroadcastResult;
  follow(sessionId: string | null): void;
  subscribe(listener: (event: StudioPeerAnimaticEvent) => void): () => void;
  close(): void;
}

const ACTION_SET = new Set<string>(STUDIO_PEER_ANIMATIC_ACTIONS);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteTime(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= STUDIO_PEER_ANIMATIC_MAX_TIME_MS;
}

function parseLoop(value: unknown): StudioPeerAnimaticLoop | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || Object.keys(value).length !== 2
    || !finiteTime(value.startMs) || !finiteTime(value.endMs)
    || value.endMs <= value.startMs) return undefined;
  return { startMs: value.startMs, endMs: value.endMs };
}

export function parseStudioPeerAnimaticPacket(value: unknown): StudioPeerAnimaticPacket | null {
  if (!isRecord(value) || Object.keys(value).length !== 10) return null;
  const loop = parseLoop(value.loop);
  if (value.wire !== STUDIO_PEER_ANIMATIC_WIRE
    || typeof value.sessionEpoch !== "string" || !ID_PATTERN.test(value.sessionEpoch)
    || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1
    || typeof value.action !== "string" || !ACTION_SET.has(value.action)
    || typeof value.playing !== "boolean"
    || !finiteTime(value.timeMs)
    || typeof value.playbackRate !== "number" || !Number.isFinite(value.playbackRate)
    || value.playbackRate < 0.25 || value.playbackRate > 4
    || !(value.shotId === null
      || (typeof value.shotId === "string" && ID_PATTERN.test(value.shotId)))
    || loop === undefined
    || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt)) return null;
  return {
    wire: STUDIO_PEER_ANIMATIC_WIRE,
    sessionEpoch: value.sessionEpoch,
    sequence: Number(value.sequence),
    action: value.action as StudioPeerAnimaticAction,
    playing: value.playing,
    timeMs: value.timeMs,
    playbackRate: value.playbackRate,
    shotId: value.shotId,
    loop,
    sentAt: value.sentAt,
  };
}

export function projectStudioPeerAnimaticTime(
  packet: StudioPeerAnimaticPacket,
  now: number,
): number {
  const elapsed = packet.playing ? Math.max(0, now - packet.sentAt) * packet.playbackRate : 0;
  const projected = Math.min(STUDIO_PEER_ANIMATIC_MAX_TIME_MS, packet.timeMs + elapsed);
  if (!packet.loop) return projected;
  const duration = packet.loop.endMs - packet.loop.startMs;
  if (projected < packet.loop.endMs || duration <= 0) return projected;
  return packet.loop.startMs + ((projected - packet.loop.startMs) % duration);
}

function defaultEpoch(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value || !ID_PATTERN.test(value)) {
    throw new Error("애니매틱 P2P 세션 식별자를 생성할 수 없습니다.");
  }
  return value;
}

export class StudioPeerAnimaticPlayback implements StudioPeerAnimaticPlaybackPort {
  private readonly listeners = new Set<(event: StudioPeerAnimaticEvent) => void>();
  private readonly frontier = new Map<string, { epoch: string; sequence: number }>();
  private readonly unsubscribe: () => void;
  private readonly sessionEpoch: string;
  private sequence = 0;
  private followedSessionId: string | null = null;
  private closed = false;

  constructor(
    private readonly fabric: StudioPeerFabricPort,
    private readonly now: () => number = Date.now,
    createEpoch: () => string = defaultEpoch,
  ) {
    this.sessionEpoch = createEpoch();
    if (!ID_PATTERN.test(this.sessionEpoch)) {
      throw new TypeError("애니매틱 P2P 세션 식별자가 올바르지 않습니다.");
    }
    this.unsubscribe = fabric.subscribe("animatic-playback-v1", (event) => this.receive(event));
  }

  publish(
    input: Omit<StudioPeerAnimaticPacket, "wire" | "sessionEpoch" | "sequence" | "sentAt">,
  ): StudioPeerFabricBroadcastResult {
    if (this.closed) return { targets: [], sent: [], failed: [] };
    const packet = parseStudioPeerAnimaticPacket({
      ...input,
      wire: STUDIO_PEER_ANIMATIC_WIRE,
      sessionEpoch: this.sessionEpoch,
      sequence: ++this.sequence,
      sentAt: this.now(),
    });
    if (!packet) return { targets: [], sent: [], failed: [] };
    return this.fabric.broadcast(
      "animatic-playback-v1",
      JSON.stringify(packet),
      { trafficClass: "realtime", ttlMs: 2_000 },
    );
  }

  follow(sessionId: string | null): void {
    this.followedSessionId = sessionId && ID_PATTERN.test(sessionId) ? sessionId : null;
  }

  subscribe(listener: (event: StudioPeerAnimaticEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    this.listeners.clear();
    this.frontier.clear();
  }

  private receive(event: StudioPeerFabricEvent): void {
    if (this.closed || (
      this.followedSessionId !== null
      && event.sender.sessionId !== this.followedSessionId
    )) return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(event.payload) as unknown;
    } catch {
      return;
    }
    const packet = parseStudioPeerAnimaticPacket(candidate);
    if (!packet || packet.sentAt > this.now() + 5_000) return;
    const previous = this.frontier.get(event.sender.sessionId);
    if (previous?.epoch === packet.sessionEpoch && packet.sequence <= previous.sequence) return;
    this.frontier.set(event.sender.sessionId, {
      epoch: packet.sessionEpoch,
      sequence: packet.sequence,
    });
    const received: StudioPeerAnimaticEvent = {
      sender: event.sender,
      packet,
      projectedTimeMs: projectStudioPeerAnimaticTime(packet, this.now()),
    };
    for (const listener of this.listeners) {
      try {
        listener(received);
      } catch {
        // Playback observers never own the RTC transport.
      }
    }
  }
}

export function createStudioPeerAnimaticPlayback(
  fabric: StudioPeerFabricPort,
  options: { readonly now?: () => number; readonly createEpoch?: () => string } = {},
): StudioPeerAnimaticPlaybackPort {
  return new StudioPeerAnimaticPlayback(
    fabric,
    options.now ?? Date.now,
    options.createEpoch ?? defaultEpoch,
  );
}
