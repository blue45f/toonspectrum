import { z } from "zod";

import {
  studioProjectRecordSchema,
  type StudioProjectRecord,
} from "./studio-project-graph-contract";

export const STUDIO_PROJECT_GRAPH_CACHE_SCHEMA = 1 as const;
export const STUDIO_PROJECT_GRAPH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const STUDIO_PROJECT_GRAPH_CACHE_PREFIX =
  "toonstudio:project-graph-cache:v1:";
const MAX_CACHE_BYTES = 2 * 1_024 * 1_024;
const MAX_ALIAS_LENGTH = 512;

export interface StudioProjectGraphCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const cacheEntrySchema = z
  .object({
    schema: z.literal(STUDIO_PROJECT_GRAPH_CACHE_SCHEMA),
    alias: z.string().trim().min(1).max(MAX_ALIAS_LENGTH),
    cachedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    record: studioProjectRecordSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.expiresAt !== entry.cachedAt + STUDIO_PROJECT_GRAPH_CACHE_TTL_MS) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "cache expiry must match the bounded retention window",
      });
    }
    if (entry.alias !== entry.record.id && entry.alias !== entry.record.workId) {
      context.addIssue({
        code: "custom",
        path: ["alias"],
        message: "cache alias must identify the project or linked work",
      });
    }
  });

export interface StudioProjectGraphCacheEntry {
  readonly record: StudioProjectRecord;
  readonly cachedAt: number;
  readonly stale: boolean;
}

function normalizedAlias(value: string): string | null {
  const alias = value.trim();
  return alias.length > 0 && alias.length <= MAX_ALIAS_LENGTH ? alias : null;
}

export function studioProjectGraphCacheKey(alias: string): string | null {
  const normalized = normalizedAlias(alias);
  return normalized
    ? `${STUDIO_PROJECT_GRAPH_CACHE_PREFIX}${encodeURIComponent(normalized)}`
    : null;
}

function bestEffortRemove(
  storage: StudioProjectGraphCacheStorage,
  key: string,
): void {
  try {
    storage.removeItem(key);
  } catch {
    // A corrupt metadata cache must not block the local document authority.
  }
}

export function readStudioProjectGraphCache(input: {
  readonly storage: StudioProjectGraphCacheStorage | null;
  readonly alias: string;
  readonly now?: number;
  readonly allowExpired?: boolean;
}): StudioProjectGraphCacheEntry | null {
  const key = studioProjectGraphCacheKey(input.alias);
  if (!input.storage || !key) return null;
  let raw: string | null;
  try {
    raw = input.storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw || raw.length > MAX_CACHE_BYTES) {
    if (raw) bestEffortRemove(input.storage, key);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    bestEffortRemove(input.storage, key);
    return null;
  }
  const result = cacheEntrySchema.safeParse(parsed);
  if (!result.success) {
    bestEffortRemove(input.storage, key);
    return null;
  }
  const now = input.now ?? Date.now();
  const stale = result.data.expiresAt <= now;
  if (stale && input.allowExpired !== true) {
    bestEffortRemove(input.storage, key);
    return null;
  }
  return Object.freeze({
    record: result.data.record,
    cachedAt: result.data.cachedAt,
    stale,
  });
}

export function writeStudioProjectGraphCache(input: {
  readonly storage: StudioProjectGraphCacheStorage | null;
  readonly record: StudioProjectRecord;
  readonly now?: number;
}): boolean {
  if (!input.storage) return false;
  const record = studioProjectRecordSchema.parse(input.record);
  const cachedAt = input.now ?? Date.now();
  if (!Number.isSafeInteger(cachedAt) || cachedAt <= 0) return false;
  const aliases = [record.id, record.workId];
  const written: string[] = [];
  try {
    for (const alias of aliases) {
      const key = studioProjectGraphCacheKey(alias);
      if (!key) throw new TypeError("invalid project cache alias");
      const raw = JSON.stringify({
        schema: STUDIO_PROJECT_GRAPH_CACHE_SCHEMA,
        alias,
        cachedAt,
        expiresAt: cachedAt + STUDIO_PROJECT_GRAPH_CACHE_TTL_MS,
        record,
      });
      if (raw.length > MAX_CACHE_BYTES) return false;
      input.storage.setItem(key, raw);
      written.push(key);
    }
    return written.every((key) => input.storage?.getItem(key) !== null);
  } catch {
    for (const key of written) bestEffortRemove(input.storage, key);
    return false;
  }
}

export function clearStudioProjectGraphCache(input: {
  readonly storage: StudioProjectGraphCacheStorage | null;
  readonly projectId: string;
  readonly workId?: string;
}): void {
  if (!input.storage) return;
  for (const alias of [input.projectId, input.workId].filter(
    (value): value is string => typeof value === "string",
  )) {
    const key = studioProjectGraphCacheKey(alias);
    if (key) bestEffortRemove(input.storage, key);
  }
}
