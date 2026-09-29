import {
  createTileEffect,
  type StudioTileEffectDefinition,
  type StudioTileEffectInput,
} from "./studio-virtual-space-tile-effects";
import {
  validateStudioWorldManifest,
  type StudioVirtualSpaceWorldManifest,
} from "./studio-virtual-space-world-manifest";

/**
 * Space-clone snapshot: a serializable copy of a well-crafted virtual-studio space
 * (world manifest + placed objects/tile effects + zone settings) plus the
 * name/description/author labels used when distributing it to a team or academy.
 * Local-only serialization; no server is involved.
 */
export const STUDIO_SPACE_SNAPSHOT_FORMAT_VERSION = 1;
/** Hard cap for a serialized clone payload, in characters (local-only; no server). */
export const STUDIO_SPACE_CLONE_MAX_PAYLOAD_LENGTH = 2_666_668;
const SNAPSHOT_MAX_NAME = 160;
const SNAPSHOT_MAX_DESCRIPTION = 4_000;
const SNAPSHOT_MAX_AUTHOR = 160;
/** Hard cap for the number of tile effects carried in one snapshot (parse stays bounded). */
const SNAPSHOT_MAX_TILE_EFFECTS = 1_000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Narrow shim for the Node Buffer fallback when atob/btoa are unavailable. */
interface Base64BufferShim {
  from(bytes: Uint8Array): { toString(encoding: string): string };
  from(encoded: string, encoding: string): Uint8Array;
}

function nodeBufferShim(): Base64BufferShim | undefined {
  const scope = globalThis as { readonly Buffer?: Base64BufferShim };
  return scope.Buffer;
}

export interface StudioSpaceSnapshotLabels {
  /** Display name shown in the import preview and when sharing with a team or academy. */
  readonly name: string;
  readonly description?: string;
  /** Layout author label. Software validation never certifies sharing rights. */
  readonly author?: string;
}

export interface StudioSpaceSnapshot {
  readonly formatVersion: number;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  /** ISO 8601 creation time. */
  readonly createdAt: string;
  readonly world: StudioVirtualSpaceWorldManifest;
  /**
   * Tile effects placed by the tile-effect editor. They are not part of the
   * world manifest, so the snapshot carries them separately (may be empty).
   */
  readonly tileEffects: readonly StudioTileEffectDefinition[];
}

/**
 * Optional extras for {@link createSpaceSnapshot}. Tile effects are re-validated
 * with the tile-effect editor's own sanitizer, so tampered or stale entries are
 * rejected instead of being stored silently.
 */
export interface StudioSpaceSnapshotExtras {
  readonly tileEffects?: readonly StudioTileEffectDefinition[];
}

export interface StudioSpaceSnapshotSummary {  readonly name: string;
  readonly author: string;
  readonly createdAt: string;
  readonly rooms: number;
  readonly props: number;
  readonly npcs: number;
  readonly interactions: number;
  readonly portals: number;
  readonly spawns: number;
  readonly tileEffects: number;
  readonly objects: number;
}

function trimmed(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

function validateSnapshotLabels(labels: StudioSpaceSnapshotLabels): { name: string; description: string; author: string } {
  const name = (labels.name ?? "").trim();
  if (!name || name.length > SNAPSHOT_MAX_NAME) {
    throw new Error("snapshot name must be 1-160 characters");
  }
  const description = trimmed(labels.description, SNAPSHOT_MAX_DESCRIPTION);
  const author = trimmed(labels.author, SNAPSHOT_MAX_AUTHOR);
  return { name, description, author };
}

function assertValidWorld(world: StudioVirtualSpaceWorldManifest): void {
  const errors = validateStudioWorldManifest(world);
  if (errors.length) {
    throw new Error(`invalid world for snapshot: ${errors[0]}`);
  }
}

/**
 * Re-validates tile effects through the tile-effect editor's sanitizer and
 * returns the sanitized, frozen definitions. Throws on any invalid entry so a
 * malformed effect can never ride along in a clone link.
 */
function sanitizeTileEffects(value: unknown): readonly StudioTileEffectDefinition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > SNAPSHOT_MAX_TILE_EFFECTS) {
    throw new Error("invalid tile effects for snapshot");
  }
  const sanitized: StudioTileEffectDefinition[] = [];
  const seenIds: string[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) throw new Error("invalid tile effect entry");
    const result = createTileEffect(candidate as StudioTileEffectInput, seenIds);
    if (!result.ok) {
      throw new Error(`invalid tile effect: ${result.errors[0]?.code ?? "unknown-error"}`);
    }
    sanitized.push(result.effect);
    seenIds.push(result.effect.id);
  }
  return Object.freeze(sanitized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToBase64Url(bytes: Uint8Array): string | null {
  try {
    if (typeof btoa === "function") {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }
    const buffer = nodeBufferShim();
    if (buffer) return buffer.from(bytes).toString("base64url");
    return null;
  } catch {
    return null;
  }
}

function base64UrlToBytes(payload: string): Uint8Array | null {
  if (!BASE64URL.test(payload)) return null;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    if (typeof atob === "function") {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }
    const buffer = nodeBufferShim();
    if (buffer) return buffer.from(padded, "base64");
    return null;
  } catch {
    return null;
  }
}

/**
 * Freezes a world manifest into a labeled, versioned snapshot.
 * Throws when the world fails manifest validation, a tile effect is invalid,
 * or the labels are invalid.
 */
export function createSpaceSnapshot(
  world: StudioVirtualSpaceWorldManifest,
  labels: StudioSpaceSnapshotLabels,
  now: Date = new Date(),
  extras: StudioSpaceSnapshotExtras = {},
): StudioSpaceSnapshot {
  assertValidWorld(world);
  const { name, description, author } = validateSnapshotLabels(labels);
  const tileEffects = sanitizeTileEffects(extras.tileEffects);
  const createdAt = now.toISOString();
  return Object.freeze({
    formatVersion: STUDIO_SPACE_SNAPSHOT_FORMAT_VERSION,
    name,
    description,
    author,
    createdAt,
    world,
    tileEffects,
  });
}

/** Summarizes a snapshot for the import preview (name, author, object counts). */
export function summarizeSpaceSnapshot(snapshot: StudioSpaceSnapshot): StudioSpaceSnapshotSummary {
  const world = snapshot.world;
  const tileEffects = snapshot.tileEffects.length;
  const objects = world.rooms.length + world.props.length + world.npcs.length
    + world.interactions.length + world.portals.length + world.spawns.length + tileEffects;
  return {
    name: snapshot.name,
    author: snapshot.author,
    createdAt: snapshot.createdAt,
    rooms: world.rooms.length,
    props: world.props.length,
    npcs: world.npcs.length,
    interactions: world.interactions.length,
    portals: world.portals.length,
    spawns: world.spawns.length,
    tileEffects,
    objects,
  };
}

/** Serializes a snapshot to a URL-safe base64 payload. Throws on invalid input. */
export function serializeSpaceSnapshot(snapshot: StudioSpaceSnapshot): string {
  if (!isRecord(snapshot) || snapshot.formatVersion !== STUDIO_SPACE_SNAPSHOT_FORMAT_VERSION) {
    throw new Error("invalid snapshot payload version");
  }
  assertValidWorld(snapshot.world);
  const { name, description, author } = validateSnapshotLabels(snapshot);
  const tileEffects = sanitizeTileEffects(snapshot.tileEffects);
  if (typeof snapshot.createdAt !== "string" || Number.isNaN(Date.parse(snapshot.createdAt))) {
    throw new Error("invalid snapshot creation time");
  }
  const canonical = {
    formatVersion: STUDIO_SPACE_SNAPSHOT_FORMAT_VERSION,
    name,
    description,
    author,
    createdAt: snapshot.createdAt,
    world: snapshot.world,
    tileEffects,
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(canonical)));
  if (!encoded || encoded.length > STUDIO_SPACE_CLONE_MAX_PAYLOAD_LENGTH) {
    throw new Error("snapshot is too large to serialize");
  }
  return encoded;
}

/**
 * Parses a clone payload back into a snapshot.
 * Returns null for any malformed, oversized, version-mismatched or invalid input.
 */
export function parseSpaceSnapshot(payload: unknown): StudioSpaceSnapshot | null {
  if (typeof payload !== "string" || !payload || payload.length > STUDIO_SPACE_CLONE_MAX_PAYLOAD_LENGTH) return null;
  const bytes = base64UrlToBytes(payload);
  if (!bytes || bytes.length > STUDIO_SPACE_CLONE_MAX_PAYLOAD_LENGTH) return null;
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.formatVersion !== STUDIO_SPACE_SNAPSHOT_FORMAT_VERSION) return null;
  if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.trim().length > SNAPSHOT_MAX_NAME) return null;
  for (const key of ["description", "author"] as const) {
    const value = raw[key];
    if (value !== undefined && (typeof value !== "string" || value.length > (key === "description" ? SNAPSHOT_MAX_DESCRIPTION : SNAPSHOT_MAX_AUTHOR))) {
      return null;
    }
  }
  if (typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) return null;
  // JSON.parse boundary: the world is only trusted after the manifest validator
  // (zod-backed) accepts it below, so the assertion never smuggles in bad data.
  const candidateWorld = raw.world as unknown as StudioVirtualSpaceWorldManifest;
  if (!isRecord(raw.world) || validateStudioWorldManifest(candidateWorld).length) return null;
  let tileEffects: readonly StudioTileEffectDefinition[];
  try {
    tileEffects = sanitizeTileEffects(raw.tileEffects);
  } catch {
    return null;
  }
  return Object.freeze({
    formatVersion: STUDIO_SPACE_SNAPSHOT_FORMAT_VERSION,
    name: raw.name.trim(),
    description: (raw.description as string | undefined ?? "").trim().slice(0, SNAPSHOT_MAX_DESCRIPTION),
    author: (raw.author as string | undefined ?? "").trim().slice(0, SNAPSHOT_MAX_AUTHOR),
    createdAt: raw.createdAt,
    world: candidateWorld,
    tileEffects,
  });
}

/** Builds a shareable clone link of the form `<base>#clone=<payload>`. Throws on invalid input. */
export function buildCloneLink(base: string, snapshot: StudioSpaceSnapshot): string {
  if (typeof base !== "string" || !base.trim()) throw new Error("clone link base must be non-empty");
  const clean = base.split("#", 1)[0] ?? base;
  return `${clean}#clone=${serializeSpaceSnapshot(snapshot)}`;
}

/**
 * Parses a `#clone=<payload>` link back into a snapshot.
 * Accepts full URLs and bare fragments; a bare payload is also accepted as a fallback.
 * Returns null when the link carries no valid clone payload.
 */
export function parseCloneLink(href: unknown): StudioSpaceSnapshot | null {
  if (typeof href !== "string" || !href.trim()) return null;
  const text = href.trim();
  const fragment = text.includes("#") ? (text.split("#").slice(1).join("#")) : "";
  for (const part of fragment.split("&")) {
    if (part.startsWith("clone=")) {
      const payload = part.slice("clone=".length);
      if (payload) return parseSpaceSnapshot(payload);
    }
  }
  if (!text.includes("#")) return parseSpaceSnapshot(text);
  return null;
}
