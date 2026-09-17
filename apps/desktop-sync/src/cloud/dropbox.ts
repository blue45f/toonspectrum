import {
  DesktopCloudHttpClient,
  asciiJsonHeader,
  cloudPathSegments,
  jsonObject,
  normalizeCloudRelativePath,
  numberField,
  stringField,
} from "./http.js";
import {
  DesktopCloudError,
  type DesktopCloudObject,
  type DesktopCloudProvider,
} from "./types.js";

export interface DropboxDesktopCloudProviderOptions {
  readonly accessToken: string;
  readonly rootPath?: string;
  readonly fetchImpl?: typeof fetch;
}

const DROPBOX_API = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT = "https://content.dropboxapi.com/2";
const DROPBOX_SIMPLE_UPLOAD_BYTES = 128 * 1024 * 1024;
const DROPBOX_CHUNK_BYTES = 8 * 1024 * 1024;

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
  private rootEnsured = false;

  constructor(options: DropboxDesktopCloudProviderOptions) {
    this.rootPath = normalizeDropboxRoot(options.rootPath);
    this.rootLabel = this.rootPath;
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
        if (metadata) files.push(cloudObject(this.rootPath, metadata));
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

  private async uploadSession(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly expected: DesktopCloudObject | null;
    readonly signal?: AbortSignal;
  }): Promise<DropboxMetadata> {
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
    let offset = firstEnd;
    while (input.bytes.byteLength - offset > DROPBOX_CHUNK_BYTES) {
      const endExclusive = offset + DROPBOX_CHUNK_BYTES;
      await this.content(
        "files/upload_session/append_v2",
        {
          cursor: { session_id: sessionId, offset },
          close: false,
        },
        input.bytes.slice(offset, endExclusive),
        input.signal,
      );
      offset = endExclusive;
    }
    const finish = await this.content(
      "files/upload_session/finish",
      {
        cursor: { session_id: sessionId, offset },
        commit: this.commit(input.relativePath, input.expected),
      },
      input.bytes.slice(offset),
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
  }

  async uploadFile(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly expected: DesktopCloudObject | null;
    readonly signal?: AbortSignal;
  }): Promise<DesktopCloudObject> {
    await this.ensureParentFolders(input.relativePath, input.signal);
    const metadata = input.bytes.byteLength <= DROPBOX_SIMPLE_UPLOAD_BYTES
      ? await this.uploadSimple(input)
      : await this.uploadSession(input);
    return cloudObject(this.rootPath, metadata);
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
    await this.api(
      "files/delete_v2",
      { path: input.file.id },
      { signal: input.signal },
    );
  }
}
