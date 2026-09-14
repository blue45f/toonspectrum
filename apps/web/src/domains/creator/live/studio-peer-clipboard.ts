import type { StudioPeerBulkExchangePort } from "./studio-peer-bulk-exchange";
import type {
  StudioPeerBulkOffer,
  StudioPeerBulkReceived,
  StudioPeerBulkTransferReceipt,
} from "./studio-peer-bulk-transfer";
import type {
  StudioPeerFabricEvent,
  StudioPeerFabricPeer,
  StudioPeerFabricPort,
} from "./studio-peer-fabric";

export const STUDIO_PEER_CLIPBOARD_WIRE = "studio-peer-clipboard-v1" as const;
export const STUDIO_PEER_CLIPBOARD_ATTACHMENT_PROTOCOL = "studio-clipboard-attachment-v1" as const;
export const STUDIO_PEER_CLIPBOARD_KINDS = [
  "scene-ir",
  "element-clip",
  "vrm-pose",
  "camera",
  "palette",
  "brush",
] as const;
export type StudioPeerClipboardKind = (typeof STUDIO_PEER_CLIPBOARD_KINDS)[number];

export interface StudioPeerClipboardAttachmentInput {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface StudioPeerClipboardInput {
  readonly id: string;
  readonly kind: StudioPeerClipboardKind;
  readonly payload: unknown;
  readonly attachments?: readonly StudioPeerClipboardAttachmentInput[];
}

export interface StudioPeerClipboardAttachment {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

export interface StudioPeerClipboardEvent {
  readonly sender: StudioPeerFabricPeer;
  readonly id: string;
  readonly kind: StudioPeerClipboardKind;
  readonly payload: unknown;
  readonly attachments: readonly StudioPeerClipboardAttachment[];
}

export interface StudioPeerClipboardPort {
  send(targetSessionId: string, input: StudioPeerClipboardInput): Promise<readonly StudioPeerBulkTransferReceipt[]>;
  subscribe(listener: (event: StudioPeerClipboardEvent) => void): () => void;
  close(): void;
}

interface ClipboardAttachmentDescriptor {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sha256: string;
}

interface ClipboardEnvelope {
  readonly wire: typeof STUDIO_PEER_CLIPBOARD_WIRE;
  readonly id: string;
  readonly kind: StudioPeerClipboardKind;
  readonly payload: string;
  readonly attachments: readonly ClipboardAttachmentDescriptor[];
}

const KIND_SET = new Set<string>(STUDIO_PEER_CLIPBOARD_KINDS);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_PAYLOAD_BYTES = 20 * 1024;
const MAX_ATTACHMENTS = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function descriptor(value: unknown): ClipboardAttachmentDescriptor | null {
  if (!isRecord(value) || Object.keys(value).length !== 5
    || typeof value.id !== "string" || !ID_PATTERN.test(value.id)
    || typeof value.name !== "string" || value.name.length < 1 || value.name.length > 240
    || typeof value.mimeType !== "string" || value.mimeType.length < 1 || value.mimeType.length > 128
    || !Number.isSafeInteger(value.byteLength) || Number(value.byteLength) < 1
    || typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) return null;
  return {
    id: value.id,
    name: value.name,
    mimeType: value.mimeType,
    byteLength: Number(value.byteLength),
    sha256: value.sha256,
  };
}

function parseEnvelope(value: unknown): ClipboardEnvelope | null {
  if (!isRecord(value) || Object.keys(value).length !== 5
    || value.wire !== STUDIO_PEER_CLIPBOARD_WIRE
    || typeof value.id !== "string" || !ID_PATTERN.test(value.id)
    || typeof value.kind !== "string" || !KIND_SET.has(value.kind)
    || typeof value.payload !== "string" || utf8Bytes(value.payload) > MAX_PAYLOAD_BYTES
    || !Array.isArray(value.attachments) || value.attachments.length > MAX_ATTACHMENTS) return null;
  const attachments = value.attachments.map(descriptor);
  if (attachments.some((entry) => entry === null)) return null;
  return {
    wire: STUDIO_PEER_CLIPBOARD_WIRE,
    id: value.id,
    kind: value.kind as StudioPeerClipboardKind,
    payload: value.payload,
    attachments: attachments as ClipboardAttachmentDescriptor[],
  };
}

export class StudioPeerClipboard implements StudioPeerClipboardPort {
  private readonly listeners = new Set<(event: StudioPeerClipboardEvent) => void>();
  private readonly attachments = new Map<string, Map<string, StudioPeerClipboardAttachment>>();
  private readonly unsubscribeControl: () => void;
  private readonly unregisterAttachments: () => void;
  private closed = false;

  constructor(
    private readonly fabric: StudioPeerFabricPort,
    private readonly bulk: StudioPeerBulkExchangePort,
  ) {
    this.unsubscribeControl = fabric.subscribe("cross-device-clipboard-v1", (event) => {
      this.receiveControl(event);
    });
    this.unregisterAttachments = bulk.register("clipboard-attachment", {
      accept: (_sender, offer) => this.parseAttachmentOffer(offer) !== null,
      receive: (received) => this.receiveAttachment(received),
    });
  }

  async send(
    targetSessionId: string,
    input: StudioPeerClipboardInput,
  ): Promise<readonly StudioPeerBulkTransferReceipt[]> {
    if (this.closed) throw new Error("기기 간 P2P 클립보드가 종료되었습니다.");
    if (!ID_PATTERN.test(input.id) || !KIND_SET.has(input.kind)) {
      throw new TypeError("P2P 클립보드 식별자 또는 종류가 올바르지 않습니다.");
    }
    let payload: string;
    try {
      payload = JSON.stringify(input.payload);
    } catch {
      throw new TypeError("P2P 클립보드 payload를 직렬화할 수 없습니다.");
    }
    if (utf8Bytes(payload) > MAX_PAYLOAD_BYTES) {
      throw new TypeError("P2P 클립보드 payload가 안전 한도를 초과했습니다.");
    }
    const sourceAttachments = [...(input.attachments ?? [])];
    if (sourceAttachments.length > MAX_ATTACHMENTS
      || new Set(sourceAttachments.map((entry) => entry.id)).size !== sourceAttachments.length) {
      throw new TypeError("P2P 클립보드 첨부 수 또는 식별자가 올바르지 않습니다.");
    }
    const receipts: StudioPeerBulkTransferReceipt[] = [];
    const descriptors: ClipboardAttachmentDescriptor[] = [];
    for (const attachment of sourceAttachments) {
      if (!ID_PATTERN.test(attachment.id)
        || typeof attachment.name !== "string" || attachment.name.length < 1 || attachment.name.length > 240
        || typeof attachment.mimeType !== "string" || attachment.mimeType.length < 1 || attachment.mimeType.length > 128
        || !(attachment.bytes instanceof Uint8Array) || attachment.bytes.byteLength < 1) {
        throw new TypeError("P2P 클립보드 첨부가 올바르지 않습니다.");
      }
      const receipt = await this.bulk.send(targetSessionId, {
        kind: "clipboard-attachment",
        name: attachment.name,
        mimeType: attachment.mimeType,
        bytes: attachment.bytes,
        metadata: {
          protocol: STUDIO_PEER_CLIPBOARD_ATTACHMENT_PROTOCOL,
          clipboardId: input.id,
          attachmentId: attachment.id,
        },
      });
      receipts.push(receipt);
      descriptors.push({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        byteLength: attachment.bytes.byteLength,
        sha256: receipt.sha256,
      });
    }
    const envelope: ClipboardEnvelope = {
      wire: STUDIO_PEER_CLIPBOARD_WIRE,
      id: input.id,
      kind: input.kind,
      payload,
      attachments: descriptors,
    };
    if (!this.fabric.send(
      targetSessionId,
      "cross-device-clipboard-v1",
      JSON.stringify(envelope),
      { trafficClass: "control", ttlMs: 30_000 },
    )) throw new Error("P2P 클립보드 메타데이터를 전달하지 못했습니다.");
    return receipts;
  }

  subscribe(listener: (event: StudioPeerClipboardEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeControl();
    this.unregisterAttachments();
    this.listeners.clear();
    this.attachments.clear();
  }

  private parseAttachmentOffer(offer: StudioPeerBulkOffer): {
    clipboardId: string;
    attachmentId: string;
  } | null {
    const clipboardId = offer.metadata.clipboardId;
    const attachmentId = offer.metadata.attachmentId;
    return offer.kind === "clipboard-attachment"
      && offer.metadata.protocol === STUDIO_PEER_CLIPBOARD_ATTACHMENT_PROTOCOL
      && typeof clipboardId === "string" && ID_PATTERN.test(clipboardId)
      && typeof attachmentId === "string" && ID_PATTERN.test(attachmentId)
      ? { clipboardId, attachmentId }
      : null;
  }

  private receiveAttachment(received: StudioPeerBulkReceived): void {
    if (this.closed) return;
    const parsed = this.parseAttachmentOffer(received.offer);
    if (!parsed) throw new Error("P2P 클립보드 첨부 메타데이터가 올바르지 않습니다.");
    const key = `${received.sender.sessionId}:${parsed.clipboardId}`;
    const attachments = this.attachments.get(key) ?? new Map<string, StudioPeerClipboardAttachment>();
    const previous = attachments.get(parsed.attachmentId);
    if (previous && previous.sha256 !== received.offer.sha256) {
      throw new Error("동일한 P2P 클립보드 첨부 ID가 다른 바이트를 가리킵니다.");
    }
    attachments.set(parsed.attachmentId, {
      id: parsed.attachmentId,
      name: received.offer.name,
      mimeType: received.offer.mimeType,
      sha256: received.offer.sha256,
      bytes: received.bytes,
    });
    this.attachments.set(key, attachments);
    while (this.attachments.size > 256) {
      const oldest = this.attachments.keys().next().value;
      if (typeof oldest !== "string") break;
      this.attachments.delete(oldest);
    }
  }

  private receiveControl(event: StudioPeerFabricEvent): void {
    if (this.closed) return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(event.payload) as unknown;
    } catch {
      return;
    }
    const envelope = parseEnvelope(candidate);
    if (!envelope) return;
    let payload: unknown;
    try {
      payload = JSON.parse(envelope.payload) as unknown;
    } catch {
      return;
    }
    const key = `${event.sender.sessionId}:${envelope.id}`;
    const stored = this.attachments.get(key) ?? new Map<string, StudioPeerClipboardAttachment>();
    const attachments: StudioPeerClipboardAttachment[] = [];
    for (const expected of envelope.attachments) {
      const actual = stored.get(expected.id);
      if (!actual
        || actual.name !== expected.name
        || actual.mimeType !== expected.mimeType
        || actual.bytes.byteLength !== expected.byteLength
        || actual.sha256 !== expected.sha256) return;
      attachments.push(actual);
    }
    this.attachments.delete(key);
    const received: StudioPeerClipboardEvent = {
      sender: event.sender,
      id: envelope.id,
      kind: envelope.kind,
      payload,
      attachments: Object.freeze(attachments),
    };
    for (const listener of this.listeners) {
      try {
        listener(received);
      } catch {
        // Clipboard observers never own the peer transport.
      }
    }
  }
}

export function createStudioPeerClipboard(
  fabric: StudioPeerFabricPort,
  bulk: StudioPeerBulkExchangePort,
): StudioPeerClipboardPort {
  return new StudioPeerClipboard(fabric, bulk);
}
