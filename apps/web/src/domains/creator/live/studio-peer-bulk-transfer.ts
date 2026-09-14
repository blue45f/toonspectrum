import type {
  StudioPeerFabricEvent,
  StudioPeerFabricPeer,
  StudioPeerFabricPort,
} from "./studio-peer-fabric";

export const STUDIO_PEER_BULK_WIRE = "studio-peer-bulk-v1" as const;
export const STUDIO_PEER_BULK_DEFAULT_CHUNK_BYTES = 24 * 1024;
export const STUDIO_PEER_BULK_MAX_CHUNK_BYTES = 32 * 1024;
export const STUDIO_PEER_BULK_MAX_BYTES = 256 * 1024 * 1024;
export const STUDIO_PEER_BULK_MAX_CHUNKS = 16_384;
export const STUDIO_PEER_BULK_SEND_WINDOW = 8;

export const STUDIO_PEER_BULK_KINDS = [
  "work-asset",
  "recovery-package",
  "library-cas",
  "clipboard-attachment",
  "reference-capture",
  "compute-input",
  "compute-output",
  "render-output",
] as const;
export type StudioPeerBulkKind = (typeof STUDIO_PEER_BULK_KINDS)[number];

export interface StudioPeerBulkOffer {
  readonly transferId: string;
  readonly kind: StudioPeerBulkKind;
  readonly name: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly chunkSize: number;
  readonly chunkCount: number;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface StudioPeerBulkSendInput {
  readonly kind: StudioPeerBulkKind;
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface StudioPeerBulkReceived {
  readonly sender: StudioPeerFabricPeer;
  readonly offer: StudioPeerBulkOffer;
  readonly bytes: Uint8Array;
}

export interface StudioPeerBulkTransferReceipt {
  readonly transferId: string;
  readonly targetSessionId: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface StudioPeerBulkTransferOptions {
  readonly maximumIncomingBytes?: number;
  readonly chunkSize?: number;
  readonly transferTimeoutMs?: number;
  readonly now?: () => number;
  readonly randomId?: () => string;
  readonly setTimeout?: (handler: () => void, delay: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
  readonly onOffer?: (
    sender: StudioPeerFabricPeer,
    offer: StudioPeerBulkOffer,
  ) => boolean | Promise<boolean>;
  readonly onReceive?: (received: StudioPeerBulkReceived) => void | Promise<void>;
}

type StudioPeerBulkMessage =
  | ({ readonly type: "offer" } & StudioPeerBulkOffer)
  | { readonly type: "accept"; readonly transferId: string }
  | { readonly type: "reject"; readonly transferId: string; readonly reason: string }
  | {
      readonly type: "chunk";
      readonly transferId: string;
      readonly index: number;
      readonly data: string;
    }
  | { readonly type: "ack"; readonly transferId: string; readonly index: number }
  | { readonly type: "complete"; readonly transferId: string; readonly sha256: string }
  | {
      readonly type: "receipt";
      readonly transferId: string;
      readonly status: "completed" | "failed";
      readonly reason?: string;
    }
  | { readonly type: "cancel"; readonly transferId: string; readonly reason: string };

interface OutgoingTransfer {
  readonly targetSessionId: string;
  readonly offer: StudioPeerBulkOffer;
  readonly bytes: Uint8Array;
  readonly resolve: (receipt: StudioPeerBulkTransferReceipt) => void;
  readonly reject: (error: Error) => void;
  readonly inFlight: Set<number>;
  nextIndex: number;
  accepted: boolean;
  completeSent: boolean;
  timer: unknown;
  pumpTimer: unknown | null;
}

interface IncomingTransfer {
  readonly sender: StudioPeerFabricPeer;
  readonly offer: StudioPeerBulkOffer;
  readonly chunks: Array<Uint8Array | null>;
  receivedBytes: number;
  timer: unknown;
}

const BULK_KIND_SET = new Set<string>(STUDIO_PEER_BULK_KINDS);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MIME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+/-]{0,127}$/u;
const METADATA_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validMetadata(value: unknown): value is Readonly<Record<string, string>> {
  if (!isRecord(value) || Object.keys(value).length > 16) return false;
  return Object.entries(value).every(([key, entry]) =>
    METADATA_KEY_PATTERN.test(key)
    && typeof entry === "string"
    && entry.length <= 500
  );
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array | null {
  if (!BASE64_PATTERN.test(value)) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("이 브라우저는 SHA-256 검증을 지원하지 않습니다.");
  const exact = new Uint8Array(bytes.byteLength);
  exact.set(bytes);
  const digest = await subtle.digest("SHA-256", exact);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

function defaultTransferId(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value || !ID_PATTERN.test(value)) {
    throw new Error("P2P 전송 식별자를 안전하게 생성할 수 없습니다.");
  }
  return value;
}

function parseOffer(value: Record<string, unknown>): StudioPeerBulkOffer | null {
  const byteLength = Number(value.byteLength);
  const chunkSize = Number(value.chunkSize);
  const chunkCount = Number(value.chunkCount);
  if (
    typeof value.transferId !== "string" || !ID_PATTERN.test(value.transferId)
    || typeof value.kind !== "string" || !BULK_KIND_SET.has(value.kind)
    || typeof value.name !== "string" || value.name.length < 1 || value.name.length > 240
    || typeof value.mimeType !== "string" || !MIME_PATTERN.test(value.mimeType)
    || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > STUDIO_PEER_BULK_MAX_BYTES
    || typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)
    || !Number.isSafeInteger(chunkSize) || chunkSize < 1024 || chunkSize > STUDIO_PEER_BULK_MAX_CHUNK_BYTES
    || !Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > STUDIO_PEER_BULK_MAX_CHUNKS
    || chunkCount !== Math.ceil(byteLength / chunkSize)
    || !validMetadata(value.metadata)
  ) return null;
  return {
    transferId: value.transferId,
    kind: value.kind as StudioPeerBulkKind,
    name: value.name,
    mimeType: value.mimeType,
    byteLength,
    sha256: value.sha256,
    chunkSize,
    chunkCount,
    metadata: Object.freeze({ ...value.metadata }),
  };
}

function parseBulkMessage(value: unknown): StudioPeerBulkMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const transferId = value.transferId;
  if (typeof transferId !== "string" || !ID_PATTERN.test(transferId)) return null;
  switch (value.type) {
    case "offer": {
      if (!exactKeys(value, [
        "type", "transferId", "kind", "name", "mimeType", "byteLength",
        "sha256", "chunkSize", "chunkCount", "metadata",
      ])) return null;
      const offer = parseOffer(value);
      return offer ? { type: "offer", ...offer } : null;
    }
    case "accept":
      return exactKeys(value, ["type", "transferId"])
        ? { type: "accept", transferId }
        : null;
    case "reject":
    case "cancel":
      return exactKeys(value, ["type", "transferId", "reason"])
        && typeof value.reason === "string"
        && value.reason.length > 0 && value.reason.length <= 240
        ? { type: value.type, transferId, reason: value.reason }
        : null;
    case "chunk":
      return exactKeys(value, ["type", "transferId", "index", "data"])
        && Number.isSafeInteger(value.index) && Number(value.index) >= 0
        && Number(value.index) < STUDIO_PEER_BULK_MAX_CHUNKS
        && typeof value.data === "string"
        && value.data.length <= Math.ceil(STUDIO_PEER_BULK_MAX_CHUNK_BYTES / 3) * 4
        && BASE64_PATTERN.test(value.data)
        ? { type: "chunk", transferId, index: Number(value.index), data: value.data }
        : null;
    case "ack":
      return exactKeys(value, ["type", "transferId", "index"])
        && Number.isSafeInteger(value.index) && Number(value.index) >= 0
        && Number(value.index) < STUDIO_PEER_BULK_MAX_CHUNKS
        ? { type: "ack", transferId, index: Number(value.index) }
        : null;
    case "complete":
      return exactKeys(value, ["type", "transferId", "sha256"])
        && typeof value.sha256 === "string" && SHA256_PATTERN.test(value.sha256)
        ? { type: "complete", transferId, sha256: value.sha256 }
        : null;
    case "receipt": {
      const keys = value.reason === undefined
        ? ["type", "transferId", "status"]
        : ["type", "transferId", "status", "reason"];
      if (!exactKeys(value, keys)
        || (value.status !== "completed" && value.status !== "failed")
        || (value.reason !== undefined
          && (typeof value.reason !== "string" || value.reason.length > 240))) return null;
      return {
        type: "receipt",
        transferId,
        status: value.status,
        ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
      };
    }
    default:
      return null;
  }
}

export interface StudioPeerBulkTransferPort {
  send(targetSessionId: string, input: StudioPeerBulkSendInput): Promise<StudioPeerBulkTransferReceipt>;
  cancel(transferId: string, reason?: string): boolean;
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const RETRY_DELAY_MS = 25;

/** RTC-only bulk transfer. A completed peer receipt is never a durable save acknowledgement. */
export class StudioPeerBulkTransfer implements StudioPeerBulkTransferPort {
  private readonly maximumIncomingBytes: number;
  private readonly chunkSize: number;
  private readonly transferTimeoutMs: number;
  private readonly now: () => number;
  private readonly makeId: () => string;
  private readonly schedule: (handler: () => void, delay: number) => unknown;
  private readonly cancelSchedule: (handle: unknown) => void;
  private readonly onOffer: NonNullable<StudioPeerBulkTransferOptions["onOffer"]>;
  private readonly onReceive: NonNullable<StudioPeerBulkTransferOptions["onReceive"]>;
  private readonly outgoing = new Map<string, OutgoingTransfer>();
  private readonly incoming = new Map<string, IncomingTransfer>();
  private readonly pendingOffers = new Set<string>();
  private readonly completing = new Set<string>();
  private readonly completed = new Map<string, {
    status: "completed" | "failed";
    reason?: string;
    expiresAt: number;
  }>();
  private unsubscribe: (() => void) | null;
  private closed = false;

  constructor(
    private readonly fabric: StudioPeerFabricPort,
    options: StudioPeerBulkTransferOptions = {},
  ) {
    const maximum = Number(options.maximumIncomingBytes);
    this.maximumIncomingBytes = Number.isSafeInteger(maximum)
      ? Math.max(1, Math.min(STUDIO_PEER_BULK_MAX_BYTES, maximum))
      : STUDIO_PEER_BULK_MAX_BYTES;
    const chunk = Number(options.chunkSize);
    this.chunkSize = Number.isSafeInteger(chunk)
      ? Math.max(1024, Math.min(STUDIO_PEER_BULK_MAX_CHUNK_BYTES, chunk))
      : STUDIO_PEER_BULK_DEFAULT_CHUNK_BYTES;
    const timeout = Number(options.transferTimeoutMs);
    this.transferTimeoutMs = Number.isSafeInteger(timeout)
      ? Math.max(5_000, Math.min(5 * 60_000, timeout))
      : DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.makeId = options.randomId ?? defaultTransferId;
    this.schedule = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelSchedule = options.clearTimeout ?? ((handle: unknown) => {
      globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
    });
    this.onOffer = options.onOffer ?? (() => true);
    this.onReceive = options.onReceive ?? (() => undefined);
    this.unsubscribe = fabric.subscribe("bulk-transfer-v1", (event) => {
      void this.receive(event).catch(() => undefined);
    });
  }

  async send(
    targetSessionId: string,
    input: StudioPeerBulkSendInput,
  ): Promise<StudioPeerBulkTransferReceipt> {
    if (this.closed) throw new Error("P2P 전송 채널이 종료되었습니다.");
    if (!this.fabric.getPeers("bulk-transfer-v1").some(
      (peer) => peer.sessionId === targetSessionId,
    )) throw new Error("상대 기기가 P2P 대용량 전송을 지원하지 않습니다.");
    if (!BULK_KIND_SET.has(input.kind)
      || typeof input.name !== "string" || input.name.length < 1 || input.name.length > 240
      || typeof input.mimeType !== "string" || !MIME_PATTERN.test(input.mimeType)
      || !(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1
      || input.bytes.byteLength > STUDIO_PEER_BULK_MAX_BYTES
      || !validMetadata(input.metadata ?? {})) {
      throw new TypeError("P2P 전송 입력이 안전 한도를 벗어났습니다.");
    }
    const bytes = new Uint8Array(input.bytes.byteLength);
    bytes.set(input.bytes);
    const sha256 = await sha256Hex(bytes);
    const transferId = this.makeId();
    if (!ID_PATTERN.test(transferId) || this.outgoing.has(transferId)) {
      throw new Error("P2P 전송 식별자가 올바르지 않거나 중복되었습니다.");
    }
    const offer: StudioPeerBulkOffer = {
      transferId,
      kind: input.kind,
      name: input.name,
      mimeType: input.mimeType,
      byteLength: bytes.byteLength,
      sha256,
      chunkSize: this.chunkSize,
      chunkCount: Math.ceil(bytes.byteLength / this.chunkSize),
      metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    };
    if (!parseOffer(offer as unknown as Record<string, unknown>)) {
      throw new TypeError("P2P 전송 제안이 안전 계약을 통과하지 못했습니다.");
    }
    return new Promise((resolve, reject) => {
      const transfer: OutgoingTransfer = {
        targetSessionId,
        offer,
        bytes,
        resolve,
        reject,
        inFlight: new Set(),
        nextIndex: 0,
        accepted: false,
        completeSent: false,
        timer: 0,
        pumpTimer: null,
      };
      transfer.timer = this.schedule(
        () => this.failOutgoing(transferId, "P2P 전송 시간이 초과되었습니다.", true),
        this.transferTimeoutMs,
      );
      this.outgoing.set(transferId, transfer);
      if (!this.sendMessage(targetSessionId, { type: "offer", ...offer })) {
        this.failOutgoing(transferId, "P2P 전송 제안을 전달하지 못했습니다.", false);
      }
    });
  }

  cancel(transferId: string, reason = "사용자가 P2P 전송을 취소했습니다."): boolean {
    if (!this.outgoing.has(transferId)) return false;
    this.failOutgoing(transferId, reason, true);
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const transferId of [...this.outgoing.keys()]) {
      this.failOutgoing(transferId, "P2P 전송 채널이 종료되었습니다.", false);
    }
    for (const [key, transfer] of this.incoming) {
      this.cancelSchedule(transfer.timer);
      this.sendMessage(transfer.sender.sessionId, {
        type: "cancel",
        transferId: transfer.offer.transferId,
        reason: "P2P 전송 채널이 종료되었습니다.",
      });
      this.incoming.delete(key);
    }
    this.pendingOffers.clear();
    this.completing.clear();
    this.completed.clear();
  }

  private sendMessage(targetSessionId: string, message: StudioPeerBulkMessage): boolean {
    return this.fabric.send(
      targetSessionId,
      "bulk-transfer-v1",
      JSON.stringify(message),
      { trafficClass: "bulk", ttlMs: this.transferTimeoutMs },
    );
  }

  private async receive(event: StudioPeerFabricEvent): Promise<void> {
    if (this.closed || event.capability !== "bulk-transfer-v1") return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(event.payload) as unknown;
    } catch {
      return;
    }
    const message = parseBulkMessage(candidate);
    if (!message) return;
    this.pruneCompleted();
    switch (message.type) {
      case "offer":
        await this.receiveOffer(event.sender, message);
        break;
      case "accept":
        this.receiveAccept(event.sender, message.transferId);
        break;
      case "reject":
      case "cancel":
        this.receiveFailure(event.sender, message.transferId, message.reason);
        break;
      case "chunk":
        this.receiveChunk(event.sender, message);
        break;
      case "ack":
        this.receiveAck(event.sender, message.transferId, message.index);
        break;
      case "complete":
        await this.receiveComplete(event.sender, message.transferId, message.sha256);
        break;
      case "receipt":
        this.receiveReceipt(event.sender, message);
        break;
    }
  }

  private async receiveOffer(
    sender: StudioPeerFabricPeer,
    offer: StudioPeerBulkOffer,
  ): Promise<void> {
    const key = `${sender.sessionId}:${offer.transferId}`;
    if (this.incoming.has(key)) {
      this.sendMessage(sender.sessionId, { type: "accept", transferId: offer.transferId });
      return;
    }
    if (this.pendingOffers.has(key)) return;
    if (offer.byteLength > this.maximumIncomingBytes) {
      this.sendMessage(sender.sessionId, {
        type: "reject",
        transferId: offer.transferId,
        reason: "수신 허용 크기를 초과했습니다.",
      });
      return;
    }
    this.pendingOffers.add(key);
    let accepted = false;
    try {
      accepted = await this.onOffer(sender, offer);
    } catch {
      // Reject below; feature callbacks never own the shared peer channel.
    } finally {
      this.pendingOffers.delete(key);
    }
    if (this.closed) return;
    if (!accepted) {
      this.sendMessage(sender.sessionId, {
        type: "reject",
        transferId: offer.transferId,
        reason: "상대 기기가 P2P 전송을 거절했습니다.",
      });
      return;
    }
    const transfer: IncomingTransfer = {
      sender: { ...sender, capabilities: Object.freeze([...sender.capabilities]) },
      offer: { ...offer, metadata: Object.freeze({ ...offer.metadata }) },
      chunks: Array.from({ length: offer.chunkCount }, () => null),
      receivedBytes: 0,
      timer: 0,
    };
    transfer.timer = this.schedule(
      () => this.failIncoming(key, "P2P 수신 시간이 초과되었습니다.", true),
      this.transferTimeoutMs,
    );
    this.incoming.set(key, transfer);
    if (!this.sendMessage(sender.sessionId, { type: "accept", transferId: offer.transferId })) {
      this.failIncoming(key, "P2P 수신 승인을 전달하지 못했습니다.", false);
    }
  }

  private receiveAccept(sender: StudioPeerFabricPeer, transferId: string): void {
    const transfer = this.outgoing.get(transferId);
    if (!transfer || transfer.targetSessionId !== sender.sessionId) return;
    transfer.accepted = true;
    this.touchOutgoing(transferId, transfer);
    this.pump(transferId, transfer);
  }

  private receiveFailure(
    sender: StudioPeerFabricPeer,
    transferId: string,
    reason: string,
  ): void {
    const outgoing = this.outgoing.get(transferId);
    if (outgoing?.targetSessionId === sender.sessionId) {
      this.failOutgoing(transferId, reason, false);
      return;
    }
    const key = `${sender.sessionId}:${transferId}`;
    if (this.incoming.has(key)) this.failIncoming(key, reason, false);
  }

  private receiveChunk(
    sender: StudioPeerFabricPeer,
    message: Extract<StudioPeerBulkMessage, { type: "chunk" }>,
  ): void {
    const key = `${sender.sessionId}:${message.transferId}`;
    const transfer = this.incoming.get(key);
    if (!transfer || this.completing.has(key) || message.index >= transfer.offer.chunkCount) return;
    const decoded = decodeBase64(message.data);
    const expectedLength = message.index === transfer.offer.chunkCount - 1
      ? transfer.offer.byteLength - message.index * transfer.offer.chunkSize
      : transfer.offer.chunkSize;
    if (!decoded || decoded.byteLength !== expectedLength) {
      this.failIncoming(key, "P2P 청크 크기 또는 인코딩이 올바르지 않습니다.", true);
      return;
    }
    const existing = transfer.chunks[message.index];
    if (existing) {
      if (!existing.every((value, index) => value === decoded[index])) {
        this.failIncoming(key, "동일한 P2P 청크가 다른 바이트로 재전송되었습니다.", true);
        return;
      }
    } else {
      transfer.chunks[message.index] = decoded;
      transfer.receivedBytes += decoded.byteLength;
    }
    if (transfer.receivedBytes > transfer.offer.byteLength) {
      this.failIncoming(key, "P2P 수신 바이트가 선언 크기를 초과했습니다.", true);
      return;
    }
    this.touchIncoming(key, transfer);
    const ack = () => this.sendMessage(sender.sessionId, {
      type: "ack",
      transferId: message.transferId,
      index: message.index,
    });
    if (!ack()) {
      this.schedule(() => {
        if (this.incoming.has(key)) ack();
      }, RETRY_DELAY_MS);
    }
  }

  private receiveAck(
    sender: StudioPeerFabricPeer,
    transferId: string,
    index: number,
  ): void {
    const transfer = this.outgoing.get(transferId);
    if (!transfer || transfer.targetSessionId !== sender.sessionId) return;
    if (transfer.inFlight.delete(index)) this.touchOutgoing(transferId, transfer);
    this.pump(transferId, transfer);
  }

  private async receiveComplete(
    sender: StudioPeerFabricPeer,
    transferId: string,
    declaredSha256: string,
  ): Promise<void> {
    const key = `${sender.sessionId}:${transferId}`;
    const previous = this.completed.get(key);
    if (previous) {
      this.sendMessage(sender.sessionId, {
        type: "receipt",
        transferId,
        status: previous.status,
        ...(previous.reason ? { reason: previous.reason } : {}),
      });
      return;
    }
    const transfer = this.incoming.get(key);
    if (!transfer || this.completing.has(key)) return;
    if (declaredSha256 !== transfer.offer.sha256
      || transfer.receivedBytes !== transfer.offer.byteLength
      || transfer.chunks.some((chunk) => chunk === null)) {
      this.failIncoming(key, "P2P 완료 정보가 수신 상태와 일치하지 않습니다.", true);
      return;
    }
    this.completing.add(key);
    this.touchIncoming(key, transfer);
    const bytes = new Uint8Array(transfer.offer.byteLength);
    let offset = 0;
    for (const chunk of transfer.chunks) {
      if (!chunk) return;
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let status: "completed" | "failed" = "completed";
    let reason: string | undefined;
    try {
      if (await sha256Hex(bytes) !== transfer.offer.sha256) {
        throw new Error("수신한 P2P 파일의 SHA-256이 일치하지 않습니다.");
      }
      await this.onReceive({ sender: transfer.sender, offer: transfer.offer, bytes });
    } catch (error) {
      status = "failed";
      reason = error instanceof Error ? error.message : "P2P 수신 처리에 실패했습니다.";
    }
    if (this.closed || this.incoming.get(key) !== transfer) return;
    this.cancelSchedule(transfer.timer);
    this.incoming.delete(key);
    this.completing.delete(key);
    const boundedReason = reason?.slice(0, 240);
    this.completed.set(key, {
      status,
      ...(boundedReason ? { reason: boundedReason } : {}),
      expiresAt: this.now() + this.transferTimeoutMs,
    });
    this.pruneCompleted();
    this.sendMessage(sender.sessionId, {
      type: "receipt",
      transferId,
      status,
      ...(boundedReason ? { reason: boundedReason } : {}),
    });
  }

  private receiveReceipt(
    sender: StudioPeerFabricPeer,
    message: Extract<StudioPeerBulkMessage, { type: "receipt" }>,
  ): void {
    const transfer = this.outgoing.get(message.transferId);
    if (!transfer || transfer.targetSessionId !== sender.sessionId) return;
    if (message.status === "failed") {
      this.failOutgoing(
        message.transferId,
        message.reason || "상대 기기가 P2P 수신을 완료하지 못했습니다.",
        false,
      );
      return;
    }
    this.cleanupOutgoing(message.transferId, transfer);
    transfer.resolve({
      transferId: message.transferId,
      targetSessionId: sender.sessionId,
      byteLength: transfer.offer.byteLength,
      sha256: transfer.offer.sha256,
    });
  }

  private pump(transferId: string, transfer: OutgoingTransfer): void {
    if (this.closed || this.outgoing.get(transferId) !== transfer || !transfer.accepted) return;
    if (transfer.pumpTimer !== null) {
      this.cancelSchedule(transfer.pumpTimer);
      transfer.pumpTimer = null;
    }
    let blocked = false;
    while (transfer.inFlight.size < STUDIO_PEER_BULK_SEND_WINDOW
      && transfer.nextIndex < transfer.offer.chunkCount) {
      const index = transfer.nextIndex;
      const start = index * transfer.offer.chunkSize;
      const end = Math.min(start + transfer.offer.chunkSize, transfer.bytes.byteLength);
      transfer.inFlight.add(index);
      transfer.nextIndex += 1;
      if (!this.sendMessage(transfer.targetSessionId, {
        type: "chunk",
        transferId,
        index,
        data: encodeBase64(transfer.bytes.subarray(start, end)),
      })) {
        transfer.inFlight.delete(index);
        transfer.nextIndex = index;
        blocked = true;
        break;
      }
    }
    if (transfer.nextIndex === transfer.offer.chunkCount
      && transfer.inFlight.size === 0 && !transfer.completeSent) {
      if (this.sendMessage(transfer.targetSessionId, {
        type: "complete",
        transferId,
        sha256: transfer.offer.sha256,
      })) {
        transfer.completeSent = true;
        this.touchOutgoing(transferId, transfer);
      } else {
        blocked = true;
      }
    }
    if (blocked && this.outgoing.get(transferId) === transfer) {
      transfer.pumpTimer = this.schedule(() => {
        transfer.pumpTimer = null;
        this.pump(transferId, transfer);
      }, RETRY_DELAY_MS);
    }
  }

  private touchOutgoing(transferId: string, transfer: OutgoingTransfer): void {
    this.cancelSchedule(transfer.timer);
    transfer.timer = this.schedule(
      () => this.failOutgoing(transferId, "P2P 전송 시간이 초과되었습니다.", true),
      this.transferTimeoutMs,
    );
  }

  private touchIncoming(key: string, transfer: IncomingTransfer): void {
    this.cancelSchedule(transfer.timer);
    transfer.timer = this.schedule(
      () => this.failIncoming(key, "P2P 수신 시간이 초과되었습니다.", true),
      this.transferTimeoutMs,
    );
  }

  private cleanupOutgoing(transferId: string, transfer: OutgoingTransfer): void {
    this.cancelSchedule(transfer.timer);
    if (transfer.pumpTimer !== null) this.cancelSchedule(transfer.pumpTimer);
    this.outgoing.delete(transferId);
  }

  private failOutgoing(transferId: string, reason: string, notify: boolean): void {
    const transfer = this.outgoing.get(transferId);
    if (!transfer) return;
    this.cleanupOutgoing(transferId, transfer);
    if (notify && !this.closed) {
      this.sendMessage(transfer.targetSessionId, {
        type: "cancel",
        transferId,
        reason: reason.slice(0, 240),
      });
    }
    transfer.reject(new Error(reason));
  }

  private failIncoming(key: string, reason: string, notify: boolean): void {
    const transfer = this.incoming.get(key);
    if (!transfer) return;
    this.cancelSchedule(transfer.timer);
    this.incoming.delete(key);
    this.completing.delete(key);
    if (notify && !this.closed) {
      this.sendMessage(transfer.sender.sessionId, {
        type: "receipt",
        transferId: transfer.offer.transferId,
        status: "failed",
        reason: reason.slice(0, 240),
      });
    }
  }

  private pruneCompleted(): void {
    const now = this.now();
    for (const [key, value] of this.completed) {
      if (value.expiresAt < now) this.completed.delete(key);
    }
    while (this.completed.size > 256) {
      const oldest = this.completed.keys().next().value;
      if (typeof oldest !== "string") break;
      this.completed.delete(oldest);
    }
  }
}

export function createStudioPeerBulkTransfer(
  fabric: StudioPeerFabricPort,
  options: StudioPeerBulkTransferOptions = {},
): StudioPeerBulkTransferPort {
  return new StudioPeerBulkTransfer(fabric, options);
}
