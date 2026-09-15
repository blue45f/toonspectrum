import {
  isStudioCompanionSessionId,
  parseStudioCompanionMessage,
  type StudioCompanionChannel,
  type StudioCompanionMessage,
} from "../studio-tools-companion";
import type { StudioPeerBulkExchangePort } from "./studio-peer-bulk-exchange";
import type { StudioPeerBulkOffer, StudioPeerBulkReceived } from "./studio-peer-bulk-transfer";
import type { StudioPeerFabricEvent, StudioPeerFabricPort } from "./studio-peer-fabric";

export const STUDIO_PEER_COMPANION_WIRE = "studio-peer-companion-v1" as const;
export const STUDIO_PEER_COMPANION_FRAME_PROTOCOL = "studio-companion-frame-v1" as const;
export const STUDIO_PEER_COMPANION_MAX_FRAME_BYTES = 16 * 1024 * 1024;

interface StudioPeerCompanionEnvelope {
  readonly wire: typeof STUDIO_PEER_COMPANION_WIRE;
  readonly sessionId: string;
  readonly message: StudioCompanionMessage;
}

export interface StudioPeerCompanionChannelOptions {
  readonly targetSessionId: string;
  readonly companionSessionId: string;
  readonly onError?: (error: Error) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function peerId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u.test(value);
}

function parseEnvelope(value: unknown): StudioPeerCompanionEnvelope | null {
  if (!isRecord(value) || Object.keys(value).length !== 3) return null;
  if (value.wire !== STUDIO_PEER_COMPANION_WIRE
    || !isStudioCompanionSessionId(value.sessionId)) return null;
  const message = parseStudioCompanionMessage(value.message);
  return message ? { wire: STUDIO_PEER_COMPANION_WIRE, sessionId: value.sessionId, message } : null;
}

function frameMessage(message: StudioCompanionMessage): message is Extract<
  StudioCompanionMessage,
  { type: "navigator-frame" | "reference-preview-frame" }
> {
  return message.type === "navigator-frame" || message.type === "reference-preview-frame";
}

function frameHeader(
  message: Extract<StudioCompanionMessage, { type: "navigator-frame" | "reference-preview-frame" }>,
): string | null {
  const { blob: _blob, ...header } = message;
  const encoded = JSON.stringify(header);
  return encoded.length <= 500 ? encoded : null;
}

function parseFrameOffer(
  offer: StudioPeerBulkOffer,
  sessionId: string,
): Omit<Extract<StudioCompanionMessage, {
  type: "navigator-frame" | "reference-preview-frame";
}>, "blob"> | null {
  if (offer.kind !== "reference-capture"
    || offer.byteLength > STUDIO_PEER_COMPANION_MAX_FRAME_BYTES
    || offer.metadata.protocol !== STUDIO_PEER_COMPANION_FRAME_PROTOCOL
    || offer.metadata.sessionId !== sessionId
    || !offer.mimeType.startsWith("image/")) return null;
  const raw = offer.metadata.message;
  if (!raw || raw.length > 500) return null;
  try {
    const header = JSON.parse(raw) as unknown;
    if (!isRecord(header)
      || (header.type !== "navigator-frame" && header.type !== "reference-preview-frame")) return null;
    const candidate = parseStudioCompanionMessage({ ...header, blob: new Blob([], {
      type: offer.mimeType,
    }) });
    return candidate && frameMessage(candidate)
      ? (({ blob: _blob, ...value }) => value)(candidate)
      : null;
  } catch {
    return null;
  }
}

function dispatchMessage(
  channel: StudioPeerCompanionChannel,
  message: StudioCompanionMessage,
): void {
  const listener = channel.onmessage;
  if (!listener) return;
  const event = typeof MessageEvent === "function"
    ? new MessageEvent("message", { data: message })
    : ({ data: message } as MessageEvent);
  try {
    listener(event);
  } catch {
    // A companion observer never owns the shared RTC fabric.
  }
}

export class StudioPeerCompanionChannel implements StudioCompanionChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  private readonly fabric: StudioPeerFabricPort;
  private readonly bulk: StudioPeerBulkExchangePort;
  private readonly targetSessionId: string;
  private readonly sessionId: string;
  private readonly onError: (error: Error) => void;
  private readonly unsubscribeControl: () => void;
  private readonly unregisterBulk: () => void;
  private closed = false;

  constructor(
    fabric: StudioPeerFabricPort,
    bulk: StudioPeerBulkExchangePort,
    options: StudioPeerCompanionChannelOptions,
  ) {
    if (!peerId(options.targetSessionId)
      || !isStudioCompanionSessionId(options.companionSessionId)) {
      throw new TypeError("P2P Companion 대상 또는 세션 식별자가 올바르지 않습니다.");
    }
    this.fabric = fabric;
    this.bulk = bulk;
    this.targetSessionId = options.targetSessionId;
    this.sessionId = options.companionSessionId;
    this.onError = options.onError ?? (() => undefined);
    this.unsubscribeControl = fabric.subscribe("companion-control-v1", (event) => {
      this.receiveControl(event);
    });
    this.unregisterBulk = bulk.register("reference-capture", {
      accept: (sender, offer) => sender.sessionId === this.targetSessionId
        && parseFrameOffer(offer, this.sessionId) !== null,
      receive: (received) => this.receiveFrame(received),
    });
  }

  postMessage(data: unknown): void {
    if (this.closed) return;
    const message = parseStudioCompanionMessage(data);
    if (!message) {
      this.report(new TypeError("P2P Companion 메시지가 올바르지 않습니다."));
      return;
    }
    if (frameMessage(message)) {
      this.sendFrame(message);
      return;
    }
    const payload = JSON.stringify({
      wire: STUDIO_PEER_COMPANION_WIRE,
      sessionId: this.sessionId,
      message,
    } satisfies StudioPeerCompanionEnvelope);
    if (!this.fabric.send(this.targetSessionId, "companion-control-v1", payload, {
      trafficClass: "control",
      ttlMs: 30_000,
    })) this.report(new Error("P2P Companion 명령을 전달하지 못했습니다."));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeControl();
    this.unregisterBulk();
    this.onmessage = null;
  }

  private receiveControl(event: StudioPeerFabricEvent): void {
    if (this.closed || event.sender.sessionId !== this.targetSessionId) return;
    try {
      const envelope = parseEnvelope(JSON.parse(event.payload) as unknown);
      if (!envelope || envelope.sessionId !== this.sessionId) return;
      dispatchMessage(this, envelope.message);
    } catch {
      // Malformed remote packets fail closed.
    }
  }

  private sendFrame(
    message: Extract<StudioCompanionMessage, {
      type: "navigator-frame" | "reference-preview-frame";
    }>,
  ): void {
    const header = frameHeader(message);
    if (!header || message.blob.size < 1
      || message.blob.size > STUDIO_PEER_COMPANION_MAX_FRAME_BYTES) {
      this.report(new TypeError("P2P Companion 프레임이 안전 한도를 벗어났습니다."));
      return;
    }
    void message.blob.arrayBuffer().then((buffer) => this.bulk.send(
      this.targetSessionId,
      {
        kind: "reference-capture",
        name: message.type === "navigator-frame"
          ? "companion-navigator-frame"
          : "companion-reference-frame",
        mimeType: message.blob.type || "image/webp",
        bytes: new Uint8Array(buffer),
        metadata: {
          protocol: STUDIO_PEER_COMPANION_FRAME_PROTOCOL,
          sessionId: this.sessionId,
          message: header,
        },
      },
    )).catch((error: unknown) => {
      this.report(error instanceof Error ? error : new Error("P2P Companion 프레임 전송에 실패했습니다."));
    });
  }

  private receiveFrame(received: StudioPeerBulkReceived): void {
    if (this.closed || received.sender.sessionId !== this.targetSessionId) return;
    const header = parseFrameOffer(received.offer, this.sessionId);
    if (!header) throw new Error("P2P Companion 프레임 헤더가 올바르지 않습니다.");
    const frameBuffer = new ArrayBuffer(received.bytes.byteLength);
    new Uint8Array(frameBuffer).set(received.bytes);
    const message = parseStudioCompanionMessage({
      ...header,
      blob: new Blob([frameBuffer], { type: received.offer.mimeType }),
    });
    if (!message || !frameMessage(message)) {
      throw new Error("P2P Companion 프레임 메시지가 올바르지 않습니다.");
    }
    dispatchMessage(this, message);
  }

  private report(error: Error): void {
    try {
      this.onError(error);
    } catch {
      // Error observers do not own the transport.
    }
  }
}

export function createStudioPeerCompanionChannel(
  fabric: StudioPeerFabricPort,
  bulk: StudioPeerBulkExchangePort,
  options: StudioPeerCompanionChannelOptions,
): StudioCompanionChannel {
  return new StudioPeerCompanionChannel(fabric, bulk, options);
}
