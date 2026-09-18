import {
  DesktopCloudHttpClient,
  asciiJsonHeader,
  cloudPathSegments,
  jsonObject,
  normalizeCloudRelativePath,
  numberField,
  sha256Bytes,
  stringField,
} from "./http.js";
import {
  DesktopCloudError,
  type DesktopCloudObject,
  type DesktopCloudProvider,
} from "./types.js";

import type { DesktopCloudAccessTokenSource } from "../oauth.js";
import type {
  DesktopUploadSessionIdentity,
  DesktopUploadSessionRecord,
  DesktopUploadSessionStore,
} from "../upload-session-store.js";

export interface DropboxDesktopCloudProviderOptions {
  readonly accessToken: string | DesktopCloudAccessTokenSource;
  readonly rootPath?: string;
  readonly fetchImpl?: typeof fetch;
  readonly credentialProfile?: string;
  readonly uploadSessionStore?: DesktopUploadSessionStore;
  readonly simpleUploadThresholdBytes?: number;
  readonly now?: () => number;
}

const DROPBOX_API = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT = "https://content.dropboxapi.com/2";
const DROPBOX_SIMPLE_UPLOAD_BYTES = 128 * 1024 * 1024;
const DROPBOX_CHUNK_BYTES = 8 * 1024 * 1024;
const DROPBOX_TRASH_ROOT = ".toonstudio-trash";

function normalizeDropboxRoot(value: string | undefined): string {
  const normalized = normalizeCloudRelativePath(value ?? "ToonStudio/Sync");
  return `/${normalized}`;
}

function dropboxPath(rootPath: string, relativePath: string): string {
  return `${rootPath}/${normalizeCloudRelativePath(relativePath)}`;
}
interface DropboxMetadata {
  readonly id: string;
  readonly pathDisplay: string;
  readonly revision: string;
  readonly modifiedAt: string;
  readonly size: number;
}

function dropboxMetadata(value: unknown): DropboxMetadata | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (stringField(row[".tag"]) !== "file") return null;
  const id = stringField(row.id);
  const pathDisplay = stringField(row.path_display) || stringField(row.path_lower);
  const revision = stringField(row.rev);
  if (!id || !pathDisplay || !revision) return null;
  return {
    id,
    pathDisplay,
    revision,
    modifiedAt: stringField(row.server_modified),
    size: numberField(row.size),
  };
}

function relativeDropboxPath(rootPath: string, pathDisplay: string): string {
  const prefix = `${rootPath}/`;
  if (!pathDisplay.toLowerCase().startsWith(prefix.toLowerCase())) {
    throw new DesktopCloudError(
      "dropbox",
      "invalid-response",
      `Dropbox returned a file outside the configured root: ${pathDisplay}`,
    );
  }
  return normalizeCloudRelativePath(pathDisplay.slice(prefix.length));
}

function cloudObject(
  rootPath: string,
  metadata: DropboxMetadata,
): DesktopCloudObject {
  return {
    id: metadata.id,
    relativePath: relativeDropboxPath(rootPath, metadata.pathDisplay),
    size: metadata.size,
    version: metadata.revision,
    modifiedAt: metadata.modifiedAt || null,
  };
}
export class DropboxDesktopCloudProvider implements DesktopCloudProvider {
  readonly id = "dropbox" as const;
  readonly rootLabel: string;
  private readonly rootPath: string;
  private readonly http: DesktopCloudHttpClient;
  private readonly credentialProfile: string;
  private readonly uploadSessionStore?: DesktopUploadSessionStore;
  private readonly simpleUploadThresholdBytes: number;
  private readonly now: () => number;
  private rootEnsured = false;

  constructor(options: DropboxDesktopCloudProviderOptions) {
    this.rootPath = normalizeDropboxRoot(options.rootPath);
    this.rootLabel = this.rootPath;
    this.credentialProfile = options.credentialProfile?.trim() || "default";
    this.uploadSessionStore = options.uploadSessionStore;
    this.now = options.now ?? Date.now;
    this.simpleUploadThresholdBytes = options.simpleUploadThresholdBytes
      ?? DROPBOX_SIMPLE_UPLOAD_BYTES;
    if (this.simpleUploadThresholdBytes < 1
      || this.simpleUploadThresholdBytes > DROPBOX_SIMPLE_UPLOAD_BYTES) {
      throw new TypeError("invalid Dropbox simple upload threshold");
    }
    this.http = new DesktopCloudHttpClient({
      provider: this.id,
      accessToken: options.accessToken,
      fetchImpl: options.fetchImpl,
    });
  }

  private async api(
    endpoint: string,
    body: unknown,
    options: {
      readonly allow?: readonly number[];
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<Response> {
    return this.http.request(`${DROPBOX_API}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, options);
  }

  private async content(
    endpoint: string,
    argument: unknown,
    bytes: Uint8Array | null,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.http.request(`${DROPBOX_CONTENT}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": asciiJsonHeader(argument),
      },
      body: bytes,
    }, { signal });
  }
  private async ensureFolder(
    path: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.api(
      "files/create_folder_v2",
      { path, autorename: false },
      { allow: [409], signal },
    );
    if (response.status !== 409) return;
    const metadataResponse = await this.api(
      "files/get_metadata",
      { path, include_deleted: false },
      { allow: [409], signal },
    );
    if (metadataResponse.status === 409) {
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `Dropbox path is occupied by a non-folder object: ${path}`,
      );
    }
    const metadata = await jsonObject(metadataResponse, this.id);
    if (stringField(metadata[".tag"]) !== "folder") {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        `Dropbox did not confirm a folder at ${path}`,
      );
    }
  }

  private async rootExists(signal?: AbortSignal): Promise<boolean> {
    const response = await this.api(
      "files/get_metadata",
      { path: this.rootPath, include_deleted: false },
      { allow: [409], signal },
    );
    if (response.status === 409) return false;
    const metadata = await jsonObject(response, this.id);
    const tag = stringField(metadata[".tag"]);
    if (tag === "folder") {
      this.rootEnsured = true;
      return true;
    }
    throw new DesktopCloudError(
      this.id,
      "version-conflict",
      `Dropbox sync root is not a folder: ${this.rootPath}`,
    );
  }

  private async ensureRoot(signal?: AbortSignal): Promise<void> {
    if (this.rootEnsured) return;
    let current = "";
    for (const segment of cloudPathSegments(this.rootPath)) {
      current += `/${segment}`;
      await this.ensureFolder(current, signal);
    }
    this.rootEnsured = true;
  }

  private async ensureParentFolders(
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.ensureRoot(signal);
    const segments = cloudPathSegments(relativePath).slice(0, -1);
    let current = this.rootPath;
    for (const segment of segments) {
      current += `/${segment}`;
      await this.ensureFolder(current, signal);
    }
  }
  async listFiles(signal?: AbortSignal): Promise<readonly DesktopCloudObject[]> {
    if (!(await this.rootExists(signal))) return Object.freeze([]);
    const files: DesktopCloudObject[] = [];
    let response = await this.api("files/list_folder", {
      path: this.rootPath,
      recursive: true,
      include_deleted: false,
      include_non_downloadable_files: false,
      limit: 2_000,
    }, { signal });

    while (true) {
      const body = await jsonObject(response, this.id);
      const entries = Array.isArray(body.entries) ? body.entries : [];
      for (const entry of entries) {
        const metadata = dropboxMetadata(entry);
        if (metadata) {
          const object = cloudObject(this.rootPath, metadata);
          if (
            object.relativePath !== DROPBOX_TRASH_ROOT
            && !object.relativePath.startsWith(`${DROPBOX_TRASH_ROOT}/`)
          ) files.push(object);
        }
      }
      if (body.has_more !== true) break;
      const cursor = stringField(body.cursor);
      if (!cursor) {
        throw new DesktopCloudError(
          this.id,
          "invalid-response",
          "Dropbox pagination cursor is missing",
        );
      }
      response = await this.api(
        "files/list_folder/continue",
        { cursor },
        { signal },
      );
    }
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return Object.freeze(files);
  }

  async downloadFile(
    file: DesktopCloudObject,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const response = await this.content(
      "files/download",
      { path: file.id },
      null,
      signal,
    );
    return new Uint8Array(await response.arrayBuffer());
  }
  private commit(
    relativePath: string,
    expected: DesktopCloudObject | null,
  ): Record<string, unknown> {
    return {
      path: dropboxPath(this.rootPath, relativePath),
      mode: expected
        ? { ".tag": "update", update: expected.version }
        : { ".tag": "add" },
      autorename: false,
      mute: true,
      strict_conflict: true,
    };
  }

  private async uploadSimple(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly expected: DesktopCloudObject | null;
    readonly signal?: AbortSignal;
  }): Promise<DropboxMetadata> {
    const response = await this.content(
      "files/upload",
      this.commit(input.relativePath, input.expected),
      input.bytes,
      input.signal,
    );
    const metadata = dropboxMetadata(await jsonObject(response, this.id));
    if (!metadata) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        "Dropbox upload response did not contain file metadata",
      );
    }
    return metadata;
  }

  private uploadIdentity(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly sourceSha256?: string;
    readonly expected: DesktopCloudObject | null;
  }): DesktopUploadSessionIdentity {
    const sourceSha256 = input.sourceSha256 ?? sha256Bytes(input.bytes);
    if (!/^[a-f0-9]{64}$/u.test(sourceSha256)) {
      throw new DesktopCloudError(
        this.id,
        "integrity",
        `Dropbox upload hash is invalid: ${input.relativePath}`,
      );
    }
    return {
      provider: this.id,
      remoteRoot: this.rootLabel,
      credentialProfile: this.credentialProfile,
      relativePath: normalizeCloudRelativePath(input.relativePath),
      sourceSha256,
      size: input.bytes.byteLength,
      expectedObjectId: input.expected?.id ?? null,
      expectedVersion: input.expected?.version ?? null,
    };
  }

  private async saveUploadSession(
    identity: DesktopUploadSessionIdentity,
    handle: string,
    offset: number,
    signal?: AbortSignal,
  ): Promise<DesktopUploadSessionRecord> {
    const now = Date.now();
    const record: DesktopUploadSessionRecord = {
      ...identity,
      schemaVersion: 1,
      kind: "dropbox-session",
      handle,
      offset,
      expiresAt: new Date(now + 6 * 24 * 60 * 60_000).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    await this.uploadSessionStore?.save(record, signal);
    return record;
  }

  private async startUploadSession(
    input: {
      readonly relativePath: string;
      readonly bytes: Uint8Array;
      readonly signal?: AbortSignal;
    },
    identity: DesktopUploadSessionIdentity,
  ): Promise<DesktopUploadSessionRecord> {
    const firstEnd = Math.min(input.bytes.byteLength, DROPBOX_CHUNK_BYTES);
    const start = await this.content(
      "files/upload_session/start",
      { close: false },
      input.bytes.slice(0, firstEnd),
      input.signal,
    );
    const startBody = await jsonObject(start, this.id);
    const sessionId = stringField(startBody.session_id);
    if (!sessionId) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        "Dropbox upload session id is missing",
      );
    }
    return this.saveUploadSession(
      identity,
      sessionId,
      firstEnd,
      input.signal,
    );
  }

  private correctedOffset(error: unknown): number | null {
    if (!(error instanceof DesktopCloudError)) return null;
    const match = /correct_offset[^0-9]{0,80}(\d+)/iu.exec(error.message);
    if (!match) return null;
    const offset = Number(match[1]);
    return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
  }

  private staleUploadSession(error: unknown): boolean {
    return error instanceof DesktopCloudError
      && error.code === "version-conflict"
      && /lookup_failed|not_found|closed|session[^\n]{0,40}(?:missing|expired)/iu
        .test(error.message);
  }

  private async uploadSession(
    input: {
      readonly relativePath: string;
      readonly bytes: Uint8Array;
      readonly expected: DesktopCloudObject | null;
      readonly signal?: AbortSignal;
    },
    identity: DesktopUploadSessionIdentity,
    initial: DesktopUploadSessionRecord,
  ): Promise<DropboxMetadata> {
    let record = initial;
    let corrections = 0;
    while (record.offset < input.bytes.byteLength) {
      const remaining = input.bytes.byteLength - record.offset;
      if (remaining > DROPBOX_CHUNK_BYTES) {
        const endExclusive = record.offset + DROPBOX_CHUNK_BYTES;
        try {
          await this.content(
            "files/upload_session/append_v2",
            {
              cursor: { session_id: record.handle, offset: record.offset },
              close: false,
            },
            input.bytes.slice(record.offset, endExclusive),
            input.signal,
          );
          record = await this.saveUploadSession(
            identity,
            record.handle,
            endExclusive,
            input.signal,
          );
          continue;
        } catch (error) {
          const corrected = this.correctedOffset(error);
          if (corrected === null || corrected > input.bytes.byteLength) throw error;
          corrections += 1;
          if (corrections > 4) {
            throw new DesktopCloudError(
              this.id,
              "integrity",
              "Dropbox upload session offset could not stabilize",
            );
          }
          record = await this.saveUploadSession(
            identity,
            record.handle,
            corrected,
            input.signal,
          );
          continue;
        }
      }
      try {
        const finish = await this.content(
          "files/upload_session/finish",
          {
            cursor: { session_id: record.handle, offset: record.offset },
            commit: this.commit(input.relativePath, input.expected),
          },
          input.bytes.slice(record.offset),
          input.signal,
        );
        const metadata = dropboxMetadata(await jsonObject(finish, this.id));
        if (!metadata) {
          throw new DesktopCloudError(
            this.id,
            "invalid-response",
            "Dropbox upload session did not return file metadata",
          );
        }
        return metadata;
      } catch (error) {
        const corrected = this.correctedOffset(error);
        if (corrected === null || corrected > input.bytes.byteLength) throw error;
        corrections += 1;
        if (corrections > 4) {
          throw new DesktopCloudError(
            this.id,
            "integrity",
            "Dropbox upload session offset could not stabilize",
          );
        }
        record = await this.saveUploadSession(
          identity,
          record.handle,
          corrected,
          input.signal,
        );
      }
    }
    throw new DesktopCloudError(
      this.id,
      "invalid-response",
      "Dropbox upload session ended without metadata",
    );
  }

  async uploadFile(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly sourceSha256?: string;
    readonly expected: DesktopCloudObject | null;
    readonly signal?: AbortSignal;
  }): Promise<DesktopCloudObject> {
    await this.ensureParentFolders(input.relativePath, input.signal);
    if (input.bytes.byteLength <= this.simpleUploadThresholdBytes) {
      return cloudObject(
        this.rootPath,
        await this.uploadSimple(input),
      );
    }
    const identity = this.uploadIdentity(input);
    let record = await this.uploadSessionStore?.load(
      identity,
      input.signal,
    ) ?? null;
    if (record && record.kind !== "dropbox-session") {
      await this.uploadSessionStore?.delete(identity, input.signal);
      record = null;
    }
    let restarted = false;
    while (true) {
      if (!record) {
        record = await this.startUploadSession(input, identity);
      }
      try {
        const metadata = await this.uploadSession(
          input,
          identity,
          record,
        );
        await this.uploadSessionStore?.delete(identity, input.signal);
        return cloudObject(this.rootPath, metadata);
      } catch (error) {
        if (!restarted && this.staleUploadSession(error)) {
          await this.uploadSessionStore?.delete(identity, input.signal);
          record = null;
          restarted = true;
          continue;
        }
        throw error;
      }
    }
  }

  private trashRelativePath(
    file: DesktopCloudObject,
    expectedVersion: string,
  ): string {
    const timestamp = new Date(this.now())
      .toISOString()
      .replace(/[^0-9]/gu, "")
      .slice(0, 17);
    const digest = sha256Bytes(new TextEncoder().encode([
      file.id,
      expectedVersion,
      file.relativePath,
    ].join("\u0000"))).slice(0, 16);
    return `${DROPBOX_TRASH_ROOT}/${timestamp}-${digest}/${file.relativePath}`;
  }

  private async moveFile(
    fromPath: string,
    toPath: string,
    signal?: AbortSignal,
  ): Promise<DropboxMetadata> {
    const response = await this.api(
      "files/move_v2",
      {
        from_path: fromPath,
        to_path: toPath,
        autorename: false,
        allow_ownership_transfer: false,
      },
      { signal },
    );
    const body = await jsonObject(response, this.id);
    const metadata = dropboxMetadata(body.metadata);
    if (!metadata) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        "Dropbox move response did not contain file metadata",
      );
    }
    return metadata;
  }

  async deleteFile(input: {
    readonly file: DesktopCloudObject;
    readonly expectedVersion: string;
    readonly signal?: AbortSignal;
  }): Promise<void> {
    const metadataResponse = await this.api(
      "files/get_metadata",
      { path: input.file.id, include_deleted: false },
      { signal: input.signal },
    );
    const current = dropboxMetadata(await jsonObject(metadataResponse, this.id));
    if (!current || current.revision !== input.expectedVersion) {
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `Dropbox file changed before delete: ${input.file.relativePath}`,
      );
    }

    const trashRelativePath = this.trashRelativePath(
      input.file,
      input.expectedVersion,
    );
    await this.ensureParentFolders(trashRelativePath, input.signal);
    const moved = await this.moveFile(
      input.file.id,
      dropboxPath(this.rootPath, trashRelativePath),
      input.signal,
    );
    if (moved.revision === input.expectedVersion) return;

    try {
      await this.moveFile(
        moved.id,
        dropboxPath(this.rootPath, input.file.relativePath),
        input.signal,
      );
    } catch (error) {
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `Dropbox file changed during delete and was preserved at ${trashRelativePath}`,
        { cause: error },
      );
    }
    throw new DesktopCloudError(
      this.id,
      "version-conflict",
      `Dropbox file changed during delete and was restored: ${input.file.relativePath}`,
    );
  }
}
