import { createHash } from "node:crypto";

export const CREATOR_MARKETPLACE_REPORT_LIMIT = 20;
export const CREATOR_MARKETPLACE_REPORT_WINDOW_MS = 24 * 60 * 60_000;
export const CREATOR_MARKETPLACE_REPORT_GATE_RETENTION_MS =
  2 * CREATOR_MARKETPLACE_REPORT_WINDOW_MS;
export const CREATOR_MARKETPLACE_REPORT_GATE_CLEANUP_BATCH_SIZE = 64;

const REPORTER_ID_MAX_CHARACTERS = 160;
const SHA256_BYTE_LENGTH = 32;

/**
 * The report itself retains its nullable reporter foreign key for administrator review. The
 * admission and uniqueness keys use only this domain-separated fixed-width digest so cleanup can
 * outlive a deleted account without retaining another raw identity copy.
 */
export function creatorMarketplaceReporterKey(
  reporterId: string
): Uint8Array {
  if (
    typeof reporterId !== "string" ||
    reporterId.length < 1 ||
    reporterId.length > REPORTER_ID_MAX_CHARACTERS
  ) {
    throw new TypeError("Creator marketplace reporter identity is invalid.");
  }
  return Uint8Array.from(
    createHash("sha256")
      .update("toonspectrum:creator-marketplace:report:v1\0", "utf8")
      .update(reporterId, "utf8")
      .digest()
  );
}

export function isCreatorMarketplaceReporterKey(value: Uint8Array): boolean {
  return value instanceof Uint8Array && value.byteLength === SHA256_BYTE_LENGTH;
}
