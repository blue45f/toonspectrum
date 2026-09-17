import {
  DesktopCloudHttpClient,
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

export interface GoogleDriveDesktopCloudProviderOptions {
  readonly accessToken: string;
  readonly rootPath?: string;
  readonly fetchImpl?: typeof fetch;
}

const GOOGLE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_CHUNK_BYTES = 8 * 1024 * 1024;
const GOOGLE_FILE_FIELDS = [
  "id",
  "name",
  "mimeType",
  "size",
  "version",
  "modifiedTime",
].join(",");

function googleQueryValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function versionField(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
interface GoogleDriveMetadata {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly version: string;
  readonly modifiedAt: string;
}

function googleMetadata(value: unknown): GoogleDriveMetadata | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = stringField(row.id);
  const name = stringField(row.name);
  const mimeType = stringField(row.mimeType);
  if (!id || !name || !mimeType) return null;
  return {
    id,
    name,
    mimeType,
    size: numberField(row.size),
    version: versionField(row.version),
    modifiedAt: stringField(row.modifiedTime),
  };
}

function cloudObject(
  relativePath: string,
  metadata: GoogleDriveMetadata,
): DesktopCloudObject {
  if (!metadata.version) {
    throw new DesktopCloudError(
      "google-drive",
      "invalid-response",
      `Google Drive version is missing for ${relativePath}`,
    );
  }
  return {
    id: metadata.id,
    relativePath: normalizeCloudRelativePath(relativePath),
    size: metadata.size,
    version: metadata.version,
    modifiedAt: metadata.modifiedAt || null,
  };
}

interface GoogleDriveMetadataWithEtag {
  readonly metadata: GoogleDriveMetadata;
  readonly etag: string;
}
export class GoogleDriveDesktopCloudProvider implements DesktopCloudProvider {
  readonly id = "google-drive" as const;
  readonly rootLabel: string;
  private readonly rootSegments: readonly string[];
  private readonly http: DesktopCloudHttpClient;
  private rootFolderId: string | null = null;

  constructor(options: GoogleDriveDesktopCloudProviderOptions) {
    const root = normalizeCloudRelativePath(options.rootPath ?? "ToonStudio/Sync");
    this.rootLabel = root;
    this.rootSegments = cloudPathSegments(root);
    this.http = new DesktopCloudHttpClient({
      provider: this.id,
      accessToken: options.accessToken,
      fetchImpl: options.fetchImpl,
    });
  }

  private async json(
    url: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const response = await this.http.request(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined
          ? { "Content-Type": "application/json; charset=UTF-8" }
          : {}),
        ...init.headers,
      },
    }, { signal });
    return jsonObject(response, this.id);
  }

  private async listChildren(
    parentId: string,
    signal?: AbortSignal,
  ): Promise<readonly GoogleDriveMetadata[]> {
    const values: GoogleDriveMetadata[] = [];
    let pageToken = "";
    do {
      const query = `'${googleQueryValue(parentId)}' in parents and trashed=false`;
      const params = new URLSearchParams({
        q: query,
        spaces: "drive",
        pageSize: "1000",
        fields: `nextPageToken,files(${GOOGLE_FILE_FIELDS})`,
        orderBy: "folder,name_natural",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const body = await this.json(`${GOOGLE_API}/files?${params}`, {}, signal);
      const files = Array.isArray(body.files) ? body.files : [];
      for (const file of files) {
        const metadata = googleMetadata(file);
        if (metadata) values.push(metadata);
      }
      pageToken = stringField(body.nextPageToken);
    } while (pageToken);
    return values;
  }
  private async findChild(
    parentId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<GoogleDriveMetadata | null> {
    const children = await this.listChildren(parentId, signal);
    const matches = children.filter((child) => child.name === name);
    if (matches.length > 1) {
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `Google Drive has duplicate items named ${name}`,
      );
    }
    return matches[0] ?? null;
  }

  private async ensureFolder(
    parentId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const existing = await this.findChild(parentId, name, signal);
    if (existing) {
      if (existing.mimeType !== GOOGLE_FOLDER_MIME) {
        throw new DesktopCloudError(
          this.id,
          "version-conflict",
          `Google Drive path is occupied by a non-folder item: ${name}`,
        );
      }
      return existing.id;
    }
    const body = await this.json(
      `${GOOGLE_API}/files?fields=id,name,mimeType`,
      {
        method: "POST",
        body: JSON.stringify({
          name,
          mimeType: GOOGLE_FOLDER_MIME,
          parents: [parentId],
        }),
      },
      signal,
    );
    const created = googleMetadata({
      ...body,
      version: "0",
      size: 0,
      modifiedTime: "",
    });
    if (!created || created.mimeType !== GOOGLE_FOLDER_MIME) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        `Google Drive did not confirm folder creation for ${name}`,
      );
    }
    return created.id;
  }

  private async findRoot(signal?: AbortSignal): Promise<string | null> {
    if (this.rootFolderId) return this.rootFolderId;
    let parentId = "root";
    for (const segment of this.rootSegments) {
      const child = await this.findChild(parentId, segment, signal);
      if (!child) return null;
      if (child.mimeType !== GOOGLE_FOLDER_MIME) {
        throw new DesktopCloudError(
          this.id,
          "version-conflict",
          `Google Drive sync root is not a folder: ${segment}`,
        );
      }
      parentId = child.id;
    }
    this.rootFolderId = parentId;
    return parentId;
  }

  private async ensureRoot(signal?: AbortSignal): Promise<string> {
    if (this.rootFolderId) return this.rootFolderId;
    let parentId = "root";
    for (const segment of this.rootSegments) {
      parentId = await this.ensureFolder(parentId, segment, signal);
    }
    this.rootFolderId = parentId;
    return parentId;
  }
  private async ensureParent(
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<{ readonly parentId: string; readonly name: string }> {
    const segments = cloudPathSegments(relativePath);
    const name = segments.at(-1)!;
    let parentId = await this.ensureRoot(signal);
    for (const segment of segments.slice(0, -1)) {
      parentId = await this.ensureFolder(parentId, segment, signal);
    }
    return { parentId, name };
  }

  async listFiles(signal?: AbortSignal): Promise<readonly DesktopCloudObject[]> {
    const rootId = await this.findRoot(signal);
    if (!rootId) return Object.freeze([]);
    const files: DesktopCloudObject[] = [];
    const queue: Array<{
      readonly folderId: string;
      readonly prefix: string;
    }> = [{ folderId: rootId, prefix: "" }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = await this.listChildren(current.folderId, signal);
      for (const child of children) {
        const relativePath = current.prefix
          ? `${current.prefix}/${child.name}`
          : child.name;
        if (child.mimeType === GOOGLE_FOLDER_MIME) {
          queue.push({ folderId: child.id, prefix: relativePath });
          continue;
        }
        if (child.mimeType.startsWith("application/vnd.google-apps.")) {
          throw new DesktopCloudError(
            this.id,
            "unsupported",
            `Google Drive native documents cannot be synchronized as files: ${relativePath}`,
          );
        }
        files.push(cloudObject(relativePath, child));
      }
    }
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const paths = new Set<string>();
    for (const file of files) {
      if (paths.has(file.relativePath)) {
        throw new DesktopCloudError(
          this.id,
          "version-conflict",
          `Google Drive has duplicate paths under ${this.rootLabel}: ${file.relativePath}`,
        );
      }
      paths.add(file.relativePath);
    }
    return Object.freeze(files);
  }
  private async getMetadataWithEtag(
    id: string,
    signal?: AbortSignal,
  ): Promise<GoogleDriveMetadataWithEtag> {
    const response = await this.http.request(
      `${GOOGLE_API}/files/${encodeURIComponent(id)}?fields=${GOOGLE_FILE_FIELDS}`,
      { headers: { Accept: "application/json" } },
      { signal },
    );
    const metadata = googleMetadata(await jsonObject(response, this.id));
    const etag = response.headers.get("ETag") ?? response.headers.get("etag") ?? "";
    if (!metadata || !metadata.version || !etag) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        `Google Drive metadata is incomplete for ${id}`,
      );
    }
    return { metadata, etag };
  }

  private assertExpected(
    file: DesktopCloudObject,
    metadata: GoogleDriveMetadata,
  ): void {
    if (file.id !== metadata.id || file.version !== metadata.version) {
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `Google Drive file changed: ${file.relativePath}`,
      );
    }
  }

  async downloadFile(
    file: DesktopCloudObject,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const current = await this.getMetadataWithEtag(file.id, signal);
    this.assertExpected(file, current.metadata);
    const response = await this.http.request(
      `${GOOGLE_API}/files/${encodeURIComponent(file.id)}?alt=media`,
      { headers: { "If-Match": current.etag } },
      { signal },
    );
    return new Uint8Array(await response.arrayBuffer());
  }
  private async createUploadSession(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly expected: DesktopCloudObject | null;
    readonly signal?: AbortSignal;
  }): Promise<string> {
    const { parentId, name } = await this.ensureParent(
      input.relativePath,
      input.signal,
    );
    let endpoint: string;
    let method: "POST" | "PATCH";
    let etag = "";
    if (input.expected) {
      const current = await this.getMetadataWithEtag(
        input.expected.id,
        input.signal,
      );
      this.assertExpected(input.expected, current.metadata);
      endpoint = `${GOOGLE_UPLOAD}/files/${encodeURIComponent(input.expected.id)}?uploadType=resumable&fields=${GOOGLE_FILE_FIELDS}`;
      method = "PATCH";
      etag = current.etag;
    } else {
      const existing = await this.findChild(parentId, name, input.signal);
      if (existing) {
        throw new DesktopCloudError(
          this.id,
          "version-conflict",
          `Google Drive file already exists: ${input.relativePath}`,
        );
      }
      endpoint = `${GOOGLE_UPLOAD}/files?uploadType=resumable&fields=${GOOGLE_FILE_FIELDS}`;
      method = "POST";
    }
    const response = await this.http.request(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/octet-stream",
        "X-Upload-Content-Length": String(input.bytes.byteLength),
        ...(etag ? { "If-Match": etag } : {}),
      },
      body: JSON.stringify({
        name,
        ...(input.expected ? {} : { parents: [parentId] }),
      }),
    }, { signal: input.signal });
    const location = response.headers.get("Location");
    if (!location?.startsWith("https://")) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        "Google Drive upload session URL is missing",
      );
    }
    return location;
  }

  private async uploadChunks(
    uploadUrl: string,
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<GoogleDriveMetadata> {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const endExclusive = Math.min(
        bytes.byteLength,
        offset + GOOGLE_CHUNK_BYTES,
      );
      const response = await this.http.request(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${offset}-${endExclusive - 1}/${bytes.byteLength}`,
        },
        body: bytes.slice(offset, endExclusive),
      }, { allow: [308], anonymous: true, signal });
      if (response.status === 308) {
        const range = response.headers.get("Range");
        const match = range ? /bytes=0-(\d+)/u.exec(range) : null;
        offset = match ? Number(match[1]) + 1 : endExclusive;
        continue;
      }
      const metadata = googleMetadata(await jsonObject(response, this.id));
      if (!metadata?.version) {
        throw new DesktopCloudError(
          this.id,
          "invalid-response",
          "Google Drive upload did not return versioned metadata",
        );
      }
      return metadata;
    }
    throw new DesktopCloudError(
      this.id,
      "invalid-response",
      "Google Drive cannot upload an empty file",
    );
  }

  async uploadFile(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly expected: DesktopCloudObject | null;
    readonly signal?: AbortSignal;
  }): Promise<DesktopCloudObject> {
    if (input.bytes.byteLength === 0) {
      throw new DesktopCloudError(
        this.id,
        "unsupported",
        "empty Google Drive uploads are not supported",
      );
    }
    const session = await this.createUploadSession(input);
    const metadata = await this.uploadChunks(
      session,
      input.bytes,
      input.signal,
    );
    return cloudObject(input.relativePath, metadata);
  }
  async deleteFile(input: {
    readonly file: DesktopCloudObject;
    readonly expectedVersion: string;
    readonly signal?: AbortSignal;
  }): Promise<void> {
    const current = await this.getMetadataWithEtag(
      input.file.id,
      input.signal,
    );
    if (
      current.metadata.version !== input.expectedVersion
      || current.metadata.id !== input.file.id
    ) {
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `Google Drive file changed before delete: ${input.file.relativePath}`,
      );
    }
    await this.http.request(
      `${GOOGLE_API}/files/${encodeURIComponent(input.file.id)}`,
      {
        method: "DELETE",
        headers: { "If-Match": current.etag },
      },
      { signal: input.signal },
    );
  }
}
