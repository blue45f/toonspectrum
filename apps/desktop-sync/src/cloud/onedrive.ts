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

export interface OneDriveDesktopCloudProviderOptions {
  readonly accessToken: string;
  readonly rootPath?: string;
  readonly fetchImpl?: typeof fetch;
}

const GRAPH_API = "https://graph.microsoft.com/v1.0/me/drive";
const ONEDRIVE_CHUNK_BYTES = 10 * 1024 * 1024;
const ONEDRIVE_FIELDS = [
  "id",
  "name",
  "eTag",
  "lastModifiedDateTime",
  "size",
  "file",
  "folder",
].join(",");

function encodeGraphSegment(value: string): string {
  return encodeURIComponent(value).replace(/%2F/giu, "%252F");
}
interface OneDriveMetadata {
  readonly id: string;
  readonly name: string;
  readonly eTag: string;
  readonly modifiedAt: string;
  readonly size: number;
  readonly isFolder: boolean;
}

function oneDriveMetadata(value: unknown): OneDriveMetadata | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = stringField(row.id);
  const name = stringField(row.name);
  const eTag = stringField(row.eTag);
  if (!id || !name || !eTag) return null;
  return {
    id,
    name,
    eTag,
    modifiedAt: stringField(row.lastModifiedDateTime),
    size: numberField(row.size),
    isFolder: Boolean(row.folder && typeof row.folder === "object"),
  };
}

function cloudObject(
  relativePath: string,
  metadata: OneDriveMetadata,
): DesktopCloudObject {
  return {
    id: metadata.id,
    relativePath: normalizeCloudRelativePath(relativePath),
    size: metadata.size,
    version: metadata.eTag,
    modifiedAt: metadata.modifiedAt || null,
  };
}
export class OneDriveDesktopCloudProvider implements DesktopCloudProvider {
  readonly id = "onedrive" as const;
  readonly rootLabel: string;
  private readonly rootSegments: readonly string[];
  private readonly http: DesktopCloudHttpClient;
  private rootFolderId: string | null = null;

  constructor(options: OneDriveDesktopCloudProviderOptions) {
    const root = normalizeCloudRelativePath(options.rootPath ?? "Sync");
    this.rootLabel = `AppRoot/${root}`;
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
    options: {
      readonly allowMissing?: boolean;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<Record<string, unknown> | null> {
    const response = await this.http.request(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    }, {
      allow: options.allowMissing ? [404] : undefined,
      signal: options.signal,
    });
    if (response.status === 404) return null;
    return jsonObject(response, this.id);
  }
  private async getById(
    id: string,
    signal?: AbortSignal,
  ): Promise<OneDriveMetadata> {
    const body = await this.json(
      `${GRAPH_API}/items/${encodeURIComponent(id)}?$select=${ONEDRIVE_FIELDS}`,
      {},
      { signal },
    );
    const metadata = oneDriveMetadata(body);
    if (!metadata) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        `OneDrive metadata is incomplete for ${id}`,
      );
    }
    return metadata;
  }

  private async getChild(
    parentId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<OneDriveMetadata | null> {
    const body = await this.json(
      `${GRAPH_API}/items/${encodeURIComponent(parentId)}:/${encodeGraphSegment(name)}?$select=${ONEDRIVE_FIELDS}`,
      {},
      { allowMissing: true, signal },
    );
    return body ? oneDriveMetadata(body) : null;
  }

  private async createFolder(
    parentId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<OneDriveMetadata> {
    const response = await this.http.request(
      `${GRAPH_API}/items/${encodeURIComponent(parentId)}/children?$select=${ONEDRIVE_FIELDS}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      },
      { allow: [409], signal },
    );
    if (response.status === 409) {
      const existing = await this.getChild(parentId, name, signal);
      if (existing?.isFolder) return existing;
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `OneDrive path is occupied by a non-folder item: ${name}`,
      );
    }
    const metadata = oneDriveMetadata(await jsonObject(response, this.id));
    if (!metadata?.isFolder) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        `OneDrive did not confirm folder creation for ${name}`,
      );
    }
    return metadata;
  }
  private async findRoot(signal?: AbortSignal): Promise<string | null> {
    if (this.rootFolderId) return this.rootFolderId;
    const appRootBody = await this.json(
      `${GRAPH_API}/special/approot?$select=${ONEDRIVE_FIELDS}`,
      {},
      { signal },
    );
    const appRoot = oneDriveMetadata(appRootBody);
    if (!appRoot?.isFolder) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        "OneDrive app root is unavailable",
      );
    }
    let parent = appRoot;
    for (const segment of this.rootSegments) {
      const child = await this.getChild(parent.id, segment, signal);
      if (!child) return null;
      if (!child.isFolder) {
        throw new DesktopCloudError(
          this.id,
          "version-conflict",
          `OneDrive sync root is not a folder: ${segment}`,
        );
      }
      parent = child;
    }
    this.rootFolderId = parent.id;
    return parent.id;
  }

  private async ensureRoot(signal?: AbortSignal): Promise<string> {
    if (this.rootFolderId) return this.rootFolderId;
    const appRootBody = await this.json(
      `${GRAPH_API}/special/approot?$select=${ONEDRIVE_FIELDS}`,
      {},
      { signal },
    );
    const appRoot = oneDriveMetadata(appRootBody);
    if (!appRoot?.isFolder) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        "OneDrive app root is unavailable",
      );
    }
    let parent = appRoot;
    for (const segment of this.rootSegments) {
      const child = await this.getChild(parent.id, segment, signal);
      parent = child?.isFolder
        ? child
        : await this.createFolder(parent.id, segment, signal);
    }
    this.rootFolderId = parent.id;
    return parent.id;
  }

  private async ensureParent(
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<{ readonly parentId: string; readonly name: string }> {
    const segments = cloudPathSegments(relativePath);
    const name = segments.at(-1)!;
    let parentId = await this.ensureRoot(signal);
    for (const segment of segments.slice(0, -1)) {
      const child = await this.getChild(parentId, segment, signal);
      const folder = child?.isFolder
        ? child
        : await this.createFolder(parentId, segment, signal);
      parentId = folder.id;
    }
    return { parentId, name };
  }

  private async listChildren(
    parentId: string,
    signal?: AbortSignal,
  ): Promise<readonly OneDriveMetadata[]> {
    const values: OneDriveMetadata[] = [];
    let url = `${GRAPH_API}/items/${encodeURIComponent(parentId)}/children?$select=${ONEDRIVE_FIELDS}&$top=200`;
    while (url) {
      const body = await this.json(url, {}, { signal });
      const rows = Array.isArray(body?.value) ? body.value : [];
      for (const row of rows) {
        const metadata = oneDriveMetadata(row);
        if (metadata) values.push(metadata);
      }
      url = stringField(body?.["@odata.nextLink"]);
    }
    return values;
  }
  async listFiles(signal?: AbortSignal): Promise<readonly DesktopCloudObject[]> {
    const rootId = await this.findRoot(signal);
    if (!rootId) return Object.freeze([]);
    const queue: Array<{
      readonly folderId: string;
      readonly prefix: string;
    }> = [{ folderId: rootId, prefix: "" }];
    const files: DesktopCloudObject[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = await this.listChildren(current.folderId, signal);
      for (const child of children) {
        const relativePath = current.prefix
          ? `${current.prefix}/${child.name}`
          : child.name;
        if (child.isFolder) {
          queue.push({ folderId: child.id, prefix: relativePath });
        } else {
          files.push(cloudObject(relativePath, child));
        }
      }
    }
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return Object.freeze(files);
  }

  private assertExpected(
    file: DesktopCloudObject,
    metadata: OneDriveMetadata,
  ): void {
    if (file.id !== metadata.id || file.version !== metadata.eTag) {
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `OneDrive file changed: ${file.relativePath}`,
      );
    }
  }

  async downloadFile(
    file: DesktopCloudObject,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const current = await this.getById(file.id, signal);
    this.assertExpected(file, current);
    const response = await this.http.request(
      `${GRAPH_API}/items/${encodeURIComponent(file.id)}/content`,
      { headers: { "If-Match": current.eTag } },
      { signal },
    );
    return new Uint8Array(await response.arrayBuffer());
  }
  private async createUploadSession(input: {
    readonly relativePath: string;
    readonly expected: DesktopCloudObject | null;
    readonly signal?: AbortSignal;
  }): Promise<string> {
    const { parentId, name } = await this.ensureParent(
      input.relativePath,
      input.signal,
    );
    let endpoint: string;
    let etag = "";
    if (input.expected) {
      const current = await this.getById(input.expected.id, input.signal);
      this.assertExpected(input.expected, current);
      endpoint = `${GRAPH_API}/items/${encodeURIComponent(input.expected.id)}/createUploadSession`;
      etag = current.eTag;
    } else {
      const existing = await this.getChild(parentId, name, input.signal);
      if (existing) {
        throw new DesktopCloudError(
          this.id,
          "version-conflict",
          `OneDrive file already exists: ${input.relativePath}`,
        );
      }
      endpoint = `${GRAPH_API}/items/${encodeURIComponent(parentId)}:/${encodeGraphSegment(name)}:/createUploadSession`;
    }
    const body = await this.json(endpoint, {
      method: "POST",
      headers: etag ? { "If-Match": etag } : {},
      body: JSON.stringify({
        item: {
          name,
          "@microsoft.graph.conflictBehavior": input.expected
            ? "replace"
            : "fail",
        },
        deferCommit: false,
      }),
    }, { signal: input.signal });
    const uploadUrl = stringField(body?.uploadUrl);
    if (!uploadUrl.startsWith("https://")) {
      throw new DesktopCloudError(
        this.id,
        "invalid-response",
        "OneDrive upload session URL is missing",
      );
    }
    return uploadUrl;
  }
  private async uploadChunks(
    uploadUrl: string,
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<OneDriveMetadata> {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const endExclusive = Math.min(
        bytes.byteLength,
        offset + ONEDRIVE_CHUNK_BYTES,
      );
      const response = await this.http.request(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${offset}-${endExclusive - 1}/${bytes.byteLength}`,
        },
        body: bytes.slice(offset, endExclusive),
      }, { allow: [202], anonymous: true, signal });
      if (response.status === 202) {
        const progress = await jsonObject(response, this.id);
        const ranges = Array.isArray(progress.nextExpectedRanges)
          ? progress.nextExpectedRanges
          : [];
        const nextRange = typeof ranges[0] === "string" ? ranges[0] : "";
        const match = /^(\d+)-/u.exec(nextRange);
        offset = match ? Number(match[1]) : endExclusive;
        continue;
      }
      const metadata = oneDriveMetadata(await jsonObject(response, this.id));
      if (!metadata || metadata.isFolder) {
        throw new DesktopCloudError(
          this.id,
          "invalid-response",
          "OneDrive upload did not return file metadata",
        );
      }
      return metadata;
    }
    throw new DesktopCloudError(
      this.id,
      "unsupported",
      "OneDrive cannot upload an empty file",
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
        "empty OneDrive uploads are not supported",
      );
    }
    const uploadUrl = await this.createUploadSession(input);
    const metadata = await this.uploadChunks(
      uploadUrl,
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
    const current = await this.getById(input.file.id, input.signal);
    if (
      current.id !== input.file.id
      || current.eTag !== input.expectedVersion
    ) {
      throw new DesktopCloudError(
        this.id,
        "version-conflict",
        `OneDrive file changed before delete: ${input.file.relativePath}`,
      );
    }
    await this.http.request(
      `${GRAPH_API}/items/${encodeURIComponent(input.file.id)}`,
      {
        method: "DELETE",
        headers: { "If-Match": current.eTag },
      },
      { signal: input.signal },
    );
  }
}
