import type { StudioPeerBulkExchangePort } from "./studio-peer-bulk-exchange";
import type { StudioPeerBulkReceived, StudioPeerBulkTransferReceipt } from "./studio-peer-bulk-transfer";
import type {
  StudioPeerFabricBroadcastResult,
  StudioPeerFabricEvent,
  StudioPeerFabricPeer,
  StudioPeerFabricPort,
} from "./studio-peer-fabric";

export const STUDIO_PEER_MOBILE_REFERENCE_WIRE = "studio-peer-mobile-reference-v1" as const;
export const STUDIO_PEER_MOBILE_SNAPSHOT_PROTOCOL = "studio-mobile-reference-snapshot-v1" as const;
export const STUDIO_PEER_MOBILE_MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;

export interface StudioPeerPoseLandmark {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly confidence: number;
}

export interface StudioPeerPosePacket {
  readonly wire: typeof STUDIO_PEER_MOBILE_REFERENCE_WIRE;
  readonly frame: number;
  readonly capturedAt: number;
  readonly landmarks: readonly StudioPeerPoseLandmark[];
}

export interface StudioPeerPoseEvent {
  readonly sender: StudioPeerFabricPeer;
  readonly packet: StudioPeerPosePacket;
}

export interface StudioPeerReferenceSnapshot {
  readonly sender: StudioPeerFabricPeer;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly label: string;
}

export interface StudioPeerMobileReferencePort {
  publishLandmarks(packet: Omit<StudioPeerPosePacket, "wire">): StudioPeerFabricBroadcastResult;
  sendSnapshot(
    targetSessionId: string,
    input: { readonly bytes: Uint8Array; readonly mimeType: string; readonly label?: string },
  ): Promise<StudioPeerBulkTransferReceipt>;
  subscribeLandmarks(listener: (event: StudioPeerPoseEvent) => void): () => void;
  subscribeSnapshots(listener: (event: StudioPeerReferenceSnapshot) => void): () => void;
  close(): void;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function landmark(value: unknown): StudioPeerPoseLandmark | null {
  if (!isRecord(value) || Object.keys(value).some((key) =>
    !["id", "x", "y", "z", "confidence"].includes(key)
  ) || typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return null;
  const coordinates = [value.x, value.y, value.z ?? 0];
  if (!coordinates.every((entry) => typeof entry === "number"
    && Number.isFinite(entry) && Math.abs(entry) <= 4)
    || typeof value.confidence !== "number"
    || !Number.isFinite(value.confidence)
    || value.confidence < 0 || value.confidence > 1) return null;
  return {
    id: value.id,
    x: value.x as number,
    y: value.y as number,
    ...(value.z === undefined ? {} : { z: value.z as number }),
    confidence: value.confidence,
  };
}

export function parseStudioPeerPosePacket(value: unknown): StudioPeerPosePacket | null {
  if (!isRecord(value) || Object.keys(value).length !== 4
    || value.wire !== STUDIO_PEER_MOBILE_REFERENCE_WIRE
    || !Number.isSafeInteger(value.frame) || Number(value.frame) < 0
    || typeof value.capturedAt !== "number" || !Number.isFinite(value.capturedAt)
    || !Array.isArray(value.landmarks) || value.landmarks.length > 128) return null;
  const parsed = value.landmarks.map(landmark);
  if (parsed.some((entry) => entry === null)) return null;
  return {
    wire: STUDIO_PEER_MOBILE_REFERENCE_WIRE,
    frame: Number(value.frame),
    capturedAt: value.capturedAt,
    landmarks: Object.freeze(parsed as StudioPeerPoseLandmark[]),
  };
}

function snapshotOffer(offer: StudioPeerBulkReceived["offer"]): boolean {
  return offer.kind === "reference-capture"
    && offer.metadata.protocol === STUDIO_PEER_MOBILE_SNAPSHOT_PROTOCOL
    && offer.byteLength <= STUDIO_PEER_MOBILE_MAX_SNAPSHOT_BYTES
    && offer.mimeType.startsWith("image/");
}

export class StudioPeerMobileReference implements StudioPeerMobileReferencePort {
  private readonly landmarkListeners = new Set<(event: StudioPeerPoseEvent) => void>();
  private readonly snapshotListeners = new Set<(event: StudioPeerReferenceSnapshot) => void>();
  private readonly lastFrame = new Map<string, number>();
  private readonly unsubscribeLandmarks: () => void;
  private readonly unregisterSnapshots: () => void;
  private closed = false;

  constructor(
    private readonly fabric: StudioPeerFabricPort,
    private readonly bulk: StudioPeerBulkExchangePort,
  ) {
    this.unsubscribeLandmarks = fabric.subscribe("mobile-reference-camera-v1", (event) => {
      this.receiveLandmarks(event);
    });
    this.unregisterSnapshots = bulk.register("reference-capture", {
      accept: (_sender, offer) => snapshotOffer(offer),
      receive: (received) => this.receiveSnapshot(received),
    });
  }

  publishLandmarks(
    input: Omit<StudioPeerPosePacket, "wire">,
  ): StudioPeerFabricBroadcastResult {
    if (this.closed) return { targets: [], sent: [], failed: [] };
    const packet = parseStudioPeerPosePacket({
      ...input,
      wire: STUDIO_PEER_MOBILE_REFERENCE_WIRE,
    });
    if (!packet) return { targets: [], sent: [], failed: [] };
    return this.fabric.broadcast(
      "mobile-reference-camera-v1",
      JSON.stringify(packet),
      { trafficClass: "realtime", ttlMs: 1_000 },
    );
  }

  sendSnapshot(
    targetSessionId: string,
    input: { readonly bytes: Uint8Array; readonly mimeType: string; readonly label?: string },
  ): Promise<StudioPeerBulkTransferReceipt> {
    if (this.closed) return Promise.reject(new Error("모바일 참고자료 P2P 세션이 종료되었습니다."));
    if (!(input.bytes instanceof Uint8Array)
      || input.bytes.byteLength < 1
      || input.bytes.byteLength > STUDIO_PEER_MOBILE_MAX_SNAPSHOT_BYTES
      || !input.mimeType.startsWith("image/")) {
      return Promise.reject(new TypeError("모바일 참고 이미지가 안전 한도를 벗어났습니다."));
    }
    return this.bulk.send(targetSessionId, {
      kind: "reference-capture",
      name: "mobile-reference-capture",
      mimeType: input.mimeType,
      bytes: input.bytes,
      metadata: {
        protocol: STUDIO_PEER_MOBILE_SNAPSHOT_PROTOCOL,
        label: (input.label ?? "모바일 참고 이미지").slice(0, 200),
      },
    });
  }

  subscribeLandmarks(listener: (event: StudioPeerPoseEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.landmarkListeners.add(listener);
    return () => this.landmarkListeners.delete(listener);
  }

  subscribeSnapshots(listener: (event: StudioPeerReferenceSnapshot) => void): () => void {
    if (this.closed) return () => undefined;
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeLandmarks();
    this.unregisterSnapshots();
    this.landmarkListeners.clear();
    this.snapshotListeners.clear();
    this.lastFrame.clear();
  }

  private receiveLandmarks(event: StudioPeerFabricEvent): void {
    if (this.closed) return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(event.payload) as unknown;
    } catch {
      return;
    }
    const packet = parseStudioPeerPosePacket(candidate);
    const previous = this.lastFrame.get(event.sender.sessionId) ?? -1;
    if (!packet || packet.frame <= previous) return;
    this.lastFrame.set(event.sender.sessionId, packet.frame);
    const received: StudioPeerPoseEvent = { sender: event.sender, packet };
    for (const listener of this.landmarkListeners) {
      try {
        listener(received);
      } catch {
        // Landmark observers never own the camera or peer session.
      }
    }
  }

  private receiveSnapshot(received: StudioPeerBulkReceived): void {
    if (this.closed || !snapshotOffer(received.offer)) return;
    const event: StudioPeerReferenceSnapshot = {
      sender: received.sender,
      mimeType: received.offer.mimeType,
      bytes: received.bytes,
      label: received.offer.metadata.label ?? "모바일 참고 이미지",
    };
    for (const listener of this.snapshotListeners) {
      try {
        listener(event);
      } catch {
        // Snapshot observers do not own the shared bulk exchange.
      }
    }
  }
}

export function createStudioPeerMobileReference(
  fabric: StudioPeerFabricPort,
  bulk: StudioPeerBulkExchangePort,
): StudioPeerMobileReferencePort {
  return new StudioPeerMobileReference(fabric, bulk);
}
