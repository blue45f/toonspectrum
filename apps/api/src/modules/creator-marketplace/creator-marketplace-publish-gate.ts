import { createHash } from "node:crypto";

export const CREATOR_MARKETPLACE_PUBLISH_GATE = Symbol(
  "CREATOR_MARKETPLACE_PUBLISH_GATE"
);

export const CREATOR_MARKETPLACE_PUBLISH_LIMIT = 20;
export const CREATOR_MARKETPLACE_PUBLISH_WINDOW_MS = 60 * 60_000;
export const CREATOR_MARKETPLACE_PUBLISH_LEASE_MS = 30_000;
export const CREATOR_MARKETPLACE_PUBLISH_GATE_RETENTION_MS =
  2 * CREATOR_MARKETPLACE_PUBLISH_WINDOW_MS;
export const CREATOR_MARKETPLACE_PUBLISH_GATE_CLEANUP_BATCH_SIZE = 64;

const PUBLISHER_ID_MAX_CHARACTERS = 160;
const SHA256_BYTE_LENGTH = 32;

export interface CreatorMarketplacePublishLease {
  readonly publisherKeyHash: Uint8Array;
  readonly token: string;
  readonly fence: string;
  readonly expiresAt: Date;
}

export type CreatorMarketplacePublishAdmission =
  | {
      readonly status: "acquired";
      readonly lease: CreatorMarketplacePublishLease;
    }
  | { readonly status: "rate_limited" };

export interface CreatorMarketplacePublishGate {
  acquire(
    publisherKeyHash: Uint8Array
  ): Promise<CreatorMarketplacePublishAdmission>;
  release(lease: CreatorMarketplacePublishLease): Promise<boolean>;
}

/**
 * The authenticated publisher id is needed for ownership writes, but the short-lived admission
 * table deliberately receives only this domain-separated, fixed-width digest.
 */
export function creatorMarketplacePublisherGateKey(
  publisherId: string
): Uint8Array {
  if (
    typeof publisherId !== "string" ||
    publisherId.length < 1 ||
    publisherId.length > PUBLISHER_ID_MAX_CHARACTERS
  ) {
    throw new TypeError("Creator marketplace publisher identity is invalid.");
  }
  return Uint8Array.from(
    createHash("sha256")
      .update("toonspectrum:creator-marketplace:publish:v1\0", "utf8")
      .update(publisherId, "utf8")
      .digest()
  );
}

export function isCreatorMarketplaceGateDigest(
  value: Uint8Array
): boolean {
  return value instanceof Uint8Array && value.byteLength === SHA256_BYTE_LENGTH;
}
