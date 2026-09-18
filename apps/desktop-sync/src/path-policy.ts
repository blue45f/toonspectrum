import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const RESERVED_SEGMENTS = new Set([".toonstudio", ".git", "node_modules"]);

export class DesktopSyncPathError extends Error {
  constructor(readonly code: "outside-root" | "absolute-relative" | "reserved" | "symlink") {
    super(`desktop sync path rejected: ${code}`);
    this.name = "DesktopSyncPathError";
  }
}

function pathSegments(value: string): readonly string[] {
  return value.split(/[\\/]+/u).filter(Boolean);
}

export function normalizeRelativeSyncPath(root: string, absolutePath: string): string {
  const canonicalRoot = resolve(root);
  const canonicalTarget = resolve(absolutePath);
  const value = relative(canonicalRoot, canonicalTarget);
  if (!value || value === ".") return "";
  if (isAbsolute(value) || value === ".." || value.startsWith(`..${sep}`)) {
    throw new DesktopSyncPathError("outside-root");
  }
  if (pathSegments(value).some((segment) => RESERVED_SEGMENTS.has(segment))) {
    throw new DesktopSyncPathError("reserved");
  }
  return value.split(sep).join("/");
}

export function resolveSyncPath(root: string, relativePath: string): string {
  if (isAbsolute(relativePath)) throw new DesktopSyncPathError("absolute-relative");
  const segments = pathSegments(relativePath);
  if (segments.some((segment) => segment === ".." || RESERVED_SEGMENTS.has(segment))) {
    throw new DesktopSyncPathError(
      segments.includes("..") ? "outside-root" : "reserved",
    );
  }
  const absolutePath = resolve(root, ...segments);
  normalizeRelativeSyncPath(root, absolutePath);
  return absolutePath;
}

export async function assertNoSymlinkEscape(
  root: string,
  absolutePath: string,
): Promise<void> {
  const canonicalRoot = await realpath(root);
  const canonicalTarget = await realpath(absolutePath);
  normalizeRelativeSyncPath(canonicalRoot, canonicalTarget);
  const metadata = await lstat(absolutePath);
  if (metadata.isSymbolicLink()) throw new DesktopSyncPathError("symlink");
}

export function isReservedSyncPath(relativePath: string): boolean {
  return pathSegments(relativePath).some((segment) => RESERVED_SEGMENTS.has(segment));
}
