import { readFile, writeFile } from "node:fs/promises";

import {
  normalizeCloudRelativePath,
  sha256Bytes,
} from "./http.js";
import {
  DesktopCloudError,
  type DesktopCloudObject,
  type DesktopCloudProvider,
} from "./types.js";

import type { RemoteFileSnapshot } from "../model.js";
import type { DesktopSyncRemote } from "../runtime.js";

export const DESKTOP_CLOUD_INDEX_PATH =
  ".toonstudio-sync-index.json";
const CLOUD_INDEX_SCHEMA = 1 as const;
const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const MAX_INDEX_ENTRIES = 200_000;

interface CloudIndexEntry {
  readonly relativePath: string;
  readonly providerObjectId: string;
  readonly providerVersion: string;
  readonly sha256: string;
  readonly size: number;
  readonly modifiedAt: string | null;
}

interface CloudIndexDocument {
  readonly schemaVersion: typeof CLOUD_INDEX_SCHEMA;
  readonly provider: DesktopCloudProvider["id"];
  readonly rootLabel: string;
  readonly updatedAt: string;
  readonly entries: Readonly<Record<string, CloudIndexEntry>>;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyIndex(provider: DesktopCloudProvider): CloudIndexDocument {
  return {
    schemaVersion: CLOUD_INDEX_SCHEMA,
    provider: provider.id,
    rootLabel: provider.rootLabel,
    updatedAt: new Date(0).toISOString(),
    entries: {},
  };
}

function parseIndexEntry(
  path: string,
  value: unknown,
): CloudIndexEntry | null {
  if (!isRecord(value)) return null;
  const entry = value as Partial<CloudIndexEntry>;
  if (
    entry.relativePath !== path
    || typeof entry.providerObjectId !== "string"
    || typeof entry.providerVersion !== "string"
    || typeof entry.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(entry.sha256)
    || !Number.isSafeInteger(entry.size)
    || Number(entry.size) < 0
    || (entry.modifiedAt !== null && typeof entry.modifiedAt !== "string")
  ) return null;
  return entry as CloudIndexEntry;
}

function parseCloudIndex(
  bytes: Uint8Array,
  provider: DesktopCloudProvider,
): CloudIndexDocument {
  if (bytes.byteLength > MAX_INDEX_BYTES) {
    throw new DesktopCloudError(
      provider.id,
      "invalid-response",
      "cloud sync index exceeds the maximum supported size",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new DesktopCloudError(
      provider.id,
      "invalid-response",
      "cloud sync index is not valid JSON",
      { cause: error },
    );
  }
  if (!isRecord(value) || !isRecord(value.entries)) {
    throw new DesktopCloudError(
      provider.id,
      "invalid-response",
      "cloud sync index shape is invalid",
    );
  }
  if (
    value.schemaVersion !== CLOUD_INDEX_SCHEMA
    || value.provider !== provider.id
    || value.rootLabel !== provider.rootLabel
    || typeof value.updatedAt !== "string"
  ) {
    throw new DesktopCloudError(
      provider.id,
      "version-conflict",
      "cloud sync index belongs to a different provider or root",
    );
  }
  const rows = Object.entries(value.entries);
  if (rows.length > MAX_INDEX_ENTRIES) {
    throw new DesktopCloudError(
      provider.id,
      "invalid-response",
      "cloud sync index contains too many entries",
    );
  }
  const entries: Record<string, CloudIndexEntry> = {};
  for (const [path, candidate] of rows) {
    const normalized = normalizeCloudRelativePath(path);
    if (normalized === DESKTOP_CLOUD_INDEX_PATH) continue;
    const entry = parseIndexEntry(normalized, candidate);
    if (!entry) {
      throw new DesktopCloudError(
        provider.id,
        "invalid-response",
        `cloud sync index entry is invalid: ${normalized}`,
      );
    }
    entries[normalized] = entry;
  }
  return {
    schemaVersion: CLOUD_INDEX_SCHEMA,
    provider: provider.id,
    rootLabel: provider.rootLabel,
    updatedAt: value.updatedAt,
    entries,
  };
}

function canonicalIndexBytes(index: CloudIndexDocument): Uint8Array {
  const entries = Object.fromEntries(
    Object.entries(index.entries).sort(([left], [right]) =>
      left.localeCompare(right)),
  );
  return new TextEncoder().encode(`${JSON.stringify({
    ...index,
    entries,
  }, null, 2)}\n`);
}
interface VersionToken {
  readonly id: string;
  readonly version: string;
}

function versionToken(file: DesktopCloudObject): string {
  return Buffer.from(JSON.stringify({
    id: file.id,
    version: file.version,
  } satisfies VersionToken)).toString("base64url");
}

function parseVersionToken(
  value: string,
  provider: DesktopCloudProvider,
): VersionToken {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      isRecord(parsed)
      && typeof parsed.id === "string"
      && typeof parsed.version === "string"
      && parsed.id
      && parsed.version
    ) {
      return { id: parsed.id, version: parsed.version };
    }
  } catch {
    // Converted into a provider-scoped conflict below.
  }
  throw new DesktopCloudError(
    provider.id,
    "version-conflict",
    "cloud file version token is invalid",
  );
}

function indexEntry(
  file: DesktopCloudObject,
  sha256: string,
): CloudIndexEntry {
  return {
    relativePath: file.relativePath,
    providerObjectId: file.id,
    providerVersion: file.version,
    sha256,
    size: file.size,
    modifiedAt: file.modifiedAt,
  };
}

function snapshot(
  file: DesktopCloudObject,
  sha256: string,
): RemoteFileSnapshot {
  return {
    relativePath: file.relativePath,
    sha256,
    size: file.size,
    version: versionToken(file),
  };
}
type PendingIndexMutation =
  | { readonly kind: "set"; readonly entry: CloudIndexEntry }
  | { readonly kind: "delete" };

export class IndexedCloudDesktopSyncRemote implements DesktopSyncRemote {
  private objects = new Map<string, DesktopCloudObject>();
  private indexObject: DesktopCloudObject | null = null;
  private index: CloudIndexDocument;
  private readonly pending = new Map<string, PendingIndexMutation>();

  constructor(readonly provider: DesktopCloudProvider) {
    this.index = emptyIndex(provider);
  }

  private async refresh(signal?: AbortSignal): Promise<void> {
    const files = await this.provider.listFiles(signal);
    const objects = new Map<string, DesktopCloudObject>();
    let indexObject: DesktopCloudObject | null = null;
    for (const file of files) {
      const path = normalizeCloudRelativePath(file.relativePath);
      if (path === DESKTOP_CLOUD_INDEX_PATH) {
        if (indexObject) {
          throw new DesktopCloudError(
            this.provider.id,
            "version-conflict",
            "cloud sync root contains duplicate index files",
          );
        }
        indexObject = { ...file, relativePath: path };
        continue;
      }
      if (objects.has(path)) {
        throw new DesktopCloudError(
          this.provider.id,
          "version-conflict",
          `cloud sync root contains duplicate path: ${path}`,
        );
      }
      objects.set(path, { ...file, relativePath: path });
    }
    this.objects = objects;
    this.indexObject = indexObject;
    this.index = indexObject
      ? parseCloudIndex(
          await this.provider.downloadFile(indexObject, signal),
          this.provider,
        )
      : emptyIndex(this.provider);
  }

  private matchesIndex(
    file: DesktopCloudObject,
    entry: CloudIndexEntry | undefined,
  ): entry is CloudIndexEntry {
    return Boolean(
      entry
      && entry.providerObjectId === file.id
      && entry.providerVersion === file.version
      && entry.size === file.size,
    );
  }
  private mergedIndex(
    base: CloudIndexDocument,
    mutations: ReadonlyMap<string, PendingIndexMutation>,
  ): CloudIndexDocument {
    const entries: Record<string, CloudIndexEntry> = { ...base.entries };
    for (const [path, mutation] of mutations) {
      if (mutation.kind === "delete") delete entries[path];
      else entries[path] = mutation.entry;
    }
    return {
      schemaVersion: CLOUD_INDEX_SCHEMA,
      provider: this.provider.id,
      rootLabel: this.provider.rootLabel,
      updatedAt: new Date().toISOString(),
      entries,
    };
  }

  private assertMutationsStillCurrent(
    mutations: ReadonlyMap<string, PendingIndexMutation>,
  ): void {
    for (const [path, mutation] of mutations) {
      const current = this.objects.get(path) ?? null;
      if (mutation.kind === "delete") {
        if (current !== null) {
          throw new DesktopCloudError(
            this.provider.id,
            "version-conflict",
            `cloud file reappeared before index commit: ${path}`,
          );
        }
        continue;
      }
      if (
        current === null
        || current.id !== mutation.entry.providerObjectId
        || current.version !== mutation.entry.providerVersion
        || current.size !== mutation.entry.size
      ) {
        throw new DesktopCloudError(
          this.provider.id,
          "version-conflict",
          `cloud file changed before index commit: ${path}`,
        );
      }
    }
  }

  async commitMetadata(signal?: AbortSignal): Promise<void> {
    if (this.pending.size === 0) return;
    const mutations = new Map(this.pending);
    let lastConflict: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.refresh(signal);
      this.assertMutationsStillCurrent(mutations);
      const next = this.mergedIndex(this.index, mutations);
      try {
        const uploaded = await this.provider.uploadFile({
          relativePath: DESKTOP_CLOUD_INDEX_PATH,
          bytes: canonicalIndexBytes(next),
          sourceSha256: sha256Bytes(canonicalIndexBytes(next)),
          expected: this.indexObject,
          signal,
        });
        this.index = next;
        this.indexObject = uploaded;
        for (const path of mutations.keys()) this.pending.delete(path);
        return;
      } catch (error) {
        if (
          error instanceof DesktopCloudError
          && error.code === "version-conflict"
        ) {
          lastConflict = error;
          continue;
        }
        throw error;
      }
    }
    throw new DesktopCloudError(
      this.provider.id,
      "version-conflict",
      "cloud sync index changed repeatedly; retry the sync cycle",
      { cause: lastConflict },
    );
  }

  private assertVersion(
    file: DesktopCloudObject,
    tokenValue: string,
  ): void {
    const token = parseVersionToken(tokenValue, this.provider);
    if (token.id !== file.id || token.version !== file.version) {
      throw new DesktopCloudError(
        this.provider.id,
        "version-conflict",
        `cloud file changed: ${file.relativePath}`,
      );
    }
  }
  async listRemoteFiles(
    signal?: AbortSignal,
  ): Promise<readonly RemoteFileSnapshot[]> {
    await this.refresh(signal);
    const snapshots: RemoteFileSnapshot[] = [];
    for (const file of [...this.objects.values()].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath))) {
      const indexed = this.index.entries[file.relativePath];
      let hash: string;
      if (this.matchesIndex(file, indexed)) {
        hash = indexed.sha256;
      } else {
        const bytes = await this.provider.downloadFile(file, signal);
        if (bytes.byteLength !== file.size) {
          throw new DesktopCloudError(
            this.provider.id,
            "integrity",
            `cloud file size changed while indexing: ${file.relativePath}`,
          );
        }
        hash = sha256Bytes(bytes);
        this.pending.set(file.relativePath, {
          kind: "set",
          entry: indexEntry(file, hash),
        });
      }
      snapshots.push(snapshot(file, hash));
    }
    for (const path of Object.keys(this.index.entries)) {
      if (!this.objects.has(path)) {
        this.pending.set(path, { kind: "delete" });
      }
    }
    return Object.freeze(snapshots);
  }

  private async currentFile(
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<DesktopCloudObject | null> {
    await this.refresh(signal);
    return this.objects.get(normalizeCloudRelativePath(relativePath)) ?? null;
  }
  async uploadFile(input: {
    readonly relativePath: string;
    readonly absolutePath: string;
    readonly sha256: string;
    readonly size: number;
    readonly expectedRemoteVersion: string | null;
  }): Promise<RemoteFileSnapshot> {
    const path = normalizeCloudRelativePath(input.relativePath);
    const current = await this.currentFile(path);
    if (input.expectedRemoteVersion === null) {
      if (current) {
        throw new DesktopCloudError(
          this.provider.id,
          "version-conflict",
          `cloud file appeared before upload: ${path}`,
        );
      }
    } else {
      if (!current) {
        throw new DesktopCloudError(
          this.provider.id,
          "version-conflict",
          `cloud file disappeared before upload: ${path}`,
        );
      }
      this.assertVersion(current, input.expectedRemoteVersion);
    }
    const bytes = new Uint8Array(await readFile(input.absolutePath));
    if (
      bytes.byteLength !== input.size
      || sha256Bytes(bytes) !== input.sha256
    ) {
      throw new DesktopCloudError(
        this.provider.id,
        "integrity",
        `local file changed while uploading: ${path}`,
      );
    }
    const uploaded = await this.provider.uploadFile({
      relativePath: path,
      bytes,
      sourceSha256: input.sha256,
      expected: current,
    });
    if (
      uploaded.relativePath !== path
      || uploaded.size !== input.size
    ) {
      throw new DesktopCloudError(
        this.provider.id,
        "integrity",
        `cloud provider returned mismatched upload metadata: ${path}`,
      );
    }
    this.objects.set(path, uploaded);
    this.pending.set(path, {
      kind: "set",
      entry: indexEntry(uploaded, input.sha256),
    });
    return snapshot(uploaded, input.sha256);
  }
  async downloadFile(input: {
    readonly remote: RemoteFileSnapshot;
    readonly temporaryAbsolutePath: string;
  }): Promise<void> {
    const path = normalizeCloudRelativePath(input.remote.relativePath);
    const current = await this.currentFile(path);
    if (!current) {
      throw new DesktopCloudError(
        this.provider.id,
        "version-conflict",
        `cloud file disappeared before download: ${path}`,
      );
    }
    this.assertVersion(current, input.remote.version);
    const bytes = await this.provider.downloadFile(current);
    if (
      bytes.byteLength !== input.remote.size
      || sha256Bytes(bytes) !== input.remote.sha256
    ) {
      throw new DesktopCloudError(
        this.provider.id,
        "integrity",
        `cloud file changed while downloading: ${path}`,
      );
    }
    await writeFile(input.temporaryAbsolutePath, bytes, { mode: 0o600 });
  }

  async deleteRemoteFile(input: {
    readonly remote: RemoteFileSnapshot;
    readonly expectedRemoteVersion: string;
  }): Promise<void> {
    const path = normalizeCloudRelativePath(input.remote.relativePath);
    const current = await this.currentFile(path);
    if (!current) {
      throw new DesktopCloudError(
        this.provider.id,
        "version-conflict",
        `cloud file disappeared before delete: ${path}`,
      );
    }
    this.assertVersion(current, input.expectedRemoteVersion);
    await this.provider.deleteFile({
      file: current,
      expectedVersion: current.version,
    });
    this.objects.delete(path);
    this.pending.set(path, { kind: "delete" });
  }
}
