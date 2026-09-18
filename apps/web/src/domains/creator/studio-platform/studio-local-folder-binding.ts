export type StudioFolderPermission = "prompt" | "granted" | "denied";

export interface StudioLocalFolderBindingV1 {
  readonly version: 1;
  readonly projectId: string;
  readonly rootName: string;
  readonly permission: StudioFolderPermission;
  readonly createdAt: string;
  readonly lastScanAt: string | null;
}

export interface StudioFolderEntry {
  readonly path: string;
  readonly digest: `sha256:${string}`;
  readonly size: number;
  readonly modifiedAt: number;
}

export type StudioFolderSyncAction = "upload" | "download" | "conflict" | "noop";

export interface StudioFolderSyncPlanItem {
  readonly path: string;
  readonly action: StudioFolderSyncAction;
  readonly localDigest: string | null;
  readonly remoteDigest: string | null;
  readonly baseDigest: string | null;
}

export interface StudioFolderSnapshotEntry {
  readonly path: string;
  readonly digest: string;
  readonly baseDigest: string | null;
}

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/u;

export function normalizeStudioRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || WINDOWS_ABSOLUTE.test(path)) {
    throw new Error("Local folder path must be relative.");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Local folder path contains an unsafe segment.");
  }
  return segments.join("/");
}

export function planStudioLocalFolderSync(input: {
  readonly local: readonly StudioFolderSnapshotEntry[];
  readonly remote: readonly StudioFolderSnapshotEntry[];
}): readonly StudioFolderSyncPlanItem[] {
  const local = new Map(input.local.map((entry) => [normalizeStudioRelativePath(entry.path), entry]));
  const remote = new Map(input.remote.map((entry) => [normalizeStudioRelativePath(entry.path), entry]));
  const paths = [...new Set([...local.keys(), ...remote.keys()])].sort();
  return Object.freeze(paths.map((path) => {
    const localEntry = local.get(path);
    const remoteEntry = remote.get(path);
    const localDigest = localEntry?.digest ?? null;
    const remoteDigest = remoteEntry?.digest ?? null;
    const baseDigest = localEntry?.baseDigest ?? remoteEntry?.baseDigest ?? null;
    let action: StudioFolderSyncAction;
    if (localDigest === remoteDigest) action = "noop";
    else if (!localEntry) action = "download";
    else if (!remoteEntry) action = "upload";
    else {
      const localChanged = baseDigest === null || localDigest !== baseDigest;
      const remoteChanged = baseDigest === null || remoteDigest !== baseDigest;
      if (localChanged && remoteChanged) action = "conflict";
      else if (localChanged) action = "upload";
      else action = "download";
    }
    return Object.freeze({ path, action, localDigest, remoteDigest, baseDigest });
  }));
}

export interface StudioLocalFolderPort {
  readonly rootName: string;
  readonly queryPermission: () => Promise<StudioFolderPermission>;
  readonly requestPermission: () => Promise<StudioFolderPermission>;
  readonly scan: () => Promise<readonly StudioFolderEntry[]>;
  readonly write: (path: string, bytes: Uint8Array) => Promise<void>;
}

type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { readonly mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { readonly mode: "readwrite" }): Promise<PermissionState>;
};

function permissionState(value: PermissionState): StudioFolderPermission {
  return value === "granted" || value === "denied" ? value : "prompt";
}

async function sha256(buffer: ArrayBuffer): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

async function scanDirectory(
  handle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<StudioFolderEntry[]> {
  const entries: StudioFolderEntry[] = [];
  for await (const child of handle.values()) {
    const path = normalizeStudioRelativePath(prefix ? `${prefix}/${child.name}` : child.name);
    if (child.kind === "directory") {
      entries.push(...await scanDirectory(child, path));
      continue;
    }
    const file = await child.getFile();
    const bytes = await file.arrayBuffer();
    entries.push(Object.freeze({
      path,
      digest: await sha256(bytes),
      size: file.size,
      modifiedAt: file.lastModified,
    }));
  }
  return entries;
}

export function createBrowserStudioLocalFolderPort(
  root: FileSystemDirectoryHandle,
): StudioLocalFolderPort {
  const permissionHandle = root as PermissionCapableDirectoryHandle;
  return Object.freeze({
    rootName: root.name,
    queryPermission: async () => permissionState(
      await permissionHandle.queryPermission({ mode: "readwrite" }),
    ),
    requestPermission: async () => permissionState(
      await permissionHandle.requestPermission({ mode: "readwrite" }),
    ),
    scan: async () => Object.freeze(
      (await scanDirectory(root)).sort((left, right) => left.path.localeCompare(right.path)),
    ),
    write: async (path, bytes) => {
      const segments = normalizeStudioRelativePath(path).split("/");
      const filename = segments.pop()!;
      let directory = root;
      for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment, { create: true });
      }
      const fileHandle = await directory.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(bytes);
        await writable.close();
      } catch (error) {
        await writable.abort();
        throw error;
      }
    },
  });
}
