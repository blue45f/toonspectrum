import type { DesktopCloudProviderId } from "./cloud/types.js";
import type { DesktopCredentialVault } from "./credential-vault.js";

export const DESKTOP_UPLOAD_SESSION_CREDENTIAL_SERVICE =
  "ToonStudio Desktop Sync Upload Sessions";

export interface DesktopUploadSessionIdentity {
  readonly provider: DesktopCloudProviderId;
  readonly remoteRoot: string;
  readonly credentialProfile: string;
  readonly relativePath: string;
  readonly sourceSha256: string;
  readonly size: number;
  readonly expectedObjectId: string | null;
  readonly expectedVersion: string | null;
}

export type DesktopUploadSessionKind =
  | "dropbox-session"
  | "google-resumable"
  | "onedrive-upload-url";

export interface DesktopUploadSessionRecord extends DesktopUploadSessionIdentity {
  readonly schemaVersion: 1;
  readonly kind: DesktopUploadSessionKind;
  readonly handle: string;
  readonly offset: number;
  readonly expiresAt: string | null;
  readonly updatedAt: string;
}

export interface DesktopUploadSessionStore {
  load(
    identity: DesktopUploadSessionIdentity,
    signal?: AbortSignal,
  ): Promise<DesktopUploadSessionRecord | null>;
  save(record: DesktopUploadSessionRecord, signal?: AbortSignal): Promise<void>;
  delete(
    identity: DesktopUploadSessionIdentity,
    signal?: AbortSignal,
  ): Promise<boolean>;
}

const FNV_64_OFFSET = 0xcbf29ce484222325n;
const FNV_64_PRIME = 0x100000001b3n;
const FNV_64_MASK = 0xffffffffffffffffn;
const FNV_64_SECOND_SEED = FNV_64_OFFSET ^ 0x9e3779b97f4a7c15n;

function fnv1a64(value: string, seed: bigint): string {
  let hash = seed;
  for (const byte of Buffer.from(value, "utf8")) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_64_PRIME) & FNV_64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function accountFor(identity: Pick<
  DesktopUploadSessionIdentity,
  "provider" | "remoteRoot" | "credentialProfile" | "relativePath"
>): string {
  // This is a bounded credential-vault lookup index, not an authentication hash.
  // Exact session identity is verified again with sameIdentity after lookup.
  const serialized = JSON.stringify([
    identity.provider,
    identity.remoteRoot,
    identity.credentialProfile,
    identity.relativePath,
  ]);
  const fingerprint = `${fnv1a64(serialized, FNV_64_OFFSET)}${fnv1a64(serialized, FNV_64_SECOND_SEED)}`;
  return `upload:${identity.provider}:${fingerprint}`;
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function parsedRecord(value: string): DesktopUploadSessionRecord | null {
  if (Buffer.byteLength(value, "utf8") > 512 * 1024) return null;
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const row = candidate as Partial<DesktopUploadSessionRecord>;
  if (
    row.schemaVersion !== 1
    || !["dropbox-session", "google-resumable", "onedrive-upload-url"].includes(String(row.kind))
    || !["dropbox", "google-drive", "onedrive"].includes(String(row.provider))
    || typeof row.remoteRoot !== "string"
    || typeof row.credentialProfile !== "string"
    || typeof row.relativePath !== "string"
    || !validSha256(row.sourceSha256)
    || !Number.isSafeInteger(row.size)
    || Number(row.size) < 0
  ) return null;
  if (
    (row.expectedObjectId !== null && typeof row.expectedObjectId !== "string")
    || (row.expectedVersion !== null && typeof row.expectedVersion !== "string")
    || typeof row.handle !== "string"
    || row.handle.length < 1
    || row.handle.length > 16_384
    || !Number.isSafeInteger(row.offset)
    || Number(row.offset) < 0
    || Number(row.offset) > Number(row.size)
    || (row.expiresAt !== null && typeof row.expiresAt !== "string")
    || typeof row.updatedAt !== "string"
  ) return null;
  if (
    !Number.isFinite(Date.parse(row.updatedAt))
    || (row.expiresAt !== null && !Number.isFinite(Date.parse(row.expiresAt)))
  ) return null;
  return row as DesktopUploadSessionRecord;
}

function sameIdentity(
  left: DesktopUploadSessionIdentity,
  right: DesktopUploadSessionIdentity,
): boolean {
  return left.provider === right.provider
    && left.remoteRoot === right.remoteRoot
    && left.credentialProfile === right.credentialProfile
    && left.relativePath === right.relativePath
    && left.sourceSha256 === right.sourceSha256
    && left.size === right.size
    && left.expectedObjectId === right.expectedObjectId
    && left.expectedVersion === right.expectedVersion;
}

export class CredentialDesktopUploadSessionStore implements DesktopUploadSessionStore {
  constructor(
    private readonly vault: DesktopCredentialVault,
    private readonly now: () => number = Date.now,
  ) {}

  async load(
    identity: DesktopUploadSessionIdentity,
    signal?: AbortSignal,
  ): Promise<DesktopUploadSessionRecord | null> {
    const account = accountFor(identity);
    const raw = await this.vault.get(
      DESKTOP_UPLOAD_SESSION_CREDENTIAL_SERVICE,
      account,
      signal,
    );
    if (raw === null) return null;
    const record = parsedRecord(raw);
    if (record === null) {
      await this.vault.delete(
        DESKTOP_UPLOAD_SESSION_CREDENTIAL_SERVICE,
        account,
        signal,
      );
      return null;
    }
    if (!sameIdentity(record, identity)) return null;
    if (
      record.expiresAt !== null
      && Date.parse(record.expiresAt) <= this.now() + 5_000
    ) {
      await this.vault.delete(
        DESKTOP_UPLOAD_SESSION_CREDENTIAL_SERVICE,
        account,
        signal,
      );
      return null;
    }
    return record;
  }

  async save(record: DesktopUploadSessionRecord, signal?: AbortSignal): Promise<void> {
    const parsed = parsedRecord(JSON.stringify(record));
    if (parsed === null) throw new TypeError("invalid desktop upload session record");
    await this.vault.set(
      DESKTOP_UPLOAD_SESSION_CREDENTIAL_SERVICE,
      accountFor(record),
      JSON.stringify(record),
      signal,
    );
  }

  async delete(
    identity: DesktopUploadSessionIdentity,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.vault.delete(
      DESKTOP_UPLOAD_SESSION_CREDENTIAL_SERVICE,
      accountFor(identity),
      signal,
    );
  }
}

export class MemoryDesktopUploadSessionStore implements DesktopUploadSessionStore {
  private readonly records = new Map<string, DesktopUploadSessionRecord>();

  async load(
    identity: DesktopUploadSessionIdentity,
    signal?: AbortSignal,
  ): Promise<DesktopUploadSessionRecord | null> {
    if (signal?.aborted) throw signal.reason;
    const record = this.records.get(accountFor(identity)) ?? null;
    return record && sameIdentity(record, identity) ? record : null;
  }

  async save(record: DesktopUploadSessionRecord, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    this.records.set(accountFor(record), record);
  }

  async delete(
    identity: DesktopUploadSessionIdentity,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (signal?.aborted) throw signal.reason;
    return this.records.delete(accountFor(identity));
  }
}
