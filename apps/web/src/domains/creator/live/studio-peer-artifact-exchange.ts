import type { StudioPeerBulkExchangePort } from "./studio-peer-bulk-exchange";
import type {
  StudioPeerBulkKind,
  StudioPeerBulkOffer,
  StudioPeerBulkReceived,
  StudioPeerBulkTransferReceipt,
} from "./studio-peer-bulk-transfer";
import type { StudioPeerFabricPeer } from "./studio-peer-fabric";

export const STUDIO_PEER_RECOVERY_PROTOCOL = "studio-recovery-handoff-v1" as const;
export const STUDIO_PEER_LIBRARY_PROTOCOL = "studio-library-cas-v1" as const;
export const STUDIO_PEER_WORK_ASSET_PROTOCOL = "studio-work-asset-v1" as const;

export interface StudioPeerArtifactEvent {
  readonly sender: StudioPeerFabricPeer;
  readonly offer: StudioPeerBulkOffer;
  readonly bytes: Uint8Array;
}

export interface StudioPeerArtifactExchangeOptions {
  readonly accept?: (
    sender: StudioPeerFabricPeer,
    offer: StudioPeerBulkOffer,
  ) => boolean | Promise<boolean>;
  readonly receive?: (event: StudioPeerArtifactEvent) => void | Promise<void>;
}

export interface StudioPeerArtifactSendInput {
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface StudioPeerArtifactExchangePort {
  send(targetSessionId: string, input: StudioPeerArtifactSendInput): Promise<StudioPeerBulkTransferReceipt>;
  subscribe(listener: (event: StudioPeerArtifactEvent) => void): () => void;
  close(): void;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;

type ArtifactSpec = Readonly<{
  kind: StudioPeerBulkKind;
  protocol: string;
  requiredMetadata: readonly string[];
  maximumBytes: number;
}>;

function metadataMatches(offer: StudioPeerBulkOffer, spec: ArtifactSpec): boolean {
  return offer.kind === spec.kind
    && offer.metadata.protocol === spec.protocol
    && offer.byteLength <= spec.maximumBytes
    && spec.requiredMetadata.every((key) => {
      const value = offer.metadata[key];
      return typeof value === "string" && ID_PATTERN.test(value);
    });
}

class StudioPeerArtifactExchange implements StudioPeerArtifactExchangePort {
  private readonly listeners = new Set<(event: StudioPeerArtifactEvent) => void>();
  private readonly unregister: () => void;
  private closed = false;

  constructor(
    private readonly bulk: StudioPeerBulkExchangePort,
    private readonly spec: ArtifactSpec,
    private readonly options: StudioPeerArtifactExchangeOptions,
  ) {
    this.unregister = bulk.register(spec.kind, {
      accept: async (sender, offer) => {
        if (!metadataMatches(offer, spec)) return false;
        return options.accept ? options.accept(sender, offer) : true;
      },
      receive: async (received) => this.receive(received),
    });
  }

  send(
    targetSessionId: string,
    input: StudioPeerArtifactSendInput,
  ): Promise<StudioPeerBulkTransferReceipt> {
    if (this.closed) return Promise.reject(new Error("P2P artifact exchange가 종료되었습니다."));
    if (!(input.bytes instanceof Uint8Array)
      || input.bytes.byteLength < 1
      || input.bytes.byteLength > this.spec.maximumBytes) {
      return Promise.reject(new TypeError("P2P artifact가 안전 한도를 벗어났습니다."));
    }
    const metadata: Record<string, string> = {
      ...input.metadata,
      protocol: this.spec.protocol,
    };
    if (!this.spec.requiredMetadata.every((key) => {
      const value = metadata[key];
      return typeof value === "string" && ID_PATTERN.test(value);
    })) return Promise.reject(new TypeError("P2P artifact 메타데이터가 올바르지 않습니다."));
    return this.bulk.send(targetSessionId, {
      kind: this.spec.kind,
      name: input.name,
      mimeType: input.mimeType,
      bytes: input.bytes,
      metadata,
    });
  }

  subscribe(listener: (event: StudioPeerArtifactEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unregister();
    this.listeners.clear();
  }

  private async receive(received: StudioPeerBulkReceived): Promise<void> {
    if (this.closed || !metadataMatches(received.offer, this.spec)) return;
    const event: StudioPeerArtifactEvent = {
      sender: received.sender,
      offer: received.offer,
      bytes: received.bytes,
    };
    await this.options.receive?.(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Artifact observers never own the shared bulk exchange.
      }
    }
  }
}

const RECOVERY_SPEC: ArtifactSpec = Object.freeze({
  kind: "recovery-package",
  protocol: STUDIO_PEER_RECOVERY_PROTOCOL,
  requiredMetadata: ["workId", "projectDigest"],
  maximumBytes: 256 * 1024 * 1024,
});
const LIBRARY_SPEC: ArtifactSpec = Object.freeze({
  kind: "library-cas",
  protocol: STUDIO_PEER_LIBRARY_PROTOCOL,
  requiredMetadata: ["namespace", "recordId"],
  maximumBytes: 128 * 1024 * 1024,
});
const WORK_ASSET_SPEC: ArtifactSpec = Object.freeze({
  kind: "work-asset",
  protocol: STUDIO_PEER_WORK_ASSET_PROTOCOL,
  requiredMetadata: ["workId", "assetId", "elementType"],
  maximumBytes: 256 * 1024 * 1024,
});

export function createStudioPeerRecoveryHandoff(
  bulk: StudioPeerBulkExchangePort,
  options: StudioPeerArtifactExchangeOptions = {},
): StudioPeerArtifactExchangePort {
  return new StudioPeerArtifactExchange(bulk, RECOVERY_SPEC, options);
}

export function createStudioPeerLibraryCasExchange(
  bulk: StudioPeerBulkExchangePort,
  options: StudioPeerArtifactExchangeOptions = {},
): StudioPeerArtifactExchangePort {
  return new StudioPeerArtifactExchange(bulk, LIBRARY_SPEC, options);
}

export function createStudioPeerWorkAssetExchange(
  bulk: StudioPeerBulkExchangePort,
  options: StudioPeerArtifactExchangeOptions = {},
): StudioPeerArtifactExchangePort {
  return new StudioPeerArtifactExchange(bulk, WORK_ASSET_SPEC, options);
}
