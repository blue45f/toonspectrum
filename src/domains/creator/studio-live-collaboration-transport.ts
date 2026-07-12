import type {
  StudioLiveEnvelope,
  StudioLiveParticipant,
} from "./studio-live-collaboration-protocol";

export type StudioLiveTransportMode = "local" | "server";

export interface StudioLiveTransportContext {
  workId: string;
  roomName: string;
  participant: StudioLiveParticipant;
}

export type StudioLiveTransportStatus =
  | { state: "connecting"; message: string; recoverable: true }
  | { state: "ready"; message: string; recoverable: true }
  | { state: "disconnected"; message: string; recoverable: true }
  | { state: "error"; message: string; recoverable: true }
  | { state: "revoked"; message: string; recoverable: false };

export type StudioLiveAuthoritativeLockEvent =
  | {
      action: "acquired";
      resource: string;
      claimId: string;
      owner: StudioLiveParticipant;
      leaseUntil: number;
    }
  | { action: "released"; resource: string; claimId: string };

export type StudioLiveTransportControlEvent =
  | { type: "status"; status: StudioLiveTransportStatus }
  | { type: "lock"; lock: StudioLiveAuthoritativeLockEvent };

/**
 * Transport-neutral ephemeral message surface. A server implementation must fail closed until its
 * authenticated socket has received a successful work-room ACL acknowledgement.
 */
export interface StudioLiveTransport {
  readonly mode: StudioLiveTransportMode;
  readonly ready: boolean;
  connect(): Promise<void>;
  send(envelope: StudioLiveEnvelope): boolean;
  subscribe(listener: (value: unknown) => void): () => void;
  /** Optional server-only authoritative status/ACK seam; local transports need no control plane. */
  subscribeControl?(listener: (event: StudioLiveTransportControlEvent) => void): () => void;
  close(): void;
}

export type StudioLiveTransportFactory = (
  context: StudioLiveTransportContext
) => StudioLiveTransport;

export interface StudioBroadcastChannelLike {
  postMessage(value: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

export type StudioBroadcastChannelFactory = (name: string) => StudioBroadcastChannelLike;

function defaultBroadcastChannelFactory(name: string): StudioBroadcastChannelLike {
  return new BroadcastChannel(name);
}

export function isStudioLocalLiveTransportSupported(): boolean {
  return typeof BroadcastChannel === "function";
}

/** Memory-only, same-origin tab transport. It never writes signaling data to localStorage. */
export class StudioBroadcastChannelTransport implements StudioLiveTransport {
  readonly mode = "local" as const;
  private readonly channel: StudioBroadcastChannelLike;
  private readonly listeners = new Set<(value: unknown) => void>();
  private closed = false;
  private connected = false;
  private readonly onMessage = (event: MessageEvent<unknown>) => {
    for (const listener of this.listeners) listener(event.data);
  };

  constructor(
    roomName: string,
    createChannel: StudioBroadcastChannelFactory = defaultBroadcastChannelFactory
  ) {
    this.channel = createChannel(roomName);
    this.channel.addEventListener("message", this.onMessage);
  }

  get ready(): boolean {
    return this.connected && !this.closed;
  }

  connect(): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("이미 닫힌 로컬 공동작업 채널입니다."));
    }
    this.connected = true;
    return Promise.resolve();
  }

  send(envelope: StudioLiveEnvelope): boolean {
    if (!this.ready) return false;
    try {
      this.channel.postMessage(envelope);
      return true;
    } catch {
      return false;
    }
  }

  subscribe(listener: (value: unknown) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.channel.removeEventListener("message", this.onMessage);
    this.channel.close();
  }
}

export const createStudioLocalLiveTransport: StudioLiveTransportFactory = ({ roomName }) => {
  if (!isStudioLocalLiveTransportSupported()) {
    throw new Error("이 브라우저는 로컬 탭 공동작업 채널을 지원하지 않습니다.");
  }
  return new StudioBroadcastChannelTransport(roomName);
};
